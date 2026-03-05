-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'merchant', 'admin')),
  is_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id         UUID PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance    BIGINT       NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- stored in cents
  currency   VARCHAR(3)   NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'GBP')),
  status     VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY,
  idempotency_key  UUID         NOT NULL UNIQUE,
  from_wallet_id   UUID         REFERENCES wallets(id),
  to_wallet_id     UUID         REFERENCES wallets(id),
  amount           BIGINT       NOT NULL CHECK (amount > 0),  -- in cents
  currency         VARCHAR(3)   NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
  type             VARCHAR(20)  NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer', 'payment', 'refund')),
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  description      TEXT,
  metadata         JSONB        NOT NULL DEFAULT '{}',
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_from_wallet ON transactions(from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_wallet   ON transactions(to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON transactions(created_at DESC);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER wallets_updated_at
  BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
