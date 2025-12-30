import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  describe('buildTransportTargets', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
      // Reset modules to get fresh imports
      vi.resetModules();
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    describe('when in development mode', () => {
      it('should use pino-pretty for console output', async () => {
        // Arrange: Set development environment
        process.env.NODE_ENV = 'development';
        delete process.env.LOG_FILE_PATH;

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should have one target using pino-pretty
        expect(targets).toHaveLength(1);
        expect(targets[0]).toEqual({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        });
      });

      it('should include file transport when LOG_FILE_PATH is set', async () => {
        // Arrange: Set development environment with file logging
        process.env.NODE_ENV = 'development';
        process.env.LOG_FILE_PATH = './logs/test.log';

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should have two targets - console (pino-pretty) and file
        expect(targets).toHaveLength(2);
        expect(targets[0]).toMatchObject({
          target: 'pino-pretty',
        });
        expect(targets[1]).toEqual({
          target: 'pino/file',
          options: {
            destination: './logs/test.log',
            mkdir: true,
          },
        });
      });
    });

    describe('when in production mode', () => {
      it('should use pino/file with stdout for console output', async () => {
        // Arrange: Set production environment
        process.env.NODE_ENV = 'production';
        delete process.env.LOG_FILE_PATH;

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should have one target using pino/file with stdout
        expect(targets).toHaveLength(1);
        expect(targets[0]).toEqual({
          target: 'pino/file',
          options: {
            destination: 1, // stdout
          },
        });
      });

      it('should include file transport when LOG_FILE_PATH is set', async () => {
        // Arrange: Set production environment with file logging
        // Use a relative path that doesn't require special permissions
        process.env.NODE_ENV = 'production';
        process.env.LOG_FILE_PATH = './test-logs/app.log';

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should have two targets - console (stdout) and file
        expect(targets).toHaveLength(2);
        expect(targets[0]).toEqual({
          target: 'pino/file',
          options: {
            destination: 1, // stdout
          },
        });
        expect(targets[1]).toEqual({
          target: 'pino/file',
          options: {
            destination: './test-logs/app.log',
            mkdir: true,
          },
        });
      });

      it('should set mkdir:true for file transport to create directories', async () => {
        // Arrange: Set production environment with nested log path
        process.env.NODE_ENV = 'production';
        process.env.LOG_FILE_PATH = './logs/nested/path/app.log';

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: File transport should have mkdir:true
        const fileTarget = targets.find(
          (t) => t.target === 'pino/file' && 'destination' in t.options && t.options.destination !== 1
        );
        expect(fileTarget).toBeDefined();
        expect(fileTarget?.options).toHaveProperty('mkdir', true);
      });
    });

    describe('when LOG_FILE_PATH is not set', () => {
      it('should not include file transport in development', async () => {
        // Arrange: Development without file logging
        process.env.NODE_ENV = 'development';
        delete process.env.LOG_FILE_PATH;

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should only have console transport
        expect(targets).toHaveLength(1);
        expect(targets.every((t) => !('destination' in t.options && typeof t.options.destination === 'string'))).toBe(true);
      });

      it('should not include file transport in production', async () => {
        // Arrange: Production without file logging
        process.env.NODE_ENV = 'production';
        delete process.env.LOG_FILE_PATH;

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should only have console transport (stdout)
        expect(targets).toHaveLength(1);
        expect(targets[0]).toEqual({
          target: 'pino/file',
          options: {
            destination: 1, // stdout
          },
        });
      });
    });

    describe('when LOG_FILE_PATH is empty string', () => {
      it('should treat empty string as not set', async () => {
        // Arrange: Empty LOG_FILE_PATH
        process.env.NODE_ENV = 'production';
        process.env.LOG_FILE_PATH = '';

        // Act: Import and call buildTransportTargets
        const { buildTransportTargets } = await import('../utils/logger');
        const targets = buildTransportTargets();

        // Assert: Should not include file transport (empty string is falsy)
        expect(targets).toHaveLength(1);
        expect(targets[0].options).toEqual({ destination: 1 });
      });
    });
  });

  describe('logger instance', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should export a logger instance', async () => {
      // Act: Import the logger module
      const { logger } = await import('../utils/logger');

      // Assert: Logger exists and is defined
      expect(logger).toBeDefined();
      expect(logger).not.toBeNull();
    });

    it('should have standard pino logging methods', async () => {
      // Act: Import the logger module
      const { logger } = await import('../utils/logger');

      // Assert: Logger has all standard pino methods
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('should have a configured log level', async () => {
      // Act: Import the logger module
      const { logger } = await import('../utils/logger');

      // Assert: Logger has a valid level
      const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
      expect(logger.level).toBeDefined();
      expect(validLevels).toContain(logger.level);
    });

    it('should allow creating child loggers with bindings', async () => {
      // Act: Import logger and create child
      const { logger } = await import('../utils/logger');
      const childLogger = logger.child({ component: 'test' });

      // Assert: Child logger exists and has logging methods
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.child).toBe('function');
    });
  });

  describe('logger configuration from environment', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should default to info level when LOG_LEVEL is not set', async () => {
      // Arrange: Remove LOG_LEVEL
      delete process.env.LOG_LEVEL;

      // Act: Import logger
      const { logger } = await import('../utils/logger');

      // Assert: Should default to info
      expect(logger.level).toBe('info');
    });

    it('should respect LOG_LEVEL environment variable', async () => {
      // Arrange: Set LOG_LEVEL to debug
      process.env.LOG_LEVEL = 'debug';

      // Act: Import logger
      const { logger } = await import('../utils/logger');

      // Assert: Should use debug level
      expect(logger.level).toBe('debug');
    });

    it('should handle various log levels from environment', async () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

      for (const level of levels) {
        // Arrange: Reset modules and set level
        vi.resetModules();
        process.env.LOG_LEVEL = level;

        // Act: Import logger
        const { logger } = await import('../utils/logger');

        // Assert: Should use specified level
        expect(logger.level).toBe(level);
      }
    });
  });
});
