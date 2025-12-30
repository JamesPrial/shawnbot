import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReadyHandler } from '../handlers/events/ready';
import type { Client } from 'discord.js';
import { createMockLogger } from './fixtures';

describe('createReadyHandler', () => {
  let mockVoiceMonitor: any;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockClient: Partial<Client>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock VoiceMonitorService with initialize method
    mockVoiceMonitor = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = createMockLogger();

    // Mock Discord client with user
    mockClient = {
      user: {
        tag: 'TestBot#1234',
      } as any,
    };
  });

  describe('when client is ready', () => {
    it('should log bot tag with correct message', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { botTag: 'TestBot#1234' },
        'Logged in as TestBot#1234'
      );
    });

    it('should log ready message', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Ready to monitor voice channels'
      );
    });

    it('should call voiceMonitor.initialize()', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockVoiceMonitor.initialize).toHaveBeenCalledTimes(1);
    });

    it('should call initialize after logging ready messages', async () => {
      const callOrder: string[] = [];

      mockLogger.info.mockImplementation(() => {
        callOrder.push('log');
      });

      mockVoiceMonitor.initialize.mockImplementation(async () => {
        callOrder.push('initialize');
      });

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      // Logs should happen before initialization
      expect(callOrder).toEqual(['log', 'log', 'initialize']);
    });
  });

  describe('when initialize() throws an error', () => {
    it('should catch and log the error', async () => {
      const testError = new Error('Initialization failed');
      mockVoiceMonitor.initialize.mockRejectedValue(testError);

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Failed to initialize voice monitoring on startup'
      );
    });

    it('should not throw and allow handler to complete', async () => {
      mockVoiceMonitor.initialize.mockRejectedValue(new Error('Init failed'));

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      // Handler should complete successfully despite initialization error
      await expect(handler(mockClient as Client)).resolves.not.toThrow();
    });

    it('should still log ready messages even when initialize fails', async () => {
      mockVoiceMonitor.initialize.mockRejectedValue(new Error('Init failed'));

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      // Both ready messages should have been logged before the error
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ botTag: expect.any(String) }),
        expect.stringContaining('Logged in')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Ready to monitor voice channels'
      );
    });

    it('should log error with initialization failure context', async () => {
      const specificError = new Error('Database connection timeout');
      mockVoiceMonitor.initialize.mockRejectedValue(specificError);

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: specificError },
        'Failed to initialize voice monitoring on startup'
      );
    });
  });

  describe('when client.user is undefined', () => {
    it('should handle missing user and use fallback tag', async () => {
      const clientWithoutUser: Partial<Client> = {
        user: undefined,
      };

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(clientWithoutUser as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { botTag: 'Unknown Bot' },
        'Logged in as Unknown Bot'
      );
    });

    it('should handle missing user.tag and use fallback', async () => {
      const clientWithMalformedUser: Partial<Client> = {
        user: {} as any, // user exists but has no tag
      };

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(clientWithMalformedUser as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { botTag: 'Unknown Bot' },
        'Logged in as Unknown Bot'
      );
    });

    it('should still call initialize when user is undefined', async () => {
      const clientWithoutUser: Partial<Client> = {
        user: undefined,
      };

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(clientWithoutUser as Client);

      expect(mockVoiceMonitor.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('with different bot tags', () => {
    it('should log correct tag for bot with different name', async () => {
      const customClient: Partial<Client> = {
        user: {
          tag: 'CustomAFKBot#5678',
        } as any,
      };

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(customClient as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { botTag: 'CustomAFKBot#5678' },
        'Logged in as CustomAFKBot#5678'
      );
    });

    it('should handle bot tag with special characters', async () => {
      const specialClient: Partial<Client> = {
        user: {
          tag: 'Bot-Name_123#0001',
        } as any,
      };

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(specialClient as Client);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { botTag: 'Bot-Name_123#0001' },
        'Logged in as Bot-Name_123#0001'
      );
    });
  });

  describe('handler creation', () => {
    it('should return a function that accepts a Client', () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      expect(typeof handler).toBe('function');
      expect(handler.length).toBe(1); // Function accepts one parameter
    });

    it('should be callable multiple times with same dependencies', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      // Call handler twice
      await handler(mockClient as Client);
      await handler(mockClient as Client);

      // Initialize should be called twice
      expect(mockVoiceMonitor.initialize).toHaveBeenCalledTimes(2);
      // Logging should occur twice
      expect(mockLogger.info).toHaveBeenCalledTimes(4); // 2 logs per call
    });
  });

  describe('async behavior', () => {
    it('should wait for initialize to complete before resolving', async () => {
      let initializeCompleted = false;

      mockVoiceMonitor.initialize.mockImplementation(async () => {
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        initializeCompleted = true;
      });

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      // After handler completes, initialize should have completed
      expect(initializeCompleted).toBe(true);
    });

    it('should handle slow initialization gracefully', async () => {
      mockVoiceMonitor.initialize.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      const startTime = Date.now();
      await handler(mockClient as Client);
      const duration = Date.now() - startTime;

      // Should have waited for initialization
      expect(duration).toBeGreaterThanOrEqual(90); // Allow some margin
      expect(mockVoiceMonitor.initialize).toHaveBeenCalled();
    });
  });

  describe('error edge cases', () => {
    it('should handle non-Error objects thrown from initialize', async () => {
      // Some libraries throw non-Error objects
      mockVoiceMonitor.initialize.mockRejectedValue('String error');

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await expect(handler(mockClient as Client)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: 'String error' },
        'Failed to initialize voice monitoring on startup'
      );
    });

    it('should handle initialization rejection with null', async () => {
      mockVoiceMonitor.initialize.mockRejectedValue(null);

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await expect(handler(mockClient as Client)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: null },
        'Failed to initialize voice monitoring on startup'
      );
    });

    it('should handle initialization rejection with undefined', async () => {
      mockVoiceMonitor.initialize.mockRejectedValue(undefined);

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await expect(handler(mockClient as Client)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: undefined },
        'Failed to initialize voice monitoring on startup'
      );
    });
  });

  describe('logger interaction', () => {
    it('should call logger.info exactly twice on success', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });

    it('should call logger.error exactly once when initialize fails', async () => {
      mockVoiceMonitor.initialize.mockRejectedValue(new Error('Test error'));

      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should never call logger.error on successful initialization', async () => {
      const handler = createReadyHandler({
        voiceMonitor: mockVoiceMonitor,
        logger: mockLogger,
      });

      await handler(mockClient as Client);

      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });
});
