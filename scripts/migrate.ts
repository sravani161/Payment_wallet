import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';
import { logger } from '../src/middleware/logger';

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`Running migration: ${file}`);
    await pool.query(sql);
    logger.info(`Migration complete: ${file}`);
  }

  await pool.end();
  logger.info('All migrations complete');
}

migrate().catch(err => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
