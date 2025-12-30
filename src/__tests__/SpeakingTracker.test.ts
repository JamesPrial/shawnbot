import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceConnection } from '@discordjs/voice';
import { SpeakingTracker } from '../voice/SpeakingTracker';
import { createMockLogger, type MockLogger } from './fixtures';

/**
 * SpeakingTracker Tests
 *
 * These tests verify the speaking event detection and logging behavior.
 * Key behaviors tested:
 * 1. Speaking events are properly tracked and emitted
 * 2. Debug logs use isLevelEnabled guards for performance (WU-3)
 * 3. Event listeners are properly registered and cleaned up
 * 4. Error handling for listener exceptions
 */

describe('SpeakingTracker', () => {
  let mockLogger: MockLogger;
  let tracker: SpeakingTracker;

  beforeEach(() => {
    mockLogger = createMockLogger();
    tracker = new SpeakingTracker(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerConnection', () => {
    describe('when registering a new connection', () => {
      it('should register voice connection for speaking tracking', () => {
        // WHY: The tracker needs to listen to speaking events from the connection's receiver.

        const guildId = 'test-guild';
        const mockSpeakingEmitter = {
          on: vi.fn(),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Should register listeners for 'start' and 'end' events
        expect(mockSpeakingEmitter.on).toHaveBeenCalledWith('start', expect.any(Function));
        expect(mockSpeakingEmitter.on).toHaveBeenCalledWith('end', expect.any(Function));

        // Should log registration
        expect(mockLogger.info).toHaveBeenCalledWith(
          { guildId },
          'Voice connection registered for speaking tracking'
        );
      });

      it('should store connection in internal map', () => {
        // WHY: The tracker needs to maintain a reference to the connection.

        const guildId = 'stored-guild';
        const mockConnection = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: vi.fn(),
            },
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        expect(tracker.hasConnection(guildId)).toBe(true);
        expect(tracker.getConnection(guildId)).toBe(mockConnection);
      });

      it('should replace existing connection when registering same guild twice', () => {
        // WHY: If we reconnect to a guild, we should replace the old connection.

        const guildId = 'replace-guild';

        const mockConnection1 = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: vi.fn(),
            },
          },
        } as unknown as VoiceConnection;

        const mockConnection2 = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: vi.fn(),
            },
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection1);
        tracker.registerConnection(guildId, mockConnection2);

        // Should warn about replacement
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { guildId },
          'Connection already registered, replacing'
        );

        // Should have the new connection
        expect(tracker.getConnection(guildId)).toBe(mockConnection2);
      });
    });
  });

  describe('unregisterConnection', () => {
    describe('when unregistering a connection', () => {
      it('should remove all listeners from speaking emitter', () => {
        // WHY: Prevent memory leaks by cleaning up event listeners.

        const guildId = 'unregister-guild';
        const mockRemoveAllListeners = vi.fn();
        const mockConnection = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: mockRemoveAllListeners,
            },
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);
        tracker.unregisterConnection(guildId);

        expect(mockRemoveAllListeners).toHaveBeenCalled();
      });

      it('should remove connection from internal map', () => {
        // WHY: The connection should no longer be tracked after unregistering.

        const guildId = 'removed-guild';
        const mockConnection = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: vi.fn(),
            },
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);
        expect(tracker.hasConnection(guildId)).toBe(true);

        tracker.unregisterConnection(guildId);
        expect(tracker.hasConnection(guildId)).toBe(false);
        expect(tracker.getConnection(guildId)).toBeUndefined();
      });

      it('should log unregistration', () => {
        // WHY: Track when connections are unregistered for debugging.

        const guildId = 'log-unregister-guild';
        const mockConnection = {
          receiver: {
            speaking: {
              on: vi.fn(),
              removeAllListeners: vi.fn(),
            },
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Clear registration logs
        vi.mocked(mockLogger.info).mockClear();

        tracker.unregisterConnection(guildId);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { guildId },
          'Voice connection unregistered from speaking tracking'
        );
      });

      it('should not throw when unregistering non-existent connection', () => {
        // WHY: Defensive coding - should be safe to call on non-existent guilds.

        expect(() => {
          tracker.unregisterConnection('non-existent-guild');
        }).not.toThrow();

        // Should not log when connection doesn't exist
        expect(mockLogger.info).not.toHaveBeenCalled();
      });
    });
  });

  describe('WU-3: Speaking Event Debug Logging with Level Guards', () => {
    /**
     * WU-3 tests for debug logging with isLevelEnabled performance guards.
     * Speaking events fire frequently, so we guard debug logs to avoid
     * performance overhead when debug logging is disabled.
     */

    describe('when user starts speaking', () => {
      it('should guard debug log with isLevelEnabled check', () => {
        // WHY: Speaking events fire frequently. We should only process debug logs
        // when debug level is actually enabled to avoid performance overhead.

        const guildId = 'debug-guard-guild';
        const userId = 'user-123';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Clear registration logs
        vi.mocked(mockLogger.isLevelEnabled).mockClear();
        vi.mocked(mockLogger.debug).mockClear();

        // Set debug logging disabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(false);

        // Trigger speaking start event
        if (startHandler) {
          startHandler(userId);
        }

        // Should check if debug is enabled
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');

        // Should NOT call debug when disabled
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log with action metadata when debug is enabled', () => {
        // WHY: When debug is enabled, we want structured logs with action identifiers.

        const guildId = 'debug-enabled-guild';
        const userId = 'user-456';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Clear registration logs
        vi.mocked(mockLogger.isLevelEnabled).mockClear();
        vi.mocked(mockLogger.debug).mockClear();

        // Set debug logging enabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);

        // Trigger speaking start event
        if (startHandler) {
          startHandler(userId);
        }

        // Should check if debug is enabled
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');

        // Should log with action metadata when enabled
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'speaking_start',
            userId,
            guildId,
          }),
          expect.stringContaining('started speaking')
        );
      });

      it('should emit userStartedSpeaking event regardless of debug level', () => {
        // WHY: Event emission is independent of logging. The AFK detection service
        // needs these events even when debug logging is disabled.

        const guildId = 'emit-guild';
        const userId = 'user-789';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Set debug logging disabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(false);

        const startListener = vi.fn();
        tracker.on('userStartedSpeaking', startListener);

        // Trigger speaking start event
        if (startHandler) {
          startHandler(userId);
        }

        // Event should be emitted even when debug logging is disabled
        expect(startListener).toHaveBeenCalledWith(userId, guildId);
      });

      it('should include userId and guildId in debug log', () => {
        // WHY: These IDs are essential for correlating speaking events with specific users and servers.

        const guildId = 'ids-guild';
        const userId = 'user-with-id';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);
        vi.mocked(mockLogger.debug).mockClear();

        if (startHandler) {
          startHandler(userId);
        }

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-with-id',
            guildId: 'ids-guild',
          }),
          expect.any(String)
        );
      });
    });

    describe('when user stops speaking', () => {
      it('should guard debug log with isLevelEnabled check', () => {
        // WHY: Speaking stop events also fire frequently and need performance guards.

        const guildId = 'stop-guard-guild';
        const userId = 'user-stop-123';

        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Clear registration logs
        vi.mocked(mockLogger.isLevelEnabled).mockClear();
        vi.mocked(mockLogger.debug).mockClear();

        // Set debug logging disabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(false);

        // Trigger speaking end event
        if (endHandler) {
          endHandler(userId);
        }

        // Should check if debug is enabled
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');

        // Should NOT call debug when disabled
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should log with action metadata when debug is enabled', () => {
        // WHY: Structured logs help track when users stop speaking.

        const guildId = 'stop-enabled-guild';
        const userId = 'user-stop-456';

        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Clear registration logs
        vi.mocked(mockLogger.isLevelEnabled).mockClear();
        vi.mocked(mockLogger.debug).mockClear();

        // Set debug logging enabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);

        // Trigger speaking end event
        if (endHandler) {
          endHandler(userId);
        }

        // Should check if debug is enabled
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');

        // Should log with action metadata when enabled
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'speaking_stop',
            userId,
            guildId,
          }),
          expect.stringContaining('stopped speaking')
        );
      });

      it('should emit userStoppedSpeaking event regardless of debug level', () => {
        // WHY: Event emission is independent of logging. The AFK detection service
        // needs these events even when debug logging is disabled.

        const guildId = 'emit-stop-guild';
        const userId = 'user-stop-789';

        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Set debug logging disabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(false);

        const stopListener = vi.fn();
        tracker.on('userStoppedSpeaking', stopListener);

        // Trigger speaking end event
        if (endHandler) {
          endHandler(userId);
        }

        // Event should be emitted even when debug logging is disabled
        expect(stopListener).toHaveBeenCalledWith(userId, guildId);
      });

      it('should include userId and guildId in debug log', () => {
        // WHY: These IDs are essential for correlating speaking events with specific users and servers.

        const guildId = 'stop-ids-guild';
        const userId = 'user-stop-with-id';

        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);
        vi.mocked(mockLogger.debug).mockClear();

        if (endHandler) {
          endHandler(userId);
        }

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-stop-with-id',
            guildId: 'stop-ids-guild',
          }),
          expect.any(String)
        );
      });
    });

    describe('performance optimization', () => {
      it('should not construct debug log object when debug is disabled', () => {
        // WHY: Object construction has overhead. We should guard it behind isLevelEnabled.

        const guildId = 'perf-guild';
        const userId = 'perf-user';

        let startHandler: ((userId: string) => void) | undefined;
        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Set debug logging disabled
        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(false);
        vi.mocked(mockLogger.debug).mockClear();

        // Trigger many speaking events
        for (let i = 0; i < 100; i++) {
          if (startHandler) startHandler(userId);
          if (endHandler) endHandler(userId);
        }

        // Should check level 200 times (100 start + 100 end)
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(200);

        // Should NEVER call debug
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should only call isLevelEnabled once per event when enabled', () => {
        // WHY: isLevelEnabled check should happen before debug log, not after.

        const guildId = 'single-check-guild';
        const userId = 'single-check-user';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);
        vi.mocked(mockLogger.isLevelEnabled).mockClear();
        vi.mocked(mockLogger.debug).mockClear();

        if (startHandler) {
          startHandler(userId);
        }

        // Should call isLevelEnabled exactly once per event
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('error handling', () => {
    describe('when event listener throws error', () => {
      it('should log error when userStartedSpeaking listener throws', () => {
        // WHY: Errors in listeners shouldn't crash the tracker or stop other listeners.

        const guildId = 'error-start-guild';
        const userId = 'error-user';

        let startHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'start') {
              startHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Add a listener that throws
        tracker.on('userStartedSpeaking', () => {
          throw new Error('Listener error');
        });

        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);
        vi.mocked(mockLogger.error).mockClear();

        // Trigger event
        if (startHandler) {
          startHandler(userId);
        }

        // Should log the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId,
            guildId,
          }),
          'Error emitting userStartedSpeaking event'
        );
      });

      it('should log error when userStoppedSpeaking listener throws', () => {
        // WHY: Errors in stop listeners shouldn't crash the tracker.

        const guildId = 'error-stop-guild';
        const userId = 'error-stop-user';

        let endHandler: ((userId: string) => void) | undefined;

        const mockSpeakingEmitter = {
          on: vi.fn((event: string, handler: (userId: string) => void) => {
            if (event === 'end') {
              endHandler = handler;
            }
          }),
          removeAllListeners: vi.fn(),
        };

        const mockConnection = {
          receiver: {
            speaking: mockSpeakingEmitter,
          },
        } as unknown as VoiceConnection;

        tracker.registerConnection(guildId, mockConnection);

        // Add a listener that throws
        tracker.on('userStoppedSpeaking', () => {
          throw new Error('Stop listener error');
        });

        mockLogger.isLevelEnabled = vi.fn().mockReturnValue(true);
        vi.mocked(mockLogger.error).mockClear();

        // Trigger event
        if (endHandler) {
          endHandler(userId);
        }

        // Should log the error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            userId,
            guildId,
          }),
          'Error emitting userStoppedSpeaking event'
        );
      });
    });
  });

  describe('clear', () => {
    it('should unregister all connections', () => {
      // WHY: When shutting down, we need to clean up all connections.

      const guild1 = 'clear-guild-1';
      const guild2 = 'clear-guild-2';
      const guild3 = 'clear-guild-3';

      const createMockConnection = () => ({
        receiver: {
          speaking: {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      }) as unknown as VoiceConnection;

      tracker.registerConnection(guild1, createMockConnection());
      tracker.registerConnection(guild2, createMockConnection());
      tracker.registerConnection(guild3, createMockConnection());

      expect(tracker.hasConnection(guild1)).toBe(true);
      expect(tracker.hasConnection(guild2)).toBe(true);
      expect(tracker.hasConnection(guild3)).toBe(true);

      tracker.clear();

      expect(tracker.hasConnection(guild1)).toBe(false);
      expect(tracker.hasConnection(guild2)).toBe(false);
      expect(tracker.hasConnection(guild3)).toBe(false);
    });

    it('should log when clearing all connections', () => {
      // WHY: Track when all connections are cleared for debugging.

      const guild = 'single-guild';
      const mockConnection = {
        receiver: {
          speaking: {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      } as unknown as VoiceConnection;

      tracker.registerConnection(guild, mockConnection);

      vi.mocked(mockLogger.info).mockClear();

      tracker.clear();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All connections cleared from speaking tracker'
      );
    });

    it('should handle empty tracker without errors', () => {
      // WHY: Calling clear on empty tracker should be safe.

      expect(() => {
        tracker.clear();
      }).not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All connections cleared from speaking tracker'
      );
    });
  });

  describe('getConnection and hasConnection', () => {
    it('should return undefined for non-existent guild', () => {
      // WHY: Defensive null safety - get() should return undefined, not throw.

      expect(tracker.getConnection('non-existent')).toBeUndefined();
    });

    it('should return false for non-existent guild', () => {
      // WHY: hasConnection should accurately reflect absence of connection.

      expect(tracker.hasConnection('non-existent')).toBe(false);
    });

    it('should return connection for registered guild', () => {
      // WHY: After registration, we should be able to retrieve the connection.

      const guildId = 'get-guild';
      const mockConnection = {
        receiver: {
          speaking: {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      } as unknown as VoiceConnection;

      tracker.registerConnection(guildId, mockConnection);

      expect(tracker.getConnection(guildId)).toBe(mockConnection);
      expect(tracker.hasConnection(guildId)).toBe(true);
    });
  });
});
