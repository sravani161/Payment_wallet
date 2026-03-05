import { pollTransactions } from '../queue/sqsService';
import { processTransaction } from '../payments/paymentService';
import { SQSTransactionMessage } from '../types';
import { logger } from '../middleware/logger';

export async function startTransactionWorker(): Promise<void> {
  logger.info('Starting transaction worker');

  await pollTransactions(async (message: SQSTransactionMessage) => {
    logger.info('Worker received transaction', {
      transactionId: message.transactionId,
      type: message.type,
    });
    await processTransaction(message.transactionId);
  });
}
