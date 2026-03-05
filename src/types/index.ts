export type UserRole = 'admin' | 'user' | 'merchant';

export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'refund';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';

export type WalletStatus = 'active' | 'suspended' | 'closed';
export type Currency = 'USD' | 'EUR' | 'GBP';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number; // stored in cents to avoid floating point issues
  currency: Currency;
  status: WalletStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Transaction {
  id: string;
  idempotency_key: string;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  amount: number; // in cents
  currency: Currency;
  type: TransactionType;
  status: TransactionStatus;
  description: string | null;
  metadata: Record<string, unknown>;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface SQSTransactionMessage {
  transactionId: string;
  type: TransactionType;
  fromWalletId: string | null;
  toWalletId: string | null;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  description?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// Request types
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateTransactionRequest {
  to_wallet_id?: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  description?: string;
  idempotency_key: string;
  metadata?: Record<string, unknown>;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
