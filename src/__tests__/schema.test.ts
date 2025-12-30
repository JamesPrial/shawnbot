import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { createTables } from '../database/schema';

describe('schema', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    // Create a mock logger for each test
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(() => mockLogger),
      level: 'info',
    } as unknown as Logger;
  });

  describe('createTables', () => {
    describe('when database is valid', () => {
      it('should create guild_settings table successfully', () => {
        // Arrange: Create an in-memory database
        const db = new Database(':memory:');

        // Act: Create tables (should not throw)
        expect(() => createTables(db, mockLogger)).not.toThrow();

        // Assert: Verify the table exists by querying sqlite_master
        const tableExists = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='guild_settings'`
          )
          .get();

        expect(tableExists).toBeDefined();
        expect((tableExists as any).name).toBe('guild_settings');

        db.close();
      });

      it('should create table with correct columns', () => {
        const db = new Database(':memory:');
        createTables(db, mockLogger);

        // Query the table schema
        const columns = db
          .prepare(`PRAGMA table_info(guild_settings)`)
          .all() as Array<{ name: string; type: string; pk: number }>;

        const columnNames = columns.map((col) => col.name);

        // Verify all expected columns exist
        expect(columnNames).toContain('guild_id');
        expect(columnNames).toContain('enabled');
        expect(columnNames).toContain('afk_timeout_seconds');
        expect(columnNames).toContain('warning_seconds_before');
        expect(columnNames).toContain('warning_channel_id');
        expect(columnNames).toContain('exempt_role_ids');
        expect(columnNames).toContain('admin_role_ids');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('updated_at');

        // Verify guild_id is the primary key
        const guildIdColumn = columns.find((col) => col.name === 'guild_id');
        expect(guildIdColumn?.pk).toBe(1);

        db.close();
      });

      it('should be idempotent (safe to call multiple times)', () => {
        // This proves CREATE TABLE IF NOT EXISTS works correctly
        const db = new Database(':memory:');

        // First call
        createTables(db, mockLogger);

        // Second call should not throw
        expect(() => createTables(db, mockLogger)).not.toThrow();

        // Third call should also not throw
        expect(() => createTables(db, mockLogger)).not.toThrow();

        // Table should still exist and be usable
        const result = db
          .prepare('SELECT COUNT(*) as count FROM guild_settings')
          .get() as { count: number };

        expect(result.count).toBe(0);

        db.close();
      });

      it('should not log errors when successful', () => {
        const db = new Database(':memory:');

        createTables(db, mockLogger);

        expect(mockLogger.error).not.toHaveBeenCalled();

        db.close();
      });
    });

    describe('when database.exec fails', () => {
      it('should throw error with context when db.exec fails', () => {
        // Arrange: Create a mock database where exec throws
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error('Simulated database error: disk I/O error');
          }),
        } as unknown as Database.Database;

        // Act & Assert: Verify it throws with enhanced error message
        expect(() => createTables(mockDb, mockLogger)).toThrow();
        expect(() => createTables(mockDb, mockLogger)).toThrow(
          /Database schema creation failed/
        );
      });

      it('should log error before throwing', () => {
        // This test proves that errors are logged for observability before propagating
        const originalError = new Error('Database is locked');
        const mockDb = {
          exec: vi.fn(() => {
            throw originalError;
          }),
        } as unknown as Database.Database;

        // Attempt to create tables (will throw)
        try {
          createTables(mockDb, mockLogger);
        } catch (error) {
          // Expected to throw
        }

        // Verify error was logged
        expect(mockLogger.error).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
          }),
          expect.stringContaining('Failed to create database tables')
        );
      });

      it('should preserve the original error message in the thrown error', () => {
        const originalMessage = 'SQLITE_READONLY: attempt to write a readonly database';
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error(originalMessage);
          }),
        } as unknown as Database.Database;

        try {
          createTables(mockDb, mockLogger);
          // Should not reach here
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Database schema creation failed');
          expect((error as Error).message).toContain(originalMessage);
        }
      });

      it('should handle database connection errors', () => {
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error('SQLITE_CANTOPEN: unable to open database file');
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow(
          /Database schema creation failed/
        );
        expect(mockLogger.error).toHaveBeenCalledOnce();
      });

      it('should handle disk full errors', () => {
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error('SQLITE_FULL: database or disk is full');
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow(
          /Database schema creation failed/
        );
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should handle permission errors', () => {
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error('SQLITE_PERM: access permission denied');
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow(
          /Database schema creation failed/
        );
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should handle syntax errors in SQL (if schema is modified incorrectly)', () => {
        // This test ensures that if someone modifies the schema with invalid SQL,
        // we get a clear error message
        const mockDb = {
          exec: vi.fn(() => {
            throw new Error('SQLITE_ERROR: near "INVALID": syntax error');
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow();
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
          }),
          expect.any(String)
        );
      });

      it('should include the full error details in the log', () => {
        const detailedError = new Error('SQLITE_CORRUPT: database disk image is malformed');
        const mockDb = {
          exec: vi.fn(() => {
            throw detailedError;
          }),
        } as unknown as Database.Database;

        try {
          createTables(mockDb, mockLogger);
        } catch {
          // Expected
        }

        const logCall = (mockLogger.error as any).mock.calls[0];
        expect(logCall[0].error).toBeDefined();
        expect(logCall[0].error).toBeInstanceOf(Error);
        expect((logCall[0].error as Error).message).toContain('database disk image is malformed');
      });
    });

    describe('edge cases', () => {
      it('should handle closed database gracefully', () => {
        const db = new Database(':memory:');
        db.close();

        // Attempting to create tables on a closed database should throw
        expect(() => createTables(db, mockLogger)).toThrow();
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should handle non-Error exceptions from db.exec', () => {
        // In JavaScript, you can throw anything, not just Error objects
        const mockDb = {
          exec: vi.fn(() => {
            throw 'String error instead of Error object';
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow();
        expect(mockLogger.error).toHaveBeenCalled();

        // Verify the raw error was logged (could be a string or Error)
        const logCall = (mockLogger.error as any).mock.calls[0];
        expect(logCall[0].error).toBeDefined();
      });

      it('should handle null/undefined thrown from db.exec', () => {
        const mockDb = {
          exec: vi.fn(() => {
            throw null;
          }),
        } as unknown as Database.Database;

        expect(() => createTables(mockDb, mockLogger)).toThrow();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('integration scenarios', () => {
      it('should allow inserting data after successful table creation', () => {
        const db = new Database(':memory:');
        createTables(db, mockLogger);

        // Verify we can insert data into the created table
        const insertStmt = db.prepare(`
          INSERT INTO guild_settings (guild_id, enabled)
          VALUES (?, ?)
        `);

        expect(() => insertStmt.run('test-guild', 1)).not.toThrow();

        const result = db
          .prepare('SELECT * FROM guild_settings WHERE guild_id = ?')
          .get('test-guild') as any;

        expect(result).toBeDefined();
        expect(result.guild_id).toBe('test-guild');
        expect(result.enabled).toBe(1);

        db.close();
      });

      it('should create table with correct default values', () => {
        const db = new Database(':memory:');
        createTables(db, mockLogger);

        // Insert a row with only guild_id
        db.prepare(`
          INSERT INTO guild_settings (guild_id)
          VALUES (?)
        `).run('test-defaults');

        const result = db
          .prepare('SELECT * FROM guild_settings WHERE guild_id = ?')
          .get('test-defaults') as any;

        // Verify default values
        expect(result.enabled).toBe(0); // DEFAULT 0
        expect(result.afk_timeout_seconds).toBe(300); // DEFAULT 300
        expect(result.warning_seconds_before).toBe(60); // DEFAULT 60
        expect(result.created_at).toBeDefined();
        expect(result.updated_at).toBeDefined();

        db.close();
      });

      it('should enforce primary key constraint', () => {
        const db = new Database(':memory:');
        createTables(db, mockLogger);

        // Insert first guild
        db.prepare(`
          INSERT INTO guild_settings (guild_id)
          VALUES (?)
        `).run('duplicate-guild');

        // Attempting to insert the same guild_id should fail
        expect(() => {
          db.prepare(`
            INSERT INTO guild_settings (guild_id)
            VALUES (?)
          `).run('duplicate-guild');
        }).toThrow(/UNIQUE constraint failed/);

        db.close();
      });
    });
  });
});
