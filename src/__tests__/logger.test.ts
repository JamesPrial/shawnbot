import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Logger } from 'pino';

describe('logger', () => {
  describe('WU-1: Lazy logger initialization', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment and reset modules for clean state
      originalEnv = { ...process.env };
      vi.resetModules();
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should not create logger until first method call', async () => {
      // Arrange: Set LOG_LEVEL before import
      process.env.LOG_LEVEL = 'debug';

      // Act: Import the logger module - should NOT create logger yet
      const { logger } = await import('../utils/logger');

      // Assert: Logger should be a proxy that hasn't initialized yet
      // We verify laziness by checking that changing env AFTER import
      // but BEFORE first use still affects the logger
      // This test proves env is read lazily, not at import time
      process.env.LOG_LEVEL = 'error';

      // First actual use triggers initialization
      const level = logger.level;

      // Should reflect the env var at USE time (error), not IMPORT time (debug)
      expect(level).toBe('error');
    });

    it('should read LOG_LEVEL environment variable on first use, not at import time', async () => {
      // Arrange: Import logger with one level
      delete process.env.LOG_LEVEL;
      const { logger } = await import('../utils/logger');

      // Act: Change env AFTER import but BEFORE first use
      process.env.LOG_LEVEL = 'warn';

      // First use should read current env value
      const level = logger.level;

      // Assert: Should use 'warn' (current env), not 'info' (default at import)
      expect(level).toBe('warn');
    });

    it('should use same logger instance for all method calls (memoization)', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'info';
      const { logger } = await import('../utils/logger');

      // Act: Call multiple methods to trigger initialization
      logger.info('first call');
      const firstChild = logger.child({ first: true });

      // Change env after first use
      process.env.LOG_LEVEL = 'debug';

      // Call again - should use SAME instance (memoized)
      const secondChild = logger.child({ second: true });
      const level = logger.level;

      // Assert: Level should still be 'info' because logger was memoized after first use
      expect(level).toBe('info');

      // Both children should come from the same root logger instance
      // (We can't directly compare parent references, but level inheritance proves it)
      expect(firstChild.level).toBe('info');
      expect(secondChild.level).toBe('info');
    });

    it('should default to info level when LOG_LEVEL is not set', async () => {
      // Arrange: Ensure LOG_LEVEL is not set
      delete process.env.LOG_LEVEL;

      // Act: Import and use logger
      const { logger } = await import('../utils/logger');
      const level = logger.level;

      // Assert: Should default to 'info'
      expect(level).toBe('info');
    });

    it('should correctly forward debug method through proxy', async () => {
      // Arrange: Set debug level and import
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await import('../utils/logger');

      // Act: Call debug method - should not throw
      const debugCall = () => logger.debug('test message');

      // Assert: Should work without errors
      expect(debugCall).not.toThrow();
    });

    it('should correctly forward info method through proxy', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'info';
      const { logger } = await import('../utils/logger');

      // Act: Call info method
      const infoCall = () => logger.info('test message');

      // Assert: Should work without errors
      expect(infoCall).not.toThrow();
    });

    it('should correctly forward warn method through proxy', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'warn';
      const { logger } = await import('../utils/logger');

      // Act: Call warn method
      const warnCall = () => logger.warn('test message');

      // Assert: Should work without errors
      expect(warnCall).not.toThrow();
    });

    it('should correctly forward error method through proxy', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'error';
      const { logger } = await import('../utils/logger');

      // Act: Call error method
      const errorCall = () => logger.error('test message');

      // Assert: Should work without errors
      expect(errorCall).not.toThrow();
    });

    it('should correctly forward child method through proxy', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'info';
      const { logger } = await import('../utils/logger');

      // Act: Create child logger
      const child = logger.child({ service: 'test' });

      // Assert: Child should be a valid logger with methods
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
      expect(typeof child.debug).toBe('function');
      expect(typeof child.error).toBe('function');
    });

    it('should correctly forward isLevelEnabled method through proxy', async () => {
      // Arrange: Import logger at info level
      process.env.LOG_LEVEL = 'info';
      const { logger } = await import('../utils/logger');

      // Act: Check level enablement
      const infoEnabled = logger.isLevelEnabled('info');
      const debugEnabled = logger.isLevelEnabled('debug');

      // Assert: Info should be enabled, debug should not
      expect(infoEnabled).toBe(true);
      expect(debugEnabled).toBe(false);
    });

    it('should handle all standard pino log levels through lazy proxy', async () => {
      // Arrange: Test each standard level
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

      for (const level of levels) {
        // Reset for each test
        vi.resetModules();
        process.env.LOG_LEVEL = level;

        // Act: Import and get level
        const { logger } = await import('../utils/logger');
        const actualLevel = logger.level;

        // Assert: Should match the level we set
        expect(actualLevel).toBe(level);
      }
    });

    it('should preserve logger bindings after lazy initialization', async () => {
      // Arrange: Import logger
      process.env.LOG_LEVEL = 'info';
      const { logger } = await import('../utils/logger');

      // Act: Create child with bindings before and after first use
      const childBefore = logger.child({ phase: 'before' });

      // Trigger initialization with a different method
      logger.info('initializing');

      const childAfter = logger.child({ phase: 'after' });

      // Assert: Both children should work and have proper methods
      expect(typeof childBefore.info).toBe('function');
      expect(typeof childAfter.info).toBe('function');

      // Both should inherit the same level from root
      expect(childBefore.level).toBe('info');
      expect(childAfter.level).toBe('info');
    });
  });

  describe('WU-2: createServiceLogger factory', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      vi.resetModules();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return a child logger with service binding', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create a service logger
      const serviceLogger = createServiceLogger('MyService');

      // Assert: Should be a valid logger
      expect(serviceLogger).toBeDefined();
      expect(typeof serviceLogger.info).toBe('function');
      expect(typeof serviceLogger.debug).toBe('function');
      expect(typeof serviceLogger.error).toBe('function');
      expect(typeof serviceLogger.warn).toBe('function');

      // Should have child method to create further children
      expect(typeof serviceLogger.child).toBe('function');
    });

    it('should create new child logger instances on each call', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create multiple loggers with same name
      const logger1 = createServiceLogger('TestService');
      const logger2 = createServiceLogger('TestService');

      // Assert: Should be different instances (not cached)
      // We verify this by checking that they can have different children
      const child1 = logger1.child({ instance: 1 });
      const child2 = logger2.child({ instance: 2 });

      expect(child1).not.toBe(child2);
      expect(typeof child1.info).toBe('function');
      expect(typeof child2.info).toBe('function');
    });

    it('should create loggers with different service names', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create loggers for different services
      const serviceA = createServiceLogger('ServiceA');
      const serviceB = createServiceLogger('ServiceB');
      const serviceC = createServiceLogger('ServiceC');

      // Assert: All should be valid loggers
      expect(serviceA).toBeDefined();
      expect(serviceB).toBeDefined();
      expect(serviceC).toBeDefined();

      expect(typeof serviceA.info).toBe('function');
      expect(typeof serviceB.info).toBe('function');
      expect(typeof serviceC.info).toBe('function');
    });

    it('should inherit log level from root logger', async () => {
      // Arrange: Set a specific log level
      process.env.LOG_LEVEL = 'warn';
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create service logger
      const serviceLogger = createServiceLogger('TestService');

      // Assert: Should inherit 'warn' level from root
      expect(serviceLogger.level).toBe('warn');
    });

    it('should not inherit level changes made after child creation (pino behavior)', async () => {
      // Arrange: Start with info level
      process.env.LOG_LEVEL = 'info';
      const { createServiceLogger, logger } = await import('../utils/logger');

      // Act: Create child BEFORE changing root level
      const serviceLogger = createServiceLogger('TestService');
      expect(serviceLogger.level).toBe('info');

      // Change root logger level
      logger.level = 'debug';

      // Assert: Child keeps its original level (pino child behavior - level is snapshotted at creation)
      expect(serviceLogger.level).toBe('info');

      // But NEW children will have the new level
      const newServiceLogger = createServiceLogger('NewService');
      expect(newServiceLogger.level).toBe('debug');
    });

    it('should support all standard logger methods', async () => {
      // Arrange: Import createServiceLogger
      process.env.LOG_LEVEL = 'trace';
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create service logger
      const serviceLogger = createServiceLogger('FullService');

      // Assert: Should have all standard pino methods
      expect(typeof serviceLogger.trace).toBe('function');
      expect(typeof serviceLogger.debug).toBe('function');
      expect(typeof serviceLogger.info).toBe('function');
      expect(typeof serviceLogger.warn).toBe('function');
      expect(typeof serviceLogger.error).toBe('function');
      expect(typeof serviceLogger.fatal).toBe('function');
      expect(typeof serviceLogger.child).toBe('function');
    });

    it('should allow creating nested children from service logger', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create service logger then create child from it
      const serviceLogger = createServiceLogger('ParentService');
      const childLogger = serviceLogger.child({ component: 'ChildComponent' });

      // Assert: Child should be valid and have logging methods
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
      expect(typeof childLogger.error).toBe('function');
    });

    it('should handle service names with special characters', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create loggers with various service names
      const logger1 = createServiceLogger('Service-With-Dashes');
      const logger2 = createServiceLogger('Service_With_Underscores');
      const logger3 = createServiceLogger('Service.With.Dots');
      const logger4 = createServiceLogger('Service123');

      // Assert: All should work correctly
      expect(typeof logger1.info).toBe('function');
      expect(typeof logger2.info).toBe('function');
      expect(typeof logger3.info).toBe('function');
      expect(typeof logger4.info).toBe('function');
    });

    it('should handle empty service name gracefully', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create logger with empty string
      const emptyLogger = createServiceLogger('');

      // Assert: Should still return a valid logger
      expect(emptyLogger).toBeDefined();
      expect(typeof emptyLogger.info).toBe('function');
    });

    it('should work correctly when called multiple times with same service', async () => {
      // Arrange: Import createServiceLogger
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create many loggers with the same name
      const loggers = Array.from({ length: 10 }, () => createServiceLogger('RepeatedService'));

      // Assert: All should be valid loggers
      loggers.forEach((logger, index) => {
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');

        // Each should be able to create its own children
        const child = logger.child({ index });
        expect(typeof child.info).toBe('function');
      });
    });

    it('should integrate with lazy initialization correctly', async () => {
      // Arrange: Set level and import
      process.env.LOG_LEVEL = 'debug';
      const { createServiceLogger } = await import('../utils/logger');

      // Act: Create service logger BEFORE root logger is initialized
      const serviceLogger = createServiceLogger('EarlyService');

      // Assert: Service logger should work and have correct level
      expect(serviceLogger.level).toBe('debug');
      expect(typeof serviceLogger.debug).toBe('function');

      // Should not throw when used
      expect(() => serviceLogger.debug('test message')).not.toThrow();
    });
  });

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
