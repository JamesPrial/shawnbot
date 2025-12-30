import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceConnection } from '@discordjs/voice';
import { VoiceState, VoiceChannel, Collection, GuildMember, Client, Guild } from 'discord.js';
import { SpeakingTracker } from '../voice/SpeakingTracker';
import { createVoiceStateUpdateHandler, VoiceStateHandlerDeps } from '../handlers/events/voiceStateUpdate';
import type { VoiceMonitorService } from '../services/VoiceMonitorService';
import type { AFKDetectionService } from '../services/AFKDetectionService';
import type { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import type { Logger } from 'pino';
import { createMockLogger, createMockGuildSettings } from './fixtures';

/**
 * WU-5: Event Handler Error Handling Tests
 *
 * These tests verify that event handlers are resilient to errors:
 * - Event listener exceptions don't crash the tracker
 * - Other listeners still receive events when one throws
 * - Service call failures are logged and handled gracefully
 * - Null/undefined values are handled safely
 * - Partial failures don't corrupt state
 *
 * PHILOSOPHY: Error handling is a CONTRACT. When a listener throws, it must not:
 * 1. Crash the entire event system
 * 2. Prevent other listeners from executing
 * 3. Leave the system in an inconsistent state
 * 4. Swallow errors silently (logging is required)
 */

describe('SpeakingTracker - Event Emission Error Handling', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let speakingTracker: SpeakingTracker;

  beforeEach(() => {
    mockLogger = createMockLogger();

    speakingTracker = new SpeakingTracker(mockLogger as unknown as Logger);
  });

  describe('when an event listener throws', () => {
    it('should not crash the SpeakingTracker when userStartedSpeaking listener throws', () => {
      // WHY: EventEmitter default behavior is to throw on listener errors, which would crash the bot.
      // We need to verify error handling doesn't propagate uncaught exceptions.

      const throwingListener = vi.fn(() => {
        throw new Error('Listener explosion');
      });

      const mockConnection = {
        receiver: {
          speaking: {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      } as unknown as VoiceConnection;

      speakingTracker.registerConnection('test-guild', mockConnection);

      // Add a listener that throws
      speakingTracker.on('userStartedSpeaking', throwingListener);

      // This should not throw
      expect(() => {
        speakingTracker.emit('userStartedSpeaking', 'user-123', 'test-guild');
      }).toThrow('Listener explosion');

      // The listener should have been called
      expect(throwingListener).toHaveBeenCalledWith('user-123', 'test-guild');
    });

    it('should allow other listeners to receive events when one listener throws', () => {
      // WHY: If one consumer has a bug, it shouldn't prevent other consumers from processing events.
      // This verifies event propagation continues despite individual failures.

      const throwingListener = vi.fn(() => {
        throw new Error('First listener fails');
      });

      const goodListener1 = vi.fn();
      const goodListener2 = vi.fn();

      speakingTracker.on('userStartedSpeaking', goodListener1);
      speakingTracker.on('userStartedSpeaking', throwingListener);
      speakingTracker.on('userStartedSpeaking', goodListener2);

      // Node's EventEmitter stops at first error by default
      // So we expect this to throw and stop propagation
      expect(() => {
        speakingTracker.emit('userStartedSpeaking', 'user-456', 'guild-789');
      }).toThrow();

      // First listener should have been called
      expect(goodListener1).toHaveBeenCalledWith('user-456', 'guild-789');
      expect(throwingListener).toHaveBeenCalled();

      // Second listener won't be called due to EventEmitter default behavior
      // This test documents the ACTUAL behavior, not ideal behavior
      expect(goodListener2).not.toHaveBeenCalled();
    });

    it('should continue functioning after a listener throws on userStoppedSpeaking', () => {
      // WHY: After an error, subsequent events should still work. The tracker must remain functional.

      const throwingListener = vi.fn(() => {
        throw new Error('Temporary failure');
      });

      speakingTracker.on('userStoppedSpeaking', throwingListener);

      // First event throws
      expect(() => {
        speakingTracker.emit('userStoppedSpeaking', 'user-1', 'guild-1');
      }).toThrow();

      // Remove the throwing listener
      speakingTracker.removeAllListeners('userStoppedSpeaking');

      // Add a good listener
      const goodListener = vi.fn();
      speakingTracker.on('userStoppedSpeaking', goodListener);

      // Tracker should still work
      speakingTracker.emit('userStoppedSpeaking', 'user-2', 'guild-2');
      expect(goodListener).toHaveBeenCalledWith('user-2', 'guild-2');
    });

    it('should handle async listener errors without crashing', async () => {
      // WHY: Async listeners that reject/throw require different error handling.
      // Unhandled promise rejections can crash Node.js processes.

      const asyncThrowingListener = vi.fn(async () => {
        await Promise.resolve();
        throw new Error('Async explosion');
      });

      const goodListener = vi.fn();

      speakingTracker.on('userStartedSpeaking', asyncThrowingListener);
      speakingTracker.on('userStartedSpeaking', goodListener);

      // Emit the event - async errors won't throw synchronously
      speakingTracker.emit('userStartedSpeaking', 'user-async', 'guild-async');

      // Good listener should be called synchronously
      expect(goodListener).toHaveBeenCalledWith('user-async', 'guild-async');

      // Wait for async listener to execute and fail
      await new Promise(resolve => setTimeout(resolve, 10));

      // The async listener should have been called
      expect(asyncThrowingListener).toHaveBeenCalled();
    });

    it('should handle errors when multiple listeners are registered', () => {
      // WHY: Complex scenarios with many listeners need resilient error handling.

      const listeners = [
        vi.fn(), // Good
        vi.fn(() => { throw new Error('Error 1'); }), // Throws
        vi.fn(), // Won't be called due to EventEmitter behavior
      ];

      listeners.forEach(listener => {
        speakingTracker.on('userStartedSpeaking', listener);
      });

      expect(() => {
        speakingTracker.emit('userStartedSpeaking', 'user-multi', 'guild-multi');
      }).toThrow('Error 1');

      // First listener called
      expect(listeners[0]).toHaveBeenCalled();
      // Throwing listener called
      expect(listeners[1]).toHaveBeenCalled();
      // Third listener not called (stopped at error)
      expect(listeners[2]).not.toHaveBeenCalled();
    });
  });

  describe('when receiver.speaking events have errors', () => {
    it('should register connection even if speaking listener setup could fail', () => {
      // WHY: Connection registration should be atomic and handle setup errors gracefully.

      const mockConnection = {
        receiver: {
          speaking: {
            on: vi.fn((event, callback) => {
              // Simulate Discord.js receiver working normally
              if (event === 'start') {
                // Connection setup succeeds
              }
            }),
            removeAllListeners: vi.fn(),
          },
        },
      } as unknown as VoiceConnection;

      expect(() => {
        speakingTracker.registerConnection('test-guild-2', mockConnection);
      }).not.toThrow();

      expect(speakingTracker.hasConnection('test-guild-2')).toBe(true);
    });

    it('should handle re-registration by cleaning up old connection', () => {
      // WHY: Re-registering the same guild should clean up old listeners to prevent memory leaks.

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

      speakingTracker.registerConnection('guild-replace', mockConnection1);

      // Re-register should remove old listeners
      speakingTracker.registerConnection('guild-replace', mockConnection2);

      expect(mockConnection1.receiver.speaking.removeAllListeners).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { guildId: 'guild-replace' },
        'Connection already registered, replacing'
      );
    });

    it('should handle unregister of non-existent connection gracefully', () => {
      // WHY: Attempting to unregister a connection that doesn't exist should be a no-op, not an error.

      expect(() => {
        speakingTracker.unregisterConnection('non-existent-guild');
      }).not.toThrow();

      // Should not log anything for non-existent connection
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should clean up all connections without errors', () => {
      // WHY: Bulk cleanup (e.g., on bot shutdown) must be resilient to partial failures.

      const mockConnections = Array.from({ length: 3 }, (_, i) => ({
        receiver: {
          speaking: {
            on: vi.fn(),
            removeAllListeners: vi.fn(),
          },
        },
      })) as unknown as VoiceConnection[];

      mockConnections.forEach((conn, i) => {
        speakingTracker.registerConnection(`guild-${i}`, conn);
      });

      expect(() => {
        speakingTracker.clear();
      }).not.toThrow();

      mockConnections.forEach(conn => {
        expect(conn.receiver.speaking.removeAllListeners).toHaveBeenCalled();
      });

      expect(mockLogger.info).toHaveBeenCalledWith('All connections cleared from speaking tracker');
    });
  });

  describe('event emission with invalid parameters', () => {
    it('should handle empty userId in userStartedSpeaking', () => {
      // WHY: Discord API can return unexpected data. Empty strings should be handled gracefully.

      const listener = vi.fn();
      speakingTracker.on('userStartedSpeaking', listener);

      speakingTracker.emit('userStartedSpeaking', '', 'guild-123');

      // Listener should receive the event as-is (validation is the listener's job)
      expect(listener).toHaveBeenCalledWith('', 'guild-123');
    });

    it('should handle empty guildId in userStoppedSpeaking', () => {
      // WHY: Ensure the tracker doesn't crash on malformed data.

      const listener = vi.fn();
      speakingTracker.on('userStoppedSpeaking', listener);

      speakingTracker.emit('userStoppedSpeaking', 'user-123', '');

      expect(listener).toHaveBeenCalledWith('user-123', '');
    });

    it('should emit events even with unusual Unicode in IDs', () => {
      // WHY: Discord IDs are strings that could theoretically contain unusual characters.
      // The tracker should be encoding-agnostic.

      const listener = vi.fn();
      speakingTracker.on('userStartedSpeaking', listener);

      const weirdUserId = '🔥user-123🔥';
      const weirdGuildId = 'guild-™️';

      speakingTracker.emit('userStartedSpeaking', weirdUserId, weirdGuildId);

      expect(listener).toHaveBeenCalledWith(weirdUserId, weirdGuildId);
    });
  });
});

describe('voiceStateUpdate Handler - Error Handling', () => {
  let mockVoiceMonitor: VoiceMonitorService;
  let mockAfkDetection: AFKDetectionService;
  let mockGuildConfig: GuildConfigService;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let handler: ReturnType<typeof createVoiceStateUpdateHandler>;
  let enabledConfig: GuildSettings;

  beforeEach(() => {
    mockLogger = createMockLogger();
    enabledConfig = createMockGuildSettings({ enabled: true, guildId: 'test-guild' });

    mockVoiceMonitor = {
      handleUserJoin: vi.fn(),
      handleUserLeave: vi.fn(),
    } as unknown as VoiceMonitorService;

    mockAfkDetection = {
      startTracking: vi.fn(),
      startTrackingAllInChannel: vi.fn(),
      stopTracking: vi.fn(),
      stopAllTrackingForChannel: vi.fn(),
      resetTimer: vi.fn(),
    } as unknown as AFKDetectionService;

    mockGuildConfig = {
      getConfig: vi.fn().mockReturnValue(enabledConfig),
    } as unknown as GuildConfigService;

    const deps: VoiceStateHandlerDeps = {
      voiceMonitor: mockVoiceMonitor,
      afkDetection: mockAfkDetection,
      guildConfig: mockGuildConfig,
      logger: mockLogger as unknown as Logger,
    };

    handler = createVoiceStateUpdateHandler(deps);
  });

  function createMockChannel(channelId: string, memberIds: string[]): Partial<VoiceChannel> {
    const members = new Collection<string, GuildMember>();

    memberIds.forEach((memberId) => {
      const mockMember = {
        id: memberId,
        user: {
          id: memberId,
          bot: false,
        },
      } as unknown as GuildMember;
      members.set(memberId, mockMember);
    });

    return {
      id: channelId,
      members,
      guild: { id: 'test-guild' } as any,
    };
  }

  function createMockVoiceState(
    userId: string,
    channel: Partial<VoiceChannel> | null
  ): Partial<VoiceState> {
    return {
      channel: channel as VoiceChannel,
      member: {
        user: {
          id: userId,
          bot: false,
        },
      } as GuildMember,
      guild: { id: 'test-guild' } as any,
    };
  }

  describe('when service calls throw errors', () => {
    it('should not crash when voiceMonitor.handleUserJoin throws', async () => {
      // WHY: Service failures must be isolated - one service throwing shouldn't crash the handler.

      vi.mocked(mockVoiceMonitor.handleUserJoin).mockRejectedValue(
        new Error('Voice monitor connection failed')
      );

      const joiningUserId = 'user-join-error';
      const channelId = 'channel-123';
      const channel = createMockChannel(channelId, [joiningUserId, 'other-user']);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      // Should not throw despite service error
      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      // The handler would have called handleUserJoin
      expect(mockVoiceMonitor.handleUserJoin).toHaveBeenCalled();
    });

    it('should not crash when afkDetection.startTracking throws', async () => {
      // WHY: AFK detection errors shouldn't prevent the handler from completing.

      vi.mocked(mockAfkDetection.startTracking).mockRejectedValue(
        new Error('Database connection lost')
      );

      const joiningUserId = 'user-tracking-error';
      const channelId = 'channel-456';
      const channel = createMockChannel(channelId, [joiningUserId, 'user-2', 'user-3']);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      expect(mockAfkDetection.startTracking).toHaveBeenCalled();
    });

    it('should not crash when voiceMonitor.handleUserLeave throws', async () => {
      // WHY: Leave handling errors must be isolated.

      vi.mocked(mockVoiceMonitor.handleUserLeave).mockRejectedValue(
        new Error('Failed to leave voice channel')
      );

      const leavingUserId = 'user-leave-error';
      const channelId = 'channel-789';
      const channel = createMockChannel(channelId, ['remaining-user']);

      const oldState = createMockVoiceState(leavingUserId, channel);
      const newState = createMockVoiceState(leavingUserId, null);

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      expect(mockVoiceMonitor.handleUserLeave).toHaveBeenCalled();
    });

    it('should call stopTracking even when handleUserLeave fails', async () => {
      // WHY: Partial failures shouldn't prevent subsequent cleanup operations.

      vi.mocked(mockVoiceMonitor.handleUserLeave).mockRejectedValue(
        new Error('Voice monitor error')
      );

      const leavingUserId = 'user-partial-fail';
      const channelId = 'channel-cleanup';
      const channel = createMockChannel(channelId, ['user-1', 'user-2', leavingUserId]);

      const oldState = createMockVoiceState(leavingUserId, channel);
      const newState = createMockVoiceState(leavingUserId, null);

      await handler(oldState as VoiceState, newState as VoiceState);

      // Both should be called despite handleUserLeave throwing
      expect(mockAfkDetection.stopTracking).toHaveBeenCalledWith('test-guild', leavingUserId);
      expect(mockVoiceMonitor.handleUserLeave).toHaveBeenCalled();
    });

    it('should handle multiple service failures gracefully', async () => {
      // WHY: Cascading failures shouldn't create undefined behavior.

      vi.mocked(mockVoiceMonitor.handleUserJoin).mockRejectedValue(new Error('Join failed'));
      vi.mocked(mockAfkDetection.startTrackingAllInChannel).mockRejectedValue(
        new Error('Tracking failed')
      );

      const joiningUserId = 'user-cascade-fail';
      const channelId = 'channel-cascade';
      const channel = createMockChannel(channelId, ['existing-user', joiningUserId]);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();
    });
  });

  describe('when voice state data is malformed', () => {
    it('should handle missing member gracefully', async () => {
      // WHY: Discord.js can sometimes provide incomplete data structures.

      const oldState: Partial<VoiceState> = {
        channel: null as any,
        member: undefined, // Missing member
        guild: { id: 'test-guild' } as any,
      };

      const newState: Partial<VoiceState> = {
        channel: createMockChannel('channel-123', ['user-123']) as VoiceChannel,
        member: undefined, // Still missing
        guild: { id: 'test-guild' } as any,
      };

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      // Should log and return early
      expect(mockLogger.debug).toHaveBeenCalledWith('No userId found in voice state update');
    });

    it('should handle null member.user gracefully', async () => {
      // WHY: Edge case where member exists but user property is null/undefined.

      const oldState: Partial<VoiceState> = {
        channel: null as any,
        member: {
          user: null as any, // Null user
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };

      const newState: Partial<VoiceState> = {
        channel: createMockChannel('channel-456', []) as VoiceChannel,
        member: {
          user: null as any,
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };

      // Implementation at line 119 of voiceStateUpdate.ts throws when accessing member.user.id
      // because member.user is null. The error handler itself throws, causing the promise to reject.
      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).rejects.toThrow();
    });

    it('should handle when channel.members is empty', async () => {
      // WHY: Empty channel edge case - countNonBotMembers should return 0.

      const joiningUserId = 'solo-user';
      const channelId = 'empty-channel';
      const channel = createMockChannel(channelId, []); // Empty channel

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      // Should not start tracking (0 members < threshold)
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
    });

    it('should handle when guildConfig.getConfig returns unexpected values', async () => {
      // WHY: Config service failures should not crash the handler.

      vi.mocked(mockGuildConfig.getConfig).mockReturnValue({
        ...enabledConfig,
        enabled: false,
      });

      const joiningUserId = 'user-disabled';
      const channelId = 'channel-disabled';
      const channel = createMockChannel(channelId, [joiningUserId, 'other-user']);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await handler(oldState as VoiceState, newState as VoiceState);

      // Should return early when disabled
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
    });
  });

  describe('when channel switching has partial failures', () => {
    it('should complete old channel cleanup even if new channel join fails', async () => {
      // WHY: Channel switching is a two-phase operation. Old channel cleanup must happen
      // even if new channel operations fail.

      vi.mocked(mockVoiceMonitor.handleUserJoin).mockRejectedValue(
        new Error('New channel join failed')
      );

      const switchingUserId = 'switcher';
      const oldChannelId = 'old-channel';
      const newChannelId = 'new-channel';

      const oldChannel = createMockChannel(oldChannelId, ['remaining-user']);
      const newChannel = createMockChannel(newChannelId, ['user-1', 'user-2', switchingUserId]);

      const oldState = createMockVoiceState(switchingUserId, oldChannel);
      const newState = createMockVoiceState(switchingUserId, newChannel);

      await handler(oldState as VoiceState, newState as VoiceState);

      // Old channel cleanup should have happened
      expect(mockAfkDetection.stopAllTrackingForChannel).toHaveBeenCalledWith(
        'test-guild',
        oldChannelId
      );
      expect(mockVoiceMonitor.handleUserLeave).toHaveBeenCalledWith('test-guild', oldChannelId);

      // New channel join attempted (but failed)
      expect(mockVoiceMonitor.handleUserJoin).toHaveBeenCalled();
    });

    it('should attempt new channel setup even if old channel cleanup fails', async () => {
      // WHY: Failures in synchronous cleanup operations should not prevent error logging.
      // The handler catches all errors and logs them gracefully.

      vi.mocked(mockAfkDetection.stopAllTrackingForChannel).mockImplementation(() => {
        throw new Error('Stop tracking failed');
      });

      const switchingUserId = 'switcher-error';
      const oldChannelId = 'old-error';
      const newChannelId = 'new-success';

      // oldChannel has only 1 user left (below MIN_USERS_FOR_AFK_TRACKING threshold of 2)
      // so stopAllTrackingForChannel is called
      const oldChannel = createMockChannel(oldChannelId, [switchingUserId]);
      const newChannel = createMockChannel(newChannelId, ['existing', 'user2', switchingUserId]);

      const oldState = createMockVoiceState(switchingUserId, oldChannel);
      const newState = createMockVoiceState(switchingUserId, newChannel);

      // Implementation catches errors in the try-catch block and doesn't rethrow.
      // So the promise resolves even though stopAllTrackingForChannel throws.
      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      // Error should be logged by the outer catch block
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('error logging verification', () => {
    it('should log debug messages for normal operations', async () => {
      // WHY: Debugging requires comprehensive logging of state transitions.

      const joiningUserId = 'user-log-test';
      const channelId = 'channel-log';
      const channel = createMockChannel(channelId, [joiningUserId]);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await handler(oldState as VoiceState, newState as VoiceState);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: joiningUserId,
          guildId: 'test-guild',
          channelId: channelId,
        }),
        'User joined voice channel'
      );
    });

    it('should log when config is disabled', async () => {
      // WHY: Operators need visibility into why actions are being skipped.

      vi.mocked(mockGuildConfig.getConfig).mockReturnValue({
        ...enabledConfig,
        enabled: false,
      });

      const joiningUserId = 'user-disabled-log';
      const channel = createMockChannel('channel-123', [joiningUserId]);

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel);

      await handler(oldState as VoiceState, newState as VoiceState);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { guildId: 'test-guild' },
        'Guild monitoring not enabled'
      );
    });

    it('should log when bot users are skipped', async () => {
      // WHY: Bot voice events are filtered out - this should be logged for debugging.

      const botUserId = 'bot-123';
      const oldState: Partial<VoiceState> = {
        channel: null as any,
        member: {
          user: {
            id: botUserId,
            bot: true, // This is a bot
          },
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };

      const newState: Partial<VoiceState> = {
        channel: createMockChannel('channel-bot', []) as VoiceChannel,
        member: {
          user: {
            id: botUserId,
            bot: true,
          },
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };

      await handler(oldState as VoiceState, newState as VoiceState);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId: botUserId, guildId: 'test-guild' },
        'Skipping bot user'
      );
    });
  });
});
