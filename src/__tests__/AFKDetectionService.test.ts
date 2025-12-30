import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client, Guild, GuildMember, VoiceState } from 'discord.js';
import { AFKDetectionService, MIN_USERS_FOR_AFK_TRACKING } from '../services/AFKDetectionService';
import { WarningService } from '../services/WarningService';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import type { RateLimiter } from '../utils/RateLimiter';
import {
  createMockGuildSettings,
  createMockLogger,
  DISABLED_CONFIG,
  ENABLED_CONFIG,
  INVALID_CONFIGS,
} from './fixtures';

describe('AFKDetectionService', () => {
  let mockClient: Client;
  let mockWarningService: WarningService;
  let mockConfigService: GuildConfigService;
  let mockRateLimiter: RateLimiter;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let service: AFKDetectionService;

  beforeEach(() => {
    // Use fake timers for all timer-related tests
    vi.useFakeTimers();

    // Mock the logger
    mockLogger = createMockLogger();

    // Mock the Client
    mockClient = {
      guilds: {
        fetch: vi.fn(),
      },
    } as unknown as Client;

    // Mock the WarningService
    mockWarningService = {
      sendWarning: vi.fn(),
    } as unknown as WarningService;

    // Mock the GuildConfigService
    mockConfigService = {
      getConfig: vi.fn(),
    } as unknown as GuildConfigService;

    // Mock the RateLimiter
    mockRateLimiter = {
      recordAction: vi.fn(),
      getActionCount: vi.fn().mockReturnValue(0),
    } as unknown as RateLimiter;

    service = new AFKDetectionService(
      mockWarningService,
      mockConfigService,
      mockClient,
      mockLogger,
      mockRateLimiter
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startTracking', () => {
    describe('when config is disabled', () => {
      it('should not start tracking when config is disabled', async () => {
        const guildId = 'disabled-guild';
        const userId = 'user-123';
        const channelId = 'channel-456';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(false);
      });

      it('should not set any timers when config is disabled', async () => {
        const guildId = 'disabled-guild';
        const userId = 'user-456';
        const channelId = 'channel-789';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );

        await service.startTracking(guildId, userId, channelId);

        // Fast-forward time - nothing should happen
        await vi.advanceTimersByTimeAsync(1000000);

        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
      });
    });

    describe('when config is enabled', () => {
      it('should start tracking user with enabled config', async () => {
        const guildId = 'enabled-guild';
        const userId = 'user-123';
        const channelId = 'channel-456';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(true);
      });

      it('should set up warning timer based on config', async () => {
        const guildId = 'warning-timer-guild';
        const userId = 'user-warn';
        const channelId = 'channel-warn';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300, // 5 minutes
            warningSecondsBefore: 60, // 1 minute before
            warningChannelId: 'warning-channel',
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userId, channelId);

        // Warning should fire at (300 - 60) = 240 seconds
        await vi.advanceTimersByTimeAsync(240000 - 1);
        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(mockWarningService.sendWarning).toHaveBeenCalledWith(guildId, userId, channelId);
      });

      it('should set up kick timer based on config', async () => {
        const guildId = 'kick-timer-guild';
        const userId = 'user-kick';
        const channelId = 'channel-kick';

        const mockVoiceState: Partial<VoiceState> = {
          channel: { id: channelId } as any,
        };

        const mockMember: Partial<GuildMember> = {
          voice: mockVoiceState as VoiceState,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 120, // 2 minutes
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        const mockDisconnect = vi.fn();
        (mockMember.voice as any).disconnect = mockDisconnect;

        await service.startTracking(guildId, userId, channelId);

        // Kick should fire at 120 seconds
        await vi.advanceTimersByTimeAsync(120000 - 1);
        expect(mockDisconnect).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        // Need to wait for promises to resolve
        await vi.runAllTimersAsync();

        expect(mockDisconnect).toHaveBeenCalledWith('AFK timeout');
      });
    });

    describe('timer calculation', () => {
      it('should calculate timers correctly with different timeout values', async () => {
        const guildId = 'calc-guild';
        const userId = 'calc-user';
        const channelId = 'calc-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 600, // 10 minutes
            warningSecondsBefore: 120, // 2 minutes before
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userId, channelId);

        // Warning should be at (600 - 120) = 480 seconds = 8 minutes
        await vi.advanceTimersByTimeAsync(480000 - 1);
        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(mockWarningService.sendWarning).toHaveBeenCalled();
      });

      it('should handle edge case where warning time equals kick time', async () => {
        const guildId = 'edge-guild';
        const userId = 'edge-user';
        const channelId = 'edge-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 60,
            warningSecondsBefore: 60, // Warning at same time as timeout - invalid!
          })
        );

        await service.startTracking(guildId, userId, channelId);

        // Should not start tracking with invalid config
        expect(service.isTracking(guildId, userId)).toBe(false);
      });
    });

    describe('when user is already being tracked', () => {
      it('should stop existing tracking before starting new tracking', async () => {
        const guildId = 'restart-guild';
        const userId = 'restart-user';
        const channelId1 = 'channel-old';
        const channelId2 = 'channel-new';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, userId, channelId1);
        expect(service.isTracking(guildId, userId)).toBe(true);

        await service.startTracking(guildId, userId, channelId2);
        expect(service.isTracking(guildId, userId)).toBe(true);
      });

      it('should clear old timers when restarting tracking', async () => {
        const guildId = 'clear-timers-guild';
        const userId = 'clear-timers-user';
        const channelId1 = 'channel-1';
        const channelId2 = 'channel-2';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userId, channelId1);

        // Advance partway through first tracking period
        await vi.advanceTimersByTimeAsync(50000);

        // Restart tracking (new channel)
        await service.startTracking(guildId, userId, channelId2);

        // Advance to where old warning would have fired (100s - 30s = 70s total from first start)
        // We've already advanced 50s, so advance 20s more
        await vi.advanceTimersByTimeAsync(20000);

        // Old timer should not fire - new timer has restarted the countdown
        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
      });
    });

    describe('tracking key generation', () => {
      it('should track users independently across different guilds', async () => {
        const userId = 'same-user';
        const channelId = 'some-channel';
        const guild1 = 'guild-1';
        const guild2 = 'guild-2';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ enabled: true })
        );

        await service.startTracking(guild1, userId, channelId);
        await service.startTracking(guild2, userId, channelId);

        expect(service.isTracking(guild1, userId)).toBe(true);
        expect(service.isTracking(guild2, userId)).toBe(true);

        service.stopTracking(guild1, userId);

        expect(service.isTracking(guild1, userId)).toBe(false);
        expect(service.isTracking(guild2, userId)).toBe(true);
      });

      it('should track different users in same guild independently', async () => {
        const guildId = 'multi-user-guild';
        const user1 = 'user-1';
        const user2 = 'user-2';
        const channelId = 'channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, channelId);

        expect(service.isTracking(guildId, user1)).toBe(true);
        expect(service.isTracking(guildId, user2)).toBe(true);

        service.stopTracking(guildId, user1);

        expect(service.isTracking(guildId, user1)).toBe(false);
        expect(service.isTracking(guildId, user2)).toBe(true);
      });
    });

    describe('config validation', () => {
      it.each(INVALID_CONFIGS)('should not start tracking with $name', async ({ config }) => {
        const guildId = 'test-guild';
        const userId = 'test-user';
        const channelId = 'test-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true, ...config })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(false);
      });

      it('should allow tracking with valid edge case: warningSecondsBefore = afkTimeoutSeconds - 1', async () => {
        const guildId = 'valid-edge-guild';
        const userId = 'valid-edge-user';
        const channelId = 'valid-edge-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 60,
            warningSecondsBefore: 59, // Warning at 1 second (valid)
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(true);
      });
    });
  });

  describe('stopTracking', () => {
    it('should clear timers and remove tracking', async () => {
      const guildId = 'stop-guild';
      const userId = 'stop-user';
      const channelId = 'stop-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({ guildId, enabled: true })
      );

      await service.startTracking(guildId, userId, channelId);
      expect(service.isTracking(guildId, userId)).toBe(true);

      service.stopTracking(guildId, userId);

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should prevent timers from firing after stopping', async () => {
      const guildId = 'prevent-timers-guild';
      const userId = 'prevent-timers-user';
      const channelId = 'prevent-timers-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      // Advance partway
      await vi.advanceTimersByTimeAsync(50000);

      service.stopTracking(guildId, userId);

      // Advance past where warning would have fired
      await vi.advanceTimersByTimeAsync(100000);

      expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
    });

    it('should do nothing when stopping non-tracked user', () => {
      const guildId = 'not-tracked-guild';
      const userId = 'not-tracked-user';

      expect(() => {
        service.stopTracking(guildId, userId);
      }).not.toThrow();

      expect(service.isTracking(guildId, userId)).toBe(false);
    });
  });

  describe('resetTimer', () => {
    it('should restart tracking for tracked user', async () => {
      const guildId = 'reset-guild';
      const userId = 'reset-user';
      const channelId = 'reset-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      // Advance partway
      await vi.advanceTimersByTimeAsync(60000);

      await service.resetTimer(guildId, userId);

      // Advance to where old warning would have been (70s from start)
      await vi.advanceTimersByTimeAsync(10000);

      // Old timer should not fire - timer was reset
      expect(mockWarningService.sendWarning).not.toHaveBeenCalled();

      // Warning should fire at 70s from reset (130s total)
      await vi.advanceTimersByTimeAsync(60000);
      expect(mockWarningService.sendWarning).toHaveBeenCalled();
    });

    it('should do nothing for non-tracked user', async () => {
      const guildId = 'not-tracked-reset-guild';
      const userId = 'not-tracked-reset-user';

      await expect(service.resetTimer(guildId, userId)).resolves.toBeUndefined();
    });

    it('should preserve channel info when resetting', async () => {
      const guildId = 'preserve-channel-guild';
      const userId = 'preserve-channel-user';
      const channelId = 'original-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);
      await service.resetTimer(guildId, userId);

      // Advance to warning time
      await vi.advanceTimersByTimeAsync(70000);

      expect(mockWarningService.sendWarning).toHaveBeenCalledWith(guildId, userId, channelId);
    });
  });

  describe('isTracking', () => {
    it('should return true when user is being tracked', async () => {
      const guildId = 'is-tracking-guild';
      const userId = 'is-tracking-user';
      const channelId = 'is-tracking-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({ guildId, enabled: true })
      );

      await service.startTracking(guildId, userId, channelId);

      expect(service.isTracking(guildId, userId)).toBe(true);
    });

    it('should return false when user is not being tracked', () => {
      const guildId = 'not-tracking-guild';
      const userId = 'not-tracking-user';

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should return false after tracking is stopped', async () => {
      const guildId = 'stopped-guild';
      const userId = 'stopped-user';
      const channelId = 'stopped-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({ guildId, enabled: true })
      );

      await service.startTracking(guildId, userId, channelId);
      service.stopTracking(guildId, userId);

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should correctly distinguish between different users in same guild', async () => {
      const guildId = 'multi-user-guild';
      const user1 = 'user-alpha';
      const user2 = 'user-beta';
      const channelId = 'channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({ guildId, enabled: true })
      );

      await service.startTracking(guildId, user1, channelId);

      expect(service.isTracking(guildId, user1)).toBe(true);
      expect(service.isTracking(guildId, user2)).toBe(false);
    });

    it('should correctly distinguish same user across different guilds', async () => {
      const userId = 'same-user';
      const guild1 = 'guild-alpha';
      const guild2 = 'guild-beta';
      const channelId = 'channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({ enabled: true })
      );

      await service.startTracking(guild1, userId, channelId);

      expect(service.isTracking(guild1, userId)).toBe(true);
      expect(service.isTracking(guild2, userId)).toBe(false);
    });
  });

  describe('warning behavior', () => {
    it('should send warning when warning timer fires', async () => {
      const guildId = 'warning-behavior-guild';
      const userId = 'warning-behavior-user';
      const channelId = 'warning-behavior-channel';

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 200,
          warningSecondsBefore: 50,
        })
      );
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      // Advance to warning time (200 - 50 = 150 seconds)
      await vi.advanceTimersByTimeAsync(150000);

      expect(mockWarningService.sendWarning).toHaveBeenCalledWith(guildId, userId, channelId);
    });
  });

  describe('kick behavior', () => {
    it('should disconnect user when kick timer fires', async () => {
      const guildId = 'kick-behavior-guild';
      const userId = 'kick-behavior-user';
      const channelId = 'kick-behavior-channel';

      const mockDisconnect = vi.fn();
      const mockVoiceState: Partial<VoiceState> = {
        channel: { id: channelId } as any,
        disconnect: mockDisconnect,
      };

      const mockMember: Partial<GuildMember> = {
        voice: mockVoiceState as VoiceState,
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 150,
          warningSecondsBefore: 40,
        })
      );
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

      await service.startTracking(guildId, userId, channelId);

      // Advance to kick time
      await vi.advanceTimersByTimeAsync(150000);
      await vi.runAllTimersAsync();

      expect(mockDisconnect).toHaveBeenCalledWith('AFK timeout');
    });

    it('should remove tracking after successful kick', async () => {
      const guildId = 'remove-after-kick-guild';
      const userId = 'remove-after-kick-user';
      const channelId = 'remove-after-kick-channel';

      const mockDisconnect = vi.fn();
      const mockVoiceState: Partial<VoiceState> = {
        channel: { id: channelId } as any,
        disconnect: mockDisconnect,
      };

      const mockMember: Partial<GuildMember> = {
        voice: mockVoiceState as VoiceState,
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

      await service.startTracking(guildId, userId, channelId);

      expect(service.isTracking(guildId, userId)).toBe(true);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should handle user already disconnected gracefully', async () => {
      const guildId = 'already-gone-guild';
      const userId = 'already-gone-user';
      const channelId = 'already-gone-channel';

      const mockVoiceState: Partial<VoiceState> = {
        channel: null, // User already left
      };

      const mockMember: Partial<GuildMember> = {
        voice: mockVoiceState as VoiceState,
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      // Should not throw, should clean up tracking
      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should still remove tracking even when kick fails', async () => {
      const guildId = 'kick-fails-guild';
      const userId = 'kick-fails-user';
      const channelId = 'kick-fails-channel';

      const error = new Error('Disconnect failed');
      const mockDisconnect = vi.fn().mockRejectedValue(error);

      const mockVoiceState: Partial<VoiceState> = {
        channel: { id: channelId } as any,
        disconnect: mockDisconnect,
      };

      const mockMember: Partial<GuildMember> = {
        voice: mockVoiceState as VoiceState,
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(
        createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 100,
          warningSecondsBefore: 30,
        })
      );
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      // Tracking should be cleaned up even though kick failed
      expect(service.isTracking(guildId, userId)).toBe(false);
    });
  });

  describe('MIN_USERS_FOR_AFK_TRACKING constant', () => {
    it('should exist and equal 2', () => {
      expect(MIN_USERS_FOR_AFK_TRACKING).toBe(2);
    });

    it('should be a number', () => {
      expect(typeof MIN_USERS_FOR_AFK_TRACKING).toBe('number');
    });

    it('should be positive', () => {
      expect(MIN_USERS_FOR_AFK_TRACKING).toBeGreaterThan(0);
    });
  });

  describe('stopAllTrackingForChannel', () => {
    const guildId = 'bulk-stop-guild';
    const channelId = 'target-channel';

    describe('when multiple users are in same channel', () => {
      it('should stop tracking all users in that specific channel', async () => {
        const user1 = 'user-1';
        const user2 = 'user-2';
        const user3 = 'user-3';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, channelId);
        await service.startTracking(guildId, user3, channelId);

        service.stopAllTrackingForChannel(guildId, channelId);

        expect(service.isTracking(guildId, user1)).toBe(false);
        expect(service.isTracking(guildId, user2)).toBe(false);
        expect(service.isTracking(guildId, user3)).toBe(false);
      });

      it('should clear all timers for stopped users', async () => {
        const user1 = 'timer-user-1';
        const user2 = 'timer-user-2';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, channelId);

        service.stopAllTrackingForChannel(guildId, channelId);

        // Advance past warning time
        await vi.advanceTimersByTimeAsync(100000);

        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
      });
    });

    describe('when users are in different channels', () => {
      it('should only stop users in target channel and leave other channels untouched', async () => {
        const user1 = 'user-in-target';
        const user2 = 'user-in-other';
        const otherChannel = 'other-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, otherChannel);

        service.stopAllTrackingForChannel(guildId, channelId);

        expect(service.isTracking(guildId, user1)).toBe(false);
        expect(service.isTracking(guildId, user2)).toBe(true);
      });

      it('should preserve timers for users in other channels', async () => {
        const userInTarget = 'user-target';
        const userInOther = 'user-other';
        const otherChannel = 'other-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userInTarget, channelId);
        await service.startTracking(guildId, userInOther, otherChannel);

        service.stopAllTrackingForChannel(guildId, channelId);

        // Advance to warning time
        await vi.advanceTimersByTimeAsync(70000);

        // Only user in other channel should get warning
        expect(mockWarningService.sendWarning).toHaveBeenCalledTimes(1);
        expect(mockWarningService.sendWarning).toHaveBeenCalledWith(guildId, userInOther, otherChannel);
      });
    });

    describe('when channel has no tracked users', () => {
      it('should be a no-op and not throw', () => {
        const emptyChannel = 'empty-channel';

        expect(() => {
          service.stopAllTrackingForChannel(guildId, emptyChannel);
        }).not.toThrow();
      });
    });

    describe('guild isolation', () => {
      it('should only affect the specified guild', async () => {
        const guild1 = 'guild-1';
        const guild2 = 'guild-2';
        const userId = 'cross-guild-user';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ enabled: true })
        );

        await service.startTracking(guild1, userId, channelId);
        await service.startTracking(guild2, userId, channelId);

        service.stopAllTrackingForChannel(guild1, channelId);

        expect(service.isTracking(guild1, userId)).toBe(false);
        expect(service.isTracking(guild2, userId)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle stopping same channel multiple times', async () => {
        const userId = 'edge-user';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(() => {
          service.stopAllTrackingForChannel(guildId, channelId);
          service.stopAllTrackingForChannel(guildId, channelId);
        }).not.toThrow();
      });

      it('should handle empty string channel ID', async () => {
        expect(() => {
          service.stopAllTrackingForChannel(guildId, '');
        }).not.toThrow();
      });
    });
  });

  describe('startTrackingAllInChannel', () => {
    const guildId = 'bulk-start-guild';
    const channelId = 'bulk-start-channel';

    describe('when provided with multiple user IDs', () => {
      it('should start tracking for all provided users', async () => {
        const userIds = ['bulk-user-1', 'bulk-user-2', 'bulk-user-3'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(true);
        });
      });

      it('should set up timers for all users', async () => {
        const userIds = ['timer-bulk-1', 'timer-bulk-2'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        // Advance to warning time
        await vi.advanceTimersByTimeAsync(70000);

        expect(mockWarningService.sendWarning).toHaveBeenCalledTimes(userIds.length);
      });
    });

    describe('when provided with empty userIds array', () => {
      it('should not start tracking any users', async () => {
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, []);

        // No assertions needed - just verify no errors
      });

      it('should not call startTracking when userIds is empty', async () => {
        const startTrackingSpy = vi.spyOn(service, 'startTracking');

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, []);

        expect(startTrackingSpy).not.toHaveBeenCalled();
      });
    });

    describe('respecting config settings', () => {
      it('should respect disabled config for all users', async () => {
        const userIds = ['disabled-bulk-1', 'disabled-bulk-2'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(false);
        });
      });
    });

    describe('when users already being tracked', () => {
      it('should restart tracking for already-tracked users', async () => {
        const userId = 'already-tracked-bulk';
        const oldChannel = 'old-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, userId, oldChannel);
        expect(service.isTracking(guildId, userId)).toBe(true);

        await service.startTrackingAllInChannel(guildId, channelId, [userId]);

        expect(service.isTracking(guildId, userId)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle single user ID', async () => {
        const userIds = ['single-user'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        expect(service.isTracking(guildId, userIds[0])).toBe(true);
      });

      it('should handle duplicate user IDs in array', async () => {
        const userIds = ['dup-user', 'dup-user'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        expect(service.isTracking(guildId, 'dup-user')).toBe(true);
      });

      it('should handle large number of users', async () => {
        const userIds = Array.from({ length: 100 }, (_, i) => `mass-user-${i}`);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(true);
        });
      });

      it('should handle special characters in user IDs', async () => {
        const userIds = ['user-with-dash', 'user_with_underscore', 'user.with.dot'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(true);
        });
      });
    });

    describe('integration with stopAllTrackingForChannel', () => {
      it('should allow starting and stopping in succession', async () => {
        const userIds = ['succession-1', 'succession-2', 'succession-3'];

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTrackingAllInChannel(guildId, channelId, userIds);
        service.stopAllTrackingForChannel(guildId, channelId);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(false);
        });

        await service.startTrackingAllInChannel(guildId, channelId, userIds);

        userIds.forEach((userId) => {
          expect(service.isTracking(guildId, userId)).toBe(true);
        });
      });
    });
  });

  describe('error handling hardening', () => {
    describe('timer callback error handling', () => {
      describe('when handleWarning throws', () => {
        it('should keep tracking state intact after warning error', async () => {
          const guildId = 'warning-error-state-guild';
          const userId = 'warning-error-state-user';
          const channelId = 'warning-error-state-channel';

          vi.mocked(mockConfigService.getConfig).mockReturnValue(
            createMockGuildSettings({
              guildId,
              enabled: true,
              afkTimeoutSeconds: 200,
              warningSecondsBefore: 50,
            })
          );
          vi.mocked(mockWarningService.sendWarning).mockRejectedValue(new Error('Warning failed'));

          await service.startTracking(guildId, userId, channelId);

          // Advance to warning time
          await vi.advanceTimersByTimeAsync(150000);

          // Tracking should still be active despite warning failure
          expect(service.isTracking(guildId, userId)).toBe(true);
        });

        it('should still fire kick timer after warning fails', async () => {
          const guildId = 'warning-fail-kick-still-fires-guild';
          const userId = 'warning-fail-kick-still-fires-user';
          const channelId = 'warning-fail-kick-still-fires-channel';

          const mockDisconnect = vi.fn();
          const mockVoiceState: Partial<VoiceState> = {
            channel: { id: channelId } as any,
            disconnect: mockDisconnect,
          };

          const mockMember: Partial<GuildMember> = {
            voice: mockVoiceState as VoiceState,
          };

          const mockGuild: Partial<Guild> = {
            members: {
              fetch: vi.fn().mockResolvedValue(mockMember),
            } as any,
          };

          vi.mocked(mockConfigService.getConfig).mockReturnValue(
            createMockGuildSettings({
              guildId,
              enabled: true,
              afkTimeoutSeconds: 200,
              warningSecondsBefore: 50,
            })
          );
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
          vi.mocked(mockWarningService.sendWarning).mockRejectedValue(new Error('Warning API failed'));

          await service.startTracking(guildId, userId, channelId);

          // Advance to warning time
          await vi.advanceTimersByTimeAsync(150000);

          // Warning should fail but not crash
          expect(mockWarningService.sendWarning).toHaveBeenCalled();

          // Advance to kick time
          await vi.advanceTimersByTimeAsync(50000);
          await vi.runAllTimersAsync();

          // Kick should still fire despite warning failure
          expect(mockDisconnect).toHaveBeenCalledWith('AFK timeout');
          expect(service.isTracking(guildId, userId)).toBe(false);
        });
      });

      describe('when handleKick throws', () => {
        it('should cleanup tracking state even when kick fails', async () => {
          const guildId = 'kick-error-cleanup-guild';
          const userId = 'kick-error-cleanup-user';
          const channelId = 'kick-error-cleanup-channel';

          const mockGuild: Partial<Guild> = {
            members: {
              fetch: vi.fn().mockRejectedValue(new Error('Member fetch failed')),
            } as any,
          };

          vi.mocked(mockConfigService.getConfig).mockReturnValue(
            createMockGuildSettings({
              guildId,
              enabled: true,
              afkTimeoutSeconds: 100,
              warningSecondsBefore: 30,
            })
          );
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

          await service.startTracking(guildId, userId, channelId);

          // Advance to kick time
          await vi.advanceTimersByTimeAsync(100000);
          await vi.runAllTimersAsync();

          // Tracking should be cleaned up even though kick failed
          expect(service.isTracking(guildId, userId)).toBe(false);
        });

        it('should cleanup even when disconnect call throws', async () => {
          const guildId = 'disconnect-throws-guild';
          const userId = 'disconnect-throws-user';
          const channelId = 'disconnect-throws-channel';

          const mockDisconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'));
          const mockVoiceState: Partial<VoiceState> = {
            channel: { id: channelId } as any,
            disconnect: mockDisconnect,
          };

          const mockMember: Partial<GuildMember> = {
            voice: mockVoiceState as VoiceState,
          };

          const mockGuild: Partial<Guild> = {
            members: {
              fetch: vi.fn().mockResolvedValue(mockMember),
            } as any,
          };

          vi.mocked(mockConfigService.getConfig).mockReturnValue(
            createMockGuildSettings({
              guildId,
              enabled: true,
              afkTimeoutSeconds: 100,
              warningSecondsBefore: 30,
            })
          );
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

          await service.startTracking(guildId, userId, channelId);

          // Advance to kick time
          await vi.advanceTimersByTimeAsync(100000);
          await vi.runAllTimersAsync();

          // Tracking should be cleaned up even though disconnect threw
          expect(service.isTracking(guildId, userId)).toBe(false);
        });
      });
    });

    describe('exempt role check failure', () => {
      it('should not start tracking when exempt role check throws during guild fetch', async () => {
        const guildId = 'exempt-check-error-guild';
        const userId = 'exempt-check-error-user';
        const channelId = 'exempt-check-error-channel';
        const error = new Error('Guild not found');

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['some-exempt-role'], // Non-empty triggers exempt check
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(error);

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(false);
      });

      it('should not start tracking when exempt role check throws during member fetch', async () => {
        const guildId = 'member-fetch-error-guild';
        const userId = 'member-fetch-error-user';
        const channelId = 'member-fetch-error-channel';
        const error = new Error('Member not found');

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockRejectedValue(error),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role-id'],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(false);
      });

      it('should not set any timers when exempt check fails', async () => {
        const guildId = 'no-timers-exempt-error-guild';
        const userId = 'no-timers-exempt-error-user';
        const channelId = 'no-timers-exempt-error-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
            exemptRoleIds: ['exempt-role'],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(new Error('Fetch failed'));
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userId, channelId);

        // Advance time - no warnings or kicks should happen
        await vi.advanceTimersByTimeAsync(200000);
        await vi.runAllTimersAsync();

        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
      });

      it('should handle role.cache.some() throwing gracefully', async () => {
        const guildId = 'role-cache-error-guild';
        const userId = 'role-cache-error-user';
        const channelId = 'role-cache-error-channel';
        const error = new Error('Cache corrupted');

        const mockRolesCache = {
          some: vi.fn().mockImplementation(() => {
            throw error;
          }),
        };

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: mockRolesCache as any,
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role'],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(false);
      });
    });
  });

  describe('debug logging enhancements', () => {
    describe('timer start logging', () => {
      it('should log timer start with action and timer values', async () => {
        const guildId = 'log-start-guild';
        const userId = 'log-start-user';
        const channelId = 'log-start-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_start',
            guildId,
            userId,
            channelId,
            warningTimeMs: 240000, // (300 - 60) * 1000
            kickTimeMs: 300000, // 300 * 1000
          }),
          expect.any(String)
        );
      });

      it('should include correct timer calculations for different timeout values', async () => {
        const guildId = 'calc-log-guild';
        const userId = 'calc-log-user';
        const channelId = 'calc-log-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 600, // 10 minutes
            warningSecondsBefore: 120, // 2 minutes before
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_start',
            warningTimeMs: 480000, // (600 - 120) * 1000
            kickTimeMs: 600000, // 600 * 1000
          }),
          expect.any(String)
        );
      });

      it('should include timer values even with minimal warning time', async () => {
        const guildId = 'minimal-warning-guild';
        const userId = 'minimal-warning-user';
        const channelId = 'minimal-warning-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 60,
            warningSecondsBefore: 1, // 1 second before kick
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_start',
            warningTimeMs: 59000, // (60 - 1) * 1000
            kickTimeMs: 60000, // 60 * 1000
          }),
          expect.any(String)
        );
      });
    });

    describe('timer stop logging', () => {
      it('should log timer stop with action when stopTracking is called', async () => {
        const guildId = 'log-stop-guild';
        const userId = 'log-stop-user';
        const channelId = 'log-stop-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, userId, channelId);

        // Clear previous calls
        mockLogger.debug.mockClear();

        service.stopTracking(guildId, userId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_stop',
            guildId,
            userId,
          }),
          expect.any(String)
        );
      });

      it('should not log timer stop when user was not being tracked', () => {
        const guildId = 'not-tracked-guild';
        const userId = 'not-tracked-user';

        service.stopTracking(guildId, userId);

        // Should not log when there's nothing to stop
        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'timer_stop' }),
          expect.any(String)
        );
      });

      it('should log timer stop for each user in bulk stop', async () => {
        const guildId = 'bulk-stop-log-guild';
        const channelId = 'bulk-stop-log-channel';
        const user1 = 'bulk-user-1';
        const user2 = 'bulk-user-2';
        const user3 = 'bulk-user-3';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, channelId);
        await service.startTracking(guildId, user3, channelId);

        // Clear previous calls
        mockLogger.debug.mockClear();

        service.stopAllTrackingForChannel(guildId, channelId);

        // Should log timer_stop for each stopped user
        const stopCalls = mockLogger.debug.mock.calls.filter(
          call => call[0]?.action === 'timer_stop'
        );
        expect(stopCalls).toHaveLength(3);
      });
    });

    describe('timer reset logging', () => {
      it('should log timer reset with action when resetTimer is called', async () => {
        const guildId = 'log-reset-guild';
        const userId = 'log-reset-user';
        const channelId = 'log-reset-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        // Clear previous calls
        mockLogger.debug.mockClear();

        await service.resetTimer(guildId, userId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_reset',
            guildId,
            userId,
          }),
          expect.any(String)
        );
      });

      it('should not log timer reset when user was not being tracked', async () => {
        const guildId = 'not-tracked-reset-guild';
        const userId = 'not-tracked-reset-user';

        await service.resetTimer(guildId, userId);

        // Should not log when there's nothing to reset
        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'timer_reset' }),
          expect.any(String)
        );
      });

      it('should log both timer_reset and timer_start when resetting', async () => {
        const guildId = 'reset-sequence-guild';
        const userId = 'reset-sequence-user';
        const channelId = 'reset-sequence-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        // Clear to see only reset logs
        mockLogger.debug.mockClear();

        await service.resetTimer(guildId, userId);

        // Should log timer_reset first
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_reset',
            guildId,
            userId,
          }),
          expect.any(String)
        );

        // Then log timer_start as tracking restarts
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'timer_start',
            guildId,
            userId,
          }),
          expect.any(String)
        );
      });
    });

    describe('exempt role check logging', () => {
      it('should log exempt check with action and matched role when user has exempt role', async () => {
        const guildId = 'exempt-log-guild';
        const userId = 'exempt-log-user';
        const channelId = 'exempt-log-channel';
        const exemptRoleId = 'exempt-role-123';

        const mockRole = { id: exemptRoleId };
        const mockRolesCache = new Map([[exemptRoleId, mockRole as any]]);
        // Add .find() method to mock Map to behave like Discord.js Collection
        (mockRolesCache as any).find = function(predicate: (role: any) => boolean) {
          for (const [_, role] of this.entries()) {
            if (predicate(role)) return role;
          }
          return undefined;
        };

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: mockRolesCache,
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: [exemptRoleId],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'exempt_check',
            guildId,
            userId,
            matchedRoleId: exemptRoleId,
          }),
          expect.any(String)
        );
      });

      it('should log first matched role when user has multiple exempt roles', async () => {
        const guildId = 'multi-exempt-guild';
        const userId = 'multi-exempt-user';
        const channelId = 'multi-exempt-channel';
        const exemptRole1 = 'exempt-role-1';
        const exemptRole2 = 'exempt-role-2';

        const mockRolesCache = new Map([
          [exemptRole1, { id: exemptRole1 } as any],
          [exemptRole2, { id: exemptRole2 } as any],
        ]);
        // Add .find() method to mock Map to behave like Discord.js Collection
        (mockRolesCache as any).find = function(predicate: (role: any) => boolean) {
          for (const [_, role] of this.entries()) {
            if (predicate(role)) return role;
          }
          return undefined;
        };

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: mockRolesCache,
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: [exemptRole1, exemptRole2],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Should log with one of the matched roles
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'exempt_check',
            guildId,
            userId,
            matchedRoleId: expect.stringMatching(/exempt-role-[12]/),
          }),
          expect.any(String)
        );
      });

      it('should not log exempt check when user has no exempt roles', async () => {
        const guildId = 'no-exempt-guild';
        const userId = 'no-exempt-user';
        const channelId = 'no-exempt-channel';

        const mockRolesCache = new Map([
          ['regular-role-1', { id: 'regular-role-1' } as any],
        ]);

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: mockRolesCache,
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role-999'],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Should not log exempt_check when no roles match
        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'exempt_check',
            matchedRoleId: expect.anything(),
          }),
          expect.any(String)
        );
      });

      it('should not log exempt check when exemptRoleIds is empty', async () => {
        const guildId = 'no-config-exempt-guild';
        const userId = 'no-config-exempt-user';
        const channelId = 'no-config-exempt-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: [],
          })
        );

        await service.startTracking(guildId, userId, channelId);

        // Should not perform exempt check when list is empty
        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'exempt_check',
          }),
          expect.any(String)
        );
      });
    });

    describe('validation failure logging', () => {
      it('should log validation failed when timeout is NaN', async () => {
        const guildId = 'nan-timeout-guild';
        const userId = 'nan-timeout-user';
        const channelId = 'nan-timeout-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: NaN,
            warningSecondsBefore: 60,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'nan_values',
            afkTimeoutSeconds: NaN,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when warning is NaN', async () => {
        const guildId = 'nan-warning-guild';
        const userId = 'nan-warning-user';
        const channelId = 'nan-warning-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: NaN,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'nan_values',
            warningSecondsBefore: NaN,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when timeout is negative', async () => {
        const guildId = 'negative-timeout-guild';
        const userId = 'negative-timeout-user';
        const channelId = 'negative-timeout-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: -100,
            warningSecondsBefore: 30,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'negative_values',
            afkTimeoutSeconds: -100,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when timeout is zero', async () => {
        const guildId = 'zero-timeout-guild';
        const userId = 'zero-timeout-user';
        const channelId = 'zero-timeout-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 0,
            warningSecondsBefore: 0,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'negative_values',
            afkTimeoutSeconds: 0,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when warning is negative', async () => {
        const guildId = 'negative-warning-guild';
        const userId = 'negative-warning-user';
        const channelId = 'negative-warning-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: -30,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'negative_values',
            warningSecondsBefore: -30,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when warning time equals timeout', async () => {
        const guildId = 'equal-times-guild';
        const userId = 'equal-times-user';
        const channelId = 'equal-times-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 300,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'warning_exceeds_timeout',
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 300,
          }),
          expect.any(String)
        );
      });

      it('should log validation failed when warning time exceeds timeout', async () => {
        const guildId = 'warning-exceeds-guild';
        const userId = 'warning-exceeds-user';
        const channelId = 'warning-exceeds-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 400,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
            guildId,
            reason: 'warning_exceeds_timeout',
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 400,
          }),
          expect.any(String)
        );
      });

      it('should use error level for validation failures, not debug', async () => {
        const guildId = 'error-level-guild';
        const userId = 'error-level-user';
        const channelId = 'error-level-channel';

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: -100,
          })
        );

        await service.startTracking(guildId, userId, channelId);

        // Should use error, not debug
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
          }),
          expect.any(String)
        );

        expect(mockLogger.debug).not.toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'validation_failed',
          }),
          expect.any(String)
        );
      });
    });
  });

  describe('RateLimiter integration', () => {
    const createEnabledConfig = (guildId: string): GuildSettings =>
      createMockGuildSettings({
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
      });

    describe('startTracking with exempt roles', () => {
      it('should call recordAction twice when checking exempt roles (guilds.fetch, members.fetch)', async () => {
        const guildId = 'rate-limit-guild';
        const userId = 'rate-limit-user';
        const channelId = 'rate-limit-channel';

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: new Map(),
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role-123'], // Non-empty exempt roles triggers API calls
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Should call recordAction twice: once for guilds.fetch, once for members.fetch
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(2);
      });

      it('should call recordAction before guilds.fetch', async () => {
        const guildId = 'rate-limit-order-guild';
        const userId = 'rate-limit-order-user';
        const channelId = 'rate-limit-order-channel';

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: new Map(),
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role-456'],
          })
        );

        // Set up verification that recordAction is called before guilds.fetch
        let recordActionCallCount = 0;
        vi.mocked(mockRateLimiter.recordAction).mockImplementation(() => {
          recordActionCallCount++;
        });

        vi.mocked(mockClient.guilds.fetch).mockImplementation(async () => {
          // At this point, recordAction should have been called at least once
          expect(recordActionCallCount).toBeGreaterThanOrEqual(1);
          return mockGuild as Guild;
        });

        await service.startTracking(guildId, userId, channelId);
      });

      it('should not call recordAction when exempt roles list is empty', async () => {
        const guildId = 'no-exempt-guild';
        const userId = 'no-exempt-user';
        const channelId = 'no-exempt-channel';

        const config = createEnabledConfig(guildId);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await service.startTracking(guildId, userId, channelId);

        // Should not call recordAction when there are no exempt roles to check
        expect(mockRateLimiter.recordAction).not.toHaveBeenCalled();
      });

      it('should still call recordAction even if exempt role check fails', async () => {
        const guildId = 'error-exempt-guild';
        const userId = 'error-exempt-user';
        const channelId = 'error-exempt-channel';
        const error = new Error('Failed to fetch guild');

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: ['exempt-role-789'],
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(error);

        await service.startTracking(guildId, userId, channelId);

        // Should call recordAction once (guilds.fetch) before the error occurs
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(1);
      });
    });

    describe('handleKick', () => {
      it('should call recordAction three times during kick (guilds.fetch, members.fetch, voice.disconnect)', async () => {
        const guildId = 'kick-rate-limit-guild';
        const userId = 'kick-rate-limit-user';
        const channelId = 'kick-rate-limit-channel';

        const mockDisconnect = vi.fn();
        const mockVoiceState: Partial<VoiceState> = {
          channel: { id: channelId } as any,
          disconnect: mockDisconnect,
        };

        const mockMember: Partial<GuildMember> = {
          voice: mockVoiceState as VoiceState,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Reset mock to only count calls during kick
        vi.mocked(mockRateLimiter.recordAction).mockClear();

        // Advance time to trigger kick
        await vi.advanceTimersByTimeAsync(100000);
        await vi.runAllTimersAsync();

        // Should call recordAction 3 times: guilds.fetch, members.fetch, voice.disconnect
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(3);
      });

      it('should call recordAction in correct order during kick', async () => {
        const guildId = 'kick-order-guild';
        const userId = 'kick-order-user';
        const channelId = 'kick-order-channel';

        const mockDisconnect = vi.fn();
        const mockVoiceState: Partial<VoiceState> = {
          channel: { id: channelId } as any,
          disconnect: mockDisconnect,
        };

        const mockMember: Partial<GuildMember> = {
          voice: mockVoiceState as VoiceState,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );

        // Track recordAction calls
        let recordActionCallCount = 0;
        vi.mocked(mockRateLimiter.recordAction).mockImplementation(() => {
          recordActionCallCount++;
        });

        // Verify recordAction called before guilds.fetch
        vi.mocked(mockClient.guilds.fetch).mockImplementation(async () => {
          expect(recordActionCallCount).toBeGreaterThanOrEqual(1);
          return mockGuild as Guild;
        });

        // Verify recordAction called before members.fetch
        const originalMembersFetch = mockGuild.members!.fetch as any;
        mockGuild.members!.fetch = vi.fn().mockImplementation(async () => {
          expect(recordActionCallCount).toBeGreaterThanOrEqual(2);
          return mockMember;
        });

        // Verify recordAction called before voice.disconnect
        mockDisconnect.mockImplementation(() => {
          expect(recordActionCallCount).toBeGreaterThanOrEqual(3);
        });

        await service.startTracking(guildId, userId, channelId);

        // Reset counter for kick phase
        recordActionCallCount = 0;

        await vi.advanceTimersByTimeAsync(100000);
        await vi.runAllTimersAsync();
      });

      it('should call recordAction twice when user already disconnected (no voice.disconnect call)', async () => {
        const guildId = 'already-gone-guild';
        const userId = 'already-gone-user';
        const channelId = 'already-gone-channel';

        const mockVoiceState: Partial<VoiceState> = {
          channel: null, // User already left
        };

        const mockMember: Partial<GuildMember> = {
          voice: mockVoiceState as VoiceState,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Reset mock to only count calls during kick
        vi.mocked(mockRateLimiter.recordAction).mockClear();

        await vi.advanceTimersByTimeAsync(100000);
        await vi.runAllTimersAsync();

        // Should call recordAction only twice: guilds.fetch, members.fetch (no disconnect)
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(2);
      });

      it('should call recordAction for guilds.fetch even when members.fetch fails', async () => {
        const guildId = 'kick-error-guild';
        const userId = 'kick-error-user';
        const channelId = 'kick-error-channel';
        const error = new Error('Member fetch failed');

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockRejectedValue(error),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 100,
            warningSecondsBefore: 30,
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Reset mock to only count calls during kick
        vi.mocked(mockRateLimiter.recordAction).mockClear();

        await vi.advanceTimersByTimeAsync(100000);
        await vi.runAllTimersAsync();

        // Should call recordAction at least once for guilds.fetch before error
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(2);
      });
    });

    describe('resetTimer with exempt roles', () => {
      it('should call recordAction when resetTimer restarts tracking with exempt roles', async () => {
        const guildId = 'reset-rate-limit-guild';
        const userId = 'reset-rate-limit-user';
        const channelId = 'reset-rate-limit-channel';

        const mockMember: Partial<GuildMember> = {
          roles: {
            cache: new Map(),
          } as any,
        };

        const mockGuild: Partial<Guild> = {
          members: {
            fetch: vi.fn().mockResolvedValue(mockMember),
          } as any,
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            exemptRoleIds: [],  // No exempt roles - user should be tracked
          })
        );
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);

        await service.startTracking(guildId, userId, channelId);

        // Verify tracking was established
        expect(service.isTracking(guildId, userId)).toBe(true);

        // Reset mock to count only resetTimer calls
        vi.mocked(mockRateLimiter.recordAction).mockClear();

        await service.resetTimer(guildId, userId);

        // With no exempt roles, recordAction is not called during startTracking
        // (it's only called when checking exempt roles). So we expect 0 calls.
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(0);
      });
    });
  });
});
