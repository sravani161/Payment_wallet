import express from 'express';
import rateLimit from 'express-rate-limit';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallets';
import transactionRoutes from './routes/transactions';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api/', limiter);

  // Strict limiter for auth
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
  app.use('/api/auth/', authLimiter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/wallets', walletRoutes);
  app.use('/api/transactions', transactionRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
