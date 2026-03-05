import 'dotenv/config';
import { createApp } from './app';
import { logger } from './middleware/logger';
import { pool } from './db';
import { startTransactionWorker } from './queue/worker';

const PORT = parseInt(process.env.PORT || '3000');

async function main() {
  // Verify DB connection
  try {
    await pool.query('SELECT 1');
    logger.info('Database connected');
  } catch (err) {
    logger.error('Failed to connect to database', { error: (err as Error).message });
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Start SQS transaction worker (if configured)
  startTransactionWorker().catch((err) => {
    logger.warn('Transaction worker failed to start', { error: err.message });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    server.close(async () => {
      await pool.end();
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

main();
