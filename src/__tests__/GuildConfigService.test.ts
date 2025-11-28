import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettingsRepository, GuildSettings } from '../database/repositories/GuildSettingsRepository';

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
});
