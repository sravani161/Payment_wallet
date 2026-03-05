import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../src/db';
import { logger } from '../src/middleware/logger';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const adminId = uuidv4();
    const userId1 = uuidv4();
    const userId2 = uuidv4();

    const adminHash = await bcrypt.hash('Admin123!', 12);
    const userHash  = await bcrypt.hash('User1234!', 12);

    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, 'admin@example.com', adminHash, 'Admin User', 'admin']
    );

    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO NOTHING`,
      [userId1, 'alice@example.com', userHash, 'Alice Smith', 'user']
    );

    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, is_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (email) DO NOTHING`,
      [userId2, 'bob@example.com', userHash, 'Bob Jones', 'merchant']
    );

    // Wallets with starting balance
    await client.query(
      `INSERT INTO wallets (id, user_id, balance, currency, status) VALUES ($1, $2, $3, 'USD', 'active') ON CONFLICT DO NOTHING`,
      [uuidv4(), userId1, 100000] // $1,000.00
    );
    await client.query(
      `INSERT INTO wallets (id, user_id, balance, currency, status) VALUES ($1, $2, $3, 'USD', 'active') ON CONFLICT DO NOTHING`,
      [uuidv4(), userId2, 50000]  // $500.00
    );
    await client.query(
      `INSERT INTO wallets (id, user_id, balance, currency, status) VALUES ($1, $2, $3, 'USD', 'active') ON CONFLICT DO NOTHING`,
      [uuidv4(), adminId, 0]
    );

    await client.query('COMMIT');
    logger.info('Seed complete', {
      accounts: [
        { email: 'admin@example.com', password: 'Admin123!', role: 'admin' },
        { email: 'alice@example.com', password: 'User1234!', role: 'user', balance: '$1,000' },
        { email: 'bob@example.com',   password: 'User1234!', role: 'merchant', balance: '$500' },
      ],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
});
