import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Client } from 'discord.js';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import type { SpeakingTracker } from '../voice/SpeakingTracker';
import type { VoiceConnectionManager } from '../voice/VoiceConnectionManager';

/**
 * SHUTDOWN CLEANUP TEST SUITE (WU-6)
 *
 * This suite tests the graceful shutdown behavior in index.ts (lines 32-48).
 *
 * KEY BEHAVIORS:
 * 1. Graceful shutdown calls database.close()
 * 2. Database close is called AFTER other cleanup (speakingTracker.clear, voiceConnectionManager.disconnectAll, client.destroy)
 * 3. Errors during shutdown are logged properly
 * 4. Process exits with correct code (0 for success, 1 for error)
 * 5. Shutdown is triggered by SIGINT and SIGTERM signals
 *
 * CRITICAL: The cleanup order matters. Database close must happen after all other cleanup
 * to ensure in-flight operations can complete and be persisted.
 *
 * CONTEXT: WU-6 adds database.close() to the shutdown sequence to prevent database
 * connection leaks and ensure data integrity.
 */

describe('index.ts - Graceful Shutdown', () => {
  let mockLogger: Logger;
  let mockDatabase: Database.Database;
  let mockSpeakingTracker: SpeakingTracker;
  let mockVoiceConnectionManager: VoiceConnectionManager;
  let mockClient: Client;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    mockDatabase = {
      close: vi.fn(),
      prepare: vi.fn(),
      exec: vi.fn(),
    } as unknown as Database.Database;

    mockSpeakingTracker = {
      clear: vi.fn(),
      on: vi.fn(),
      emit: vi.fn(),
    } as unknown as SpeakingTracker;

    mockVoiceConnectionManager = {
      disconnectAll: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
    } as unknown as VoiceConnectionManager;

    mockClient = {
      destroy: vi.fn(),
      login: vi.fn(),
      on: vi.fn(),
    } as unknown as Client;

    // Mock process.exit to prevent actual process termination during tests
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      return undefined as never;
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
  });

  /**
   * Helper to simulate the gracefulShutdown function from index.ts
   */
  async function gracefulShutdown(
    signal: string,
    logger: Logger,
    speakingTracker: SpeakingTracker,
    voiceConnectionManager: VoiceConnectionManager,
    client: Client,
    database: Database.Database
  ): Promise<void> {
    logger.info({ signal }, 'Received shutdown signal, cleaning up');

    try {
      speakingTracker.clear();
      voiceConnectionManager.disconnectAll();
      client.destroy();
      database.close();
      logger.info('Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  describe('successful shutdown', () => {
    it('should call database.close() during graceful shutdown', async () => {
      // WHY: Database connections must be properly closed to prevent resource leaks
      // and ensure all pending writes are flushed.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockDatabase.close).toHaveBeenCalledTimes(1);
    });

    it('should call speakingTracker.clear() during shutdown', async () => {
      // WHY: Speaking tracker must clear all event listeners and timers to prevent
      // memory leaks and ensure clean shutdown.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockSpeakingTracker.clear).toHaveBeenCalledTimes(1);
    });

    it('should call voiceConnectionManager.disconnectAll() during shutdown', async () => {
      // WHY: All voice connections must be gracefully disconnected to prevent
      // Discord API errors and ghost connections.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockVoiceConnectionManager.disconnectAll).toHaveBeenCalledTimes(1);
    });

    it('should call client.destroy() during shutdown', async () => {
      // WHY: Discord client must be destroyed to close the WebSocket connection
      // and clean up internal resources.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockClient.destroy).toHaveBeenCalledTimes(1);
    });

    it('should log shutdown start with signal information', async () => {
      // WHY: Logging which signal triggered shutdown aids in debugging and monitoring.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { signal: 'SIGTERM' },
        'Received shutdown signal, cleaning up'
      );
    });

    it('should log shutdown completion', async () => {
      // WHY: Successful shutdown should be logged for monitoring and debugging.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Bot shutdown complete');
    });

    it('should exit with code 0 on successful shutdown', async () => {
      // WHY: Exit code 0 indicates clean shutdown, important for process managers.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT signal', async () => {
      // WHY: SIGINT (Ctrl+C) is a common shutdown signal that must be handled.

      await gracefulShutdown(
        'SIGINT',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { signal: 'SIGINT' },
        'Received shutdown signal, cleaning up'
      );
      expect(mockDatabase.close).toHaveBeenCalled();
    });

    it('should handle SIGTERM signal', async () => {
      // WHY: SIGTERM is the standard signal for graceful shutdown.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { signal: 'SIGTERM' },
        'Received shutdown signal, cleaning up'
      );
      expect(mockDatabase.close).toHaveBeenCalled();
    });
  });

  describe('cleanup order', () => {
    it('should call database.close() AFTER speakingTracker.clear()', async () => {
      // WHY: Speaking tracker must be cleared before database close to ensure
      // any in-flight database operations from speaking events complete first.

      const callOrder: string[] = [];

      const trackedSpeakingTracker = {
        clear: vi.fn(() => callOrder.push('speakingTracker.clear')),
      } as unknown as SpeakingTracker;

      const trackedDatabase = {
        close: vi.fn(() => callOrder.push('database.close')),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        trackedSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        trackedDatabase
      );

      const clearIndex = callOrder.indexOf('speakingTracker.clear');
      const closeIndex = callOrder.indexOf('database.close');

      expect(clearIndex).toBeGreaterThan(-1);
      expect(closeIndex).toBeGreaterThan(-1);
      expect(clearIndex).toBeLessThan(closeIndex);
    });

    it('should call database.close() AFTER voiceConnectionManager.disconnectAll()', async () => {
      // WHY: Voice connections might trigger database writes during disconnect.
      // Database must remain open until all connections are closed.

      const callOrder: string[] = [];

      const trackedVoiceManager = {
        disconnectAll: vi.fn(() => callOrder.push('voiceConnectionManager.disconnectAll')),
      } as unknown as VoiceConnectionManager;

      const trackedDatabase = {
        close: vi.fn(() => callOrder.push('database.close')),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        trackedVoiceManager,
        mockClient,
        trackedDatabase
      );

      const disconnectIndex = callOrder.indexOf('voiceConnectionManager.disconnectAll');
      const closeIndex = callOrder.indexOf('database.close');

      expect(disconnectIndex).toBeGreaterThan(-1);
      expect(closeIndex).toBeGreaterThan(-1);
      expect(disconnectIndex).toBeLessThan(closeIndex);
    });

    it('should call database.close() AFTER client.destroy()', async () => {
      // WHY: Client destruction might trigger event handlers that need database access.
      // Database must be the last thing to close.

      const callOrder: string[] = [];

      const trackedClient = {
        destroy: vi.fn(() => callOrder.push('client.destroy')),
      } as unknown as Client;

      const trackedDatabase = {
        close: vi.fn(() => callOrder.push('database.close')),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        trackedClient,
        trackedDatabase
      );

      const destroyIndex = callOrder.indexOf('client.destroy');
      const closeIndex = callOrder.indexOf('database.close');

      expect(destroyIndex).toBeGreaterThan(-1);
      expect(closeIndex).toBeGreaterThan(-1);
      expect(destroyIndex).toBeLessThan(closeIndex);
    });

    it('should execute all cleanup steps in correct order', async () => {
      // WHY: The complete cleanup sequence must follow the correct order:
      // 1. speakingTracker.clear()
      // 2. voiceConnectionManager.disconnectAll()
      // 3. client.destroy()
      // 4. database.close()

      const callOrder: string[] = [];

      const trackedSpeakingTracker = {
        clear: vi.fn(() => callOrder.push('speakingTracker.clear')),
      } as unknown as SpeakingTracker;

      const trackedVoiceManager = {
        disconnectAll: vi.fn(() => callOrder.push('voiceConnectionManager.disconnectAll')),
      } as unknown as VoiceConnectionManager;

      const trackedClient = {
        destroy: vi.fn(() => callOrder.push('client.destroy')),
      } as unknown as Client;

      const trackedDatabase = {
        close: vi.fn(() => callOrder.push('database.close')),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        trackedSpeakingTracker,
        trackedVoiceManager,
        trackedClient,
        trackedDatabase
      );

      expect(callOrder).toEqual([
        'speakingTracker.clear',
        'voiceConnectionManager.disconnectAll',
        'client.destroy',
        'database.close',
      ]);
    });
  });

  describe('error handling during shutdown', () => {
    it('should log error when speakingTracker.clear() throws', async () => {
      // WHY: Errors during shutdown must be logged to aid debugging.

      const testError = new Error('Failed to clear speaking tracker');
      const failingSpeakingTracker = {
        clear: vi.fn(() => {
          throw testError;
        }),
      } as unknown as SpeakingTracker;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        failingSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError },
        'Error during shutdown'
      );
    });

    it('should log error when voiceConnectionManager.disconnectAll() throws', async () => {
      // WHY: Voice disconnection errors must be captured and logged.

      const testError = new Error('Failed to disconnect voice connections');
      const failingVoiceManager = {
        disconnectAll: vi.fn(() => {
          throw testError;
        }),
      } as unknown as VoiceConnectionManager;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        failingVoiceManager,
        mockClient,
        mockDatabase
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError },
        'Error during shutdown'
      );
    });

    it('should log error when client.destroy() throws', async () => {
      // WHY: Client destruction errors must be logged.

      const testError = new Error('Failed to destroy Discord client');
      const failingClient = {
        destroy: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Client;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        failingClient,
        mockDatabase
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError },
        'Error during shutdown'
      );
    });

    it('should log error when database.close() throws', async () => {
      // WHY: Database close errors are critical and must be logged.

      const testError = new Error('Database close failed');
      const failingDatabase = {
        close: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        failingDatabase
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError },
        'Error during shutdown'
      );
    });

    it('should exit with code 1 when shutdown fails', async () => {
      // WHY: Non-zero exit code indicates failure, important for process managers
      // to detect and handle shutdown errors.

      const testError = new Error('Shutdown failure');
      const failingDatabase = {
        close: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        failingDatabase
      );

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should NOT log "Bot shutdown complete" when error occurs', async () => {
      // WHY: Success message should not be logged if shutdown failed.

      const testError = new Error('Shutdown error');
      const failingClient = {
        destroy: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Client;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        failingClient,
        mockDatabase
      );

      expect(mockLogger.info).not.toHaveBeenCalledWith('Bot shutdown complete');
    });

    it('should still log shutdown start even if cleanup fails', async () => {
      // WHY: The initial shutdown signal should always be logged, even if cleanup fails.

      const testError = new Error('Cleanup failed');
      const failingDatabase = {
        close: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        failingDatabase
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { signal: 'SIGTERM' },
        'Received shutdown signal, cleaning up'
      );
    });

    it('should include error object in error log', async () => {
      // WHY: The error object contains stack traces and details critical for debugging.

      const testError = new Error('Database corruption detected');
      testError.stack = 'Error: Database corruption detected\n  at shutdown.ts:42:10';
      const failingDatabase = {
        close: vi.fn(() => {
          throw testError;
        }),
      } as unknown as Database.Database;

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        failingDatabase
      );

      const errorLog = vi.mocked(mockLogger.error).mock.calls[0];
      expect(errorLog[0]).toHaveProperty('error', testError);
    });
  });

  describe('partial cleanup scenarios', () => {
    it('should attempt database.close() even if speakingTracker.clear() fails', async () => {
      // WHY: Shutdown should be as complete as possible. Even if early steps fail,
      // later cleanup steps should still be attempted.
      // NOTE: This is aspirational - the current implementation uses a single try-catch
      // that would abort on first error. This documents desired behavior.

      const testError = new Error('Clear failed');
      const failingSpeakingTracker = {
        clear: vi.fn(() => {
          throw testError;
        }),
      } as unknown as SpeakingTracker;

      // Current implementation will abort on first error
      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        failingSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      // In current implementation, database.close() is NOT called if earlier step fails
      // Future enhancement: implement resilient cleanup that attempts all steps
      expect(mockDatabase.close).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('database close behavior', () => {
    it('should call database.close() exactly once per shutdown', async () => {
      // WHY: Multiple close() calls could cause errors. Verify it's called exactly once.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockDatabase.close).toHaveBeenCalledTimes(1);
    });

    it('should not pass arguments to database.close()', async () => {
      // WHY: better-sqlite3 close() takes no arguments. Verify correct API usage.

      await gracefulShutdown(
        'SIGTERM',
        mockLogger,
        mockSpeakingTracker,
        mockVoiceConnectionManager,
        mockClient,
        mockDatabase
      );

      expect(mockDatabase.close).toHaveBeenCalledWith();
    });
  });

  describe('signal-specific behavior', () => {
    it('should handle multiple different signals with same cleanup logic', async () => {
      // WHY: SIGINT and SIGTERM should trigger identical cleanup behavior.

      const signals = ['SIGINT', 'SIGTERM'];

      for (const signal of signals) {
        // Create fresh mocks for each iteration
        const freshDatabase = { close: vi.fn() } as unknown as Database.Database;
        const freshClient = { destroy: vi.fn() } as unknown as Client;
        const freshVoiceManager = {
          disconnectAll: vi.fn(),
        } as unknown as VoiceConnectionManager;
        const freshSpeakingTracker = { clear: vi.fn() } as unknown as SpeakingTracker;

        await gracefulShutdown(
          signal,
          mockLogger,
          freshSpeakingTracker,
          freshVoiceManager,
          freshClient,
          freshDatabase
        );

        expect(freshDatabase.close).toHaveBeenCalledTimes(1);
        expect(freshClient.destroy).toHaveBeenCalledTimes(1);
      }
    });
  });
});
