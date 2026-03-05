# Payment Wallet System

Stripe-style payment & wallet API built with Node.js, TypeScript, PostgreSQL, and AWS SQS.

## Architecture

- **JWT Auth + RBAC** — access/refresh tokens, roles: `user`, `merchant`, `admin`
- **Wallet Service** — concurrency-safe balance operations using `SELECT FOR UPDATE` + check constraints
- **Transaction Processing** — ACID-compliant with serializable isolation, idempotency keys prevent duplicates
- **AWS SQS Queue** — event-driven async processing; transactions are enqueued and processed by a worker
- **Double-spend prevention** — DB-level locking with consistent lock ordering to avoid deadlocks

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL and AWS credentials
```

### 3. Create the database
```bash
psql -U postgres -c "CREATE DATABASE payment_wallet;"
```

### 4. Run migrations
```bash
npm run migrate
```

### 5. Seed test data (optional)
```bash
npm run seed
```

### 6. Start the server
```bash
npm run dev       # development with hot reload
npm run build && npm start  # production
```

Server runs on `http://localhost:3000`

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |

**Register**
```json
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "Password123",
  "name": "Jane Doe",
  "role": "user"
}
```

**Login Response**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": { "id": "...", "email": "...", "name": "...", "role": "user" }
}
```

---

### Wallets

All wallet routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallets` | List my wallets |
| GET | `/api/wallets/:id` | Get wallet by ID |
| POST | `/api/wallets` | Create additional wallet |

---

### Transactions

All transaction routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions` | Create transaction (enqueued) |
| GET | `/api/transactions/:id` | Get transaction by ID |
| GET | `/api/transactions/wallet/:walletId` | List transactions for wallet |
| PUT | `/api/transactions/:id/status` | Update status (admin only) |

**Create Transaction**
```json
POST /api/transactions
Authorization: Bearer <token>

{
  "from_wallet_id": "uuid-of-source-wallet",
  "to_wallet_id": "uuid-of-dest-wallet",
  "amount": 2500,
  "currency": "USD",
  "type": "transfer",
  "description": "Payment for invoice #42",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

> **Note:** `amount` is in cents. $25.00 = `2500`

Transaction types: `deposit`, `withdrawal`, `transfer`, `payment`, `refund`

Transaction is created as `pending`, enqueued to SQS, then processed asynchronously by the worker.

---

## Test Accounts (after seed)

| Email | Password | Role | Balance |
|-------|----------|------|---------|
| admin@example.com | Admin123! | admin | $0 |
| alice@example.com | User1234! | user | $1,000 |
| bob@example.com | User1234! | merchant | $500 |

---

## AWS SQS Setup

For full async processing, create an SQS FIFO queue:
1. Go to AWS Console → SQS → Create Queue
2. Type: **FIFO**, name: `transactions.fifo`
3. Enable **Content-based deduplication**
4. Copy the queue URL into `.env` as `SQS_TRANSACTION_QUEUE_URL`

Without SQS configured, transactions are still created but not auto-processed. You can manually trigger processing via the admin status endpoint.

---

## Key Design Decisions

### Double-spend prevention
Wallet debits use a conditional UPDATE:
```sql
UPDATE wallets SET balance = balance - $amount
WHERE id = $id AND balance >= $amount
```
This atomically checks and deducts in one statement — no race condition possible.

### Deadlock prevention for transfers
When locking two wallets, they are always locked in UUID sort order so two concurrent transfers between the same wallets can never deadlock each other.

### Idempotency
Every transaction requires a client-supplied `idempotency_key` (UUID). Duplicate submissions return the original transaction instead of creating a duplicate charge.
