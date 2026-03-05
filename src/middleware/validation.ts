import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
}

export const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and number'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role').optional().isIn(['user', 'merchant', 'admin']).withMessage('Invalid role'),
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

export const transactionValidation = [
  body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (in cents)'),
  body('currency').isIn(['USD', 'EUR', 'GBP']).withMessage('Invalid currency'),
  body('type').isIn(['deposit', 'withdrawal', 'transfer', 'payment', 'refund']).withMessage('Invalid transaction type'),
  body('idempotency_key').isUUID().withMessage('idempotency_key must be a valid UUID'),
  body('to_wallet_id').optional().isUUID().withMessage('to_wallet_id must be a valid UUID'),
  body('description').optional().isString().isLength({ max: 500 }),
];
