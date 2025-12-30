import { describe, it, expect, vi } from 'vitest';
import {
  createMockLogger,
  createMockRateLimiter,
  createMockGuildSettings,
  ENABLED_CONFIG,
  DISABLED_CONFIG,
  INVALID_CONFIGS,
  type MockLogger,
  type MockRateLimiter,
} from './fixtures';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';

describe('fixtures', () => {
  describe('createMockLogger', () => {
    it('should return object with all logging methods', () => {
      const logger = createMockLogger();

      expect(logger).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.fatal).toBeDefined();
      expect(logger.trace).toBeDefined();
      expect(logger.child).toBeDefined();
    });

    it('should return mock functions for all logging methods', () => {
      const logger = createMockLogger();

      expect(vi.isMockFunction(logger.debug)).toBe(true);
      expect(vi.isMockFunction(logger.info)).toBe(true);
      expect(vi.isMockFunction(logger.warn)).toBe(true);
      expect(vi.isMockFunction(logger.error)).toBe(true);
      expect(vi.isMockFunction(logger.fatal)).toBe(true);
      expect(vi.isMockFunction(logger.trace)).toBe(true);
      expect(vi.isMockFunction(logger.child)).toBe(true);
    });

    it('should return a fresh instance on each call to prevent shared state', () => {
      const logger1 = createMockLogger();
      const logger2 = createMockLogger();

      // Call one logger's method
      logger1.info('test message');

      // Verify the other logger's method was not called
      expect(logger1.info).toHaveBeenCalledTimes(1);
      expect(logger1.info).toHaveBeenCalledWith('test message');
      expect(logger2.info).not.toHaveBeenCalled();
    });

    it('should allow independent mock configuration per instance', () => {
      const logger1 = createMockLogger();
      const logger2 = createMockLogger();

      // Configure mocks differently
      logger1.error.mockReturnValue('error1' as any);
      logger2.error.mockReturnValue('error2' as any);

      expect(logger1.error()).toBe('error1');
      expect(logger2.error()).toBe('error2');
    });

    it('should configure child method to return the logger itself', () => {
      const logger = createMockLogger();

      const childLogger = logger.child({ component: 'test' });

      expect(childLogger).toBe(logger);
      expect(logger.child).toHaveBeenCalledTimes(1);
      expect(logger.child).toHaveBeenCalledWith({ component: 'test' });
    });

    it('should support all pino log levels including fatal and trace', () => {
      const logger = createMockLogger();

      logger.trace('trace message');
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      logger.fatal('fatal message');

      expect(logger.trace).toHaveBeenCalledWith('trace message');
      expect(logger.debug).toHaveBeenCalledWith('debug message');
      expect(logger.info).toHaveBeenCalledWith('info message');
      expect(logger.warn).toHaveBeenCalledWith('warn message');
      expect(logger.error).toHaveBeenCalledWith('error message');
      expect(logger.fatal).toHaveBeenCalledWith('fatal message');
    });
  });

  describe('createMockRateLimiter', () => {
    it('should return object with recordAction and getActionCount methods', () => {
      const rateLimiter = createMockRateLimiter();

      expect(rateLimiter).toBeDefined();
      expect(rateLimiter.recordAction).toBeDefined();
      expect(rateLimiter.getActionCount).toBeDefined();
    });

    it('should return mock functions for both methods', () => {
      const rateLimiter = createMockRateLimiter();

      expect(vi.isMockFunction(rateLimiter.recordAction)).toBe(true);
      expect(vi.isMockFunction(rateLimiter.getActionCount)).toBe(true);
    });

    it('should configure getActionCount to return 0 by default', () => {
      const rateLimiter = createMockRateLimiter();

      expect(rateLimiter.getActionCount()).toBe(0);
    });

    it('should return a fresh instance on each call to prevent shared state', () => {
      const rateLimiter1 = createMockRateLimiter();
      const rateLimiter2 = createMockRateLimiter();

      // Call one rate limiter's method
      rateLimiter1.recordAction();

      // Verify the other rate limiter's method was not called
      expect(rateLimiter1.recordAction).toHaveBeenCalledTimes(1);
      expect(rateLimiter2.recordAction).not.toHaveBeenCalled();
    });

    it('should allow independent mock configuration per instance', () => {
      const rateLimiter1 = createMockRateLimiter();
      const rateLimiter2 = createMockRateLimiter();

      // Configure getActionCount differently
      rateLimiter1.getActionCount.mockReturnValue(10);
      rateLimiter2.getActionCount.mockReturnValue(25);

      expect(rateLimiter1.getActionCount()).toBe(10);
      expect(rateLimiter2.getActionCount()).toBe(25);
    });
  });

  describe('createMockGuildSettings', () => {
    describe('when called without overrides', () => {
      it('should return complete GuildSettings object with all required fields', () => {
        const settings = createMockGuildSettings();

        expect(settings).toBeDefined();
        expect(settings.guildId).toBeDefined();
        expect(typeof settings.enabled).toBe('boolean');
        expect(typeof settings.afkTimeoutSeconds).toBe('number');
        expect(typeof settings.warningSecondsBefore).toBe('number');
        expect(settings.warningChannelId).toBeNull();
        expect(Array.isArray(settings.exemptRoleIds)).toBe(true);
        expect(Array.isArray(settings.adminRoleIds)).toBe(true);
        expect(settings.createdAt).toBeDefined();
        expect(settings.updatedAt).toBeDefined();
      });

      it('should return default values matching the documented defaults', () => {
        const settings = createMockGuildSettings();

        expect(settings.guildId).toBe('test-guild-123');
        expect(settings.enabled).toBe(false);
        expect(settings.afkTimeoutSeconds).toBe(300);
        expect(settings.warningSecondsBefore).toBe(60);
        expect(settings.warningChannelId).toBe(null);
        expect(settings.exemptRoleIds).toEqual([]);
        expect(settings.adminRoleIds).toEqual([]);
      });

      it('should have valid timeout values', () => {
        const settings = createMockGuildSettings();

        expect(settings.afkTimeoutSeconds).toBeGreaterThan(0);
        expect(settings.warningSecondsBefore).toBeGreaterThan(0);
        expect(settings.warningSecondsBefore).toBeLessThan(settings.afkTimeoutSeconds);
      });
    });

    describe('when called with overrides', () => {
      it('should merge overrides onto defaults', () => {
        const settings = createMockGuildSettings({
          enabled: true,
          afkTimeoutSeconds: 600,
        });

        expect(settings.enabled).toBe(true);
        expect(settings.afkTimeoutSeconds).toBe(600);
        // Other fields should retain defaults
        expect(settings.guildId).toBe('test-guild-123');
        expect(settings.warningSecondsBefore).toBe(60);
      });

      it('should allow overriding all fields', () => {
        const customSettings: GuildSettings = {
          guildId: 'custom-guild',
          enabled: true,
          afkTimeoutSeconds: 900,
          warningSecondsBefore: 120,
          warningChannelId: 'custom-channel',
          exemptRoleIds: ['role1', 'role2'],
          adminRoleIds: ['admin1'],
          createdAt: '2025-12-29T00:00:00.000Z',
          updatedAt: '2025-12-29T00:00:00.000Z',
        };

        const settings = createMockGuildSettings(customSettings);

        expect(settings).toEqual(customSettings);
      });

      it('should allow partial overrides without affecting other fields', () => {
        const settings = createMockGuildSettings({
          warningChannelId: 'test-channel-456',
        });

        expect(settings.warningChannelId).toBe('test-channel-456');
        expect(settings.guildId).toBe('test-guild-123');
        expect(settings.enabled).toBe(false);
        expect(settings.afkTimeoutSeconds).toBe(300);
      });

      it('should handle null overrides correctly', () => {
        const settings = createMockGuildSettings({
          warningChannelId: null,
        });

        expect(settings.warningChannelId).toBe(null);
      });

      it('should handle array overrides correctly', () => {
        const settings = createMockGuildSettings({
          exemptRoleIds: ['exempt1', 'exempt2'],
          adminRoleIds: ['admin1', 'admin2', 'admin3'],
        });

        expect(settings.exemptRoleIds).toEqual(['exempt1', 'exempt2']);
        expect(settings.adminRoleIds).toEqual(['admin1', 'admin2', 'admin3']);
      });
    });

    describe('instance independence', () => {
      it('should return a fresh instance on each call', () => {
        const settings1 = createMockGuildSettings();
        const settings2 = createMockGuildSettings();

        expect(settings1).not.toBe(settings2);
      });

      it('should prevent shared state mutations between instances', () => {
        const settings1 = createMockGuildSettings();
        const settings2 = createMockGuildSettings();

        // Mutate the first instance's array
        settings1.exemptRoleIds.push('new-role');

        // Verify the second instance is unaffected
        expect(settings1.exemptRoleIds).toEqual(['new-role']);
        expect(settings2.exemptRoleIds).toEqual([]);
      });

      it('should create independent array instances for each call', () => {
        const settings1 = createMockGuildSettings({ exemptRoleIds: ['role1'] });
        const settings2 = createMockGuildSettings({ exemptRoleIds: ['role1'] });

        // Even with the same values, arrays should be different instances
        expect(settings1.exemptRoleIds).toEqual(settings2.exemptRoleIds);
        expect(settings1.exemptRoleIds).not.toBe(settings2.exemptRoleIds);
      });
    });
  });

  describe('ENABLED_CONFIG', () => {
    it('should have enabled set to true', () => {
      expect(ENABLED_CONFIG.enabled).toBe(true);
    });

    it('should have valid timeout values', () => {
      expect(ENABLED_CONFIG.afkTimeoutSeconds).toBeGreaterThan(0);
      expect(ENABLED_CONFIG.warningSecondsBefore).toBeGreaterThan(0);
      expect(ENABLED_CONFIG.warningSecondsBefore).toBeLessThan(ENABLED_CONFIG.afkTimeoutSeconds);
    });

    it('should have specific expected timeout values', () => {
      expect(ENABLED_CONFIG.afkTimeoutSeconds).toBe(300);
      expect(ENABLED_CONFIG.warningSecondsBefore).toBe(60);
    });

    it('should have all required GuildSettings fields', () => {
      expect(ENABLED_CONFIG.guildId).toBeDefined();
      expect(typeof ENABLED_CONFIG.enabled).toBe('boolean');
      expect(typeof ENABLED_CONFIG.afkTimeoutSeconds).toBe('number');
      expect(typeof ENABLED_CONFIG.warningSecondsBefore).toBe('number');
      expect(ENABLED_CONFIG.warningChannelId).toBeDefined();
      expect(Array.isArray(ENABLED_CONFIG.exemptRoleIds)).toBe(true);
      expect(Array.isArray(ENABLED_CONFIG.adminRoleIds)).toBe(true);
      expect(ENABLED_CONFIG.createdAt).toBeDefined();
      expect(ENABLED_CONFIG.updatedAt).toBeDefined();
    });
  });

  describe('DISABLED_CONFIG', () => {
    it('should have enabled set to false', () => {
      expect(DISABLED_CONFIG.enabled).toBe(false);
    });

    it('should have valid timeout values', () => {
      expect(DISABLED_CONFIG.afkTimeoutSeconds).toBeGreaterThan(0);
      expect(DISABLED_CONFIG.warningSecondsBefore).toBeGreaterThan(0);
      expect(DISABLED_CONFIG.warningSecondsBefore).toBeLessThan(DISABLED_CONFIG.afkTimeoutSeconds);
    });

    it('should have all required GuildSettings fields', () => {
      expect(DISABLED_CONFIG.guildId).toBeDefined();
      expect(typeof DISABLED_CONFIG.enabled).toBe('boolean');
      expect(typeof DISABLED_CONFIG.afkTimeoutSeconds).toBe('number');
      expect(typeof DISABLED_CONFIG.warningSecondsBefore).toBe('number');
      expect(DISABLED_CONFIG.warningChannelId).toBeDefined();
      expect(Array.isArray(DISABLED_CONFIG.exemptRoleIds)).toBe(true);
      expect(Array.isArray(DISABLED_CONFIG.adminRoleIds)).toBe(true);
      expect(DISABLED_CONFIG.createdAt).toBeDefined();
      expect(DISABLED_CONFIG.updatedAt).toBeDefined();
    });
  });

  describe('INVALID_CONFIGS', () => {
    it('should contain at least 7 invalid configuration scenarios', () => {
      expect(INVALID_CONFIGS.length).toBeGreaterThanOrEqual(7);
    });

    it('should have name and config fields for each entry', () => {
      INVALID_CONFIGS.forEach((entry) => {
        expect(entry.name).toBeDefined();
        expect(typeof entry.name).toBe('string');
        expect(entry.name.length).toBeGreaterThan(0);
        expect(entry.config).toBeDefined();
        expect(typeof entry.config).toBe('object');
      });
    });

    it('should have unique names for all entries', () => {
      const names = INVALID_CONFIGS.map((entry) => entry.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });

    it('should include negative timeout scenario', () => {
      const negativeTimeout = INVALID_CONFIGS.find(
        (entry) => entry.config.afkTimeoutSeconds !== undefined && entry.config.afkTimeoutSeconds < 0
      );

      expect(negativeTimeout).toBeDefined();
      expect(negativeTimeout!.name).toBeTruthy();
    });

    it('should include zero timeout scenario', () => {
      const zeroTimeout = INVALID_CONFIGS.find(
        (entry) => entry.config.afkTimeoutSeconds === 0
      );

      expect(zeroTimeout).toBeDefined();
      expect(zeroTimeout!.name).toBeTruthy();
    });

    it('should include NaN timeout scenario', () => {
      const nanTimeout = INVALID_CONFIGS.find(
        (entry) => entry.config.afkTimeoutSeconds !== undefined && Number.isNaN(entry.config.afkTimeoutSeconds)
      );

      expect(nanTimeout).toBeDefined();
      expect(nanTimeout!.name).toBeTruthy();
    });

    it('should include negative warning time scenario', () => {
      const negativeWarning = INVALID_CONFIGS.find(
        (entry) => entry.config.warningSecondsBefore !== undefined && entry.config.warningSecondsBefore < 0
      );

      expect(negativeWarning).toBeDefined();
      expect(negativeWarning!.name).toBeTruthy();
    });

    it('should include warning time exceeding timeout scenario', () => {
      const warningExceedsTimeout = INVALID_CONFIGS.find((entry) => {
        if (entry.config.afkTimeoutSeconds === undefined || entry.config.warningSecondsBefore === undefined) {
          return false;
        }
        return entry.config.warningSecondsBefore > entry.config.afkTimeoutSeconds;
      });

      expect(warningExceedsTimeout).toBeDefined();
      expect(warningExceedsTimeout!.name).toBeTruthy();
    });

    it('should include warning time equal to timeout scenario', () => {
      const warningEqualsTimeout = INVALID_CONFIGS.find((entry) => {
        if (entry.config.afkTimeoutSeconds === undefined || entry.config.warningSecondsBefore === undefined) {
          return false;
        }
        return entry.config.warningSecondsBefore === entry.config.afkTimeoutSeconds;
      });

      expect(warningEqualsTimeout).toBeDefined();
      expect(warningEqualsTimeout!.name).toBeTruthy();
    });

    describe('each invalid config entry', () => {
      it.each(INVALID_CONFIGS)('$name should have a descriptive name and valid config object', ({ name, config }) => {
        // Name should be descriptive (more than just a single word)
        expect(name.length).toBeGreaterThan(3);

        // Config should be an object with at least one property
        expect(Object.keys(config).length).toBeGreaterThan(0);
      });
    });
  });

  describe('type safety', () => {
    it('should allow MockLogger to be used where Logger type is expected', () => {
      // This test verifies compile-time type compatibility
      const mockLogger: MockLogger = createMockLogger();

      // These calls should be type-safe
      mockLogger.debug('test');
      mockLogger.info('test');
      mockLogger.warn('test');
      mockLogger.error('test');

      expect(mockLogger.debug).toHaveBeenCalledWith('test');
    });

    it('should allow MockRateLimiter to be used where RateLimiter type is expected', () => {
      // This test verifies compile-time type compatibility
      const mockRateLimiter: MockRateLimiter = createMockRateLimiter();

      // These calls should be type-safe
      mockRateLimiter.recordAction();
      const count = mockRateLimiter.getActionCount();

      expect(count).toBe(0);
    });

    it('should enforce GuildSettings type for createMockGuildSettings result', () => {
      // This test verifies compile-time type compatibility
      const settings: GuildSettings = createMockGuildSettings();

      // All GuildSettings fields should be accessible
      expect(settings.guildId).toBeDefined();
      expect(settings.enabled).toBeDefined();
      expect(settings.afkTimeoutSeconds).toBeDefined();
      expect(settings.warningSecondsBefore).toBeDefined();
      expect(settings.warningChannelId).toBeDefined();
      expect(settings.exemptRoleIds).toBeDefined();
      expect(settings.adminRoleIds).toBeDefined();
      expect(settings.createdAt).toBeDefined();
      expect(settings.updatedAt).toBeDefined();
    });
  });
});
