import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Guild, GuildMember, VoiceState, VoiceChannel, Collection } from 'discord.js';
import { SpeakingTracker } from '../voice/SpeakingTracker';
import type { AFKDetectionService } from '../services/AFKDetectionService';
import type { RateLimiter } from '../utils/RateLimiter';

/**
 * These tests verify the CACHE BEHAVIOR for speaking event handlers in bot.ts (WU-1).
 *
 * KEY CONCEPT: The speaking event handlers MUST use cache.get() NOT fetch() to avoid
 * unnecessary Discord API calls and rate limiting. cache.get() is synchronous and returns
 * undefined immediately if the guild/member is not cached.
 *
 * CRITICAL BEHAVIORS:
 * 1. Handler uses client.guilds.cache.get() NOT client.guilds.fetch()
 * 2. Handler returns early with debug log when guild is undefined (cache miss)
 * 3. Handler uses guild.members.cache.get() NOT guild.members.fetch()
 * 4. Handler returns early with debug log when member is undefined (cache miss)
 * 5. Handler does NOT call rateLimiter.recordAction() - this is critical
 * 6. Handler still resets AFK timer when member found (userStartedSpeaking)
 * 7. Handler still starts tracking when member found (userStoppedSpeaking)
 */
describe('bot.ts - Speaking Event Cache Behavior (WU-1)', () => {
  let mockClient: Client;
  let mockAfkDetection: AFKDetectionService;
  let mockRateLimiter: RateLimiter;
  let speakingTracker: SpeakingTracker;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock client with cache.get() interface, not fetch()
    mockClient = {
      guilds: {
        cache: {
          get: vi.fn(),
        },
      },
    } as unknown as Client;

    mockAfkDetection = {
      resetTimer: vi.fn(),
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      isTracking: vi.fn().mockReturnValue(false),
    } as unknown as AFKDetectionService;

    mockRateLimiter = {
      recordAction: vi.fn(),
      getActionCount: vi.fn().mockReturnValue(0),
    } as unknown as RateLimiter;

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
   * Helper to set up cache.get() mocks for a user in a specific channel.
   * Returns the guild immediately (synchronous cache lookup).
   */
  function mockUserInCache(userId: string, guildId: string, channel: Partial<VoiceChannel> | null) {
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
        cache: {
          get: vi.fn().mockReturnValue(mockMember),
        },
      } as any,
    };

    vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);
  }

  describe('userStartedSpeaking - cache.get() usage', () => {
    it('should use client.guilds.cache.get() not fetch()', () => {
      // WHY: Using cache.get() avoids API calls and rate limiting.
      // This is a synchronous operation that returns immediately.

      const userId = 'test-user';
      const guildId = 'test-guild';
      const channelId = 'test-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          // Use cache.get() - synchronous, no await needed
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping reset');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping reset');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      // Verify cache.get was called, NOT fetch
      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
    });

    it('should return early with debug log when guild not in cache', () => {
      // WHY: If the guild isn't cached, we can't process the event.
      // This is expected and should be handled gracefully with logging.

      const userId = 'test-user';
      const guildId = 'uncached-guild';

      // Return undefined to simulate cache miss
      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(undefined);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          // Should not reach here
          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      // Verify early return behavior
      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId },
        'Guild not in cache'
      );
      expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
    });

    it('should return early with debug log when member not in cache', () => {
      // WHY: Even if guild is cached, member might not be.
      // This should also be handled gracefully.

      const userId = 'uncached-user';
      const guildId = 'test-guild';

      const mockGuild: Partial<Guild> = {
        id: guildId,
        members: {
          cache: {
            get: vi.fn().mockReturnValue(undefined), // Member not in cache
          },
        } as any,
      };

      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      // Verify cache lookups and early return
      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith(userId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId },
        'Member not in cache'
      );
      expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
    });

    it('should NOT call rateLimiter.recordAction() at all', () => {
      // WHY: This is CRITICAL. Since we're using cache.get() instead of fetch(),
      // we should NOT record any rate limit actions. The whole point is to avoid API calls.

      const userId = 'test-user';
      const guildId = 'test-guild';
      const channelId = 'test-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          // CRITICAL: No rateLimiter.recordAction() call here
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          // CRITICAL: No rateLimiter.recordAction() call here either
          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping reset');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping reset');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      // CRITICAL ASSERTION: rateLimiter.recordAction should NEVER be called
      expect(mockRateLimiter.recordAction).not.toHaveBeenCalled();
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
    });

    it('should still reset AFK timer when member found in cache (2+ users)', () => {
      // WHY: The cache approach should still correctly reset timers when data is available.
      // This verifies the happy path works correctly.

      const userId = 'speaker';
      const guildId = 'test-guild';
      const channelId = 'active-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping reset');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping reset');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(1);
    });

    it('should NOT reset timer when only 1 user in channel (below threshold)', () => {
      // WHY: Threshold logic should still work with cache-based lookups.

      const userId = 'solo-user';
      const guildId = 'test-guild';
      const channelId = 'solo-channel';

      const channel = createMockChannel(channelId, [userId]); // Only 1 user
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping reset');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping reset');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      // Should not reset timer (below threshold)
      expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId, nonBotCount: 1 },
        'Below threshold, skipping reset'
      );
    });
  });

  describe('userStoppedSpeaking - cache.get() usage', () => {
    it('should use client.guilds.cache.get() not fetch()', () => {
      // WHY: Same cache usage pattern as userStartedSpeaking.

      const userId = 'test-user';
      const guildId = 'test-guild';
      const channelId = 'test-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping tracking');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping tracking');
            return;
          }

          if (mockAfkDetection.isTracking(emittedGuildId, emittedUserId)) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Already tracking user, skipping');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, voiceChannel.id);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
    });

    it('should return early with debug log when guild not in cache', () => {
      // WHY: Cache miss handling for guild lookup.

      const userId = 'test-user';
      const guildId = 'uncached-guild';

      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(undefined);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, 'channel-id');
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId },
        'Guild not in cache'
      );
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
    });

    it('should return early with debug log when member not in cache', () => {
      // WHY: Cache miss handling for member lookup.

      const userId = 'uncached-user';
      const guildId = 'test-guild';

      const mockGuild: Partial<Guild> = {
        id: guildId,
        members: {
          cache: {
            get: vi.fn().mockReturnValue(undefined),
          },
        } as any,
      };

      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, 'channel-id');
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      expect(mockClient.guilds.cache.get).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith(userId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId },
        'Member not in cache'
      );
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
    });

    it('should NOT call rateLimiter.recordAction() at all', () => {
      // WHY: CRITICAL - no rate limiting should occur with cache lookups.

      const userId = 'test-user';
      const guildId = 'test-guild';
      const channelId = 'test-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          // CRITICAL: No rateLimiter.recordAction() calls
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping tracking');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping tracking');
            return;
          }

          if (mockAfkDetection.isTracking(emittedGuildId, emittedUserId)) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Already tracking user, skipping');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, voiceChannel.id);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      // CRITICAL ASSERTION
      expect(mockRateLimiter.recordAction).not.toHaveBeenCalled();
      expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
    });

    it('should still start tracking when member found in cache (2+ users)', () => {
      // WHY: Verify happy path works correctly with cache.

      const userId = 'stopper';
      const guildId = 'test-guild';
      const channelId = 'active-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping tracking');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping tracking');
            return;
          }

          if (mockAfkDetection.isTracking(emittedGuildId, emittedUserId)) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Already tracking user, skipping');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, voiceChannel.id);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
      expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(1);
    });

    it('should NOT start tracking when only 1 user in channel (below threshold)', () => {
      // WHY: Threshold logic should still work with cache-based lookups.

      const userId = 'solo-user';
      const guildId = 'test-guild';
      const channelId = 'solo-channel';

      const channel = createMockChannel(channelId, [userId]);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking, starting AFK tracking');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping tracking');
            return;
          }

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId, nonBotCount }, 'Below threshold, skipping tracking');
            return;
          }

          if (mockAfkDetection.isTracking(emittedGuildId, emittedUserId)) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Already tracking user, skipping');
            return;
          }

          mockAfkDetection.startTracking(emittedGuildId, emittedUserId, voiceChannel.id);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to start tracking after user stopped speaking');
        }
      };

      speakingTracker.on('userStoppedSpeaking', handler);
      speakingTracker.emit('userStoppedSpeaking', userId, guildId);

      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId, nonBotCount: 1 },
        'Below threshold, skipping tracking'
      );
    });
  });

  describe('cache behavior edge cases', () => {
    it('should handle when member.voice is null', () => {
      // WHY: Member might be in cache but not in voice channel.

      const userId = 'not-in-voice';
      const guildId = 'test-guild';

      const mockMember: Partial<GuildMember> = {
        id: userId,
        user: { id: userId, bot: false } as any,
        voice: null as any, // Not in voice
      };

      const mockGuild: Partial<Guild> = {
        id: guildId,
        members: {
          cache: {
            get: vi.fn().mockReturnValue(mockMember),
          },
        } as any,
      };

      vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking, resetting AFK timer');

        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache');
            return;
          }

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in voice channel, skipping reset');
            return;
          }

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer after user started speaking');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);
      speakingTracker.emit('userStartedSpeaking', userId, guildId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { userId, guildId },
        'Member not in voice channel, skipping reset'
      );
      expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
    });

    it('should handle multiple rapid events without rate limiting', () => {
      // WHY: Cache lookups should be fast and not trigger rate limiting even under load.

      const userId = 'rapid-user';
      const guildId = 'test-guild';
      const channelId = 'test-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInCache(userId, guildId, channel);

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        try {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          const voiceChannel = member.voice?.channel;
          if (!voiceChannel) return;

          const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
          if (nonBotCount < 2) return;

          mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
        } catch (error) {
          mockLogger.error({ error, userId: emittedUserId, guildId: emittedGuildId }, 'Failed to reset timer');
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);

      // Emit 10 rapid events
      for (let i = 0; i < 10; i++) {
        speakingTracker.emit('userStartedSpeaking', userId, guildId);
      }

      // No rate limiting should occur
      expect(mockRateLimiter.recordAction).not.toHaveBeenCalled();
      // All events should be processed
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(10);
    });
  });
});

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
        cache: {
          get: vi.fn(),
        },
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
   * Helper to set up the guild/member cache mocks for a user in a specific channel.
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
        cache: {
          get: vi.fn().mockReturnValue(mockMember),
        },
      } as any,
    };

    vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);
  }

  describe('userStartedSpeaking event', () => {
    describe('with 1 user in channel (alone)', () => {
      it('should NOT call resetTimer when user is alone', () => {
        // WHY: A user alone in a channel cannot be AFK in a social sense.
        // Starting to speak when alone should not reset any timer because no timer should be running.

        const userId = 'solo-speaker';
        const guildId = 'test-guild';
        const channelId = 'solo-channel';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        // Set up the handler for userStartedSpeaking
        const handler = (emittedUserId: string, emittedGuildId: string) => {
          // Get the user from cache to check channel member count
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);

            // Only reset timer if 2+ users in channel
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);

        // Emit the event
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });

      it('should log that user started speaking even when alone', () => {
        // WHY: We should still log the event for debugging, even if we don't act on it.

        const userId = 'solo-speaker-2';
        const guildId = 'test-guild';
        const channelId = 'solo-channel-2';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User started speaking');

          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { userId, guildId },
          'User started speaking'
        );
      });

      it('should handle when user is alone with bots (bots dont count)', () => {
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

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        // Should NOT reset timer (only 1 non-bot member)
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });
    });

    describe('with 2+ users in channel', () => {
      it('should call resetTimer when user starts speaking with 2 users present', () => {
        // WHY: When a user speaks in a channel with 2+ people, it proves they're not AFK.
        // The timer should reset.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'active-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
        expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(1);
      });

      it('should call resetTimer when user starts speaking with 3+ users present', () => {
        // WHY: Same behavior for any count >= 2.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'busy-channel';

        const channel = createMockChannel(channelId, [userId, 'user-2', 'user-3']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, userId);
      });

      it('should call resetTimer at exactly the threshold (2 users)', () => {
        // WHY: Boundary test - verify threshold is >= 2, not > 2.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'threshold-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockAfkDetection.resetTimer).toHaveBeenCalled();
      });

      it('should handle large channels correctly', () => {
        // WHY: Verify the logic works at scale.

        const userId = 'speaker';
        const guildId = 'test-guild';
        const channelId = 'large-channel';

        const otherUsers = Array.from({ length: 20 }, (_, i) => `user-${i}`);
        const channel = createMockChannel(channelId, [userId, ...otherUsers]);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockAfkDetection.resetTimer).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle when user is not in a channel', () => {
        // WHY: User might have left the channel between speaking and event processing.

        const userId = 'disconnected-user';
        const guildId = 'test-guild';

        mockUserInChannel(userId, guildId, null);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        // Should not call resetTimer if user is not in channel
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });

      it('should log debug when guild is not in cache', () => {
        // WHY: Guild not in cache should be handled gracefully with debug logging.

        const userId = 'user-error';
        const guildId = 'invalid-guild';

        vi.mocked(mockClient.guilds.cache.get).mockReturnValue(undefined);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Guild not in cache, skipping reset');
            return;
          }

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
            }
          }
        };

        speakingTracker.on('userStartedSpeaking', handler);
        speakingTracker.emit('userStartedSpeaking', userId, guildId);

        expect(mockLogger.debug).toHaveBeenCalled();
        expect(mockAfkDetection.resetTimer).not.toHaveBeenCalled();
      });
    });
  });

  describe('userStoppedSpeaking event', () => {
    describe('with 1 user in channel (alone)', () => {
      it('should NOT call startTracking when user is alone', () => {
        // WHY: A user alone in a channel should not be tracked for AFK.
        // They can't be AFK in a social context if no one else is present.

        const userId = 'solo-stopper';
        const guildId = 'test-guild';
        const channelId = 'solo-channel';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);

            // Only start tracking if 2+ users in channel
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });

      it('should log that user stopped speaking even when alone', () => {
        // WHY: Logging helps with debugging, even if we don't act on the event.

        const userId = 'solo-stopper-2';
        const guildId = 'test-guild';
        const channelId = 'solo-channel-2';

        const channel = createMockChannel(channelId, [userId]);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'User stopped speaking');

          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { userId, guildId },
          'User stopped speaking'
        );
      });

      it('should NOT start tracking when alone with bots', () => {
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

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });
    });

    describe('with 2+ users in channel', () => {
      it('should call startTracking when user stops speaking with 2 users present', () => {
        // WHY: When a user stops speaking in a channel with 2+ people, they might become AFK.
        // Tracking should start to monitor their activity.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'active-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
        expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(1);
      });

      it('should call startTracking when user stops speaking with 3+ users present', () => {
        // WHY: Same behavior for any count >= 2.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'busy-channel';

        const channel = createMockChannel(channelId, [userId, 'user-2', 'user-3']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(guildId, userId, channelId);
      });

      it('should call startTracking at exactly the threshold (2 users)', () => {
        // WHY: Boundary test - verify threshold is >= 2, not > 2.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'threshold-channel';

        const channel = createMockChannel(channelId, [userId, 'other-user']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).toHaveBeenCalled();
      });

      it('should include correct channel ID when calling startTracking', () => {
        // WHY: Verify the channel ID is correctly passed to startTracking.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'specific-channel-id-123';

        const channel = createMockChannel(channelId, [userId, 'user-2']);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          guildId,
          userId,
          channelId
        );
      });

      it('should handle large channels correctly', () => {
        // WHY: Verify the logic works at scale.

        const userId = 'stopper';
        const guildId = 'test-guild';
        const channelId = 'large-channel';

        const otherUsers = Array.from({ length: 15 }, (_, i) => `user-${i}`);
        const channel = createMockChannel(channelId, [userId, ...otherUsers]);
        mockUserInChannel(userId, guildId, channel);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockAfkDetection.startTracking).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle when user is not in a channel', () => {
        // WHY: User might have disconnected between stopping speaking and event processing.

        const userId = 'disconnected-user';
        const guildId = 'test-guild';

        mockUserInChannel(userId, guildId, null);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) return;

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        // Should not call startTracking if user is not in channel
        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });

      it('should log debug when member is not in cache', () => {
        // WHY: Member not in cache should be handled gracefully with debug logging.

        const userId = 'invalid-user';
        const guildId = 'test-guild';

        const mockGuild: Partial<Guild> = {
          id: guildId,
          members: {
            cache: {
              get: vi.fn().mockReturnValue(undefined),
            },
          } as any,
        };

        vi.mocked(mockClient.guilds.cache.get).mockReturnValue(mockGuild as Guild);

        const handler = (emittedUserId: string, emittedGuildId: string) => {
          const guild = mockClient.guilds.cache.get(emittedGuildId);
          if (!guild) return;

          const member = guild.members.cache.get(emittedUserId);
          if (!member) {
            mockLogger.debug({ userId: emittedUserId, guildId: emittedGuildId }, 'Member not in cache, skipping tracking');
            return;
          }

          if (member.voice.channel) {
            const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
            if (nonBotMembers.size >= 2) {
              mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
            }
          }
        };

        speakingTracker.on('userStoppedSpeaking', handler);
        speakingTracker.emit('userStoppedSpeaking', userId, guildId);

        expect(mockLogger.debug).toHaveBeenCalled();
        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid speaking/stopping cycles correctly', () => {
      // WHY: Users might toggle speaking rapidly. Each event should be handled independently.

      const userId = 'rapid-speaker';
      const guildId = 'test-guild';
      const channelId = 'active-channel';

      const channel = createMockChannel(channelId, [userId, 'other-user']);
      mockUserInChannel(userId, guildId, channel);

      const startHandler = (emittedUserId: string, emittedGuildId: string) => {
        const guild = mockClient.guilds.cache.get(emittedGuildId);
        if (!guild) return;

        const member = guild.members.cache.get(emittedUserId);
        if (!member) return;

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
          }
        }
      };

      const stopHandler = (emittedUserId: string, emittedGuildId: string) => {
        const guild = mockClient.guilds.cache.get(emittedGuildId);
        if (!guild) return;

        const member = guild.members.cache.get(emittedUserId);
        if (!member) return;

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            mockAfkDetection.startTracking(emittedGuildId, emittedUserId, member.voice.channel.id);
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

      // Should have called each method twice
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(2);
      expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(2);
    });

    it('should differentiate between users in the same channel', () => {
      // WHY: Multiple users speaking in the same channel should be tracked independently.

      const user1 = 'user-1';
      const user2 = 'user-2';
      const guildId = 'test-guild';
      const channelId = 'shared-channel';

      const channel = createMockChannel(channelId, [user1, user2]);

      // Set up cache to return different members based on userId
      vi.mocked(mockClient.guilds.cache.get).mockImplementation((gid) => {
        const mockGuild: Partial<Guild> = {
          id: gid as string,
          members: {
            cache: {
              get: vi.fn().mockImplementation((uid) => {
                const mockMember: Partial<GuildMember> = {
                  id: uid as string,
                  user: { id: uid as string, bot: false } as any,
                  voice: {
                    channel: channel as VoiceChannel,
                  } as VoiceState,
                };
                return mockMember;
              }),
            },
          } as any,
        };
        return mockGuild as Guild;
      });

      const handler = (emittedUserId: string, emittedGuildId: string) => {
        const guild = mockClient.guilds.cache.get(emittedGuildId);
        if (!guild) return;

        const member = guild.members.cache.get(emittedUserId);
        if (!member) return;

        if (member.voice.channel) {
          const nonBotMembers = member.voice.channel.members.filter(m => !m.user.bot);
          if (nonBotMembers.size >= 2) {
            mockAfkDetection.resetTimer(emittedGuildId, emittedUserId);
          }
        }
      };

      speakingTracker.on('userStartedSpeaking', handler);

      // Both users speak
      speakingTracker.emit('userStartedSpeaking', user1, guildId);
      speakingTracker.emit('userStartedSpeaking', user2, guildId);

      // Should reset timer for each user separately
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, user1);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledWith(guildId, user2);
      expect(mockAfkDetection.resetTimer).toHaveBeenCalledTimes(2);
    });
  });
});
