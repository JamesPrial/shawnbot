import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export function initDatabase(path: string): Database.Database {
  const directory = dirname(path);

  mkdirSync(directory, { recursive: true });

  const db = new Database(path);

  db.pragma('journal_mode = WAL');

  return db;
}
