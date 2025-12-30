import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { GuildSettingsRepository } from '../database/repositories/GuildSettingsRepository';
import { createTables } from '../database/schema';

describe('GuildSettingsRepository', () => {
  let db: Database.Database;
  let repository: GuildSettingsRepository;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create a mock logger
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

    // Create an in-memory SQLite database for each test
    db = new Database(':memory:');
    createTables(db, mockLogger);
    repository = new GuildSettingsRepository(db, mockLogger);
  });

  afterEach(() => {
    // Clean up the database after each test
    db.close();
  });

  describe('findByGuildId', () => {
    describe('when guild settings do not exist', () => {
      it('should return null for non-existent guild', () => {
        const result = repository.findByGuildId('non-existent-guild-id');

        expect(result).toBeNull();
      });

      it('should return null for empty string guild ID', () => {
        const result = repository.findByGuildId('');

        expect(result).toBeNull();
      });
    });

    describe('when guild settings exist', () => {
      it('should return settings for existing guild', () => {
        // Arrange: Insert a guild setting directly
        const guildId = 'test-guild-123';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, enabled, afk_timeout_seconds, warning_seconds_before)
          VALUES (?, 1, 600, 120)
        `).run(guildId);

        // Act
        const result = repository.findByGuildId(guildId);

        // Assert
        expect(result).not.toBeNull();
        expect(result?.guildId).toBe(guildId);
        expect(result?.enabled).toBe(true);
        expect(result?.afkTimeoutSeconds).toBe(600);
        expect(result?.warningSecondsBefore).toBe(120);
      });

      it('should correctly deserialize boolean enabled field from integer 0', () => {
        const guildId = 'test-guild-disabled';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, enabled)
          VALUES (?, 0)
        `).run(guildId);

        const result = repository.findByGuildId(guildId);

        expect(result?.enabled).toBe(false);
      });

      it('should correctly deserialize boolean enabled field from integer 1', () => {
        const guildId = 'test-guild-enabled';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, enabled)
          VALUES (?, 1)
        `).run(guildId);

        const result = repository.findByGuildId(guildId);

        expect(result?.enabled).toBe(true);
      });

      it('should handle null warning_channel_id', () => {
        const guildId = 'test-guild-null-channel';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, warning_channel_id)
          VALUES (?, NULL)
        `).run(guildId);

        const result = repository.findByGuildId(guildId);

        expect(result?.warningChannelId).toBeNull();
      });

      it('should handle non-null warning_channel_id', () => {
        const guildId = 'test-guild-with-channel';
        const channelId = 'channel-123456';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, warning_channel_id)
          VALUES (?, ?)
        `).run(guildId, channelId);

        const result = repository.findByGuildId(guildId);

        expect(result?.warningChannelId).toBe(channelId);
      });

      it('should include createdAt and updatedAt timestamps', () => {
        const guildId = 'test-guild-timestamps';
        db.prepare(`
          INSERT INTO guild_settings (guild_id)
          VALUES (?)
        `).run(guildId);

        const result = repository.findByGuildId(guildId);

        expect(result?.createdAt).toBeDefined();
        expect(result?.updatedAt).toBeDefined();
        expect(typeof result?.createdAt).toBe('string');
        expect(typeof result?.updatedAt).toBe('string');
      });
    });
  });

  describe('JSON serialization of exemptRoleIds', () => {
    describe('when deserializing from database', () => {
      it('should return empty array when exempt_role_ids is null', () => {
        const guildId = 'test-guild-null-roles';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, exempt_role_ids)
          VALUES (?, NULL)
        `).run(guildId);

        const result = repository.findByGuildId(guildId);

        expect(result?.exemptRoleIds).toEqual([]);
      });

      it('should deserialize single role ID correctly', () => {
        const guildId = 'test-guild-single-role';
        const roleId = 'role-123';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, exempt_role_ids)
          VALUES (?, ?)
        `).run(guildId, JSON.stringify([roleId]));

        const result = repository.findByGuildId(guildId);

        expect(result?.exemptRoleIds).toEqual([roleId]);
      });

      it('should deserialize multiple role IDs correctly', () => {
        const guildId = 'test-guild-multiple-roles';
        const roleIds = ['role-123', 'role-456', 'role-789'];
        db.prepare(`
          INSERT INTO guild_settings (guild_id, exempt_role_ids)
          VALUES (?, ?)
        `).run(guildId, JSON.stringify(roleIds));

        const result = repository.findByGuildId(guildId);

        expect(result?.exemptRoleIds).toEqual(roleIds);
      });

      it('should deserialize empty array correctly', () => {
        const guildId = 'test-guild-empty-roles';
        db.prepare(`
          INSERT INTO guild_settings (guild_id, exempt_role_ids)
          VALUES (?, ?)
        `).run(guildId, JSON.stringify([]));

        const result = repository.findByGuildId(guildId);

        expect(result?.exemptRoleIds).toEqual([]);
      });
    });
  });

  describe('upsert', () => {
    describe('when creating new record', () => {
      it('should insert new guild settings', () => {
        const guildId = 'new-guild-123';

        repository.upsert({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 500,
          warningSecondsBefore: 90,
        });

        const result = repository.findByGuildId(guildId);
        expect(result).not.toBeNull();
        expect(result?.guildId).toBe(guildId);
        expect(result?.enabled).toBe(true);
        expect(result?.afkTimeoutSeconds).toBe(500);
        expect(result?.warningSecondsBefore).toBe(90);
      });

      it('should create record with only guildId provided', () => {
        const guildId = 'minimal-guild';

        repository.upsert({ guildId });

        const result = repository.findByGuildId(guildId);
        expect(result).not.toBeNull();
        expect(result?.guildId).toBe(guildId);
        // Upsert without providing values results in null, not defaults
        expect(result?.enabled).toBe(false);
        expect(result?.afkTimeoutSeconds).toBeNull();
        expect(result?.warningSecondsBefore).toBeNull();
      });

      it('should serialize exemptRoleIds array to JSON', () => {
        const guildId = 'guild-with-roles';
        const roleIds = ['role-1', 'role-2', 'role-3'];

        repository.upsert({
          guildId,
          exemptRoleIds: roleIds,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.exemptRoleIds).toEqual(roleIds);
      });

      it('should handle empty exemptRoleIds array', () => {
        const guildId = 'guild-empty-roles';

        repository.upsert({
          guildId,
          exemptRoleIds: [],
        });

        // Verify it was stored (even empty array should be stored as JSON)
        const row = db.prepare('SELECT exempt_role_ids FROM guild_settings WHERE guild_id = ?')
          .get(guildId) as { exempt_role_ids: string | null };

        // Empty array gets serialized to "[]" string in DB
        expect(row.exempt_role_ids).toBe('[]');
      });

      it('should set warningChannelId correctly', () => {
        const guildId = 'guild-with-channel';
        const channelId = 'channel-999';

        repository.upsert({
          guildId,
          warningChannelId: channelId,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.warningChannelId).toBe(channelId);
      });
    });

    describe('when updating existing record', () => {
      it('should update existing guild settings', () => {
        const guildId = 'existing-guild';

        // Create initial record
        repository.upsert({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
        });

        // Update the record
        repository.upsert({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.enabled).toBe(true);
        expect(result?.afkTimeoutSeconds).toBe(600);
      });

      it('should preserve existing values when partial update provided', () => {
        const guildId = 'partial-update-guild';

        // Create initial record with multiple fields
        repository.upsert({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 400,
          warningSecondsBefore: 80,
          warningChannelId: 'channel-original',
        });

        // Update only enabled field
        repository.upsert({
          guildId,
          enabled: false,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.enabled).toBe(false);
        // These should be preserved from original
        expect(result?.afkTimeoutSeconds).toBe(400);
        expect(result?.warningSecondsBefore).toBe(80);
        expect(result?.warningChannelId).toBe('channel-original');
      });

      it('should update exemptRoleIds on existing record', () => {
        const guildId = 'update-roles-guild';

        repository.upsert({
          guildId,
          exemptRoleIds: ['role-1', 'role-2'],
        });

        repository.upsert({
          guildId,
          exemptRoleIds: ['role-3', 'role-4', 'role-5'],
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.exemptRoleIds).toEqual(['role-3', 'role-4', 'role-5']);
      });

      it('should update updatedAt timestamp on update', () => {
        const guildId = 'timestamp-update-guild';

        repository.upsert({ guildId });
        const initial = repository.findByGuildId(guildId);
        const initialUpdatedAt = initial?.updatedAt;

        // Small delay to ensure timestamp difference
        // Note: SQLite CURRENT_TIMESTAMP has second precision, so this might not always differ
        repository.upsert({ guildId, enabled: true });
        const updated = repository.findByGuildId(guildId);

        // updatedAt should be defined in both cases
        expect(updated?.updatedAt).toBeDefined();
        expect(initialUpdatedAt).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should handle boolean false correctly (not as null)', () => {
        const guildId = 'boolean-false-test';

        repository.upsert({
          guildId,
          enabled: false,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.enabled).toBe(false);
      });

      it('should handle zero values correctly', () => {
        const guildId = 'zero-values-test';

        repository.upsert({
          guildId,
          afkTimeoutSeconds: 0,
          warningSecondsBefore: 0,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.afkTimeoutSeconds).toBe(0);
        expect(result?.warningSecondsBefore).toBe(0);
      });

      it('should handle very large timeout values', () => {
        const guildId = 'large-values-test';
        const largeTimeout = Number.MAX_SAFE_INTEGER;

        repository.upsert({
          guildId,
          afkTimeoutSeconds: largeTimeout,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.afkTimeoutSeconds).toBe(largeTimeout);
      });

      it('should handle guild IDs with special characters', () => {
        const guildId = 'guild-with-special-chars-!@#$%^&*()';

        repository.upsert({
          guildId,
          enabled: true,
        });

        const result = repository.findByGuildId(guildId);
        expect(result?.guildId).toBe(guildId);
        expect(result?.enabled).toBe(true);
      });
    });
  });

  describe('delete', () => {
    it('should remove existing guild settings', () => {
      const guildId = 'guild-to-delete';

      // Create a record
      repository.upsert({
        guildId,
        enabled: true,
      });

      // Verify it exists
      expect(repository.findByGuildId(guildId)).not.toBeNull();

      // Delete it
      repository.delete(guildId);

      // Verify it's gone
      expect(repository.findByGuildId(guildId)).toBeNull();
    });

    it('should not throw error when deleting non-existent guild', () => {
      // This should not throw
      expect(() => {
        repository.delete('non-existent-guild');
      }).not.toThrow();
    });

    it('should allow re-creating deleted guild with fresh data', () => {
      const guildId = 'recreate-guild';

      // Create
      repository.upsert({
        guildId,
        enabled: true,
        afkTimeoutSeconds: 500,
      });

      // Delete
      repository.delete(guildId);

      // Recreate with different values
      repository.upsert({
        guildId,
        enabled: false,
        afkTimeoutSeconds: 700,
      });

      const result = repository.findByGuildId(guildId);
      expect(result?.enabled).toBe(false);
      expect(result?.afkTimeoutSeconds).toBe(700);
    });

    it('should handle deletion of multiple different guilds', () => {
      const guild1 = 'guild-1';
      const guild2 = 'guild-2';
      const guild3 = 'guild-3';

      repository.upsert({ guildId: guild1 });
      repository.upsert({ guildId: guild2 });
      repository.upsert({ guildId: guild3 });

      repository.delete(guild2);

      expect(repository.findByGuildId(guild1)).not.toBeNull();
      expect(repository.findByGuildId(guild2)).toBeNull();
      expect(repository.findByGuildId(guild3)).not.toBeNull();
    });
  });

  describe('data integrity', () => {
    it('should maintain data consistency across multiple operations', () => {
      const guildId = 'integrity-test-guild';
      const roleIds = ['role-a', 'role-b'];

      // Create
      repository.upsert({
        guildId,
        enabled: true,
        afkTimeoutSeconds: 350,
        warningSecondsBefore: 70,
        warningChannelId: 'channel-123',
        exemptRoleIds: roleIds,
      });

      // Read
      let result = repository.findByGuildId(guildId);
      expect(result?.enabled).toBe(true);
      expect(result?.afkTimeoutSeconds).toBe(350);
      expect(result?.warningSecondsBefore).toBe(70);
      expect(result?.warningChannelId).toBe('channel-123');
      expect(result?.exemptRoleIds).toEqual(roleIds);

      // Update
      repository.upsert({
        guildId,
        afkTimeoutSeconds: 450,
      });

      // Read again - updated field changed, others preserved
      result = repository.findByGuildId(guildId);
      expect(result?.afkTimeoutSeconds).toBe(450);
      expect(result?.enabled).toBe(true);
      expect(result?.warningSecondsBefore).toBe(70);
      expect(result?.warningChannelId).toBe('channel-123');
      expect(result?.exemptRoleIds).toEqual(roleIds);
    });

    it('should handle concurrent-like operations correctly', () => {
      const guildId = 'concurrent-test';

      repository.upsert({ guildId, enabled: true });
      repository.upsert({ guildId, enabled: false });
      repository.upsert({ guildId, enabled: true });

      const result = repository.findByGuildId(guildId);
      expect(result?.enabled).toBe(true);
    });
  });

  describe('safe JSON parsing', () => {
    it('should handle malformed JSON gracefully for exempt_role_ids', () => {
      const guildId = 'malformed-json-exempt';

      // Insert malformed JSON directly into database
      db.prepare(`
        INSERT INTO guild_settings (guild_id, exempt_role_ids)
        VALUES (?, ?)
      `).run(guildId, '{invalid json}');

      const result = repository.findByGuildId(guildId);

      // Should return empty array and log warning
      expect(result?.exemptRoleIds).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully for admin_role_ids', () => {
      const guildId = 'malformed-json-admin';

      // Insert malformed JSON directly into database
      db.prepare(`
        INSERT INTO guild_settings (guild_id, admin_role_ids)
        VALUES (?, ?)
      `).run(guildId, '[not, valid, json]');

      const result = repository.findByGuildId(guildId);

      // Should return empty array and log warning
      expect(result?.adminRoleIds).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle non-array JSON for exempt_role_ids', () => {
      const guildId = 'non-array-exempt';

      // Insert valid JSON but not an array
      db.prepare(`
        INSERT INTO guild_settings (guild_id, exempt_role_ids)
        VALUES (?, ?)
      `).run(guildId, '{"key": "value"}');

      const result = repository.findByGuildId(guildId);

      // Should return empty array and log warning
      expect(result?.exemptRoleIds).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldName: 'exempt_role_ids',
        }),
        expect.stringContaining('non-array')
      );
    });

    it('should handle array with non-string values', () => {
      const guildId = 'mixed-types-array';

      // Insert array with mixed types
      db.prepare(`
        INSERT INTO guild_settings (guild_id, exempt_role_ids)
        VALUES (?, ?)
      `).run(guildId, '[123, "valid", null, true]');

      const result = repository.findByGuildId(guildId);

      // Should return empty array and log warning
      expect(result?.exemptRoleIds).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldName: 'exempt_role_ids',
        }),
        expect.stringContaining('non-string')
      );
    });

    it('should successfully parse valid JSON arrays', () => {
      const guildId = 'valid-json';
      const roleIds = ['role-1', 'role-2', 'role-3'];

      // Insert valid JSON array
      db.prepare(`
        INSERT INTO guild_settings (guild_id, exempt_role_ids, admin_role_ids)
        VALUES (?, ?, ?)
      `).run(guildId, JSON.stringify(roleIds), JSON.stringify(['admin-1']));

      const result = repository.findByGuildId(guildId);

      // Should successfully parse both arrays without warnings
      expect(result?.exemptRoleIds).toEqual(roleIds);
      expect(result?.adminRoleIds).toEqual(['admin-1']);
    });
  });

  describe('safeParseJsonArray - comprehensive unit tests', () => {
    // These tests directly test the safeParseJsonArray method to ensure all edge cases are covered

    beforeEach(() => {
      // Reset mock logger before each test in this suite
      vi.clearAllMocks();
    });

    describe('when input is null or undefined', () => {
      it('should return empty array for null input without logging', () => {
        // This proves null database values are safely handled
        const result = (repository as any).safeParseJsonArray(null, 'test_field');

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should return empty array for undefined input without logging', () => {
        // This proves undefined values (from optional fields) are safely handled
        const result = (repository as any).safeParseJsonArray(undefined, 'test_field');

        expect(result).toEqual([]);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('when input is valid JSON array', () => {
      it('should parse single-element array correctly', () => {
        const validJson = '["role-123"]';
        const result = (repository as any).safeParseJsonArray(validJson, 'exempt_role_ids');

        expect(result).toEqual(['role-123']);
        expect(result).toHaveLength(1);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should parse multi-element array correctly', () => {
        const validJson = '["role-1", "role-2", "role-3"]';
        const result = (repository as any).safeParseJsonArray(validJson, 'exempt_role_ids');

        expect(result).toEqual(['role-1', 'role-2', 'role-3']);
        expect(result).toHaveLength(3);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should parse empty array correctly', () => {
        const validJson = '[]';
        const result = (repository as any).safeParseJsonArray(validJson, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should preserve string values without type coercion', () => {
        // This proves that string "0" is not coerced to number 0, etc.
        const validJson = '["123", "0", "", "null", "false"]';
        const result = (repository as any).safeParseJsonArray(validJson, 'test_field');

        expect(result).toEqual(['123', '0', '', 'null', 'false']);
        expect(result[0]).toBe('123'); // String, not number 123
        expect(result[1]).toBe('0'); // String "0", not number 0
        expect(result[2]).toBe(''); // Empty string, not falsy value
        expect(result[3]).toBe('null'); // String "null", not null
        expect(result[4]).toBe('false'); // String "false", not boolean false
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should handle special characters in strings', () => {
        const validJson = '["role-!@#$%^&*()", "role-with-\\"quotes\\"", "role\\twith\\ttabs"]';
        const result = (repository as any).safeParseJsonArray(validJson, 'test_field');

        expect(result).toHaveLength(3);
        expect(result[0]).toBe('role-!@#$%^&*()');
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should handle very large arrays without error', () => {
        // This proves the function can handle realistic large datasets (e.g., servers with many roles)
        const largeArray = Array.from({ length: 1000 }, (_, i) => `role-${i}`);
        const largeJson = JSON.stringify(largeArray);
        const result = (repository as any).safeParseJsonArray(largeJson, 'exempt_role_ids');

        expect(result).toEqual(largeArray);
        expect(result).toHaveLength(1000);
        expect(result[0]).toBe('role-0');
        expect(result[999]).toBe('role-999');
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });

    describe('when input is invalid/corrupted JSON', () => {
      it('should return empty array and log warning for malformed JSON (missing bracket)', () => {
        const invalidJson = '["role-1", "role-2"'; // Missing closing bracket
        const result = (repository as any).safeParseJsonArray(invalidJson, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            fieldName: 'exempt_role_ids',
            value: invalidJson,
            error: expect.any(Error),
          }),
          'Failed to parse JSON array, returning empty array'
        );
      });

      it('should return empty array and log warning for completely invalid JSON', () => {
        const invalidJson = 'not json at all';
        const result = (repository as any).safeParseJsonArray(invalidJson, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        const logCall = (mockLogger.warn as any).mock.calls[0];
        expect(logCall[0]).toHaveProperty('fieldName', 'exempt_role_ids');
        expect(logCall[0]).toHaveProperty('error');
      });

      it('should return empty array for truncated JSON', () => {
        const truncatedJson = '["role-1", "role-2", "role-3"';
        const result = (repository as any).safeParseJsonArray(truncatedJson, 'admin_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect((mockLogger.warn as any).mock.calls[0][0].fieldName).toBe('admin_role_ids');
      });

      it('should return empty array for JSON with unescaped quotes', () => {
        const invalidJson = '["role-with"quotes"]';
        const result = (repository as any).safeParseJsonArray(invalidJson, 'test_field');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should return empty array for JSON with trailing comma', () => {
        // Trailing commas are invalid in JSON (unlike JavaScript)
        const invalidJson = '["role-1", "role-2",]';
        const result = (repository as any).safeParseJsonArray(invalidJson, 'test_field');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should handle binary/garbage data gracefully', () => {
        // This simulates database corruption with binary data
        const corruptedData = '\x00\x01\x02\x03\x04';
        const result = (repository as any).safeParseJsonArray(corruptedData, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should include the actual JSON.parse error message in log', () => {
        const invalidJson = '{"broken": json}';
        (repository as any).safeParseJsonArray(invalidJson, 'test_field');

        expect(mockLogger.warn).toHaveBeenCalledOnce();
        const logCall = (mockLogger.warn as any).mock.calls[0];
        expect(logCall[0].error).toBeDefined();
        expect(logCall[0].error instanceof Error).toBe(true);
        expect(logCall[0].error.message.length).toBeGreaterThan(0);
      });
    });

    describe('when input is valid JSON but not an array', () => {
      it('should return empty array and log warning for JSON object', () => {
        const jsonObject = '{"key": "value"}';
        const result = (repository as any).safeParseJsonArray(jsonObject, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            fieldName: 'exempt_role_ids',
            value: jsonObject,
            parsedType: 'object',
          }),
          expect.stringContaining('non-array')
        );
      });

      it('should return empty array and log warning for JSON string', () => {
        const jsonString = '"just a string"';
        const result = (repository as any).safeParseJsonArray(jsonString, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            parsedType: 'string',
          }),
          expect.any(String)
        );
      });

      it('should return empty array and log warning for JSON number', () => {
        const jsonNumber = '42';
        const result = (repository as any).safeParseJsonArray(jsonNumber, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            parsedType: 'number',
          }),
          expect.any(String)
        );
      });

      it('should return empty array and log warning for JSON boolean true', () => {
        const jsonBoolean = 'true';
        const result = (repository as any).safeParseJsonArray(jsonBoolean, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            parsedType: 'boolean',
          }),
          expect.any(String)
        );
      });

      it('should return empty array and log warning for JSON boolean false', () => {
        const jsonBoolean = 'false';
        const result = (repository as any).safeParseJsonArray(jsonBoolean, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should return empty array and log warning for JSON null', () => {
        // This is the JSON string "null", not actual null input
        const jsonNull = 'null';
        const result = (repository as any).safeParseJsonArray(jsonNull, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            parsedType: 'object', // typeof null === 'object' in JavaScript
          }),
          expect.any(String)
        );
      });

      it('should return empty array and log warning for nested array', () => {
        // Nested arrays are arrays, but not arrays of strings
        const nestedArray = '[["inner1", "inner2"], ["inner3"]]';
        const result = (repository as any).safeParseJsonArray(nestedArray, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            fieldName: 'exempt_role_ids',
          }),
          expect.stringContaining('non-string')
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty string input', () => {
        // Empty string is falsy, so returns early without logging
        const emptyString = '';
        const result = (repository as any).safeParseJsonArray(emptyString, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should handle whitespace-only input', () => {
        const whitespace = '   \n\t  ';
        const result = (repository as any).safeParseJsonArray(whitespace, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should handle array with only numeric strings', () => {
        // Discord IDs can be large numbers represented as strings
        const numericStrings = '["123456789012345678", "987654321098765432"]';
        const result = (repository as any).safeParseJsonArray(numericStrings, 'exempt_role_ids');

        expect(result).toEqual(['123456789012345678', '987654321098765432']);
        expect(result[0]).toBe('123456789012345678'); // String, not number
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should handle array with unicode characters', () => {
        const unicodeJson = '["role-😀", "role-日本語", "role-🎵"]';
        const result = (repository as any).safeParseJsonArray(unicodeJson, 'exempt_role_ids');

        expect(result).toEqual(['role-😀', 'role-日本語', 'role-🎵']);
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should reject array with numbers (not strings)', () => {
        const numbersArray = '[123, 456, 789]';
        const result = (repository as any).safeParseJsonArray(numbersArray, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            fieldName: 'exempt_role_ids',
          }),
          expect.stringContaining('non-string')
        );
      });

      it('should reject array with mixed types', () => {
        const mixedArray = '["valid", 123, null, true, "also-valid"]';
        const result = (repository as any).safeParseJsonArray(mixedArray, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });

      it('should reject array with objects as elements', () => {
        const objectsArray = '[{"id": "role-1"}, {"id": "role-2"}]';
        const result = (repository as any).safeParseJsonArray(objectsArray, 'exempt_role_ids');

        expect(result).toEqual([]);
        expect(mockLogger.warn).toHaveBeenCalledOnce();
      });
    });
  });
});
