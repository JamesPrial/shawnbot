import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceState, VoiceChannel, GuildMember, Collection } from 'discord.js';
import { createVoiceStateUpdateHandler, VoiceStateHandlerDeps } from '../handlers/events/voiceStateUpdate';
import type { VoiceMonitorService } from '../services/VoiceMonitorService';
import type { AFKDetectionService } from '../services/AFKDetectionService';
import type { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import { createMockLogger, createMockGuildSettings } from './fixtures';

/**
 * These tests verify the THRESHOLD COORDINATION behavior for WU-2.
 *
 * KEY CONCEPT: Tracking only starts when there are 2+ users in a voice channel.
 * This prevents false AFK detection when a user is alone in a channel.
 *
 * When user count transitions:
 * - 1 → 2: Start tracking ALL users in channel (threshold crossed)
 * - N → N+1 (where N >= 2): Start tracking only the new user
 * - 2 → 1: Stop tracking ALL users (dropped below threshold)
 * - N → N-1 (where N > 2): Stop tracking only the leaving user
 */
describe('voiceStateUpdate - Threshold Coordination', () => {
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
      logger: mockLogger,
    };

    handler = createVoiceStateUpdateHandler(deps);
  });

  /**
   * Helper to create a mock voice channel with a specific number of non-bot members.
   * This simulates the Discord.js channel.members collection behavior.
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
   * Helper to create mock voice state.
   */
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

  describe('when user joins a channel', () => {
    describe('making count = 2 (threshold crossed)', () => {
      it('should call startTrackingAllInChannel with both user IDs', async () => {
        // WHY: When the second user joins, we cross the threshold from "alone" to "conversation possible".
        // Both users should start being tracked because now they can interact.

        const existingUserId = 'user-existing';
        const joiningUserId = 'user-joining';
        const channelId = 'channel-123';

        // After join: channel has 2 users (the existing one + the new one)
        const channelAfterJoin = createMockChannel(channelId, [existingUserId, joiningUserId]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Should call startTrackingAllInChannel instead of individual startTracking
        expect(mockAfkDetection.startTrackingAllInChannel).toHaveBeenCalledWith(
          'test-guild',
          channelId,
          expect.arrayContaining([existingUserId, joiningUserId])
        );
        expect(mockAfkDetection.startTrackingAllInChannel).toHaveBeenCalledTimes(1);
      });

      it('should not call individual startTracking when threshold is crossed', async () => {
        // WHY: startTrackingAllInChannel should handle all users, so individual startTracking is redundant.

        const existingUserId = 'user-1';
        const joiningUserId = 'user-2';
        const channelId = 'channel-456';

        const channelAfterJoin = createMockChannel(channelId, [existingUserId, joiningUserId]);
        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      });

      it('should handle the case where channel members collection includes the joining user', async () => {
        // WHY: Discord.js updates the channel.members BEFORE firing the event, so the joining user
        // is already in the collection. We need to handle this correctly.

        const existingUserId = 'existing-user';
        const joiningUserId = 'joining-user';
        const channelId = 'channel-789';

        const channelAfterJoin = createMockChannel(channelId, [existingUserId, joiningUserId]);
        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        const callArgs = vi.mocked(mockAfkDetection.startTrackingAllInChannel).mock.calls[0];
        const userIds = callArgs[2] as string[];

        // Both users should be in the array
        expect(userIds).toHaveLength(2);
        expect(userIds).toContain(existingUserId);
        expect(userIds).toContain(joiningUserId);
      });
    });

    describe('making count > 2', () => {
      it('should call startTracking only for the new user', async () => {
        // WHY: When joining a channel that already has 2+ people, only the new user needs tracking started.
        // The existing users are already being tracked.

        const existingUser1 = 'user-1';
        const existingUser2 = 'user-2';
        const joiningUserId = 'user-3';
        const channelId = 'channel-multi';

        const channelAfterJoin = createMockChannel(channelId, [
          existingUser1,
          existingUser2,
          joiningUserId,
        ]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          'test-guild',
          joiningUserId,
          channelId
        );
        expect(mockAfkDetection.startTracking).toHaveBeenCalledTimes(1);
      });

      it('should not call startTrackingAllInChannel when count > 2', async () => {
        // WHY: startTrackingAllInChannel is only for the threshold crossing (1→2).

        const joiningUserId = 'user-4';
        const channelId = 'channel-many';

        const channelAfterJoin = createMockChannel(channelId, [
          'user-1',
          'user-2',
          'user-3',
          joiningUserId,
        ]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
      });

      it('should work correctly with 10 users in channel', async () => {
        // WHY: Edge case test for larger channels to ensure the count logic works at scale.

        const joiningUserId = 'user-10';
        const channelId = 'channel-large';
        const existingUsers = Array.from({ length: 9 }, (_, i) => `user-${i + 1}`);

        const channelAfterJoin = createMockChannel(channelId, [...existingUsers, joiningUserId]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          'test-guild',
          joiningUserId,
          channelId
        );
        expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
      });
    });

    describe('making count = 1 (alone in channel)', () => {
      it('should not call any tracking methods when joining alone', async () => {
        // WHY: A user alone in a channel cannot be AFK in a social sense (no one to interact with).
        // Tracking should not start until a second person joins.

        const joiningUserId = 'solo-user';
        const channelId = 'channel-solo';

        const channelAfterJoin = createMockChannel(channelId, [joiningUserId]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
        expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
      });

      it('should still call voiceMonitor.handleUserJoin for bot connection', async () => {
        // WHY: Even though tracking doesn't start, the bot still needs to join the voice channel
        // to be ready when the second user joins.

        const joiningUserId = 'solo-user';
        const channelId = 'channel-prep';

        const channelAfterJoin = createMockChannel(channelId, [joiningUserId]);

        const oldState = createMockVoiceState(joiningUserId, null);
        const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockVoiceMonitor.handleUserJoin).toHaveBeenCalledWith(channelAfterJoin);
      });
    });
  });

  describe('when user leaves a channel', () => {
    describe('making count = 1 (dropped below threshold)', () => {
      it('should call stopAllTrackingForChannel', async () => {
        // WHY: When the count drops to 1, we're below the threshold. The remaining user is alone,
        // so they can't be AFK in a social context. All tracking for this channel should stop.

        const remainingUserId = 'user-remaining';
        const leavingUserId = 'user-leaving';
        const channelId = 'channel-dropping';

        // Discord.js updates channel.members BEFORE firing the event
        // After leave: 1 user (just the remaining user - leaving user already removed)
        const channelAfterLeave = createMockChannel(channelId, [remainingUserId]);

        const oldState = createMockVoiceState(leavingUserId, channelAfterLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopAllTrackingForChannel).toHaveBeenCalledWith(
          'test-guild',
          channelId
        );
      });

      it('should not call individual stopTracking when dropping to 1', async () => {
        // WHY: stopAllTrackingForChannel handles everyone, so individual stops are redundant.

        const remainingUserId = 'user-1';
        const leavingUserId = 'user-2';
        const channelId = 'channel-threshold';

        // Discord.js updates channel.members BEFORE firing the event
        const channelAfterLeave = createMockChannel(channelId, [remainingUserId]);
        const oldState = createMockVoiceState(leavingUserId, channelAfterLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopTracking).not.toHaveBeenCalled();
      });

      it('should determine count by checking old channel state', async () => {
        // WHY: This test verifies we're correctly determining if we dropped below threshold
        // by examining the channel state AFTER the user left (in oldState.channel).

        const remainingUserId = 'remaining';
        const leavingUserId = 'leaving';
        const channelId = 'channel-check';

        // Discord.js updates channel.members BEFORE firing the event
        const channelAfterLeave = createMockChannel(channelId, [remainingUserId]);
        const oldState = createMockVoiceState(leavingUserId, channelAfterLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Should have detected 1 user remaining (dropped below threshold)
        expect(mockAfkDetection.stopAllTrackingForChannel).toHaveBeenCalled();
      });
    });

    describe('making count >= 2 (still above threshold)', () => {
      it('should call stopTracking only for the leaving user when count remains > 2', async () => {
        // WHY: When leaving a channel with 3+ people, only the leaving user's tracking stops.
        // The remaining users continue to be tracked.

        const user1 = 'user-1';
        const user2 = 'user-2';
        const leavingUserId = 'user-3';
        const channelId = 'channel-active';

        const channelBeforeLeave = createMockChannel(channelId, [user1, user2, leavingUserId]);
        const oldState = createMockVoiceState(leavingUserId, channelBeforeLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopTracking).toHaveBeenCalledWith('test-guild', leavingUserId);
        expect(mockAfkDetection.stopTracking).toHaveBeenCalledTimes(1);
      });

      it('should not call stopAllTrackingForChannel when count stays >= 2', async () => {
        // WHY: stopAllTrackingForChannel is only for dropping below the threshold.

        const leavingUserId = 'user-leaving';
        const channelId = 'channel-busy';

        const channelBeforeLeave = createMockChannel(channelId, [
          'user-1',
          'user-2',
          'user-3',
          leavingUserId,
        ]);

        const oldState = createMockVoiceState(leavingUserId, channelBeforeLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopAllTrackingForChannel).not.toHaveBeenCalled();
      });

      it('should work correctly when leaving a channel with exactly 3 users', async () => {
        // WHY: Edge case at the boundary - leaving brings count from 3 to 2, which is still >= 2.

        const user1 = 'user-1';
        const user2 = 'user-2';
        const leavingUserId = 'user-3';
        const channelId = 'channel-boundary';

        const channelBeforeLeave = createMockChannel(channelId, [user1, user2, leavingUserId]);
        const oldState = createMockVoiceState(leavingUserId, channelBeforeLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Should use individual stopTracking, not stopAll
        expect(mockAfkDetection.stopTracking).toHaveBeenCalledWith('test-guild', leavingUserId);
        expect(mockAfkDetection.stopAllTrackingForChannel).not.toHaveBeenCalled();
      });
    });

    describe('making count = 0 (channel becomes empty)', () => {
      it('should call stopTracking for the last user leaving', async () => {
        // WHY: When the last user leaves, we need to stop tracking them.
        // stopAllTrackingForChannel could also be used here, but stopTracking is sufficient
        // since there's only one user.

        const leavingUserId = 'last-user';
        const channelId = 'channel-empty';

        const channelBeforeLeave = createMockChannel(channelId, [leavingUserId]);
        const oldState = createMockVoiceState(leavingUserId, channelBeforeLeave);
        const newState = createMockVoiceState(leavingUserId, null);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Either stopTracking or stopAllTrackingForChannel is acceptable here
        const stopTrackingCalled = vi.mocked(mockAfkDetection.stopTracking).mock.calls.length > 0;
        const stopAllCalled = vi.mocked(mockAfkDetection.stopAllTrackingForChannel).mock.calls.length > 0;

        expect(stopTrackingCalled || stopAllCalled).toBe(true);
      });
    });
  });

  describe('when user switches channels', () => {
    describe('old channel drops to 1 user', () => {
      it('should call stopAllTrackingForChannel for old channel', async () => {
        // WHY: When user switches and their old channel drops to 1, all tracking in old channel stops.

        const switchingUserId = 'switcher';
        const remainingUserId = 'remaining';
        const oldChannelId = 'channel-old';
        const newChannelId = 'channel-new';

        // Discord.js updates channel.members BEFORE firing the event
        // oldChannel now has only the remaining user (switcher already removed)
        const oldChannel = createMockChannel(oldChannelId, [remainingUserId]);
        const newChannel = createMockChannel(newChannelId, [switchingUserId, 'other-user-1', 'other-user-2']);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopAllTrackingForChannel).toHaveBeenCalledWith(
          'test-guild',
          oldChannelId
        );
      });

      it('should call startTracking for new channel if count > 2', async () => {
        // WHY: Switching to a channel with 3+ people means just start tracking the switcher.

        const switchingUserId = 'switcher';
        const oldChannelId = 'channel-old';
        const newChannelId = 'channel-new';

        const oldChannel = createMockChannel(oldChannelId, [switchingUserId, 'old-user']);
        const newChannel = createMockChannel(newChannelId, [switchingUserId, 'new-1', 'new-2']);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          'test-guild',
          switchingUserId,
          newChannelId
        );
      });
    });

    describe('new channel reaches count = 2', () => {
      it('should call startTrackingAllInChannel for new channel', async () => {
        // WHY: When switching to a channel with 1 person, the arrival makes it 2 (threshold crossed).

        const switchingUserId = 'switcher';
        const existingInNewChannel = 'existing-new';
        const oldChannelId = 'channel-old';
        const newChannelId = 'channel-new';

        const oldChannel = createMockChannel(oldChannelId, ['user-1', 'user-2', switchingUserId]);
        const newChannel = createMockChannel(newChannelId, [existingInNewChannel, switchingUserId]);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.startTrackingAllInChannel).toHaveBeenCalledWith(
          'test-guild',
          newChannelId,
          expect.arrayContaining([existingInNewChannel, switchingUserId])
        );
      });

      it('should call stopTracking for old channel if old count >= 2', async () => {
        // WHY: Old channel still has 2+ people, so only stop tracking the switcher individually.

        const switchingUserId = 'switcher';
        const oldChannelId = 'channel-old';
        const newChannelId = 'channel-new';

        const oldChannel = createMockChannel(oldChannelId, ['old-1', 'old-2', switchingUserId]);
        const newChannel = createMockChannel(newChannelId, ['new-1', switchingUserId]);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        expect(mockAfkDetection.stopTracking).toHaveBeenCalledWith('test-guild', switchingUserId);
      });
    });

    describe('complex switching scenarios', () => {
      it('should handle switching from 2-person to 3-person channel', async () => {
        // WHY: Tests the combination of threshold drop on old channel and individual tracking on new.

        const switchingUserId = 'switcher';
        const oldChannelId = 'channel-2';
        const newChannelId = 'channel-3';

        // Discord.js updates channel.members BEFORE firing the event
        // oldChannel now has only 1 user (switcher already removed)
        const oldChannel = createMockChannel(oldChannelId, ['old-user']);
        const newChannel = createMockChannel(newChannelId, ['new-1', 'new-2', switchingUserId]);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Old channel: drops to 1, so stopAll
        expect(mockAfkDetection.stopAllTrackingForChannel).toHaveBeenCalledWith(
          'test-guild',
          oldChannelId
        );

        // New channel: already has 2+, so just track the switcher
        expect(mockAfkDetection.startTracking).toHaveBeenCalledWith(
          'test-guild',
          switchingUserId,
          newChannelId
        );
      });

      it('should handle switching from 3-person to 2-person channel', async () => {
        // WHY: Old channel stays above threshold, new channel reaches threshold.

        const switchingUserId = 'switcher';
        const oldChannelId = 'channel-3';
        const newChannelId = 'channel-2';

        const oldChannel = createMockChannel(oldChannelId, ['old-1', 'old-2', switchingUserId]);
        const newChannel = createMockChannel(newChannelId, ['new-user', switchingUserId]);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Old channel: still has 2+, so individual stop
        expect(mockAfkDetection.stopTracking).toHaveBeenCalledWith('test-guild', switchingUserId);

        // New channel: crosses threshold to 2, so trackAll
        expect(mockAfkDetection.startTrackingAllInChannel).toHaveBeenCalledWith(
          'test-guild',
          newChannelId,
          expect.arrayContaining(['new-user', switchingUserId])
        );
      });

      it('should handle switching from solo channel to another solo channel', async () => {
        // WHY: Edge case - switching between solo channels should not trigger any active tracking.
        // NOTE: stopAllTrackingForChannel may be called on the old (now empty) channel as a no-op,
        // since oldCount (0) < MIN_USERS_FOR_AFK_TRACKING (2). This is harmless.

        const switchingUserId = 'switcher';
        const oldChannelId = 'solo-1';
        const newChannelId = 'solo-2';

        // Discord.js updates channel.members BEFORE firing the event
        // oldChannel is now empty (switcher already removed)
        // newChannel has only the switcher (already added)
        const oldChannel = createMockChannel(oldChannelId, []);
        const newChannel = createMockChannel(newChannelId, [switchingUserId]);

        const oldState = createMockVoiceState(switchingUserId, oldChannel);
        const newState = createMockVoiceState(switchingUserId, newChannel);

        await handler(oldState as VoiceState, newState as VoiceState);

        // Neither channel meets threshold, so no active tracking should start
        expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
        expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
        // stopTracking should not be called (user was never tracked in solo channel)
        expect(mockAfkDetection.stopTracking).not.toHaveBeenCalled();
        // stopAllTrackingForChannel may be called on the empty old channel (harmless no-op)
        // so we don't assert it's NOT called
      });
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should ignore bot users when counting channel members', async () => {
      // WHY: Bots don't count toward the threshold. A user + bot is still "alone".

      const joiningUserId = 'human-user';
      const botUserId = 'bot-user';
      const channelId = 'channel-with-bot';

      // Manually create a channel with a bot
      const members = new Collection<string, GuildMember>();
      members.set(joiningUserId, {
        id: joiningUserId,
        user: { id: joiningUserId, bot: false },
      } as GuildMember);
      members.set(botUserId, {
        id: botUserId,
        user: { id: botUserId, bot: true },
      } as GuildMember);

      const channel = {
        id: channelId,
        members,
        guild: { id: 'test-guild' } as any,
      };

      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channel as VoiceChannel);

      await handler(oldState as VoiceState, newState as VoiceState);

      // Should not start tracking (only 1 human)
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
    });

    it('should handle when config is disabled', async () => {
      // WHY: When monitoring is disabled, no tracking operations should occur.

      vi.mocked(mockGuildConfig.getConfig).mockReturnValue({
        ...enabledConfig,
        enabled: false,
      });

      const joiningUserId = 'user-1';
      const channelId = 'channel-disabled';

      const channelAfterJoin = createMockChannel(channelId, ['existing-user', joiningUserId]);
      const oldState = createMockVoiceState(joiningUserId, null);
      const newState = createMockVoiceState(joiningUserId, channelAfterJoin);

      await handler(oldState as VoiceState, newState as VoiceState);

      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
    });

    it('should handle bot users joining (should be ignored)', async () => {
      // WHY: Bot voice state changes should be completely ignored.

      const botUserId = 'bot-123';
      const channelId = 'channel-test';

      const channel = createMockChannel(channelId, ['user-1']);
      const oldState: Partial<VoiceState> = {
        channel: null as any,
        member: {
          user: {
            id: botUserId,
            bot: true,  // This is a bot
          },
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };
      const newState: Partial<VoiceState> = {
        channel: channel as VoiceChannel,
        member: {
          user: {
            id: botUserId,
            bot: true,
          },
        } as GuildMember,
        guild: { id: 'test-guild' } as any,
      };

      await handler(oldState as VoiceState, newState as VoiceState);

      // No tracking methods should be called for bots
      expect(mockAfkDetection.startTracking).not.toHaveBeenCalled();
      expect(mockAfkDetection.startTrackingAllInChannel).not.toHaveBeenCalled();
    });

    it('should handle missing userId gracefully', async () => {
      // WHY: Edge case where member data might be missing - should not crash.

      const oldState: Partial<VoiceState> = {
        channel: null as any,
        member: undefined,
        guild: { id: 'test-guild' } as any,
      };
      const newState: Partial<VoiceState> = {
        channel: createMockChannel('channel-123', []) as VoiceChannel,
        member: undefined,
        guild: { id: 'test-guild' } as any,
      };

      await expect(
        handler(oldState as VoiceState, newState as VoiceState)
      ).resolves.not.toThrow();

      // Should have logged and returned early
      expect(mockLogger.debug).toHaveBeenCalledWith('No userId found in voice state update');
    });
  });
});
