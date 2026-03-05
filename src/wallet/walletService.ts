import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db';
import { AppError } from '../middleware/errorHandler';
import { Wallet, Currency } from '../types';
import { PoolClient } from 'pg';

export async function getWalletsByUser(userId: string): Promise<Wallet[]> {
  const result = await query<Wallet>(
    'SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return result.rows;
}

export async function getWalletById(walletId: string, userId?: string): Promise<Wallet> {
  const params: unknown[] = [walletId];
  let sql = 'SELECT * FROM wallets WHERE id = $1';
  if (userId) {
    sql += ' AND user_id = $2';
    params.push(userId);
  }
  const result = await query<Wallet>(sql, params);
  if (!result.rows[0]) throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');
  return result.rows[0];
}

export async function createWallet(userId: string, currency: Currency): Promise<Wallet> {
  const id = uuidv4();
  const result = await query<Wallet>(
    `INSERT INTO wallets (id, user_id, balance, currency, status) VALUES ($1, $2, 0, $3, 'active') RETURNING *`,
    [id, userId, currency]
  );
  return result.rows[0];
}

/**
 * Lock and return the wallet row for update within a transaction.
 * Uses SELECT ... FOR UPDATE to prevent concurrent modifications.
 */
export async function lockWallet(client: PoolClient, walletId: string): Promise<Wallet> {
  const result = await client.query<Wallet>(
    'SELECT * FROM wallets WHERE id = $1 FOR UPDATE',
    [walletId]
  );
  if (!result.rows[0]) throw new AppError('Wallet not found', 404, 'WALLET_NOT_FOUND');
  if (result.rows[0].status !== 'active') throw new AppError('Wallet is not active', 400, 'WALLET_INACTIVE');
  return result.rows[0];
}

export async function credit(client: PoolClient, walletId: string, amount: number): Promise<Wallet> {
  const result = await client.query<Wallet>(
    'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [amount, walletId]
  );
  return result.rows[0];
}

export async function debit(client: PoolClient, walletId: string, amount: number): Promise<Wallet> {
  // Debit with balance check in a single atomic statement
  const result = await client.query<Wallet>(
    `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
     WHERE id = $2 AND balance >= $1
     RETURNING *`,
    [amount, walletId]
  );
  if (!result.rows[0]) {
    throw new AppError('Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
  }
  return result.rows[0];
}
