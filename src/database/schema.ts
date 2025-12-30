import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { formatError } from '../utils/errorUtils';

export function createTables(db: Database.Database, logger: Logger): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        afk_timeout_seconds INTEGER DEFAULT 300,
        warning_seconds_before INTEGER DEFAULT 60,
        warning_channel_id TEXT,
        exempt_role_ids TEXT,
        admin_role_ids TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (error) {
    logger.error({ error }, 'Failed to create database tables');
    throw new Error(`Database schema creation failed: ${formatError(error).message}`);
  }
}
