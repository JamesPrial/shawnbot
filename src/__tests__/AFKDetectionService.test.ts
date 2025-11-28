import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client, Guild, GuildMember, VoiceState } from 'discord.js';
import { AFKDetectionService } from '../services/AFKDetectionService';
import { WarningService } from '../services/WarningService';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';

describe('AFKDetectionService', () => {
  let mockClient: Client;
  let mockWarningService: WarningService;
  let mockConfigService: GuildConfigService;
  let mockLogger: any;
  let service: AFKDetectionService;

  beforeEach(() => {
    // Use fake timers for all timer-related tests
    vi.useFakeTimers();

    // Mock the logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

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

    service = new AFKDetectionService(
      mockWarningService,
      mockConfigService,
      mockClient,
      mockLogger
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

        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(disabledConfig);

        await service.startTracking(guildId, userId, channelId);

        // Verify user is not being tracked
        expect(service.isTracking(guildId, userId)).toBe(false);
      });

      it('should not set any timers when config is disabled', async () => {
        const guildId = 'disabled-guild';
        const userId = 'user-456';
        const channelId = 'channel-789';

        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(disabledConfig);

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

        const enabledConfig: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(enabledConfig);

        await service.startTracking(guildId, userId, channelId);

        expect(service.isTracking(guildId, userId)).toBe(true);
      });

      it('should set up warning timer based on config', async () => {
        const guildId = 'warning-timer-guild';
        const userId = 'user-warn';
        const channelId = 'channel-warn';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300, // 5 minutes
          warningSecondsBefore: 60, // 1 minute before
          warningChannelId: 'warning-channel',
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
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

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 120, // 2 minutes
          warningSecondsBefore: 30,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
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

      it('should log when starting tracking', async () => {
        const guildId = 'log-guild';
        const userId = 'log-user';
        const channelId = 'log-channel';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await service.startTracking(guildId, userId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            userId,
            channelId,
          }),
          'Started tracking user for AFK'
        );
      });
    });

    describe('timer calculation', () => {
      it('should calculate timers correctly with different timeout values', async () => {
        const guildId = 'calc-guild';
        const userId = 'calc-user';
        const channelId = 'calc-channel';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600, // 10 minutes
          warningSecondsBefore: 120, // 2 minutes before
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
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

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 60,
          warningSecondsBefore: 60, // Warning at same time as timeout
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        await service.startTracking(guildId, userId, channelId);

        // Warning should fire immediately (at 0 seconds)
        await vi.runAllTimersAsync();

        expect(mockWarningService.sendWarning).toHaveBeenCalled();
      });
    });

    describe('when user is already being tracked', () => {
      it('should stop existing tracking before starting new tracking', async () => {
        const guildId = 'restart-guild';
        const userId = 'restart-user';
        const channelId1 = 'channel-1';
        const channelId2 = 'channel-2';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        // Start tracking in first channel
        await service.startTracking(guildId, userId, channelId1);
        expect(service.isTracking(guildId, userId)).toBe(true);

        // Start tracking again in second channel - should restart
        await service.startTracking(guildId, userId, channelId2);
        expect(service.isTracking(guildId, userId)).toBe(true);
      });

      it('should clear old timers when restarting tracking', async () => {
        const guildId = 'clear-timers-guild';
        const userId = 'clear-timers-user';
        const channelId = 'channel-123';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

        // Start tracking
        await service.startTracking(guildId, userId, channelId);

        // Advance time partway to warning
        await vi.advanceTimersByTimeAsync(120000); // 2 minutes

        // Restart tracking - this should reset the timer
        await service.startTracking(guildId, userId, channelId);

        // Advance another 2 minutes (total would be 4 minutes from first start)
        await vi.advanceTimersByTimeAsync(120000);

        // Warning shouldn't have fired yet (should need 4 minutes from restart)
        expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
      });
    });

    describe('tracking key generation', () => {
      it('should track users independently across different guilds', async () => {
        const userId = 'same-user';
        const guild1 = 'guild-one';
        const guild2 = 'guild-two';
        const channelId = 'channel-123';

        const config: GuildSettings = {
          guildId: guild1,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await service.startTracking(guild1, userId, channelId);
        await service.startTracking(guild2, userId, channelId);

        // Both should be tracked independently
        expect(service.isTracking(guild1, userId)).toBe(true);
        expect(service.isTracking(guild2, userId)).toBe(true);
      });

      it('should track different users in same guild independently', async () => {
        const guildId = 'multi-user-guild';
        const user1 = 'user-one';
        const user2 = 'user-two';
        const channelId = 'channel-123';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await service.startTracking(guildId, user1, channelId);
        await service.startTracking(guildId, user2, channelId);

        expect(service.isTracking(guildId, user1)).toBe(true);
        expect(service.isTracking(guildId, user2)).toBe(true);
      });
    });
  });

  describe('stopTracking', () => {
    it('should clear timers and remove tracking', async () => {
      const guildId = 'stop-guild';
      const userId = 'stop-user';
      const channelId = 'stop-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);
      expect(service.isTracking(guildId, userId)).toBe(true);

      service.stopTracking(guildId, userId);
      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should prevent timers from firing after stopping', async () => {
      const guildId = 'prevent-fire-guild';
      const userId = 'prevent-fire-user';
      const channelId = 'prevent-fire-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);
      service.stopTracking(guildId, userId);

      // Advance past when timers would have fired
      await vi.advanceTimersByTimeAsync(500000);

      expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
    });

    it('should do nothing when stopping non-tracked user', () => {
      const guildId = 'non-tracked-guild';
      const userId = 'non-tracked-user';

      // Should not throw
      expect(() => {
        service.stopTracking(guildId, userId);
      }).not.toThrow();
    });

    it('should log when stopping tracking', async () => {
      const guildId = 'log-stop-guild';
      const userId = 'log-stop-user';
      const channelId = 'log-stop-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);
      service.stopTracking(guildId, userId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { guildId, userId },
        'Stopped tracking user'
      );
    });
  });

  describe('resetTimer', () => {
    it('should restart tracking for tracked user', async () => {
      const guildId = 'reset-guild';
      const userId = 'reset-user';
      const channelId = 'reset-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      // Advance time partway
      await vi.advanceTimersByTimeAsync(200000); // 200 seconds

      // Reset timer
      await service.resetTimer(guildId, userId);

      // Advance another 200 seconds - warning still shouldn't fire
      // (needs 240 seconds from reset)
      await vi.advanceTimersByTimeAsync(200000);

      expect(mockWarningService.sendWarning).not.toHaveBeenCalled();
    });

    it('should do nothing for non-tracked user', async () => {
      const guildId = 'non-reset-guild';
      const userId = 'non-reset-user';

      // Should not throw
      await expect(service.resetTimer(guildId, userId)).resolves.not.toThrow();
    });

    it('should log when resetting timer', async () => {
      const guildId = 'log-reset-guild';
      const userId = 'log-reset-user';
      const channelId = 'log-reset-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);
      await service.resetTimer(guildId, userId);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { guildId, userId },
        'User activity detected, resetting timer'
      );
    });

    it('should preserve channel info when resetting', async () => {
      const guildId = 'preserve-guild';
      const userId = 'preserve-user';
      const channelId = 'original-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);
      await service.resetTimer(guildId, userId);

      // User should still be tracked in the same channel
      expect(service.isTracking(guildId, userId)).toBe(true);
    });
  });

  describe('isTracking', () => {
    it('should return true when user is being tracked', async () => {
      const guildId = 'tracking-check-guild';
      const userId = 'tracking-check-user';
      const channelId = 'tracking-check-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);

      expect(service.isTracking(guildId, userId)).toBe(true);
    });

    it('should return false when user is not being tracked', () => {
      const guildId = 'not-tracking-guild';
      const userId = 'not-tracking-user';

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should return false after tracking is stopped', async () => {
      const guildId = 'stopped-tracking-guild';
      const userId = 'stopped-tracking-user';
      const channelId = 'stopped-tracking-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, userId, channelId);
      service.stopTracking(guildId, userId);

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should correctly distinguish between different users in same guild', async () => {
      const guildId = 'distinguish-guild';
      const user1 = 'tracked-user';
      const user2 = 'not-tracked-user';
      const channelId = 'channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await service.startTracking(guildId, user1, channelId);

      expect(service.isTracking(guildId, user1)).toBe(true);
      expect(service.isTracking(guildId, user2)).toBe(false);
    });

    it('should correctly distinguish same user across different guilds', async () => {
      const guild1 = 'guild-one';
      const guild2 = 'guild-two';
      const userId = 'same-user';
      const channelId = 'channel';

      const config: GuildSettings = {
        guildId: guild1,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

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

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        warningChannelId: 'warning-channel-id',
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(240000); // 240 seconds

      expect(mockWarningService.sendWarning).toHaveBeenCalledWith(guildId, userId, channelId);
    });

    it('should log when warning is sent successfully', async () => {
      const guildId = 'log-warning-guild';
      const userId = 'log-warning-user';
      const channelId = 'log-warning-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 200,
        warningSecondsBefore: 50,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(150000);
      await vi.runAllTimersAsync();

      expect(mockLogger.info).toHaveBeenCalledWith(
        { guildId, userId },
        'Warning sent for AFK user'
      );
    });

    it('should log error when warning fails', async () => {
      const guildId = 'error-warning-guild';
      const userId = 'error-warning-user';
      const channelId = 'error-warning-channel';
      const error = new Error('Failed to send warning');

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 200,
        warningSecondsBefore: 50,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockWarningService.sendWarning).mockRejectedValue(error);

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(150000);
      await vi.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error, guildId, userId }),
        'Failed to send warning'
      );
    });
  });

  describe('kick behavior', () => {
    it('should disconnect user when kick timer fires', async () => {
      const guildId = 'kick-behavior-guild';
      const userId = 'kick-behavior-user';
      const channelId = 'kick-behavior-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 180,
        warningSecondsBefore: 60,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

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

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(180000);
      await vi.runAllTimersAsync();

      expect(mockDisconnect).toHaveBeenCalledWith('AFK timeout');
    });

    it('should remove tracking after successful kick', async () => {
      const guildId = 'remove-tracking-guild';
      const userId = 'remove-tracking-user';
      const channelId = 'remove-tracking-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 100,
        warningSecondsBefore: 30,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

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

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      expect(service.isTracking(guildId, userId)).toBe(false);
    });

    it('should handle user already disconnected gracefully', async () => {
      const guildId = 'already-disconnected-guild';
      const userId = 'already-disconnected-user';
      const channelId = 'already-disconnected-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 100,
        warningSecondsBefore: 30,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

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

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { guildId, userId },
        'User already disconnected when kick timer fired'
      );
    });

    it('should log error when kick fails', async () => {
      const guildId = 'kick-error-guild';
      const userId = 'kick-error-user';
      const channelId = 'kick-error-channel';
      const error = new Error('Failed to disconnect user');

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 100,
        warningSecondsBefore: 30,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockRejectedValue(error),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error, guildId, userId }),
        'Failed to kick AFK user'
      );
    });

    it('should still remove tracking even when kick fails', async () => {
      const guildId = 'cleanup-on-error-guild';
      const userId = 'cleanup-on-error-user';
      const channelId = 'cleanup-on-error-channel';

      const config: GuildSettings = {
        guildId,
        enabled: true,
        afkTimeoutSeconds: 100,
        warningSecondsBefore: 30,
        warningChannelId: null,
        exemptRoleIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const mockGuild: Partial<Guild> = {
        members: {
          fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
        } as any,
      };

      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild as Guild);
      vi.mocked(mockWarningService.sendWarning).mockResolvedValue();

      await service.startTracking(guildId, userId, channelId);

      await vi.advanceTimersByTimeAsync(100000);
      await vi.runAllTimersAsync();

      // Tracking should be removed even though kick failed
      expect(service.isTracking(guildId, userId)).toBe(false);
    });
  });
});
