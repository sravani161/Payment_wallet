import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db';
import { AppError } from '../middleware/errorHandler';
import { lockWallet, credit, debit } from '../wallet/walletService';
import { enqueueTransaction } from '../queue/sqsService';
import { Transaction, CreateTransactionRequest, TransactionStatus } from '../types';
import { logger } from '../middleware/logger';

/**
 * Create a transaction record and enqueue it for processing.
 * Idempotency key prevents duplicate submissions.
 */
export async function createTransaction(
  userId: string,
  fromWalletId: string,
  data: CreateTransactionRequest
): Promise<Transaction> {
  // Idempotency check — return existing if already submitted
  const existing = await query<Transaction>(
    'SELECT * FROM transactions WHERE idempotency_key = $1',
    [data.idempotency_key]
  );
  if (existing.rows[0]) {
    logger.info('Idempotent transaction returned', { idempotencyKey: data.idempotency_key });
    return existing.rows[0];
  }

  const transactionId = uuidv4();

  // Insert transaction as 'pending'
  const result = await query<Transaction>(
    `INSERT INTO transactions
      (id, idempotency_key, from_wallet_id, to_wallet_id, amount, currency, type, status, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
     RETURNING *`,
    [
      transactionId,
      data.idempotency_key,
      fromWalletId,
      data.to_wallet_id || null,
      data.amount,
      data.currency,
      data.type,
      data.description || null,
      JSON.stringify(data.metadata || {}),
    ]
  );

  const transaction = result.rows[0];

  // Enqueue for async processing via SQS
  await enqueueTransaction({
    transactionId,
    type: data.type,
    fromWalletId,
    toWalletId: data.to_wallet_id || null,
    amount: data.amount,
    currency: data.currency,
    idempotencyKey: data.idempotency_key,
    description: data.description,
    metadata: data.metadata,
    timestamp: new Date().toISOString(),
  });

  return transaction;
}

/**
 * Actually process a transaction — called by the SQS consumer.
 * Uses serializable isolation + row-level locking to prevent double-spend.
 */
export async function processTransaction(transactionId: string): Promise<void> {
  await withTransaction(async (client) => {
    // Lock the transaction row
    const txResult = await client.query<Transaction>(
      `SELECT * FROM transactions WHERE id = $1 FOR UPDATE`,
      [transactionId]
    );

    const tx = txResult.rows[0];
    if (!tx) throw new AppError('Transaction not found', 404);

    // Prevent re-processing
    if (tx.status !== 'pending') {
      logger.info('Transaction already processed, skipping', { transactionId, status: tx.status });
      return;
    }

    // Update to processing
    await client.query(
      `UPDATE transactions SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [transactionId]
    );

    try {
      switch (tx.type) {
        case 'deposit':
          if (!tx.to_wallet_id) throw new AppError('to_wallet_id required for deposit');
          await lockWallet(client, tx.to_wallet_id);
          await credit(client, tx.to_wallet_id, tx.amount);
          break;

        case 'withdrawal':
          if (!tx.from_wallet_id) throw new AppError('from_wallet_id required for withdrawal');
          await lockWallet(client, tx.from_wallet_id);
          await debit(client, tx.from_wallet_id, tx.amount);
          break;

        case 'transfer':
        case 'payment':
          if (!tx.from_wallet_id || !tx.to_wallet_id) {
            throw new AppError('Both from_wallet_id and to_wallet_id required for transfer');
          }
          // Lock in consistent order (lower UUID first) to prevent deadlock
          const [first, second] = [tx.from_wallet_id, tx.to_wallet_id].sort();
          await lockWallet(client, first);
          await lockWallet(client, second);
          await debit(client, tx.from_wallet_id, tx.amount);
          await credit(client, tx.to_wallet_id, tx.amount);
          break;

        case 'refund':
          if (!tx.from_wallet_id || !tx.to_wallet_id) {
            throw new AppError('Both wallets required for refund');
          }
          await lockWallet(client, tx.from_wallet_id);
          await lockWallet(client, tx.to_wallet_id);
          await debit(client, tx.from_wallet_id, tx.amount);
          await credit(client, tx.to_wallet_id, tx.amount);
          break;
      }

      await client.query(
        `UPDATE transactions SET status = 'completed', processed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [transactionId]
      );

      logger.info('Transaction completed', { transactionId, type: tx.type, amount: tx.amount });
    } catch (err) {
      // Mark as failed but still commit the status update
      await client.query(
        `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [transactionId]
      );
      logger.error('Transaction failed', { transactionId, error: (err as Error).message });
      throw err;
    }
  });
}

export async function getTransaction(transactionId: string, userId: string): Promise<Transaction> {
  const result = await query<Transaction>(
    `SELECT t.* FROM transactions t
     JOIN wallets w ON (w.id = t.from_wallet_id OR w.id = t.to_wallet_id)
     WHERE t.id = $1 AND w.user_id = $2
     LIMIT 1`,
    [transactionId, userId]
  );
  if (!result.rows[0]) throw new AppError('Transaction not found', 404);
  return result.rows[0];
}

export async function getTransactionsByWallet(
  walletId: string,
  userId: string,
  page: number = 0,
  size: number = 20
): Promise<{ transactions: Transaction[]; total: number }> {
  const offset = page * size;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM transactions t
     JOIN wallets w ON (w.id = t.from_wallet_id OR w.id = t.to_wallet_id)
     WHERE (t.from_wallet_id = $1 OR t.to_wallet_id = $1) AND w.user_id = $2`,
    [walletId, userId]
  );

  const result = await query<Transaction>(
    `SELECT DISTINCT t.* FROM transactions t
     JOIN wallets w ON (w.id = t.from_wallet_id OR w.id = t.to_wallet_id)
     WHERE (t.from_wallet_id = $1 OR t.to_wallet_id = $1) AND w.user_id = $2
     ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
    [walletId, userId, size, offset]
  );

  return {
    transactions: result.rows,
    total: parseInt(countResult.rows[0].count),
  };
}

export async function updateTransactionStatus(
  transactionId: string,
  status: TransactionStatus,
  adminUserId: string
): Promise<Transaction> {
  logger.info('Admin updating transaction status', { transactionId, status, adminUserId });
  const result = await query<Transaction>(
    `UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, transactionId]
  );
  if (!result.rows[0]) throw new AppError('Transaction not found', 404);
  return result.rows[0];
}
