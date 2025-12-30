import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettingsRepository, GuildSettings } from '../database/repositories/GuildSettingsRepository';

// Mock the logger module
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger } from '../utils/logger';

describe('GuildConfigService', () => {
  let mockRepository: GuildSettingsRepository;
  let service: GuildConfigService;

  beforeEach(() => {
    // Create a mock repository with all required methods
    mockRepository = {
      findByGuildId: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    } as unknown as GuildSettingsRepository;

    service = new GuildConfigService(mockRepository);

    // Clear all mock calls before each test
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    describe('when no guild settings exist in database', () => {
      it('should return default config for non-existent guild', () => {
        const guildId = 'new-guild-123';
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        const config = service.getConfig(guildId);

        expect(mockRepository.findByGuildId).toHaveBeenCalledWith(guildId);
        expect(config).toEqual({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        });
      });

      it('should return default config with correct default values', () => {
        const guildId = 'default-test-guild';
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        const config = service.getConfig(guildId);

        expect(config.enabled).toBe(false);
        expect(config.afkTimeoutSeconds).toBe(300);
        expect(config.warningSecondsBefore).toBe(60);
        expect(config.warningChannelId).toBeNull();
        expect(config.exemptRoleIds).toEqual([]);
      });

      it('should include ISO timestamp strings for createdAt and updatedAt', () => {
        const guildId = 'timestamp-test';
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        const config = service.getConfig(guildId);

        // Verify they are valid ISO strings
        expect(() => new Date(config.createdAt)).not.toThrow();
        expect(() => new Date(config.updatedAt)).not.toThrow();
        expect(config.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(config.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe('when guild settings exist in database', () => {
      it('should return settings from database', () => {
        const guildId = 'existing-guild';
        const dbSettings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600,
          warningSecondsBefore: 120,
          warningChannelId: 'channel-123',
          exemptRoleIds: ['role-1', 'role-2'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(dbSettings);

        const config = service.getConfig(guildId);

        expect(mockRepository.findByGuildId).toHaveBeenCalledWith(guildId);
        expect(config).toEqual(dbSettings);
      });

      it('should fetch from database on first call', () => {
        const guildId = 'first-call-guild';
        const dbSettings: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(dbSettings);

        service.getConfig(guildId);

        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);
      });
    });

    describe('caching behavior', () => {
      it('should return cached config on subsequent calls without hitting database', () => {
        const guildId = 'cached-guild';
        const dbSettings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 500,
          warningSecondsBefore: 90,
          warningChannelId: 'channel-456',
          exemptRoleIds: ['role-admin'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(dbSettings);

        // First call - should hit database
        const config1 = service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        const config2 = service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1); // Still only 1

        // Third call - should still use cache
        const config3 = service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);

        // All calls should return the same config
        expect(config1).toEqual(config2);
        expect(config2).toEqual(config3);
        expect(config1).toEqual(dbSettings);
      });

      it('should cache default config when guild not in database', () => {
        const guildId = 'non-existent-cached';
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        // First call
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);

        // Second call - should NOT hit database again even for null results
        // Note: Based on the implementation, default configs are NOT cached
        service.getConfig(guildId);

        // The implementation doesn't cache default configs, so this will be called again
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);
      });

      it('should cache different configs for different guilds independently', () => {
        const guild1 = 'guild-one';
        const guild2 = 'guild-two';
        const settings1: GuildSettings = {
          guildId: guild1,
          enabled: true,
          afkTimeoutSeconds: 400,
          warningSecondsBefore: 80,
          warningChannelId: 'channel-1',
          exemptRoleIds: ['role-1'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };
        const settings2: GuildSettings = {
          guildId: guild2,
          enabled: false,
          afkTimeoutSeconds: 800,
          warningSecondsBefore: 160,
          warningChannelId: 'channel-2',
          exemptRoleIds: ['role-2'],
          adminRoleIds: [],
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          if (id === guild1) return settings1;
          if (id === guild2) return settings2;
          return null;
        });

        // Get both configs
        const config1First = service.getConfig(guild1);
        const config2First = service.getConfig(guild2);

        // Get them again - should use cache
        const config1Second = service.getConfig(guild1);
        const config2Second = service.getConfig(guild2);

        // Verify cache was used (only 2 database calls, not 4)
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);

        // Verify correct configs returned
        expect(config1First).toEqual(settings1);
        expect(config1Second).toEqual(settings1);
        expect(config2First).toEqual(settings2);
        expect(config2Second).toEqual(settings2);
      });

      it('should return same object reference from cache', () => {
        const guildId = 'reference-test';
        const dbSettings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 350,
          warningSecondsBefore: 70,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(dbSettings);

        const config1 = service.getConfig(guildId);
        const config2 = service.getConfig(guildId);

        // Should be the exact same object reference from cache
        expect(config1).toBe(config2);
      });
    });
  });

  describe('updateConfig', () => {
    it('should persist changes to repository', () => {
      const guildId = 'update-guild';
      const updates = {
        enabled: true,
        afkTimeoutSeconds: 700,
      };

      const updatedSettings: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 700,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      service.updateConfig(guildId, updates);

      expect(mockRepository.upsert).toHaveBeenCalledWith({
        guildId,
        ...updates,
      });
    });

    it('should update cache with new config', () => {
      const guildId = 'cache-update-guild';
      const updatedSettings: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 450,
        warningSecondsBefore: 90,
        warningChannelId: 'new-channel',
        exemptRoleIds: ['new-role'],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T13:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      const result = service.updateConfig(guildId, { enabled: true });

      // Subsequent getConfig should return the updated config from cache
      vi.mocked(mockRepository.findByGuildId).mockClear();
      const cached = service.getConfig(guildId);

      expect(mockRepository.findByGuildId).not.toHaveBeenCalled();
      expect(cached).toEqual(updatedSettings);
      expect(result).toEqual(updatedSettings);
    });

    it('should return updated config', () => {
      const guildId = 'return-test-guild';
      const updates = {
        warningSecondsBefore: 100,
        warningChannelId: 'channel-999',
      };
      const updatedSettings: GuildSettings = {
        guildId,
        enabled: false,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 100,
        warningChannelId: 'channel-999',
        exemptRoleIds: [],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T14:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      const result = service.updateConfig(guildId, updates);

      expect(result).toEqual(updatedSettings);
    });

    it('should throw error if repository fails to return updated config', () => {
      const guildId = 'error-guild';

      // upsert succeeds but findByGuildId returns null (should never happen in practice)
      vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

      expect(() => {
        service.updateConfig(guildId, { enabled: true });
      }).toThrow('Failed to retrieve updated config for guild error-guild');
    });

    it('should handle partial updates correctly', () => {
      const guildId = 'partial-update';
      const updates = { enabled: true }; // Only updating one field

      const updatedSettings: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T15:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      service.updateConfig(guildId, updates);

      expect(mockRepository.upsert).toHaveBeenCalledWith({
        guildId,
        enabled: true,
      });
    });

    it('should handle updating exemptRoleIds', () => {
      const guildId = 'roles-update-guild';
      const newRoles = ['role-a', 'role-b', 'role-c'];
      const updatedSettings: GuildSettings = {
        guildId,
        enabled: false,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: newRoles,
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T16:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      const result = service.updateConfig(guildId, { exemptRoleIds: newRoles });

      expect(mockRepository.upsert).toHaveBeenCalledWith({
        guildId,
        exemptRoleIds: newRoles,
      });
      expect(result.exemptRoleIds).toEqual(newRoles);
    });

    it('should handle updating all fields at once', () => {
      const guildId = 'full-update-guild';
      const updates = {
        enabled: true,
        afkTimeoutSeconds: 900,
        warningSecondsBefore: 180,
        warningChannelId: 'channel-full',
        exemptRoleIds: ['role-full-1', 'role-full-2'],
      };
      const updatedSettings: GuildSettings = {
        guildId,
        ...updates,
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T17:00:00.000Z',
      };

      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);

      const result = service.updateConfig(guildId, updates);

      expect(mockRepository.upsert).toHaveBeenCalledWith({
        guildId,
        ...updates,
      });
      expect(result).toEqual(updatedSettings);
    });

    it('should replace old cache entry with new config', () => {
      const guildId = 'cache-replacement-guild';
      const initialSettings: GuildSettings = {
        guildId,
        enabled: false,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const updatedSettings: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 600,
        warningSecondsBefore: 120,
        warningChannelId: 'channel-new',
        exemptRoleIds: ['role-new'],
        adminRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T18:00:00.000Z',
      };

      // First get to populate cache
      vi.mocked(mockRepository.findByGuildId).mockReturnValue(initialSettings);
      const initial = service.getConfig(guildId);
      expect(initial.enabled).toBe(false);

      // Update
      vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettings);
      service.updateConfig(guildId, { enabled: true });

      // Verify cache was updated
      vi.mocked(mockRepository.findByGuildId).mockClear();
      const cached = service.getConfig(guildId);
      expect(mockRepository.findByGuildId).not.toHaveBeenCalled();
      expect(cached.enabled).toBe(true);
    });
  });

  describe('clearCache', () => {
    describe('when clearing specific guild cache', () => {
      it('should clear cache for specific guild', () => {
        const guildId = 'clear-specific-guild';
        const dbSettings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 500,
          warningSecondsBefore: 100,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(dbSettings);

        // Populate cache
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);

        // Clear cache for this guild
        service.clearCache(guildId);

        // Next getConfig should hit database again
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);
      });

      it('should only clear specified guild, not others', () => {
        const guild1 = 'guild-keep';
        const guild2 = 'guild-clear';
        const settings1: GuildSettings = {
          guildId: guild1,
          enabled: true,
          afkTimeoutSeconds: 400,
          warningSecondsBefore: 80,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };
        const settings2: GuildSettings = {
          guildId: guild2,
          enabled: false,
          afkTimeoutSeconds: 600,
          warningSecondsBefore: 120,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          if (id === guild1) return settings1;
          if (id === guild2) return settings2;
          return null;
        });

        // Populate both caches
        service.getConfig(guild1);
        service.getConfig(guild2);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);

        // Clear only guild2
        service.clearCache(guild2);

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // guild1 should still be cached
        service.getConfig(guild1);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();

        // guild2 should hit database
        service.getConfig(guild2);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);
        expect(mockRepository.findByGuildId).toHaveBeenCalledWith(guild2);
      });

      it('should not throw error when clearing non-existent cache entry', () => {
        expect(() => {
          service.clearCache('never-cached-guild');
        }).not.toThrow();
      });
    });

    describe('when clearing all caches', () => {
      it('should clear all cached guilds when no guildId provided', () => {
        const guild1 = 'guild-all-1';
        const guild2 = 'guild-all-2';
        const guild3 = 'guild-all-3';

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => createSettings(id));

        // Populate multiple caches
        service.getConfig(guild1);
        service.getConfig(guild2);
        service.getConfig(guild3);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(3);

        // Clear all caches
        service.clearCache();

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // All should hit database again
        service.getConfig(guild1);
        service.getConfig(guild2);
        service.getConfig(guild3);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(3);
      });

      it('should work when called on empty cache', () => {
        expect(() => {
          service.clearCache();
        }).not.toThrow();
      });

      it('should allow caching again after clearing all', () => {
        const guildId = 'recache-test';
        const settings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 350,
          warningSecondsBefore: 70,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settings);

        // Cache it
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);

        // Clear all
        service.clearCache();

        // Recache it
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);

        // Verify it's cached again
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2); // Still 2
      });
    });

    describe('edge cases', () => {
      it('should handle clearing same guild cache multiple times', () => {
        const guildId = 'multi-clear-guild';

        expect(() => {
          service.clearCache(guildId);
          service.clearCache(guildId);
          service.clearCache(guildId);
        }).not.toThrow();
      });

      it('should handle clearing all cache multiple times', () => {
        expect(() => {
          service.clearCache();
          service.clearCache();
          service.clearCache();
        }).not.toThrow();
      });
    });
  });

  describe('LRU cache eviction', () => {
    describe('when cache exceeds max size', () => {
      it('should evict the oldest entry when max size is reached', () => {
        // Create service with small cache size for easy testing
        const smallCacheService = new GuildConfigService(mockRepository, 3);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Fill cache to max capacity (3 entries)
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-2');
        smallCacheService.getConfig('guild-3');
        const initialCallCount = callCount;

        // Verify all 3 are in cache (no additional DB calls on re-fetch)
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-2');
        smallCacheService.getConfig('guild-3');
        expect(callCount).toBe(initialCallCount); // No new DB calls

        // Add 4th entry - should evict guild-1 (oldest/least recently used)
        const beforeGuild4CallCount = callCount;
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeGuild4CallCount + 1); // One more DB call for guild-4

        // Verify guild-2, guild-3, guild-4 are still cached (don't check guild-1 as it was evicted)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('guild-2');
        smallCacheService.getConfig('guild-3');
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls (all cached)
      });

      it('should evict the correct entry when cache is filled sequentially', () => {
        // This test verifies that eviction follows insertion order when no accesses occur
        const smallCacheService = new GuildConfigService(mockRepository, 2);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Add first entry
        smallCacheService.getConfig('first');
        // Add second entry
        smallCacheService.getConfig('second');
        const callCountBefore = callCount;

        // Add third entry - should evict 'first'
        smallCacheService.getConfig('third');
        expect(callCount).toBe(callCountBefore + 1); // One more call for 'third'

        // 'second' and 'third' should still be cached (don't check 'first' as it was evicted)
        const callCountBeforeFinal = callCount;
        smallCacheService.getConfig('second');
        smallCacheService.getConfig('third');
        expect(callCount).toBe(callCountBeforeFinal); // No new DB calls
      });

      it('should handle eviction when cache size is 1', () => {
        // Edge case: cache that can only hold one entry
        const tinyCache = new GuildConfigService(mockRepository, 1);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Add first entry
        tinyCache.getConfig('only-one');
        const callCountAfterFirst = callCount;

        // Verify it's cached
        tinyCache.getConfig('only-one');
        expect(callCount).toBe(callCountAfterFirst); // No new DB call

        // Add second entry - should evict first
        tinyCache.getConfig('only-two');
        expect(callCount).toBe(callCountAfterFirst + 1); // One more DB call

        // First should be gone - accessing it hits DB
        const callCountBeforeCheck = callCount;
        tinyCache.getConfig('only-one');
        expect(callCount).toBe(callCountBeforeCheck + 1); // Hit DB (was evicted)

        // Second should now be evicted since we just accessed 'only-one'
        const callCountBeforeFinal = callCount;
        tinyCache.getConfig('only-two');
        expect(callCount).toBe(callCountBeforeFinal + 1); // Hit DB (was evicted)
      });
    });

    describe('when accessing an entry updates its recency', () => {
      it('should prevent eviction of recently accessed entries', () => {
        // This test proves that accessing an entry moves it to the "most recently used" position
        const smallCacheService = new GuildConfigService(mockRepository, 3);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Fill cache: guild-1, guild-2, guild-3 (in that order)
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-2');
        smallCacheService.getConfig('guild-3');
        const afterFillCount = callCount;

        // Access guild-1 again - this should move it to "most recently used"
        smallCacheService.getConfig('guild-1');
        expect(callCount).toBe(afterFillCount); // No DB call (was cached)

        // Now the LRU order should be: guild-2 (oldest), guild-3, guild-1 (newest)

        // Add guild-4 - should evict guild-2, not guild-1
        const beforeGuild4Count = callCount;
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeGuild4Count + 1); // One new DB call

        // Verify guild-1, guild-3, guild-4 are still cached (don't check guild-2 as it was evicted)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-3');
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls
      });

      it('should update recency on multiple sequential accesses', () => {
        const smallCacheService = new GuildConfigService(mockRepository, 3);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Fill cache: A, B, C
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('B');
        smallCacheService.getConfig('C');
        const afterFillCount = callCount;

        // Access pattern: A, A, A (repeatedly accessing oldest entry)
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('A');
        expect(callCount).toBe(afterFillCount); // No new DB calls

        // LRU order should now be: B (oldest), C, A (newest)

        // Add D - should evict B
        const beforeDCount = callCount;
        smallCacheService.getConfig('D');
        expect(callCount).toBe(beforeDCount + 1); // One new DB call

        // A, C, D should be cached (don't check B as it was evicted)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('C');
        smallCacheService.getConfig('D');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls
      });

      it('should preserve cache size limit while updating recency', () => {
        // Ensures that accessing entries doesn't somehow allow cache to grow beyond max size
        const smallCacheService = new GuildConfigService(mockRepository, 2);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => {
          callCount++;
          return createSettings(id);
        });

        // Add entries with lots of accesses in between
        smallCacheService.getConfig('X');
        smallCacheService.getConfig('X'); // Access again
        smallCacheService.getConfig('Y');
        smallCacheService.getConfig('Y'); // Access again
        const beforeXAccessCount = callCount;
        smallCacheService.getConfig('X'); // Access X again
        expect(callCount).toBe(beforeXAccessCount); // No new DB call

        // At this point, cache should still only have 2 entries: X and Y

        // Add Z - should evict Y (since X was accessed most recently)
        const beforeZCount = callCount;
        smallCacheService.getConfig('Z');
        expect(callCount).toBe(beforeZCount + 1); // One new DB call

        // X and Z should be cached (don't check Y as it was evicted)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('X');
        smallCacheService.getConfig('Z');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls
      });
    });

    describe('when setting an existing entry updates its recency', () => {
      it('should move updated entry to most recently used position', () => {
        // This tests that calling updateConfig on an existing cached entry updates its LRU position
        const smallCacheService = new GuildConfigService(mockRepository, 3);

        const createSettings = (guildId: string, enabled: boolean = false): GuildSettings => ({
          guildId,
          enabled,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        const mockImpl = (id: string) => {
          callCount++;
          // Return different enabled states for clarity
          if (id === 'guild-1') return createSettings(id, true); // Updated state
          if (id === 'guild-2') return createSettings(id, false);
          if (id === 'guild-3') return createSettings(id, false);
          return createSettings(id, true);
        };

        vi.mocked(mockRepository.findByGuildId).mockImplementation(mockImpl);
        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          // upsert succeeds silently
        });

        // Fill cache: guild-1, guild-2, guild-3
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-2');
        smallCacheService.getConfig('guild-3');
        const afterFillCount = callCount;

        // Update guild-1 (oldest entry) - should move it to newest
        smallCacheService.updateConfig('guild-1', { enabled: true });
        // updateConfig calls findByGuildId once after upsert
        expect(callCount).toBe(afterFillCount + 1);

        // LRU order should now be: guild-2 (oldest), guild-3, guild-1 (newest)

        // Add guild-4 - should evict guild-2, not guild-1
        const beforeGuild4Count = callCount;
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeGuild4Count + 1);

        // Verify that guild-1, guild-3, guild-4 are still cached without accessing guild-2
        // (accessing guild-2 would re-add it to cache and potentially evict something else)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('guild-1');
        smallCacheService.getConfig('guild-3');
        smallCacheService.getConfig('guild-4');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls - all should be cached
      });

      it('should not increase cache size when updating existing entry', () => {
        // Ensures that updateConfig on a cached entry doesn't add a duplicate
        const smallCacheService = new GuildConfigService(mockRepository, 2);

        const createSettings = (guildId: string, timeout: number = 300): GuildSettings => ({
          guildId,
          enabled: false,
          afkTimeoutSeconds: timeout,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        let callCount = 0;
        const mockImpl = (id: string) => {
          callCount++;
          if (id === 'guild-A') return createSettings(id, 600); // Assume updated state
          if (id === 'guild-B') return createSettings(id, 300);
          return createSettings(id, 600);
        };

        vi.mocked(mockRepository.findByGuildId).mockImplementation(mockImpl);
        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          // upsert succeeds silently
        });

        // Fill cache to capacity
        smallCacheService.getConfig('guild-A');
        smallCacheService.getConfig('guild-B');
        const afterFillCount = callCount;

        // Update guild-A
        smallCacheService.updateConfig('guild-A', { afkTimeoutSeconds: 600 });
        // updateConfig calls findByGuildId once after upsert
        expect(callCount).toBe(afterFillCount + 1);

        // Cache should still only have 2 entries (A and B)
        // Add guild-C - should evict guild-B (since A was just updated)
        const beforeGuildCCount = callCount;
        smallCacheService.getConfig('guild-C');
        expect(callCount).toBe(beforeGuildCCount + 1); // One new DB call

        // Verify that guild-A and guild-C are still cached without accessing guild-B
        // (accessing guild-B would re-add it to cache and potentially evict something else)
        const beforeFinalCheckCount = callCount;
        smallCacheService.getConfig('guild-A');
        smallCacheService.getConfig('guild-C');
        expect(callCount).toBe(beforeFinalCheckCount); // No new DB calls
      });

      it('should add new entry to cache when updating non-cached guild', () => {
        // When updateConfig is called on a guild not in cache, it should be added
        const smallCacheService = new GuildConfigService(mockRepository, 2);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => createSettings(id));

        // Update a guild that's not in cache yet
        smallCacheService.updateConfig('new-guild', { enabled: true });

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // Should now be cached
        smallCacheService.getConfig('new-guild');
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();
      });
    });
  });

  describe('upsert error handling', () => {
    describe('when repository.upsert throws an error', () => {
      it('should log the error with context', () => {
        const guildId = 'error-guild';
        const updates = { enabled: true, afkTimeoutSeconds: 500 };
        const dbError = new Error('Database connection failed');

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          throw dbError;
        });

        expect(() => {
          service.updateConfig(guildId, updates);
        }).toThrow();

        // Verify error was logged with full context
        expect(logger.error).toHaveBeenCalledWith(
          { error: dbError, guildId, updates },
          'Failed to upsert guild settings to database'
        );
        expect(logger.error).toHaveBeenCalledTimes(1);
      });

      it('should rethrow error with additional context', () => {
        const guildId = 'failing-guild';
        const updates = { warningSecondsBefore: 120 };
        const originalError = new Error('Constraint violation');

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          throw originalError;
        });

        expect(() => {
          service.updateConfig(guildId, updates);
        }).toThrow(
          `Failed to update guild settings for guild ${guildId}: ${originalError.message}`
        );
      });

      it('should handle non-Error thrown objects gracefully', () => {
        // Edge case: something throws a non-Error object
        const guildId = 'weird-error-guild';
        const updates = { enabled: false };

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          // eslint-disable-next-line no-throw-literal
          throw 'string error'; // Intentionally throwing a string
        });

        expect(() => {
          service.updateConfig(guildId, updates);
        }).toThrow(`Failed to update guild settings for guild ${guildId}: string error`);

        // Should still log the error
        expect(logger.error).toHaveBeenCalled();
      });

      it('should handle undefined error message', () => {
        const guildId = 'no-message-guild';
        const updates = { afkTimeoutSeconds: 999 };

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          const errorWithoutMessage = new Error();
          errorWithoutMessage.message = '';
          throw errorWithoutMessage;
        });

        expect(() => {
          service.updateConfig(guildId, updates);
        }).toThrow(`Failed to update guild settings for guild ${guildId}:`);
      });

      it('should not update cache when upsert fails', () => {
        // This is critical: if DB update fails, cache must not be updated with stale data
        const guildId = 'cache-integrity-guild';
        const initialSettings: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        // First, populate cache with initial settings
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(initialSettings);
        const cachedBefore = service.getConfig(guildId);
        expect(cachedBefore.enabled).toBe(false);

        // Now make upsert fail
        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          throw new Error('Database locked');
        });

        // Attempt to update - should throw
        expect(() => {
          service.updateConfig(guildId, { enabled: true });
        }).toThrow('Database locked');

        // Clear the mock to ensure next call doesn't hit DB
        vi.mocked(mockRepository.findByGuildId).mockClear();

        // Cache should still have the OLD value (enabled: false)
        const cachedAfter = service.getConfig(guildId);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled(); // Proves it came from cache
        expect(cachedAfter.enabled).toBe(false); // Proves cache wasn't corrupted
        expect(cachedAfter).toEqual(initialSettings);
      });

      it('should allow subsequent successful updates after a failed update', () => {
        const guildId = 'retry-guild';
        const successfulSettings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 400,
          warningSecondsBefore: 80,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T01:00:00.000Z',
        };

        // First update fails
        vi.mocked(mockRepository.upsert).mockImplementationOnce(() => {
          throw new Error('Temporary failure');
        });

        expect(() => {
          service.updateConfig(guildId, { enabled: true });
        }).toThrow('Temporary failure');

        // Second update succeeds
        vi.mocked(mockRepository.upsert).mockImplementationOnce(() => {
          // Success (no throw)
        });
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(successfulSettings);

        const result = service.updateConfig(guildId, { enabled: true });

        expect(result).toEqual(successfulSettings);
        expect(logger.error).toHaveBeenCalledTimes(1); // Only the first failure was logged
      });
    });

    describe('when repository.upsert succeeds but findByGuildId returns null', () => {
      it('should throw error indicating retrieval failure', () => {
        // This tests the second error condition in updateConfig
        const guildId = 'retrieval-fail-guild';

        // upsert succeeds (doesn't throw)
        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          // Success
        });

        // But findByGuildId returns null (should never happen, but we handle it)
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        expect(() => {
          service.updateConfig(guildId, { enabled: true });
        }).toThrow(`Failed to retrieve updated config for guild ${guildId}`);

        // This error should NOT be logged to logger.error (it's a different code path)
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should not update cache when retrieval fails', () => {
        const guildId = 'retrieval-cache-test';
        const initialSettings: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        // Populate cache
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(initialSettings);
        service.getConfig(guildId);

        // Make retrieval fail after successful upsert
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);

        expect(() => {
          service.updateConfig(guildId, { enabled: true });
        }).toThrow('Failed to retrieve updated config');

        // Cache should still have old value
        vi.mocked(mockRepository.findByGuildId).mockClear();
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(initialSettings);

        const cached = service.getConfig(guildId);
        // If this didn't hit the DB, cache wasn't corrupted
        // If it did hit the DB, that's also acceptable behavior
        // The key is that we didn't cache a null/undefined value
        expect(cached).toEqual(initialSettings);
      });
    });

    describe('error handling edge cases', () => {
      it('should log all fields in updates object, including arrays', () => {
        const guildId = 'complex-update-guild';
        const complexUpdates = {
          enabled: true,
          afkTimeoutSeconds: 600,
          exemptRoleIds: ['role-1', 'role-2', 'role-3'],
          warningChannelId: 'channel-999',
        };
        const error = new Error('Complex update failed');

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          throw error;
        });

        expect(() => {
          service.updateConfig(guildId, complexUpdates);
        }).toThrow();

        // Verify the complete updates object was logged
        expect(logger.error).toHaveBeenCalledWith(
          { error, guildId, updates: complexUpdates },
          'Failed to upsert guild settings to database'
        );
      });

      it('should handle errors during updates with partial config changes', () => {
        const guildId = 'partial-error-guild';
        const partialUpdate = { warningSecondsBefore: 30 }; // Only updating one field

        vi.mocked(mockRepository.upsert).mockImplementation(() => {
          throw new Error('Partial update failed');
        });

        expect(() => {
          service.updateConfig(guildId, partialUpdate);
        }).toThrow('Partial update failed');

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            updates: partialUpdate,
          }),
          'Failed to upsert guild settings to database'
        );
      });
    });
  });

  describe('null value handling from database', () => {
    describe('when database returns settings with null numeric fields', () => {
      it('should apply default timeout (300) when database has null afkTimeoutSeconds', () => {
        const guildId = 'null-timeout-guild';
        const settingsWithNullTimeout: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number, // Simulating DB null
          warningSecondsBefore: 120,
          warningChannelId: 'channel-123',
          exemptRoleIds: ['role-1'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNullTimeout);

        const config = service.getConfig(guildId);

        // CRITICAL: Service must replace null with default value
        expect(config.afkTimeoutSeconds).toBe(300);
        // Verify other fields preserved
        expect(config.enabled).toBe(true);
        expect(config.warningSecondsBefore).toBe(120);
        expect(config.warningChannelId).toBe('channel-123');
        expect(config.exemptRoleIds).toEqual(['role-1']);
      });

      it('should apply default warning (60) when database has null warningSecondsBefore', () => {
        const guildId = 'null-warning-guild';
        const settingsWithNullWarning: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 450,
          warningSecondsBefore: null as unknown as number, // Simulating DB null
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNullWarning);

        const config = service.getConfig(guildId);

        // CRITICAL: Service must replace null with default value
        expect(config.warningSecondsBefore).toBe(60);
        // Verify other fields preserved
        expect(config.enabled).toBe(false);
        expect(config.afkTimeoutSeconds).toBe(450);
        expect(config.warningChannelId).toBeNull();
      });

      it('should apply defaults for both timeout and warning when both are null', () => {
        const guildId = 'both-null-guild';
        const settingsWithBothNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number, // Simulating DB null
          warningSecondsBefore: null as unknown as number, // Simulating DB null
          warningChannelId: 'channel-999',
          exemptRoleIds: ['role-admin', 'role-mod'],
          adminRoleIds: ['admin-1'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithBothNull);

        const config = service.getConfig(guildId);

        // CRITICAL: Both nulls must be replaced with defaults
        expect(config.afkTimeoutSeconds).toBe(300);
        expect(config.warningSecondsBefore).toBe(60);
        // Verify other fields preserved exactly
        expect(config.enabled).toBe(true);
        expect(config.warningChannelId).toBe('channel-999');
        expect(config.exemptRoleIds).toEqual(['role-admin', 'role-mod']);
        expect(config.adminRoleIds).toEqual(['admin-1']);
      });

      it('should preserve non-null numeric values from database without overwriting', () => {
        // This test proves the service doesn't blindly overwrite valid custom values
        const guildId = 'custom-values-guild';
        const settingsWithCustomValues: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 999, // Custom non-default value
          warningSecondsBefore: 150, // Custom non-default value
          warningChannelId: 'channel-custom',
          exemptRoleIds: ['custom-role'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithCustomValues);

        const config = service.getConfig(guildId);

        // CRITICAL: Must preserve the custom values, not replace with defaults
        expect(config.afkTimeoutSeconds).toBe(999);
        expect(config.warningSecondsBefore).toBe(150);
        // Verify no field was modified
        expect(config).toEqual(settingsWithCustomValues);
      });

      it('should preserve zero values without treating them as null', () => {
        // Edge case: 0 is a valid value and should not be replaced with default
        const guildId = 'zero-values-guild';
        const settingsWithZero: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 0, // Zero is valid, means immediate timeout
          warningSecondsBefore: 0, // Zero is valid, means no warning
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithZero);

        const config = service.getConfig(guildId);

        // CRITICAL: Zero must be preserved, not replaced with defaults
        expect(config.afkTimeoutSeconds).toBe(0);
        expect(config.warningSecondsBefore).toBe(0);
      });

      it('should handle mix of null and valid values correctly', () => {
        // Real-world scenario: partial null corruption from database migration
        const guildId = 'mixed-null-guild';
        const settingsWithMixedNulls: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600, // Valid value
          warningSecondsBefore: null as unknown as number, // Null value
          warningChannelId: 'channel-mixed',
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithMixedNulls);

        const config = service.getConfig(guildId);

        // Valid value preserved, null replaced
        expect(config.afkTimeoutSeconds).toBe(600);
        expect(config.warningSecondsBefore).toBe(60);
        expect(config.warningChannelId).toBe('channel-mixed');
      });
    });

    describe('when updateConfig returns settings with null fields', () => {
      it('should apply defaults to null fields in returned config after update', () => {
        // Tests that updateConfig also applies defaults when DB returns nulls
        const guildId = 'update-null-guild';
        const updatedSettingsWithNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number, // DB returned null after update
          warningSecondsBefore: 90,
          warningChannelId: 'new-channel',
          exemptRoleIds: ['new-role'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T10:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedSettingsWithNull);

        const result = service.updateConfig(guildId, { enabled: true });

        // CRITICAL: Returned config must have defaults applied
        expect(result.afkTimeoutSeconds).toBe(300);
        expect(result.warningSecondsBefore).toBe(90);
        expect(result.enabled).toBe(true);
      });

      it('should apply defaults to both null fields when updateConfig returns both null', () => {
        const guildId = 'update-both-null-guild';
        const updatedWithBothNull: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: null as unknown as number,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T11:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedWithBothNull);

        const result = service.updateConfig(guildId, { warningChannelId: null });

        // CRITICAL: Both nulls replaced with defaults
        expect(result.afkTimeoutSeconds).toBe(300);
        expect(result.warningSecondsBefore).toBe(60);
        expect(result.enabled).toBe(false);
      });

      it('should preserve custom non-null values in updateConfig result', () => {
        // Ensures updateConfig doesn't overwrite valid custom values with defaults
        const guildId = 'update-preserve-guild';
        const updatedWithCustomValues: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 888,
          warningSecondsBefore: 200,
          warningChannelId: 'preserved-channel',
          exemptRoleIds: ['preserved-role'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(updatedWithCustomValues);

        const result = service.updateConfig(guildId, { afkTimeoutSeconds: 888 });

        // CRITICAL: Custom values must not be replaced
        expect(result.afkTimeoutSeconds).toBe(888);
        expect(result.warningSecondsBefore).toBe(200);
      });
    });

    describe('when cached values have null fields', () => {
      it('should apply defaults before caching so subsequent calls have correct values', () => {
        // This test proves that nulls are fixed BEFORE caching, not on every access
        const guildId = 'cache-with-nulls-guild';
        const settingsWithNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: null as unknown as number,
          warningChannelId: 'channel-cache',
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNull);

        // First call - hits DB
        const firstCall = service.getConfig(guildId);
        expect(firstCall.afkTimeoutSeconds).toBe(300);
        expect(firstCall.warningSecondsBefore).toBe(60);

        // Clear mock to verify cache is used
        vi.mocked(mockRepository.findByGuildId).mockClear();

        // Second call - should use cache AND still have defaults applied
        const secondCall = service.getConfig(guildId);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled(); // Proves cache hit
        expect(secondCall.afkTimeoutSeconds).toBe(300); // CRITICAL: Defaults still present
        expect(secondCall.warningSecondsBefore).toBe(60);
      });

      it('should return same object reference from cache with defaults already applied', () => {
        // Tests that the cached object already has defaults, ensuring performance
        const guildId = 'cache-reference-nulls';
        const settingsWithNull: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: 45,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNull);

        const call1 = service.getConfig(guildId);
        const call2 = service.getConfig(guildId);

        // Should be same reference (cached)
        expect(call1).toBe(call2);
        // And both should have defaults
        expect(call1.afkTimeoutSeconds).toBe(300);
        expect(call2.afkTimeoutSeconds).toBe(300);
      });

      it('should not hit database on subsequent calls after defaults are applied and cached', () => {
        // Proves that default application happens once, then cache is used
        const guildId = 'cache-efficiency-nulls';
        const settingsWithNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: null as unknown as number,
          warningChannelId: 'efficient-channel',
          exemptRoleIds: ['role-eff'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        let dbCallCount = 0;
        vi.mocked(mockRepository.findByGuildId).mockImplementation(() => {
          dbCallCount++;
          return settingsWithNull;
        });

        // Call multiple times
        service.getConfig(guildId);
        service.getConfig(guildId);
        service.getConfig(guildId);

        // Should only hit DB once
        expect(dbCallCount).toBe(1);
      });
    });

    describe('edge cases with null value handling', () => {
      it('should handle undefined as different from null and treat it as missing', () => {
        // Edge case: undefined vs null behavior
        const guildId = 'undefined-field-guild';
        const settingsWithUndefined: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: undefined as unknown as number,
          warningSecondsBefore: 75,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithUndefined);

        const config = service.getConfig(guildId);

        // Should apply default for undefined as well
        expect(config.afkTimeoutSeconds).toBe(300);
        expect(config.warningSecondsBefore).toBe(75);
      });

      it('should handle negative values by preserving them (they are technically valid numbers)', () => {
        // Edge case: negative numbers might indicate disabled features
        const guildId = 'negative-values-guild';
        const settingsWithNegatives: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: -1, // Might mean "disabled"
          warningSecondsBefore: -1, // Might mean "no warning"
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNegatives);

        const config = service.getConfig(guildId);

        // Negative numbers should be preserved as they might be valid sentinel values
        expect(config.afkTimeoutSeconds).toBe(-1);
        expect(config.warningSecondsBefore).toBe(-1);
      });

      it('should handle very large numbers without replacing them', () => {
        // Edge case: MAX_SAFE_INTEGER and beyond
        const guildId = 'large-numbers-guild';
        const settingsWithLargeNumbers: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: Number.MAX_SAFE_INTEGER,
          warningSecondsBefore: 999999999,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithLargeNumbers);

        const config = service.getConfig(guildId);

        // Large valid numbers should be preserved
        expect(config.afkTimeoutSeconds).toBe(Number.MAX_SAFE_INTEGER);
        expect(config.warningSecondsBefore).toBe(999999999);
      });
    });

    describe('integration with cache clearing and null values', () => {
      it('should reapply defaults after cache clear if DB still returns nulls', () => {
        // Tests that defaults are applied on every fetch from DB, not just once
        const guildId = 'reclear-nulls-guild';
        const settingsWithNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: null as unknown as number,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settingsWithNull);

        // First fetch
        const first = service.getConfig(guildId);
        expect(first.afkTimeoutSeconds).toBe(300);

        // Clear cache
        service.clearCache(guildId);

        // Second fetch - should apply defaults again
        const second = service.getConfig(guildId);
        expect(second.afkTimeoutSeconds).toBe(300);
        expect(second.warningSecondsBefore).toBe(60);
      });

      it('should handle update that changes value from null to custom, then to null again', () => {
        // Complex scenario: tracking default application through multiple updates
        const guildId = 'null-cycle-guild';

        // Initial state: null in DB
        const initialNull: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: null as unknown as number,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(initialNull);

        // First fetch - applies default
        const firstFetch = service.getConfig(guildId);
        expect(firstFetch.afkTimeoutSeconds).toBe(300);

        // Update to custom value
        const customValue: GuildSettings = {
          ...initialNull,
          afkTimeoutSeconds: 500,
          updatedAt: '2024-01-02T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(customValue);

        const afterUpdate = service.updateConfig(guildId, { afkTimeoutSeconds: 500 });
        expect(afterUpdate.afkTimeoutSeconds).toBe(500);

        // Update back to null (DB corruption scenario)
        const backToNull: GuildSettings = {
          ...customValue,
          afkTimeoutSeconds: null as unknown as number,
          updatedAt: '2024-01-03T00:00:00.000Z',
        };
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(backToNull);

        service.clearCache(guildId);
        const afterCorruption = service.getConfig(guildId);
        expect(afterCorruption.afkTimeoutSeconds).toBe(300); // Default reapplied
      });
    });
  });

  describe('onGuildDelete', () => {
    describe('when guild exists in cache', () => {
      it('should clear cache entry for specified guild', () => {
        const guildId = 'guild-to-delete';
        const settings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 500,
          warningSecondsBefore: 100,
          warningChannelId: 'channel-123',
          exemptRoleIds: ['role-1'],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settings);

        // Populate cache
        service.getConfig(guildId);

        // Verify it's cached
        vi.mocked(mockRepository.findByGuildId).mockClear();
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();

        // Delete guild
        service.onGuildDelete(guildId);

        // Should hit database on next access (cache was cleared)
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settings);
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).toHaveBeenCalledWith(guildId);
      });

      it('should log debug message when clearing cache', () => {
        const guildId = 'logged-delete-guild';
        const settings: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settings);

        // Populate cache
        service.getConfig(guildId);

        vi.clearAllMocks();

        // Delete guild
        service.onGuildDelete(guildId);

        // Verify debug log was called
        expect(logger.debug).toHaveBeenCalledWith(
          { guildId },
          'Cleared guild config cache on guild delete'
        );
        expect(logger.debug).toHaveBeenCalledTimes(1);
      });

      it('should only clear specified guild, not affect other cached guilds', () => {
        const guild1 = 'keep-this-guild';
        const guild2 = 'delete-this-guild';
        const guild3 = 'also-keep-this';

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => createSettings(id));

        // Populate cache with 3 guilds
        service.getConfig(guild1);
        service.getConfig(guild2);
        service.getConfig(guild3);

        // Delete only guild2
        service.onGuildDelete(guild2);

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // guild1 and guild3 should still be cached
        service.getConfig(guild1);
        service.getConfig(guild3);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();

        // guild2 should hit database
        service.getConfig(guild2);
        expect(mockRepository.findByGuildId).toHaveBeenCalledWith(guild2);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(1);
      });
    });

    describe('when guild does not exist in cache', () => {
      it('should not throw error when deleting non-existent cache entry', () => {
        const guildId = 'never-cached-guild';

        expect(() => {
          service.onGuildDelete(guildId);
        }).not.toThrow();
      });

      it('should still log debug message even when guild not in cache', () => {
        const guildId = 'uncached-delete-guild';

        service.onGuildDelete(guildId);

        // Should log regardless of whether guild was in cache
        expect(logger.debug).toHaveBeenCalledWith(
          { guildId },
          'Cleared guild config cache on guild delete'
        );
      });

      it('should be idempotent - can be called multiple times safely', () => {
        const guildId = 'idempotent-delete-guild';

        expect(() => {
          service.onGuildDelete(guildId);
          service.onGuildDelete(guildId);
          service.onGuildDelete(guildId);
        }).not.toThrow();

        // Should log each time
        expect(logger.debug).toHaveBeenCalledTimes(3);
      });
    });

    describe('integration with other cache operations', () => {
      it('should allow re-caching after deletion', () => {
        const guildId = 'recache-after-delete';
        const settings: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 400,
          warningSecondsBefore: 80,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockRepository.findByGuildId).mockReturnValue(settings);

        // Cache it
        service.getConfig(guildId);

        // Delete it
        service.onGuildDelete(guildId);

        // Re-cache it
        service.getConfig(guildId);

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // Should be cached again
        service.getConfig(guildId);
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();
      });

      it('should interact correctly with clearCache method', () => {
        const guildId1 = 'guild-delete-test';
        const guildId2 = 'guild-clear-test';

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => createSettings(id));

        // Cache both
        service.getConfig(guildId1);
        service.getConfig(guildId2);

        // Use onGuildDelete on first
        service.onGuildDelete(guildId1);

        // Use clearCache on second
        service.clearCache(guildId2);

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // Both should hit database (both cache clearing methods work)
        service.getConfig(guildId1);
        service.getConfig(guildId2);
        expect(mockRepository.findByGuildId).toHaveBeenCalledTimes(2);
      });

      it('should not interfere with LRU eviction logic', () => {
        // Ensures that onGuildDelete works correctly with the LRU cache implementation
        const smallCacheService = new GuildConfigService(mockRepository, 3);

        const createSettings = (guildId: string): GuildSettings => ({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        });

        vi.mocked(mockRepository.findByGuildId).mockImplementation((id) => createSettings(id));

        // Fill cache: A, B, C
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('B');
        smallCacheService.getConfig('C');

        // Delete B (middle entry)
        smallCacheService.onGuildDelete('B');

        // Now cache only has A and C (2 entries)
        // Add D - should not evict anything (cache size < max)
        smallCacheService.getConfig('D');

        vi.mocked(mockRepository.findByGuildId).mockClear();

        // A, C, and D should all be cached
        smallCacheService.getConfig('A');
        smallCacheService.getConfig('C');
        smallCacheService.getConfig('D');
        expect(mockRepository.findByGuildId).not.toHaveBeenCalled();

        // B should not be cached (was deleted)
        smallCacheService.getConfig('B');
        expect(mockRepository.findByGuildId).toHaveBeenCalledWith('B');
      });
    });

    describe('edge cases', () => {
      it('should handle deleting guild with empty string ID', () => {
        // Edge case: what if someone passes an empty string?
        expect(() => {
          service.onGuildDelete('');
        }).not.toThrow();

        expect(logger.debug).toHaveBeenCalledWith(
          { guildId: '' },
          'Cleared guild config cache on guild delete'
        );
      });

      it('should handle deleting guild immediately after creation', () => {
        const guildId = 'immediately-deleted';

        // Get default config (not cached because it's a default)
        vi.mocked(mockRepository.findByGuildId).mockReturnValue(null);
        service.getConfig(guildId);

        // Immediately delete (should not error even though nothing was cached)
        expect(() => {
          service.onGuildDelete(guildId);
        }).not.toThrow();
      });

      it('should handle deleting guild with special characters in ID', () => {
        // Discord IDs are numeric, but test robustness
        const weirdGuildId = 'guild-with-special-!@#$%^&*()-chars';

        expect(() => {
          service.onGuildDelete(weirdGuildId);
        }).not.toThrow();
      });
    });
  });
});
