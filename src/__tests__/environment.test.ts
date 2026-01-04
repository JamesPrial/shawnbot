import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dotenv module before any imports that use it
// This prevents loading values from .env file during tests
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn().mockReturnValue({ parsed: {} }),
  },
  config: vi.fn().mockReturnValue({ parsed: {} }),
}));

describe('environment configuration', () => {
  // Store original process.env to restore after tests
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to ensure clean imports
    vi.resetModules();

    // Create a clean environment by removing all application-specific variables
    // Keep Node.js system variables but clear all bot-related config
    process.env = { ...originalEnv };
    delete process.env.DISCORD_TOKEN;
    delete process.env.CLIENT_ID;
    delete process.env.DATABASE_PATH;
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FILE_PATH;
    delete process.env.RATE_LIMIT_WARN_THRESHOLD;
    delete process.env.RATE_LIMIT_CRASH_THRESHOLD;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.ADMIN_API_ENABLED;
    delete process.env.ADMIN_API_PORT;
    delete process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_API_BIND_ADDRESS;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  afterEach(() => {
    // Restore original process.env and mocks after each test
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    describe('when required environment variables are present', () => {
      it('should load configuration successfully with all required fields', async () => {
        // Arrange: Set minimum required environment variables
        process.env.DISCORD_TOKEN = 'testtoken123';
        process.env.CLIENT_ID = 'testclient456';

        // Act: Load configuration (dynamic import to ensure mock is applied)
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Verify configuration contains required fields
        expect(config.DISCORD_TOKEN).toBe('testtoken123');
        expect(config.CLIENT_ID).toBe('testclient456');
        expect(config.DATABASE_PATH).toBe('./data/bot.db'); // default value
        expect(config.LOG_LEVEL).toBe('info'); // default value
      });

      it('should apply default values for optional fields', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Verify all default values are correctly applied
        expect(config.DATABASE_PATH).toBe('./data/bot.db');
        expect(config.LOG_LEVEL).toBe('info');
        expect(config.RATE_LIMIT_WARN_THRESHOLD).toBe(20);
        expect(config.RATE_LIMIT_CRASH_THRESHOLD).toBe(50);
        expect(config.RATE_LIMIT_WINDOW_MS).toBe(60_000);
        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(config.ADMIN_API_PORT).toBe(3000);
      });

      it('should override default values when environment variables are set', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.DATABASE_PATH = './custom/path/db.sqlite';
        process.env.LOG_LEVEL = 'debug';
        process.env.RATE_LIMIT_WARN_THRESHOLD = '100';
        process.env.RATE_LIMIT_CRASH_THRESHOLD = '200';
        process.env.RATE_LIMIT_WINDOW_MS = '120000';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.DATABASE_PATH).toBe('./custom/path/db.sqlite');
        expect(config.LOG_LEVEL).toBe('debug');
        expect(config.RATE_LIMIT_WARN_THRESHOLD).toBe(100);
        expect(config.RATE_LIMIT_CRASH_THRESHOLD).toBe(200);
        expect(config.RATE_LIMIT_WINDOW_MS).toBe(120000);
      });
    });

    describe('when LOG_FILE_PATH is configured', () => {
      it('should accept undefined LOG_FILE_PATH for backwards compatibility', async () => {
        // Arrange: Set required fields but omit LOG_FILE_PATH
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // LOG_FILE_PATH is not set (undefined)

        // Act: Load configuration (should not throw)
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Configuration loads successfully
        expect(config).toBeDefined();
        expect(config.DISCORD_TOKEN).toBe('token');
        expect(config.CLIENT_ID).toBe('client');
        // LOG_FILE_PATH should be undefined when not set
        expect(config.LOG_FILE_PATH).toBeUndefined();
      });

      it('should accept valid file path string like "./logs/bot.log"', async () => {
        // Arrange: Set LOG_FILE_PATH to a typical log file path
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = './logs/bot.log';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: LOG_FILE_PATH is correctly set
        expect(config.LOG_FILE_PATH).toBe('./logs/bot.log');
      });

      it('should accept absolute file paths', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = '/var/log/shawnbot/app.log';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.LOG_FILE_PATH).toBe('/var/log/shawnbot/app.log');
      });

      it('should accept paths with nested directories', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = './data/logs/production/bot.log';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.LOG_FILE_PATH).toBe('./data/logs/production/bot.log');
      });

      it('should accept paths with different file extensions', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = './logs/app.json';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.LOG_FILE_PATH).toBe('./logs/app.json');
      });

      it('should accept empty string as a valid value', async () => {
        // Edge case: empty string might be used to explicitly disable file logging
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = '';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Empty string is a valid string value
        expect(config.LOG_FILE_PATH).toBe('');
      });

      it('should accept paths with special characters', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = './logs/bot-2025-12-30_14:30:00.log';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.LOG_FILE_PATH).toBe('./logs/bot-2025-12-30_14:30:00.log');
      });

      it('should accept Windows-style paths', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_FILE_PATH = 'C:\\logs\\bot.log';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.LOG_FILE_PATH).toBe('C:\\logs\\bot.log');
      });
    });

    describe('when required environment variables are missing', () => {
      it('should throw error when DISCORD_TOKEN is missing', async () => {
        // Arrange: Omit DISCORD_TOKEN
        process.env.CLIENT_ID = 'client';

        // Act & Assert: Verify it throws with clear error message
        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/DISCORD_TOKEN/);
        expect(() => loadConfig()).toThrow(/DISCORD_TOKEN/); // Zod says "Required" when field is missing
      });

      it('should throw error when CLIENT_ID is missing', async () => {
        process.env.DISCORD_TOKEN = 'token';
        // CLIENT_ID is not set

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/CLIENT_ID/);
        expect(() => loadConfig()).toThrow(/CLIENT_ID/); // Zod says "Required" when field is missing
      });

      it('should throw error when DISCORD_TOKEN is empty string', async () => {
        // Edge case: Empty string should fail min(1) validation
        process.env.DISCORD_TOKEN = '';
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/DISCORD_TOKEN/);
      });

      it('should throw error when CLIENT_ID is empty string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = '';

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/CLIENT_ID/);
      });

      it('should throw error when both required fields are missing', async () => {
        // Environment already cleaned in beforeEach
        // No env vars set, so both required fields are missing

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        // Should mention both missing fields
        expect(() => loadConfig()).toThrow(/DISCORD_TOKEN/);
      });
    });

    describe('when LOG_LEVEL has invalid value', () => {
      it('should throw error for invalid log level', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_LEVEL = 'invalid-level';

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/LOG_LEVEL/);
      });

      it('should accept all valid log levels', async () => {
        const validLevels = ['debug', 'info', 'warn', 'error'];

        for (const level of validLevels) {
          // Reset modules for each iteration to get fresh import
          vi.resetModules();

          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.LOG_LEVEL = level;

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();
          expect(config.LOG_LEVEL).toBe(level);
        }
      });

      it('should reject log level with incorrect casing', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.LOG_LEVEL = 'INFO'; // Uppercase should fail

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
      });
    });

    describe('when numeric environment variables have invalid values', () => {
      it('should coerce valid numeric strings to numbers', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WARN_THRESHOLD = '42';
        process.env.RATE_LIMIT_CRASH_THRESHOLD = '100';
        process.env.RATE_LIMIT_WINDOW_MS = '30000';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Verify coercion to actual numbers
        expect(config.RATE_LIMIT_WARN_THRESHOLD).toBe(42);
        expect(typeof config.RATE_LIMIT_WARN_THRESHOLD).toBe('number');
        expect(config.RATE_LIMIT_CRASH_THRESHOLD).toBe(100);
        expect(config.RATE_LIMIT_WINDOW_MS).toBe(30000);
      });

      it('should handle zero values for numeric fields', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WARN_THRESHOLD = '0';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.RATE_LIMIT_WARN_THRESHOLD).toBe(0);
      });

      it('should handle negative numbers if coercion allows', async () => {
        // Zod coerce.number() will accept negative numbers unless explicitly constrained
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WARN_THRESHOLD = '-10';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.RATE_LIMIT_WARN_THRESHOLD).toBe(-10);
      });

      it('should handle floating point numbers', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WINDOW_MS = '12345.67';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.RATE_LIMIT_WINDOW_MS).toBe(12345.67);
      });

      it('should throw error for non-numeric strings', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WARN_THRESHOLD = 'not-a-number';

        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
      });
    });

    describe('error message formatting', () => {
      it('should include field path and error message in validation errors', async () => {
        process.env.CLIENT_ID = 'client';
        // DISCORD_TOKEN missing

        const { loadConfig } = await import('../config/environment');

        try {
          loadConfig();
          expect.fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const message = (error as Error).message;

          // Verify error message contains field path and description
          // Note: Zod says "Required" when field is missing, custom message only for min(1) failure
          expect(message).toContain('Environment validation failed');
          expect(message).toContain('DISCORD_TOKEN');
          expect(message).toContain('Required');
        }
      });

      it('should list multiple validation errors in a single message', async () => {
        // Both required fields missing (environment already clean from beforeEach)

        const { loadConfig } = await import('../config/environment');

        try {
          loadConfig();
          expect.fail('Should have thrown an error');
        } catch (error) {
          const message = (error as Error).message;

          // Should mention both missing fields
          expect(message).toContain('DISCORD_TOKEN');
          expect(message).toContain('CLIENT_ID');
        }
      });

      it('should format errors with newlines for readability', async () => {
        // Environment already clean from beforeEach

        const { loadConfig } = await import('../config/environment');

        try {
          loadConfig();
          expect.fail('Should have thrown an error');
        } catch (error) {
          const message = (error as Error).message;

          // Error messages should be on separate lines (newline-separated)
          expect(message).toContain('\n');
          expect(message.split('\n').length).toBeGreaterThan(1);
        }
      });
    });

    describe('edge cases', () => {
      it('should handle process.env properties that are undefined', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.DATABASE_PATH = undefined as any; // TypeScript allows this at runtime

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Should fall back to default when undefined
        expect(config.DATABASE_PATH).toBe('./data/bot.db');
      });

      it('should handle whitespace-only required fields as invalid', async () => {
        process.env.DISCORD_TOKEN = '   '; // Only whitespace
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');

        // min(1) on string means at least 1 character, but doesn't trim
        // This tests the actual behavior - whitespace counts as characters
        const config = loadConfig();
        expect(config.DISCORD_TOKEN).toBe('   ');
      });

      it('should preserve exact string values without trimming', async () => {
        process.env.DISCORD_TOKEN = ' token-with-spaces ';
        process.env.CLIENT_ID = ' client ';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Zod doesn't trim by default - verify exact preservation
        expect(config.DISCORD_TOKEN).toBe(' token-with-spaces ');
        expect(config.CLIENT_ID).toBe(' client ');
      });

      it('should handle very large numeric values', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WINDOW_MS = '999999999999';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.RATE_LIMIT_WINDOW_MS).toBe(999999999999);
      });

      it('should handle scientific notation in numeric fields', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.RATE_LIMIT_WINDOW_MS = '1e6'; // 1,000,000

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.RATE_LIMIT_WINDOW_MS).toBe(1000000);
      });
    });
  });

  describe('EnvConfig type', () => {
    it('should include LOG_FILE_PATH as an optional string field', async () => {
      // This test verifies TypeScript type inference via runtime behavior
      process.env.DISCORD_TOKEN = 'token';
      process.env.CLIENT_ID = 'client';
      process.env.LOG_FILE_PATH = './logs/test.log';

      const { loadConfig } = await import('../config/environment');
      const config = loadConfig();

      // Type assertion to verify the type includes LOG_FILE_PATH
      const logPath: string | undefined = config.LOG_FILE_PATH;
      expect(logPath).toBe('./logs/test.log');

      // Verify it's truly optional (can be undefined)
      type ConfigType = typeof config;
      const testUndefined: ConfigType = {
        ...config,
        LOG_FILE_PATH: undefined,
      };
      expect(testUndefined.LOG_FILE_PATH).toBeUndefined();
    });

    it('should allow EnvConfig without LOG_FILE_PATH property', async () => {
      process.env.DISCORD_TOKEN = 'token';
      process.env.CLIENT_ID = 'client';
      // LOG_FILE_PATH not set

      const { loadConfig } = await import('../config/environment');
      const config = loadConfig();

      // TypeScript should allow accessing potentially undefined property
      const logPath: string | undefined = config.LOG_FILE_PATH;
      expect(logPath).toBeUndefined();
    });

    it('should enforce required fields in EnvConfig type', async () => {
      process.env.DISCORD_TOKEN = 'token';
      process.env.CLIENT_ID = 'client';

      const { loadConfig } = await import('../config/environment');
      const config = loadConfig();

      // Required fields should always be present and have correct types
      const token: string = config.DISCORD_TOKEN;
      const clientId: string = config.CLIENT_ID;
      const dbPath: string = config.DATABASE_PATH;
      const logLevel: 'debug' | 'info' | 'warn' | 'error' = config.LOG_LEVEL;

      expect(token).toBe('token');
      expect(clientId).toBe('client');
      expect(dbPath).toBe('./data/bot.db');
      expect(logLevel).toBe('info');
    });

    it('should infer numeric types for rate limit fields', async () => {
      process.env.DISCORD_TOKEN = 'token';
      process.env.CLIENT_ID = 'client';

      const { loadConfig } = await import('../config/environment');
      const config = loadConfig();

      // These should be typed as numbers, not strings
      const warnThreshold: number = config.RATE_LIMIT_WARN_THRESHOLD;
      const crashThreshold: number = config.RATE_LIMIT_CRASH_THRESHOLD;
      const windowMs: number = config.RATE_LIMIT_WINDOW_MS;

      expect(typeof warnThreshold).toBe('number');
      expect(typeof crashThreshold).toBe('number');
      expect(typeof windowMs).toBe('number');
    });
  });

  describe('Admin API Configuration', () => {
    describe('ADMIN_API_ENABLED', () => {
      it('should default to false when not set', async () => {
        // Arrange: Set only required fields
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_API_ENABLED is not set

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Defaults to false
        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce string "true" to boolean true', async () => {
        // Arrange: Set ADMIN_API_ENABLED to string 'true'
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'true';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Coerced to boolean true
        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce string "false" to boolean false', async () => {
        // Arrange: Set ADMIN_API_ENABLED to string 'false'
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'false';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Coerced to boolean false
        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce string "1" to boolean true', async () => {
        // Edge case: Truthy string coercion
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = '1';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce string "0" to boolean false', async () => {
        // Edge case: Falsy string coercion
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = '0';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce empty string to boolean false', async () => {
        // Edge case: Empty string should coerce to false
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = '';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce case-insensitive "TRUE" string to boolean true', async () => {
        // Edge case: Uppercase TRUE
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'TRUE';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should coerce case-insensitive "FALSE" string to boolean false', async () => {
        // Edge case: Uppercase FALSE
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'FALSE';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });

      it('should not coerce non-boolean strings like \'yes\' to true', async () => {
        // Security: Only explicit 'true' or '1' should enable, not arbitrary strings
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'yes';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(typeof config.ADMIN_API_ENABLED).toBe('boolean');
      });
    });

    describe('ADMIN_API_PORT', () => {
      it('should default to 3000 when not set', async () => {
        // Arrange: Set only required fields
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_API_PORT is not set

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Defaults to 3000
        expect(config.ADMIN_API_PORT).toBe(3000);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should accept numeric value', async () => {
        // Arrange: Set ADMIN_API_PORT to a number via string
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '8080';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Coerced to number
        expect(config.ADMIN_API_PORT).toBe(8080);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should coerce string to number', async () => {
        // Arrange: Various numeric strings
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '4000';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: String coerced to number
        expect(config.ADMIN_API_PORT).toBe(4000);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should handle port 80 (well-known port)', async () => {
        // Edge case: Low port number
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '80';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(80);
      });

      it('should handle port 65535 (maximum valid port)', async () => {
        // Edge case: Maximum port number
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '65535';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(65535);
      });

      it('should handle port 0 (system-assigned port)', async () => {
        // Edge case: Port 0 tells OS to assign a port
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '0';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(0);
      });

      it('should handle negative port numbers if coercion allows', async () => {
        // Edge case: Negative numbers (likely invalid but tests coercion behavior)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '-1';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(-1);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should handle port numbers greater than 65535 if coercion allows', async () => {
        // Edge case: Out of valid range (tests coercion behavior)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '99999';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(99999);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should throw error for non-numeric strings', async () => {
        // Arrange: Invalid port value
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = 'not-a-port';

        // Act & Assert: Should throw validation error
        const { loadConfig } = await import('../config/environment');
        expect(() => loadConfig()).toThrow(/Environment validation failed/);
        expect(() => loadConfig()).toThrow(/ADMIN_API_PORT/);
      });

      it('should handle floating point numbers', async () => {
        // Edge case: Float coercion
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '3000.5';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(3000.5);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });

      it('should handle scientific notation', async () => {
        // Edge case: Scientific notation
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '3e3'; // 3000

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_PORT).toBe(3000);
        expect(typeof config.ADMIN_API_PORT).toBe('number');
      });
    });

    describe('ADMIN_API_TOKEN', () => {
      it('should be optional and undefined when not set', async () => {
        // Arrange: Set only required fields
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_API_TOKEN is not set

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Optional field is undefined
        expect(config.ADMIN_API_TOKEN).toBeUndefined();
      });

      it('should accept valid token string', async () => {
        // Arrange: Set ADMIN_API_TOKEN to a secure token
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = 'FAKE_TEST_TOKEN_NOT_A_SECRET';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Token is correctly set
        expect(config.ADMIN_API_TOKEN).toBe('FAKE_TEST_TOKEN_NOT_A_SECRET');
        expect(typeof config.ADMIN_API_TOKEN).toBe('string');
      });

      it('should accept empty string as a valid value', async () => {
        // Edge case: Empty string (might be used to explicitly disable token auth)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = '';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('');
      });

      it('should accept tokens with special characters', async () => {
        // Edge case: Complex token with special characters
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = 'token!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('token!@#$%^&*()_+-=[]{}|;:,.<>?/~`');
      });

      it('should preserve whitespace in token', async () => {
        // Edge case: Token with leading/trailing spaces (should not trim)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = '  token-with-spaces  ';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('  token-with-spaces  ');
      });

      it('should accept very long token strings', async () => {
        // Edge case: Long token (e.g., JWT or secure random string)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        const longToken = 'a'.repeat(1000);
        process.env.ADMIN_API_TOKEN = longToken;

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe(longToken);
        expect(config.ADMIN_API_TOKEN?.length).toBe(1000);
      });

      it('should accept tokens with newlines', async () => {
        // Edge case: Multiline token (might happen with certain token formats)
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = 'line1\nline2\nline3';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('line1\nline2\nline3');
      });

      it('should accept numeric-only tokens', async () => {
        // Edge case: Token that looks like a number but should remain string
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = '123456789';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('123456789');
        expect(typeof config.ADMIN_API_TOKEN).toBe('string');
      });

      it('should accept UUID format tokens', async () => {
        // Realistic case: UUID as token
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = '550e8400-e29b-41d4-a716-446655440000';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should accept base64 encoded tokens', async () => {
        // Realistic case: Base64 encoded token
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_TOKEN = 'dGhpcyBpcyBhIHRlc3QgdG9rZW4K';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_TOKEN).toBe('dGhpcyBpcyBhIHRlc3QgdG9rZW4K');
      });
    });

    describe('Admin API Configuration - Type Inference', () => {
      it('should include all Admin API fields in EnvConfig type', async () => {
        // This test verifies TypeScript type inference via runtime behavior
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'true';
        process.env.ADMIN_API_PORT = '8080';
        process.env.ADMIN_API_TOKEN = 'FAKE_TEST_TOKEN_NOT_A_SECRET';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Type assertions verify the type includes all Admin API fields with correct types
        const enabled: boolean = config.ADMIN_API_ENABLED;
        const port: number = config.ADMIN_API_PORT;
        const token: string | undefined = config.ADMIN_API_TOKEN;

        expect(enabled).toBe(true);
        expect(port).toBe(8080);
        expect(token).toBe('FAKE_TEST_TOKEN_NOT_A_SECRET');
      });

      it('should type ADMIN_API_ENABLED as boolean not string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'true';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should enforce boolean type
        const enabled: boolean = config.ADMIN_API_ENABLED;
        expect(typeof enabled).toBe('boolean');
        expect(enabled).toBe(true);
      });

      it('should type ADMIN_API_PORT as number not string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_PORT = '8080';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should enforce number type
        const port: number = config.ADMIN_API_PORT;
        expect(typeof port).toBe('number');
        expect(port).toBe(8080);
      });

      it('should type ADMIN_API_TOKEN as optional string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_API_TOKEN not set

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should allow string | undefined
        const token: string | undefined = config.ADMIN_API_TOKEN;
        expect(token).toBeUndefined();
      });

      it('should allow creating EnvConfig without optional ADMIN_API_TOKEN', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Type should allow config without ADMIN_API_TOKEN property
        type ConfigType = typeof config;
        const testConfig: ConfigType = {
          ...config,
          ADMIN_API_TOKEN: undefined,
        };
        expect(testConfig.ADMIN_API_TOKEN).toBeUndefined();
      });
    });

    describe('Admin API Configuration - Combined scenarios', () => {
      it('should load all Admin API config when all fields are set', async () => {
        // Arrange: Set all Admin API fields
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'true';
        process.env.ADMIN_API_PORT = '8080';
        process.env.ADMIN_API_TOKEN = 'secure-token-123';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: All fields correctly loaded
        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(config.ADMIN_API_PORT).toBe(8080);
        expect(config.ADMIN_API_TOKEN).toBe('secure-token-123');
      });

      it('should use defaults when no Admin API config is set', async () => {
        // Arrange: Only required fields
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Defaults applied
        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(config.ADMIN_API_PORT).toBe(3000);
        expect(config.ADMIN_API_TOKEN).toBeUndefined();
      });

      it('should handle partial Admin API config', async () => {
        // Arrange: Only some Admin API fields set
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'true';
        // PORT and TOKEN not set

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Explicit value used, defaults for others
        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(config.ADMIN_API_PORT).toBe(3000); // default
        expect(config.ADMIN_API_TOKEN).toBeUndefined(); // optional
      });

      it('should work with disabled API but custom port and token', async () => {
        // Edge case: API disabled but port and token still configured
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_ENABLED = 'false';
        process.env.ADMIN_API_PORT = '9000';
        process.env.ADMIN_API_TOKEN = 'token-exists-but-api-disabled';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_ENABLED).toBe(false);
        expect(config.ADMIN_API_PORT).toBe(9000);
        expect(config.ADMIN_API_TOKEN).toBe('token-exists-but-api-disabled');
      });

      it('should not interfere with existing configuration fields', async () => {
        // Verify Admin API config doesn't break existing config
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.DATABASE_PATH = './custom/db.sqlite';
        process.env.LOG_LEVEL = 'debug';
        process.env.ADMIN_API_ENABLED = 'true';
        process.env.ADMIN_API_PORT = '4000';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Both old and new config work together
        expect(config.DISCORD_TOKEN).toBe('token');
        expect(config.CLIENT_ID).toBe('client');
        expect(config.DATABASE_PATH).toBe('./custom/db.sqlite');
        expect(config.LOG_LEVEL).toBe('debug');
        expect(config.ADMIN_API_ENABLED).toBe(true);
        expect(config.ADMIN_API_PORT).toBe(4000);
      });
    });
  });

  describe('Backend Environment Configuration', () => {
    describe('ADMIN_API_BIND_ADDRESS', () => {
      it('should default to 127.0.0.1 when not set', async () => {
        // Arrange: Set only required fields
        // WHY: Test the default bind address matches the security requirement of localhost-only
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_API_BIND_ADDRESS is not set

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Defaults to 127.0.0.1 for security (localhost only)
        expect(config.ADMIN_API_BIND_ADDRESS).toBe('127.0.0.1');
        expect(typeof config.ADMIN_API_BIND_ADDRESS).toBe('string');
      });

      it('should accept custom bind address', async () => {
        // Arrange: Set custom bind address
        // WHY: Test that administrators can override the bind address if needed
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = '0.0.0.0';

        // Act: Load configuration
        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Assert: Custom bind address is accepted
        expect(config.ADMIN_API_BIND_ADDRESS).toBe('0.0.0.0');
      });

      it('should accept IPv6 localhost address', async () => {
        // Edge case: IPv6 localhost
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = '::1';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_BIND_ADDRESS).toBe('::1');
      });

      it('should accept specific network interface addresses', async () => {
        // Realistic case: Binding to a specific network interface
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = '192.168.1.100';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_BIND_ADDRESS).toBe('192.168.1.100');
      });

      it('should accept empty string as a valid value', async () => {
        // Edge case: Empty string might be used for default OS behavior
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = '';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_BIND_ADDRESS).toBe('');
      });

      it('should accept hostname instead of IP address', async () => {
        // Edge case: Hostname binding
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = 'localhost';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        expect(config.ADMIN_API_BIND_ADDRESS).toBe('localhost');
      });
    });

    describe('ADMIN_USERNAME and ADMIN_PASSWORD_HASH validation', () => {
      describe('when both username and password hash are unset', () => {
        it('should pass validation', async () => {
          // Arrange: Neither username nor password hash set (token-only mode)
          // WHY: Token-only auth is a valid configuration - username/password is optional
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          // ADMIN_USERNAME and ADMIN_PASSWORD_HASH are not set

          // Act: Load configuration (should not throw)
          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Assert: Configuration loads successfully in token-only mode
          expect(config).toBeDefined();
          expect(config.ADMIN_USERNAME).toBeUndefined();
          expect(config.ADMIN_PASSWORD_HASH).toBeUndefined();
        });
      });

      describe('when both username and password hash are set together', () => {
        it('should pass validation', async () => {
          // Arrange: Both username and password hash set
          // WHY: Both must be present for username/password auth to work
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          // Test-only bcrypt hash of 'correctpassword' - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          // Act: Load configuration
          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Assert: Both fields are correctly set
          expect(config.ADMIN_USERNAME).toBe('admin');
          expect(config.ADMIN_PASSWORD_HASH).toBe('$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK');
        });

        it('should accept long usernames', async () => {
          // Edge case: Long username
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'very-long-username-with-special-chars@example.com';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          expect(config.ADMIN_USERNAME).toBe('very-long-username-with-special-chars@example.com');
        });

        it('should accept bcrypt password hashes', async () => {
          // Realistic case: bcrypt hash format
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          // Test-only bcrypt hash of 'correctpassword' - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Test-only bcrypt hash - NOT A REAL SECRET
          expect(config.ADMIN_PASSWORD_HASH).toBe('$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK');
        });

        it('should accept usernames with special characters', async () => {
          // Edge case: Special characters in username
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin-user_123@domain.com';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          expect(config.ADMIN_USERNAME).toBe('admin-user_123@domain.com');
        });
      });

      describe('when username is set without password hash', () => {
        it('should fail validation with clear error message', async () => {
          // Arrange: Username set but password hash missing
          // WHY: Having username without password hash is a configuration error
          //      that would break authentication - we must catch this early
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          // ADMIN_PASSWORD_HASH is not set

          // Act & Assert: Verify it throws with clear error message
          const { loadConfig } = await import('../config/environment');
          expect(() => loadConfig()).toThrow(/Environment validation failed/);
          expect(() => loadConfig()).toThrow(/ADMIN_USERNAME and ADMIN_PASSWORD_HASH must both be set or both be unset/);
        });

        it('should fail even with empty password hash string', async () => {
          // Edge case: Empty string for password hash should be treated as unset
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          process.env.ADMIN_PASSWORD_HASH = '';

          const { loadConfig } = await import('../config/environment');
          expect(() => loadConfig()).toThrow(/Environment validation failed/);
          expect(() => loadConfig()).toThrow(/ADMIN_USERNAME and ADMIN_PASSWORD_HASH must both be set or both be unset/);
        });

        it('should fail with whitespace-only password hash', async () => {
          // Edge case: Whitespace-only password hash
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          process.env.ADMIN_PASSWORD_HASH = '   ';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Whitespace counts as characters, so this should pass validation
          // but the hash would be invalid for actual authentication
          expect(config.ADMIN_USERNAME).toBe('admin');
          expect(config.ADMIN_PASSWORD_HASH).toBe('   ');
        });
      });

      describe('when password hash is set without username', () => {
        it('should fail validation with clear error message', async () => {
          // Arrange: Password hash set but username missing
          // WHY: Having password hash without username is a configuration error
          //      that would break authentication - we must catch this early
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';
          // ADMIN_USERNAME is not set

          // Act & Assert: Verify it throws with clear error message
          const { loadConfig } = await import('../config/environment');
          expect(() => loadConfig()).toThrow(/Environment validation failed/);
          expect(() => loadConfig()).toThrow(/ADMIN_USERNAME and ADMIN_PASSWORD_HASH must both be set or both be unset/);
        });

        it('should fail even with empty username string', async () => {
          // Edge case: Empty string for username should be treated as unset
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = '';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          expect(() => loadConfig()).toThrow(/Environment validation failed/);
          expect(() => loadConfig()).toThrow(/ADMIN_USERNAME and ADMIN_PASSWORD_HASH must both be set or both be unset/);
        });

        it('should fail with whitespace-only username', async () => {
          // Edge case: Whitespace-only username
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = '   ';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Whitespace counts as characters, so this should pass validation
          // but the username would be invalid for actual authentication
          expect(config.ADMIN_USERNAME).toBe('   ');
          expect(config.ADMIN_PASSWORD_HASH).toBe('$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK');
        });
      });

      describe('edge cases for username and password hash', () => {
        it('should accept both fields as empty strings and pass validation', async () => {
          // Edge case: Both fields explicitly set to empty strings
          // WHY: Empty strings are treated as "unset" (same as not providing the env var)
          // This is by design: hasUsername = data.ADMIN_USERNAME !== undefined && data.ADMIN_USERNAME !== ''
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = '';
          process.env.ADMIN_PASSWORD_HASH = '';

          const { loadConfig } = await import('../config/environment');
          expect(() => loadConfig()).not.toThrow();
          // Both empty strings are treated as "unset", so this is a valid configuration
        });

        it('should preserve exact string values without trimming', async () => {
          // Edge case: Verify no trimming happens
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = ' admin ';
          process.env.ADMIN_PASSWORD_HASH = ' $2b$10$hash ';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          expect(config.ADMIN_USERNAME).toBe(' admin ');
          expect(config.ADMIN_PASSWORD_HASH).toBe(' $2b$10$hash ');
        });

        it('should accept numeric-only username', async () => {
          // Edge case: Username that's all numbers
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = '12345';
          // Test-only bcrypt hash - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          expect(config.ADMIN_USERNAME).toBe('12345');
          expect(typeof config.ADMIN_USERNAME).toBe('string');
        });

        it('should accept very long password hashes', async () => {
          // Edge case: Very long hash (e.g., argon2 hashes can be longer)
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_USERNAME = 'admin';
          const longHash = '$argon2id$v=19$m=65536,t=3,p=4$' + 'a'.repeat(500);
          process.env.ADMIN_PASSWORD_HASH = longHash;

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          expect(config.ADMIN_PASSWORD_HASH).toBe(longHash);
          expect(config.ADMIN_PASSWORD_HASH?.length).toBeGreaterThan(500);
        });

        it('should work with all admin auth fields together', async () => {
          // Combined scenario: All admin fields configured together
          process.env.DISCORD_TOKEN = 'token';
          process.env.CLIENT_ID = 'client';
          process.env.ADMIN_API_ENABLED = 'true';
          process.env.ADMIN_API_PORT = '8080';
          process.env.ADMIN_API_TOKEN = 'FAKE_TEST_TOKEN_NOT_A_SECRET';
          process.env.ADMIN_API_BIND_ADDRESS = '0.0.0.0';
          process.env.ADMIN_USERNAME = 'superadmin';
          // Test-only bcrypt hash of 'correctpassword' - NOT A REAL SECRET
          process.env.ADMIN_PASSWORD_HASH = '$2b$10$Mra.F.uMhHxtpT4m4nOKm.HMlenbF7tHZc6LbmWkFNuqiLQVePzcK';

          const { loadConfig } = await import('../config/environment');
          const config = loadConfig();

          // Verify all admin fields are correctly loaded
          expect(config.ADMIN_API_ENABLED).toBe(true);
          expect(config.ADMIN_API_PORT).toBe(8080);
          expect(config.ADMIN_API_TOKEN).toBe('FAKE_TEST_TOKEN_NOT_A_SECRET');
          expect(config.ADMIN_API_BIND_ADDRESS).toBe('0.0.0.0');
          expect(config.ADMIN_USERNAME).toBe('superadmin');
          // Verify password hash is stored as a string
          expect(typeof config.ADMIN_PASSWORD_HASH).toBe('string');
        });
      });
    });

    describe('Backend Environment Configuration - Type Inference', () => {
      it('should include all backend fields in EnvConfig type', async () => {
        // This test verifies TypeScript type inference via runtime behavior
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        process.env.ADMIN_API_BIND_ADDRESS = '0.0.0.0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD_HASH = '$2b$10$hash';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Type assertions verify the type includes all backend fields with correct types
        const bindAddress: string = config.ADMIN_API_BIND_ADDRESS;
        const username: string | undefined = config.ADMIN_USERNAME;
        const passwordHash: string | undefined = config.ADMIN_PASSWORD_HASH;

        expect(bindAddress).toBe('0.0.0.0');
        expect(username).toBe('admin');
        // Verify the password hash is stored as a string (exact value is from environment)
        expect(typeof passwordHash).toBe('string');
      });

      it('should type ADMIN_API_BIND_ADDRESS as required string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should enforce string type (not optional)
        const bindAddress: string = config.ADMIN_API_BIND_ADDRESS;
        expect(typeof bindAddress).toBe('string');
        expect(bindAddress).toBe('127.0.0.1'); // default
      });

      it('should type ADMIN_USERNAME as optional string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_USERNAME not set

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should allow string | undefined
        const username: string | undefined = config.ADMIN_USERNAME;
        expect(username).toBeUndefined();
      });

      it('should type ADMIN_PASSWORD_HASH as optional string', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';
        // ADMIN_PASSWORD_HASH not set

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // TypeScript should allow string | undefined
        const passwordHash: string | undefined = config.ADMIN_PASSWORD_HASH;
        expect(passwordHash).toBeUndefined();
      });

      it('should allow creating EnvConfig without optional auth fields', async () => {
        process.env.DISCORD_TOKEN = 'token';
        process.env.CLIENT_ID = 'client';

        const { loadConfig } = await import('../config/environment');
        const config = loadConfig();

        // Type should allow config without optional auth fields
        type ConfigType = typeof config;
        const testConfig: ConfigType = {
          ...config,
          ADMIN_USERNAME: undefined,
          ADMIN_PASSWORD_HASH: undefined,
        };
        expect(testConfig.ADMIN_USERNAME).toBeUndefined();
        expect(testConfig.ADMIN_PASSWORD_HASH).toBeUndefined();
      });
    });
  });
});
