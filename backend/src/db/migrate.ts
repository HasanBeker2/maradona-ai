import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await pool.query(sql);
      logger.info({ migration: file }, 'Migration applied');
    } catch (err) {
      logger.error({ migration: file, err }, 'Migration failed');
      throw err;
    }
  }
}
