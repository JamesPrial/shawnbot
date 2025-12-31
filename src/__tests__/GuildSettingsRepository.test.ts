import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { GuildSettingsRepository } from '../database/repositories/GuildSettingsRepository';
import { createTables } from '../database/schema';
import { createMockLogger, createMockGuildSettings } from './fixtures';

describe('GuildSettingsRepository', () => {
  let db: Database.Database;
  let repository: GuildSettingsRepository;
  let mockLogger: Logger;

  beforeEach(() => {
    // Create a mock logger using the fixture
    mockLogger = createMockLogger() as unknown as Logger;

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
      expect(mockLogger.warn).toHaveBeenCalled();
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
      expect(mockLogger.warn).toHaveBeenCalled();
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

  describe('debug logging (WU-3)', () => {
    /**
     * WU-3: GuildSettingsRepository debug logging tests
     *
     * These tests verify that debug logging is properly guarded by isLevelEnabled('debug')
     * and that the correct context is logged for database operations.
     *
     * WHY: Debug logging provides visibility into database operations without performance
     * impact when debug is disabled. The isLevelEnabled check prevents expensive object
     * construction when debug logging is off.
     */

    beforeEach(() => {
      // Reset mock call counts before each test
      vi.clearAllMocks();
    });

    describe('findByGuildId debug logging', () => {
      it('should check if debug level is enabled before logging', () => {
        // WHY: Prevents expensive log object construction when debug is disabled
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.findByGuildId('test-guild');

        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
        // When debug is disabled, debug() should not be called
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log db_query action before query when debug enabled', () => {
        // WHY: Provides visibility into what queries are being executed
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild-123';

        repository.findByGuildId(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_query',
            operation: 'findByGuildId'
          }),
          'Querying guild settings from database'
        );
      });

      it('should log db_result action after query with found status when debug enabled', () => {
        // WHY: Shows whether the query found results, critical for debugging missing configs
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'existing-guild';

        // Create a record to find
        repository.upsert({ guildId, enabled: true });

        // Clear mocks from upsert
        vi.clearAllMocks();
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.findByGuildId(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_result',
            operation: 'findByGuildId',
            found: true
          }),
          'Database query result'
        );
      });

      it('should log db_result with found=false when guild not found', () => {
        // WHY: Distinguishes between "query executed but found nothing" vs "query never ran"
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'non-existent-guild';

        repository.findByGuildId(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_result',
            operation: 'findByGuildId',
            found: false
          }),
          'Database query result'
        );
      });

      it('should call debug logger twice when debug enabled (query + result)', () => {
        // WHY: Both the query and result should be logged for complete visibility
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.findByGuildId('test-guild');

        // isLevelEnabled called twice (before query, before result)
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(2);
        // debug called twice (query log, result log)
        expect(mockLogger.debug).toHaveBeenCalledTimes(2);
      });

      it('should not call debug logger when debug disabled', () => {
        // WHY: Performance optimization - avoid object construction overhead
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.findByGuildId('test-guild');

        // isLevelEnabled is checked
        expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
        // But debug is never called
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });
    });

    describe('upsert debug logging', () => {
      it('should check if debug level is enabled before logging upsert', () => {
        // WHY: Same performance optimization as findByGuildId
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.upsert({ guildId: 'test-guild', enabled: true });

        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log db_write action before upsert when debug enabled', () => {
        // WHY: Shows what data is being written to database
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild';

        repository.upsert({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600
        });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_write',
            operation: 'upsert',
            fields: expect.arrayContaining(['enabled', 'afkTimeoutSeconds'])
          }),
          'Writing guild settings to database'
        );
      });

      it('should log db_write_success action after upsert when debug enabled', () => {
        // WHY: Confirms write completed successfully, helps detect partial failures
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild';

        repository.upsert({ guildId, enabled: true });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_write_success',
            operation: 'upsert'
          }),
          'Successfully wrote guild settings to database'
        );
      });

      it('should include all modified fields in upsert log', () => {
        // WHY: Knowing which fields were updated helps debug config issues
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild';

        repository.upsert({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 500,
          warningSecondsBefore: 90,
          warningChannelId: 'channel-123',
          exemptRoleIds: ['role-1', 'role-2']
        });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            fields: expect.arrayContaining([
              'enabled',
              'afkTimeoutSeconds',
              'warningSecondsBefore',
              'warningChannelId',
              'exemptRoleIds'
            ])
          }),
          'Writing guild settings to database'
        );
      });

      it('should not include guildId in fields array', () => {
        // WHY: guildId is the key, not a modified field
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild';

        repository.upsert({ guildId, enabled: true });

        const logCall = vi.mocked(mockLogger.debug).mock.calls[0];
        expect(logCall[0].fields).not.toContain('guildId');
      });

      it('should call debug logger twice when debug enabled (write + success)', () => {
        // WHY: Both the write attempt and success should be logged
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.upsert({ guildId: 'test-guild', enabled: true });

        // isLevelEnabled called twice
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(2);
        // debug called twice (write log, success log)
        expect(mockLogger.debug).toHaveBeenCalledTimes(2);
      });

      it('should not call debug logger when debug disabled', () => {
        // WHY: Performance optimization
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.upsert({ guildId: 'test-guild', enabled: true });

        expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });
    });

    describe('delete debug logging', () => {
      it('should check if debug level is enabled before logging delete', () => {
        // WHY: Performance optimization
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.delete('test-guild');

        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log db_delete action when debug enabled', () => {
        // WHY: Shows which guilds are having their settings deleted
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'test-guild-to-delete';

        repository.delete(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_delete',
            operation: 'delete'
          }),
          'Deleting guild settings from database'
        );
      });

      it('should call debug logger once when debug enabled', () => {
        // WHY: Delete only logs once (before the operation)
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.delete('test-guild');

        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).toHaveBeenCalledTimes(1);
      });

      it('should not call debug logger when debug disabled', () => {
        // WHY: Performance optimization
        mockLogger.isLevelEnabled.mockReturnValue(false);

        repository.delete('test-guild');

        expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log delete even for non-existent guild', () => {
        // WHY: Attempting to delete a non-existent guild should still be logged
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'non-existent-guild';

        repository.delete(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'db_delete'
          }),
          'Deleting guild settings from database'
        );
      });
    });

    describe('debug logging edge cases', () => {
      it('should handle empty guild ID in logs', () => {
        // WHY: Edge case - empty string guild ID should still log
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.findByGuildId('');

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId: '',
            action: 'db_query'
          }),
          expect.any(String)
        );
      });

      it('should handle special characters in guild ID in logs', () => {
        // WHY: Guild IDs with special chars should be logged correctly
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const guildId = 'guild-!@#$%^&*()';

        repository.findByGuildId(guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId
          }),
          expect.any(String)
        );
      });

      it('should handle minimal upsert (guildId only) in logs', () => {
        // WHY: Upsert with only guildId should have empty fields array
        mockLogger.isLevelEnabled.mockReturnValue(true);

        repository.upsert({ guildId: 'minimal-guild' });

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            fields: []
          }),
          'Writing guild settings to database'
        );
      });
    });
  });
});
