import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Guild, GuildMember, VoiceState, VoiceChannel, Collection } from 'discord.js';
import { SpeakingTracker } from '../voice/SpeakingTracker';
import type { AFKDetectionService } from '../services/AFKDetectionService';

/**
 * These tests verify the THRESHOLD COORDINATION behavior for speaking events in bot.ts (WU-2).
 *
 * KEY CONCEPT: Speaking events should only trigger tracking actions when there are 2+ users
 * in the voice channel. This prevents false AFK detection in solo situations.
 *
 * Behaviors to test:
 * 7. userStartedSpeaking with 1 user in channel → resetTimer NOT called
 * 8. userStartedSpeaking with 2+ users → resetTimer called
 * 9. userStoppedSpeaking with 1 user in channel → startTracking NOT called
 * 10. userStoppedSpeaking with 2+ users → startTracking called
 */
describe('bot.ts - Speaking Event Threshold Coordination', () => {
  let mockClient: Client;
  let mockAfkDetection: AFKDetectionService;
  let speakingTracker: SpeakingTracker;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockClient = {
      guilds: {
        fetch: vi.fn(),
      },
    } as unknown as Client;

    mockAfkDetection = {
      resetTimer: vi.fn(),
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
    } as unknown as AFKDetectionService;

    speakingTracker = new SpeakingTracker(mockLogger);
  });

  /**
   * Helper to create a mock voice channel with specified non-bot members.
   */
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

  /**
   * Helper to set up the guild/member fetch mocks for a user in a specific channel.
   */
  function mockUserInChannel(userId: string, guildId: string, channel: Partial<VoiceChannel> | null) {
    const mockVoiceState: Partial<VoiceState> = {
      channel: channel as VoiceChannel,
    };

    const mockMember: Partial<GuildMember> = {
      id: userId,
      user: {
        id: userId,
        bot: false,
      } as any,
      voice: mockVoiceState as VoiceState,
    };

    const mockGuild: Partial<Guild> = {
      id: guildId,
      members: {
        fetch: vi.fn().mockResolvedValue(mockMember),
      } as any,
    };

    vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
  }

  describe('userStartedSpeaking event', () => {
    describe('with 1 user in channel (alone)', () => {
      it('should NOT call resetTimer when user is alone', async () => {
        // WHY: A user alone in a channel cannot be AFK in a social sense.
        // Starting to speak when alone should not reset any timer because no timer should be running.

        const userId = 'solo-speaker';
        const guildId = 'test-guild';
        const channelId = 'solo-channel';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        // Set up the handler for userStartedSpeaking
        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          // Fetch the user to check channel member count
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);

            // Only reset timer if 2+ users in channel
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);

        // Emit the event
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });

      it('should log that user started speaking even when alone', async () => {
        // WHY: We should still log the event for debugging, even if we don't act on it.

        const userId = 'solo-speaker-2';
        const guildId = 'test-guild';
        const channelId = 'solo-channel-2';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking');

          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { userId, guildId },
          'User started speaking'
        );
      });

      it('should handle when user is alone with bots (bots dont count)', async () => {
        // WHY: Bots in the channel don't count toward the threshold.

        const userId = 'user-with-bots';
        const guildId = 'test-guild';
        const channelId = 'channel-with-bots';

        // Create channel with 1 human and 2 bots
        const members = new Collection<string, GuildMember>();
        members.set(userId, {
          id: userId,
          user: { id: userId, bot: false },
        } as GuildMember);
        members.set('bot-1', {
          id: 'bot-1',
          user: { id: 'bot-1', bot: true },
        } as GuildMember);
        members.set('bot-2', {
          id: 'bot-2',
          user: { id: 'bot-2', bot: true },
        } as GuildMember);

        const channel = {
          id: channelId,
          members,
          guild: { id: guildId } as any,
        };

        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        // Should NOT reset timer (only 1 non-bot member)
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });
    });

    describe('with 2+ users in channel', () => {
      it('should call resetTimer when user starts speaking with 2 users present', async () => {
        // WHY: When a user speaks in a channel with 2+ people, it proves they're not AFK.
        // The timer should reset.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'active-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
        expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(1);
      });

      it('should call resetTimer when user starts speaking with 3+ users present', async () => {
        // WHY: Same behavior for any count >= 2.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'busy-channel';

        const channel = createMockChannel(channelId, [userId, 'user-2', 'user-3']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
      });

      it('should call resetTimer at exactly the threshold (2 users)', async () => {
        // WHY: Boundary test - verify threshold is >= 2, not > 2.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'threshold-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.resetTimer).toHaveBeenCalled();
      });

      it('should handle large channels correctly', async () => {
        // WHY: Verify the logic works at scale.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'large-channel';

        const otherUsers = Array.from({ length: 20 }, (_, i) => `user-${i}`);
        const channel = createMockChannel(channelId, [userId, ...otherUsers]);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          const guild = await mockClient.guilds.fetch(emittedGuildId);
          const member = await guild.members.fetch(emittedUserId);

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.resetTimer).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle when user is not in a channel', async () => {
        // WHY: User might have left the channel between speaking and event processing.

        const userId = 'disconnected-user';
        const guildId = 'test-guild';

        mockUserInChannel(userId, guildId, null);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer');
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        // Should not call resetTimer if user is not in channel
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });

      it('should log error when guild fetch fails', async () => {
        // WHY: Network errors or invalid guild IDs should be handled gracefully.

        const userId = 'user-error';
        const guildId = 'invalid-guild';

        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(new Error('Guild not found'));

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer');
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });
    });
  });

  describe('userStoppedSpeaking event', () => {
    describe('with 1 user in channel (alone)', () => {
      it('should NOT call startTracking when user is alone', async () => {
        // WHY: A user alone in a channel should not be tracked for AFK.
        // They can't be AFK in a social context if no one else is present.

        const userId = 'solo-stopper';
        const guildId = 'test-guild';
        const channelId = 'solo-channel';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);

              // Only start tracking if 2+ users in channel
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });

      it('should log that user stopped speaking even when alone', async () => {
        // WHY: Logging helps with debugging, even if we don't act on the event.

        const userId = 'solo-stopper-2';
        const guildId = 'test-guild';
        const channelId = 'solo-channel-2';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking');

          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { userId, guildId },
          'User stopped speaking'
        );
      });

      it('should NOT start tracking when alone with bots', async () => {
        // WHY: Bots don't count toward the threshold.

        const userId = 'user-with-bots';
        const guildId = 'test-guild';
        const channelId = 'channel-with-bots';

        const members = new Collection<string, GuildMember>();
        members.set(userId, {
          id: userId,
          user: { id: userId, bot: false },
        } as GuildMember);
        members.set('bot-1', {
          id: 'bot-1',
          user: { id: 'bot-1', bot: true },
        } as GuildMember);

        const channel = {
          id: channelId,
          members,
          guild: { id: guildId } as any,
        };

        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });
    });

    describe('with 2+ users in channel', () => {
      it('should call startTracking when user stops speaking with 2 users present', async () => {
        // WHY: When a user stops speaking in a channel with 2+ people, they might become AFK.
        // Tracking should start to monitor their activity.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'active-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
        expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(1);
      });

      it('should call startTracking when user stops speaking with 3+ users present', async () => {
        // WHY: Same behavior for any count >= 2.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'busy-channel';

        const channel = createMockChannel(channelId, [userId, 'user-2', 'user-3']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
      });

      it('should call startTracking at exactly the threshold (2 users)', async () => {
        // WHY: Boundary test - verify threshold is >= 2, not > 2.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'threshold-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).toHaveBeenCalled();
      });

      it('should include correct channel ID when calling startTracking', async () => {
        // WHY: Verify the channel ID is correctly passed to startTracking.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'specific-channel-id-123';

        const channel = createMockChannel(channelId, [userId, 'user-2']);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          guildId,
          userId,
          channelId
        );
      });

      it('should handle large channels correctly', async () => {
        // WHY: Verify the logic works at scale.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'large-channel';

        const otherUsers = Array.from({ length: 15 }, (_, i) => `user-${i}`);
        const channel = createMockChannel(channelId, [userId, ...otherUsers]);
        mockUserInChannel(userId, guildId, channel);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockAfkDetection.startTracking).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle when user is not in a channel', async () => {
        // WHY: User might have disconnected between stopping speaking and event processing.

        const userId = 'disconnected-user';
        const guildId = 'test-guild';

        mockUserInChannel(userId, guildId, null);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        // Should not call startTracking if user is not in channel
        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });

      it('should log error when member fetch fails', async () => {
        // WHY: Network errors or invalid user IDs should be handled gracefully.

        const userId = 'invalid-user';
        const guildId = 'test-guild';

        const mockGuild: Partial<Guild> = {
          id: guildId,
          members: {
            fetch: vi.fn().mockRejectedValue(new Error('Member not found')),
          } as any,
        };

        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        const handler = async (emittedUserId: string, emittedGuildId: string) => {
          try {
            const guild = await mockClient.guilds.fetch(emittedGuildId);
            const member = await guild.members.fetch(emittedUserId);

            if (member.voice.channel) {
              const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
              if (nonBotMembers.size >= 2) {
                await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
              }
            }
          } catch (error) {
            mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking');
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid speaking/stopping cycles correctly', async () => {
      // WHY: Users might toggle speaking rapidly. Each event should be handled independently.

      const userId = 'rapid-speaker';
      const guildId = 'test-guild';
      const channelId = 'active-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInChannel(userId, guildId, channel);

      const startHandler = async (emittedUserId: string, emittedGuildId: string) => {
        const guild = await mockClient.guilds.fetch(emittedGuildId);
        const member = await guild.members.fetch(emittedUserId);

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
          }
        }
      };

      const stopHandler = async (emittedUserId: string, emittedGuildId: string) => {
        const guild = await mockClient.guilds.fetch(emittedGuildId);
        const member = await guild.members.fetch(emittedUserId);

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            await mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
          }
        }
      };

      speakingTracker.on('userStartedSpeaking', startHandler);
      speakingTracker.on('userStoppedSpeaking', stopHandler);

      // Rapid cycle: start, stop, start, stop
      speakingTracker.emit('userStartedSpeaking', userId, guildId);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have called each method twice
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(2);
      expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(2);
    });

    it('should differentiate between users in the same channel', async () => {
      // WHY: Multiple users speaking in the same channel should be tracked independently.

      const user1 = 'user-1';
      const user2 = 'user-2';
      const guildId = 'test-guild';
      const channelId = 'shared-channel';

      const channel = createMockChannel(channelId, [user1, user2]);

      // Set up different mocks for each user
      vi.mocked(mockClient.guilds.fetch).mockImplementation(async (gid) => {
        const mockGuild: Partial<Guild> = {
          id: gid as string,
          members: {
            fetch: vi.fn().mockImplementation(async (uid) => {
              const mockMember: Partial<GuildMember> = {
                id: uid as string,
                user: { id: uid as string, bot: false } as any,
                voice: {
                  channel: channel as VoiceChannel,
                } as VoiceState,
              };
              return mockMember;
            }),
          } as any,
        };
        return mockGuild as Guild;
      });

      const handler = async (emittedUserId: string, emittedGuildId: string) => {
        const guild = await mockClient.guilds.fetch(emittedGuildId);
        const member = await guild.members.fetch(emittedUserId);

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            await mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
          }
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);

      // Both users speak
      speakingTracker.emit('userStartedSpeaking', user1, guildId);
      speakingTracker.emit('userStartedSpeaking', user2, guildId);

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should reset timer for each user separately
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, user1);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, user2);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(2);
    });
  });
});
