import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../db';
import { generateAccessToken, generateRefreshToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { RegisterRequest, LoginRequest, User } from '../types';
import { logger } from '../middleware/logger';

export async function register(data: RegisterRequest) {
  const { email, password, name, role = 'user' } = data;

  const existing = await query<User>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();

  await withTransaction(async (client) => {
    // Create user
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)`,
      [userId, email, passwordHash, name, role]
    );

    // Auto-create a USD wallet for every user
    await client.query(
      `INSERT INTO wallets (id, user_id, balance, currency, status) VALUES ($1, $2, 0, 'USD', 'active')`,
      [uuidv4(), userId]
    );
  });

  logger.info('User registered', { userId, email, role });

  const tokenPayload = { userId, email, role: role as any };
  return {
    access_token: generateAccessToken(tokenPayload),
    refresh_token: generateRefreshToken(tokenPayload),
    user: { id: userId, email, name, role },
  };
}

export async function login(data: LoginRequest) {
  const result = await query<User>(
    'SELECT * FROM users WHERE email = $1',
    [data.email]
  );

  const user = result.rows[0];
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(data.password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const tokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Store hashed refresh token
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), user.id, tokenHash, expiresAt]
  );

  logger.info('User logged in', { userId: user.id });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const result = await query(
    `SELECT rt.*, u.email, u.role FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const row = result.rows[0] as any;
  const tokenPayload = { userId: row.user_id, email: row.email, role: row.role };
  return { access_token: generateAccessToken(tokenPayload) };
}

export async function logout(refreshToken: string) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}
