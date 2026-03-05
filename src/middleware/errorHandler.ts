import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // PostgreSQL unique constraint violation
  if ((err as any).code === '23505') {
    res.status(409).json({ error: 'Resource already exists', code: 'DUPLICATE' });
    return;
  }

  // PostgreSQL serialization failure (concurrent transaction conflict) — caller should retry
  if ((err as any).code === '40001') {
    res.status(409).json({ error: 'Transaction conflict, please retry', code: 'SERIALIZATION_FAILURE' });
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack, url: req.originalUrl });
  res.status(500).json({ error: 'Internal server error' });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
}
