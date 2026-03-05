import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { SQSTransactionMessage } from '../types';
import { logger } from '../middleware/logger';

const sqs = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  } : undefined, // falls back to IAM role in production
});

const TRANSACTION_QUEUE_URL = process.env.SQS_TRANSACTION_QUEUE_URL || '';

export async function enqueueTransaction(message: SQSTransactionMessage): Promise<void> {
  if (!TRANSACTION_QUEUE_URL) {
    logger.warn('SQS queue URL not configured — skipping enqueue');
    return;
  }

  const command = new SendMessageCommand({
    QueueUrl: TRANSACTION_QUEUE_URL,
    MessageBody: JSON.stringify(message),
    // Use idempotency key as deduplication ID (for FIFO queues)
    MessageGroupId: message.fromWalletId || message.toWalletId || 'default',
    MessageDeduplicationId: message.idempotencyKey,
    MessageAttributes: {
      transactionType: {
        DataType: 'String',
        StringValue: message.type,
      },
    },
  });

  try {
    const result = await sqs.send(command);
    logger.info('Transaction enqueued', {
      transactionId: message.transactionId,
      messageId: result.MessageId,
    });
  } catch (err) {
    logger.error('Failed to enqueue transaction', {
      transactionId: message.transactionId,
      error: (err as Error).message,
    });
    throw err;
  }
}

export async function pollTransactions(
  handler: (msg: SQSTransactionMessage) => Promise<void>
): Promise<void> {
  if (!TRANSACTION_QUEUE_URL) {
    logger.warn('SQS queue URL not configured — polling disabled');
    return;
  }

  logger.info('Starting SQS transaction poller');

  const poll = async () => {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: TRANSACTION_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20, // long polling
        MessageAttributeNames: ['All'],
        VisibilityTimeout: 60,
      });

      const response = await sqs.send(command);

      for (const message of response.Messages || []) {
        try {
          const body: SQSTransactionMessage = JSON.parse(message.Body!);
          await handler(body);

          // Delete message on successful processing
          await sqs.send(new DeleteMessageCommand({
            QueueUrl: TRANSACTION_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle!,
          }));

          logger.info('SQS message processed and deleted', { transactionId: body.transactionId });
        } catch (err) {
          logger.error('Failed to process SQS message — leaving for retry', {
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      logger.error('SQS poll error', { error: (err as Error).message });
    }

    // Continue polling
    setTimeout(poll, 1000);
  };

  poll();
}
