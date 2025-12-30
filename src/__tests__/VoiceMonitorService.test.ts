import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Collection, VoiceBasedChannel, GuildMember } from 'discord.js';
import { VoiceMonitorService } from '../services/VoiceMonitorService';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import { createMockLogger, createMockRateLimiter, createMockGuildSettings } from './fixtures';

describe('VoiceMonitorService', () => {
  let mockClient: Client;
  let mockConnectionManager: VoiceConnectionManager;
  let mockGuildConfig: GuildConfigService;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockRateLimiter: ReturnType<typeof createMockRateLimiter>;
  let service: VoiceMonitorService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockRateLimiter = createMockRateLimiter();

    mockClient = {} as Client;

    mockConnectionManager = {
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      hasConnection: vi.fn(),
    } as unknown as VoiceConnectionManager;

    mockGuildConfig = {
      getConfig: vi.fn(),
    } as unknown as GuildConfigService;

    service = new VoiceMonitorService(
      mockConnectionManager,
      mockGuildConfig,
      mockClient,
      mockLogger,
      mockRateLimiter
    );
  });

  describe('handleUserJoin', () => {
    describe('when monitoring is enabled', () => {
      it('should join channel when user joins and bot is not already connected', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(mockChannel);
      });

      it('should not join if bot is already connected to guild', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(true);

        await service.handleUserJoin(mockChannel);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });

      it('should log when joining channel', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { guildId, channelId },
          'Joining voice channel'
        );
      });
    });

    describe('when monitoring is disabled', () => {
      it('should not join channel when config is disabled', async () => {
        const guildId = 'guild-disabled';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        const disabledConfig = createMockGuildSettings({ enabled: false, guildId });

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(disabledConfig);
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });

      it('should log debug message when monitoring disabled', async () => {
        const guildId = 'guild-disabled';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        const disabledConfig = createMockGuildSettings({ enabled: false, guildId });

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(disabledConfig);

        await service.handleUserJoin(mockChannel);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId, channelId },
          'Guild monitoring not enabled'
        );
      });
    });
  });

  describe('handleUserLeave', () => {
    describe('when channel becomes empty', () => {
      it('should leave channel when last non-bot user leaves', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';

        // Mock empty channel (no non-bot members)
        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection([
            ['bot-1', { user: { bot: true } } as GuildMember],
          ]),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockConnectionManager.leaveChannel).toHaveBeenCalledWith(guildId);
      });

      it('should log when leaving empty channel', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { guildId, channelId },
          'Channel empty, leaving voice channel'
        );
      });
    });

    describe('when channel still has users', () => {
      it('should not leave when non-bot users remain', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection([
            ['user-1', { user: { bot: false } } as GuildMember],
            ['user-2', { user: { bot: false } } as GuildMember],
          ]),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockConnectionManager.leaveChannel).not.toHaveBeenCalled();
      });

      it('should log debug when staying in channel with users', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection([
            ['user-1', { user: { bot: false } } as GuildMember],
          ]),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId, channelId },
          'Channel still has users, staying connected'
        );
      });
    });

    describe('error handling', () => {
      it('should handle channel fetch errors gracefully', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';
        const error = new Error('Failed to fetch channel');

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.any(String),
              stack: expect.any(String)
            }),
            guildId,
            channelId
          }),
          'Error checking if channel is empty'
        );
      });

      it('should treat error as empty channel and leave', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockRejectedValue(new Error('Fetch failed')),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        // Should leave when error occurs (defensive behavior)
        expect(mockConnectionManager.leaveChannel).toHaveBeenCalledWith(guildId);
      });

      it('should handle non-voice channel gracefully', async () => {
        const guildId = 'guild-1';
        const channelId = 'text-channel';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => false,
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          { guildId, channelId },
          'Channel not found or not voice-based'
        );
        expect(mockConnectionManager.leaveChannel).toHaveBeenCalledWith(guildId);
      });

      it('should handle null channel gracefully', async () => {
        const guildId = 'guild-1';
        const channelId = 'deleted-channel';

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(null),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          { guildId, channelId },
          'Channel not found or not voice-based'
        );
      });
    });
  });

  describe('scanGuild', () => {
    describe('when guild monitoring is disabled', () => {
      it('should skip disabled guilds without joining any channel', async () => {
        const guildId = 'disabled-guild';
        const disabledConfig = createMockGuildSettings({ enabled: false, guildId });

        const mockChannel: any = {
          id: 'channel-1',
          name: 'General',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Disabled Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', mockChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(disabledConfig);
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });

      it('should log debug message when skipping disabled guild', async () => {
        const guildId = 'disabled-guild';
        const disabledConfig = createMockGuildSettings({ enabled: false, guildId });

        const mockGuild: any = {
          id: guildId,
          name: 'Disabled Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(disabledConfig);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId },
          'Guild monitoring not enabled, skipping scan'
        );
      });
    });

    describe('when guild monitoring is enabled', () => {
      it('should find and join first channel with 2+ non-bot users', async () => {
        const guildId = 'active-guild';
        const channelId = 'channel-1';

        const mockChannel: any = {
          id: channelId,
          name: 'General',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Active Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', mockChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(mockChannel);
      });

      it('should skip channels with only 1 non-bot user', async () => {
        const guildId = 'sparse-guild';

        const emptyChannel: any = {
          id: 'channel-empty',
          name: 'Empty',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>(),
        };

        const oneUserChannel: any = {
          id: 'channel-one',
          name: 'One User',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        };

        const activeChannel: any = {
          id: 'channel-active',
          name: 'Active',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Sparse Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-empty', emptyChannel],
              ['channel-one', oneUserChannel],
              ['channel-active', activeChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should only join the active channel
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(activeChannel);
      });

      it('should not count bot users toward the 2-user threshold', async () => {
        const guildId = 'bot-heavy-guild';

        const botOnlyChannel: any = {
          id: 'channel-bots',
          name: 'Bot Party',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['bot1', { user: { bot: true } } as GuildMember],
            ['bot2', { user: { bot: true } } as GuildMember],
            ['bot3', { user: { bot: true } } as GuildMember],
          ]),
        };

        const mixedChannel: any = {
          id: 'channel-mixed',
          name: 'Mixed',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['bot1', { user: { bot: true } } as GuildMember],
          ]),
        };

        const activeChannel: any = {
          id: 'channel-active',
          name: 'Active',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
            ['bot1', { user: { bot: true } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Bot Heavy Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-bots', botOnlyChannel],
              ['channel-mixed', mixedChannel],
              ['channel-active', activeChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should only join the channel with 2+ non-bot users
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(activeChannel);
      });

      it('should only join ONE channel even if multiple have 2+ users', async () => {
        const guildId = 'multi-active-guild';

        const channel1: any = {
          id: 'channel-1',
          name: 'Active 1',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const channel2: any = {
          id: 'channel-2',
          name: 'Active 2',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user3', { user: { bot: false } } as GuildMember],
            ['user4', { user: { bot: false } } as GuildMember],
            ['user5', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Multi Active Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', channel1],
              ['channel-2', channel2],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should join exactly ONE channel (the first one found)
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(channel1);
      });

      it('should not join if bot is already connected to the guild', async () => {
        const guildId = 'already-connected-guild';

        const mockChannel: any = {
          id: 'channel-1',
          name: 'General',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Already Connected Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', mockChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(true);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });

      it('should log when joining channel during scan', async () => {
        const guildId = 'logging-guild';
        const channelId = 'channel-1';

        const mockChannel: any = {
          id: channelId,
          name: 'General Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Logging Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', mockChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.info).toHaveBeenCalledWith(
          {
            guildId,
            channelId,
            channelName: 'General Voice',
          },
          'Joining voice channel during guild scan'
        );
      });
    });

    describe('when guild has no voice channels', () => {
      it('should handle guild with no channels gracefully', async () => {
        const guildId = 'no-channels-guild';

        const mockGuild: any = {
          id: guildId,
          name: 'No Channels Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await expect((service as any).scanGuild(mockGuild)).resolves.not.toThrow();
      });

      it('should not attempt to join when no voice channels exist', async () => {
        const guildId = 'text-only-guild';

        const textChannel: any = {
          id: 'text-1',
          name: 'General Chat',
          isVoiceBased: () => false,
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Text Only Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['text-1', textChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });

      it('should log debug when no active channels found', async () => {
        const guildId = 'quiet-guild';

        const emptyChannel: any = {
          id: 'voice-1',
          name: 'Empty Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>(),
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Quiet Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['voice-1', emptyChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId },
          'No voice channels with sufficient members found during scan'
        );
      });
    });

    describe('error handling', () => {
      it('should handle channel fetch errors without crashing', async () => {
        const guildId = 'error-guild';
        const error = new Error('Failed to fetch channels');

        const mockGuild: any = {
          id: guildId,
          name: 'Error Guild',
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));

        await expect((service as any).scanGuild(mockGuild)).resolves.not.toThrow();
      });

      it('should log error when channel scan fails', async () => {
        const guildId = 'error-guild';
        const error = new Error('Channel fetch failed');

        const mockGuild: any = {
          id: guildId,
          name: 'Error Guild',
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.any(String),
              stack: expect.any(String)
            }),
            guildId,
            guildName: 'Error Guild',
          }),
          'Error scanning guild for voice channels'
        );
      });

      it('should log error with message and stack properties when scan fails', async () => {
        const guildId = 'detailed-error-guild';
        const error = new Error('Detailed channel fetch failure');
        error.stack = 'Error: Detailed channel fetch failure\n    at scanGuild (VoiceMonitorService.ts:57:15)';

        const mockGuild: any = {
          id: guildId,
          name: 'Detailed Error Guild',
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));

        await (service as any).scanGuild(mockGuild);

        // Verify error object is serialized with message and stack
        const errorLogCall = vi.mocked(mockLogger.error).mock.calls[0];
        const loggedContext = errorLogCall[0];

        expect(loggedContext.error).toEqual(
          expect.objectContaining({
            message: 'Detailed channel fetch failure',
            stack: expect.stringContaining('at scanGuild')
          })
        );
      });
    });

    describe('null channel handling', () => {
      it('should skip null channels in the collection without error', async () => {
        const guildId = 'null-channel-guild';

        const validChannel: any = {
          id: 'valid-channel',
          name: 'Valid Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        // Collection with null entry - this can happen when channels are deleted
        const channelsWithNull = new Collection<string, any>([
          ['null-channel', null],
          ['valid-channel', validChannel],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Null Channel Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channelsWithNull),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        // Should not throw when encountering null
        await expect((service as any).scanGuild(mockGuild)).resolves.not.toThrow();

        // Should still join the valid channel
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(validChannel);
      });

      it('should filter out multiple null channels and process valid ones', async () => {
        const guildId = 'multi-null-guild';

        const validChannel1: any = {
          id: 'valid-1',
          name: 'Valid Voice 1',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const validChannel2: any = {
          id: 'valid-2',
          name: 'Valid Voice 2',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user3', { user: { bot: false } } as GuildMember],
          ]),
        };

        // Multiple nulls interspersed with valid channels
        const channelsWithMultipleNulls = new Collection<string, any>([
          ['null-1', null],
          ['valid-1', validChannel1],
          ['null-2', null],
          ['valid-2', validChannel2],
          ['null-3', null],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Multi Null Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channelsWithMultipleNulls),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should join the first valid channel with sufficient users (valid-1)
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(validChannel1);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
      });

      it('should handle collection of all nulls gracefully', async () => {
        const guildId = 'all-nulls-guild';

        const allNulls = new Collection<string, any>([
          ['null-1', null],
          ['null-2', null],
          ['null-3', null],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'All Nulls Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(allNulls),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId },
          'No voice channels with sufficient members found during scan'
        );
      });
    });

    describe('non-voice channel filtering', () => {
      it('should filter out text channels from scan results', async () => {
        const guildId = 'mixed-channel-guild';

        const textChannel: any = {
          id: 'text-1',
          name: 'General Chat',
          isVoiceBased: () => false,
        };

        const voiceChannel: any = {
          id: 'voice-1',
          name: 'Voice Chat',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const channels = new Collection<string, any>([
          ['text-1', textChannel],
          ['voice-1', voiceChannel],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Mixed Channel Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channels),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should only join voice channel, not text channel
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(voiceChannel);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
      });

      it('should filter out multiple non-voice channel types', async () => {
        const guildId = 'various-types-guild';

        const textChannel: any = {
          id: 'text-1',
          name: 'Text',
          isVoiceBased: () => false,
        };

        const categoryChannel: any = {
          id: 'category-1',
          name: 'Category',
          isVoiceBased: () => false,
        };

        const announcementChannel: any = {
          id: 'announcement-1',
          name: 'Announcements',
          isVoiceBased: () => false,
        };

        const forumChannel: any = {
          id: 'forum-1',
          name: 'Forum',
          isVoiceBased: () => false,
        };

        const voiceChannel: any = {
          id: 'voice-1',
          name: 'Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const channels = new Collection<string, any>([
          ['text-1', textChannel],
          ['category-1', categoryChannel],
          ['announcement-1', announcementChannel],
          ['forum-1', forumChannel],
          ['voice-1', voiceChannel],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Various Types Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channels),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should only join the voice channel
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(voiceChannel);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
      });

      it('should handle guild with only non-voice channels', async () => {
        const guildId = 'no-voice-guild';

        const textChannel1: any = {
          id: 'text-1',
          name: 'General',
          isVoiceBased: () => false,
        };

        const textChannel2: any = {
          id: 'text-2',
          name: 'Random',
          isVoiceBased: () => false,
        };

        const channels = new Collection<string, any>([
          ['text-1', textChannel1],
          ['text-2', textChannel2],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'No Voice Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channels),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          { guildId },
          'No voice channels with sufficient members found during scan'
        );
      });

      it('should handle channels where isVoiceBased throws an error', async () => {
        const guildId = 'broken-channel-guild';

        const brokenChannel: any = {
          id: 'broken-1',
          name: 'Broken',
          isVoiceBased: () => {
            throw new Error('isVoiceBased check failed');
          },
        };

        const channels = new Collection<string, any>([
          ['broken-1', brokenChannel],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Broken Channel Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(channels),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // The error in filter should be caught by the outer try-catch
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.stringContaining('isVoiceBased'),
              stack: expect.any(String)
            }),
            guildId,
            guildName: 'Broken Channel Guild',
          }),
          'Error scanning guild for voice channels'
        );
      });
    });

    describe('combined null and non-voice filtering', () => {
      it('should handle collection with both nulls and non-voice channels', async () => {
        const guildId = 'complex-guild';

        const textChannel: any = {
          id: 'text-1',
          name: 'Text',
          isVoiceBased: () => false,
        };

        const voiceChannel: any = {
          id: 'voice-1',
          name: 'Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const complexCollection = new Collection<string, any>([
          ['null-1', null],
          ['text-1', textChannel],
          ['null-2', null],
          ['voice-1', voiceChannel],
          ['null-3', null],
        ]);

        const mockGuild: any = {
          id: guildId,
          name: 'Complex Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(complexCollection),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should successfully filter out both nulls and non-voice channels
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(voiceChannel);
        expect(mockConnectionManager.joinChannel).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('initialize', () => {
    describe('when client has multiple guilds', () => {
      it('should call scanGuild for each guild in client.guilds.cache', async () => {
        const mockGuild1: any = {
          id: 'guild-1',
          name: 'Guild 1',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        const mockGuild2: any = {
          id: 'guild-2',
          name: 'Guild 2',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        const mockGuild3: any = {
          id: 'guild-3',
          name: 'Guild 3',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        mockClient.guilds = {
          cache: new Collection([
            ['guild-1', mockGuild1],
            ['guild-2', mockGuild2],
            ['guild-3', mockGuild3],
          ]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));

        await service.initialize();

        // Each guild should have channels.fetch called (scanGuild behavior)
        expect(mockGuild1.channels.fetch).toHaveBeenCalled();
        expect(mockGuild2.channels.fetch).toHaveBeenCalled();
        expect(mockGuild3.channels.fetch).toHaveBeenCalled();
      });

      it('should scan all guilds even if one has active channels', async () => {
        const activeChannel: any = {
          id: 'channel-1',
          name: 'Active',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: 'guild-1' },
        };

        const mockGuild1: any = {
          id: 'guild-1',
          name: 'Guild 1',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', activeChannel],
            ])),
          },
        };

        const mockGuild2: any = {
          id: 'guild-2',
          name: 'Guild 2',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        mockClient.guilds = {
          cache: new Collection([
            ['guild-1', mockGuild1],
            ['guild-2', mockGuild2],
          ]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.initialize();

        // Both guilds should be scanned
        expect(mockGuild1.channels.fetch).toHaveBeenCalled();
        expect(mockGuild2.channels.fetch).toHaveBeenCalled();
      });
    });

    describe('when client has no guilds', () => {
      it('should complete successfully with empty guild cache', async () => {
        mockClient.guilds = {
          cache: new Collection(),
        } as any;

        await expect(service.initialize()).resolves.not.toThrow();
      });

      it('should log completion even with no guilds', async () => {
        mockClient.guilds = {
          cache: new Collection(),
        } as any;

        await service.initialize();

        expect(mockLogger.info).toHaveBeenCalledWith('VoiceMonitorService initialization complete');
      });
    });

    describe('logging behavior', () => {
      it('should log initialization start message', async () => {
        mockClient.guilds = {
          cache: new Collection(),
        } as any;

        await service.initialize();

        expect(mockLogger.info).toHaveBeenCalledWith('Initializing VoiceMonitorService');
      });

      it('should log completion message after scanning all guilds', async () => {
        const mockGuild: any = {
          id: 'guild-1',
          name: 'Guild 1',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        mockClient.guilds = {
          cache: new Collection([['guild-1', mockGuild]]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));

        await service.initialize();

        expect(mockLogger.info).toHaveBeenCalledWith('VoiceMonitorService initialization complete');
      });

      it('should log completion as the last log call', async () => {
        const mockGuild: any = {
          id: 'guild-1',
          name: 'Guild 1',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        mockClient.guilds = {
          cache: new Collection([['guild-1', mockGuild]]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));

        await service.initialize();

        // Get all info log calls
        const infoCalls = vi.mocked(mockLogger.info).mock.calls;
        const lastInfoCall = infoCalls[infoCalls.length - 1];

        expect(lastInfoCall[0]).toBe('VoiceMonitorService initialization complete');
      });
    });

    describe('error resilience', () => {
      it('should continue scanning other guilds if one guild scan fails', async () => {
        const mockGuild1: any = {
          id: 'error-guild',
          name: 'Error Guild',
          channels: {
            fetch: vi.fn().mockRejectedValue(new Error('Scan failed')),
          },
        };

        const mockGuild2: any = {
          id: 'good-guild',
          name: 'Good Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>()),
          },
        };

        mockClient.guilds = {
          cache: new Collection([
            ['error-guild', mockGuild1],
            ['good-guild', mockGuild2],
          ]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));

        await service.initialize();

        // Error guild should attempt fetch
        expect(mockGuild1.channels.fetch).toHaveBeenCalled();
        // Good guild should still be scanned despite error in first guild
        expect(mockGuild2.channels.fetch).toHaveBeenCalled();
      });

      it('should log error for failed guild but still complete initialization', async () => {
        const error = new Error('Guild scan failed');
        const mockGuild1: any = {
          id: 'error-guild',
          name: 'Error Guild',
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        mockClient.guilds = {
          cache: new Collection([['error-guild', mockGuild1]]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'error-guild' }));

        await service.initialize();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: expect.any(String),
              stack: expect.any(String)
            })
          }),
          'Error scanning guild for voice channels'
        );
        expect(mockLogger.info).toHaveBeenCalledWith('VoiceMonitorService initialization complete');
      });

      it('should complete initialization even if all guilds fail to scan', async () => {
        const mockGuild1: any = {
          id: 'fail-1',
          name: 'Fail 1',
          channels: {
            fetch: vi.fn().mockRejectedValue(new Error('Fail 1')),
          },
        };

        const mockGuild2: any = {
          id: 'fail-2',
          name: 'Fail 2',
          channels: {
            fetch: vi.fn().mockRejectedValue(new Error('Fail 2')),
          },
        };

        mockClient.guilds = {
          cache: new Collection([
            ['fail-1', mockGuild1],
            ['fail-2', mockGuild2],
          ]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));

        await expect(service.initialize()).resolves.not.toThrow();
        expect(mockLogger.info).toHaveBeenCalledWith('VoiceMonitorService initialization complete');
      });
    });

    describe('integration with scanGuild', () => {
      it('should join active channels found during initialization', async () => {
        const activeChannel: any = {
          id: 'channel-1',
          name: 'Active Voice',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: 'guild-1' },
        };

        const mockGuild: any = {
          id: 'guild-1',
          name: 'Guild 1',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', activeChannel],
            ])),
          },
        };

        mockClient.guilds = {
          cache: new Collection([['guild-1', mockGuild]]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId: 'guild-1' }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.initialize();

        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(activeChannel);
      });

      it('should respect disabled guild configs during initialization', async () => {
        const disabledConfig = createMockGuildSettings({ enabled: false, guildId: 'disabled-guild' });

        const activeChannel: any = {
          id: 'channel-1',
          name: 'Active',
          isVoiceBased: () => true,
          members: new Collection<string, GuildMember>([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
        };

        const mockGuild: any = {
          id: 'disabled-guild',
          name: 'Disabled Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection<string, any>([
              ['channel-1', activeChannel],
            ])),
          },
        };

        mockClient.guilds = {
          cache: new Collection([['disabled-guild', mockGuild]]),
        } as any;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(disabledConfig);

        await service.initialize();

        // Should not join channels in disabled guilds
        expect(mockConnectionManager.joinChannel).not.toHaveBeenCalled();
      });
    });
  });

  describe('WU-4: structured debug logging with action metadata', () => {
    describe('handleUserJoin logging', () => {
      it('should log user_join with action and memberCount metadata', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';
        const memberCount = 5;

        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
            ['user3', { user: { bot: false } } as GuildMember],
            ['user4', { user: { bot: false } } as GuildMember],
            ['user5', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        // Verify the first debug log includes action and memberCount
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            channelId,
            action: 'user_join',
            memberCount: 5,
          }),
          'Handling user join to voice channel'
        );
      });

      it('should correctly count non-bot members for memberCount', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
            ['bot1', { user: { bot: true } } as GuildMember],
            ['bot2', { user: { bot: true } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        // Should count only the 2 non-bot members
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'user_join',
            memberCount: 2,
          }),
          expect.any(String)
        );
      });

      it('should log memberCount of 0 when channel has only bots', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['bot1', { user: { bot: true } } as GuildMember],
            ['bot2', { user: { bot: true } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'user_join',
            memberCount: 0,
          }),
          expect.any(String)
        );
      });

      it('should log memberCount of 1 when single user joins', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.handleUserJoin(mockChannel);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'user_join',
            memberCount: 1,
          }),
          expect.any(String)
        );
      });

      it('should log even when monitoring is disabled', async () => {
        const guildId = 'disabled-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: false, guildId }));

        await service.handleUserJoin(mockChannel);

        // Should still log the user_join action even if monitoring is disabled
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'user_join',
            memberCount: 1,
          }),
          'Handling user join to voice channel'
        );
      });
    });

    describe('handleUserLeave logging', () => {
      it('should log user_leave with action metadata', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            channelId,
            action: 'user_leave',
          }),
          'Handling user leave from voice channel'
        );
      });

      it('should log user_leave before checking if channel is empty', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';

        const mockChannel = {
          id: channelId,
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockResolvedValue(mockChannel),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        // Get all debug calls
        const debugCalls = vi.mocked(mockLogger.debug).mock.calls;

        // First call should be the user_leave log
        expect(debugCalls[0]).toEqual([
          expect.objectContaining({
            action: 'user_leave',
          }),
          'Handling user leave from voice channel',
        ]);
      });

      it('should log user_leave even when errors occur', async () => {
        const guildId = 'test-guild';
        const channelId = 'test-channel';
        const error = new Error('Channel fetch failed');

        const mockGuild = {
          channels: {
            fetch: vi.fn().mockRejectedValue(error),
          },
        };

        mockClient.guilds = {
          fetch: vi.fn().mockResolvedValue(mockGuild),
        } as any;

        await service.handleUserLeave(guildId, channelId);

        // Should still log user_leave before the error
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'user_leave',
          }),
          'Handling user leave from voice channel'
        );
      });
    });

    describe('scanGuild logging with action metadata', () => {
      it('should log guild_scan with action and voiceChannelCount', async () => {
        const guildId = 'test-guild';

        const voiceChannel1: any = {
          id: 'voice-1',
          name: 'Voice 1',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const voiceChannel2: any = {
          id: 'voice-2',
          name: 'Voice 2',
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const textChannel: any = {
          id: 'text-1',
          name: 'Text',
          isVoiceBased: () => false,
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Test Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['voice-1', voiceChannel1],
              ['voice-2', voiceChannel2],
              ['text-1', textChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should log guild_scan with count of 2 voice channels
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            action: 'guild_scan',
            voiceChannelCount: 2,
          }),
          'Scanning guild for active voice channels'
        );
      });

      it('should count all voice channels including empty ones', async () => {
        const guildId = 'test-guild';

        const emptyVoice1: any = {
          id: 'empty-1',
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const emptyVoice2: any = {
          id: 'empty-2',
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Empty Voices Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['empty-1', emptyVoice1],
              ['empty-2', emptyVoice2],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'guild_scan',
            voiceChannelCount: 2,
          }),
          expect.any(String)
        );
      });

      it('should log voiceChannelCount of 0 when guild has no voice channels', async () => {
        const guildId = 'text-only-guild';

        const textChannel: any = {
          id: 'text-1',
          isVoiceBased: () => false,
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Text Only Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['text-1', textChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'guild_scan',
            voiceChannelCount: 0,
          }),
          expect.any(String)
        );
      });

      it('should handle null channels when counting voice channels', async () => {
        const guildId = 'null-guild';

        const voiceChannel: any = {
          id: 'voice-1',
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Null Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['null-1', null],
              ['voice-1', voiceChannel],
              ['null-2', null],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should count only the 1 non-null voice channel
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'guild_scan',
            voiceChannelCount: 1,
          }),
          expect.any(String)
        );
      });
    });

    describe('threshold check logging', () => {
      it('should log threshold_check with action, nonBotCount, and result for each channel', async () => {
        const guildId = 'test-guild';

        const activeChannel: any = {
          id: 'active',
          name: 'Active',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Test Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['active', activeChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should log threshold check for the channel
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            guildId,
            channelId: 'active',
            action: 'threshold_check',
            nonBotCount: 2,
            threshold: 2, // MIN_USERS_FOR_AFK_TRACKING
            result: true,
          }),
          'Threshold check for AFK tracking'
        );
      });

      it('should log threshold_check with result false for channels below threshold', async () => {
        const guildId = 'test-guild';

        const oneUserChannel: any = {
          id: 'one-user',
          name: 'One User',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Test Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['one-user', oneUserChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'threshold_check',
            nonBotCount: 1,
            result: false,
          }),
          expect.any(String)
        );
      });

      it('should log threshold_check for multiple channels independently', async () => {
        const guildId = 'test-guild';

        const channel1: any = {
          id: 'channel-1',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
          ]),
        };

        const channel2: any = {
          id: 'channel-2',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
            ['user3', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Multi Channel Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['channel-1', channel1],
              ['channel-2', channel2],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should log threshold check for channel-1 (below threshold)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            channelId: 'channel-1',
            action: 'threshold_check',
            nonBotCount: 1,
            result: false,
          }),
          expect.any(String)
        );

        // Should log threshold check for channel-2 (above threshold)
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            channelId: 'channel-2',
            action: 'threshold_check',
            nonBotCount: 3,
            result: true,
          }),
          expect.any(String)
        );
      });

      it('should exclude bots from nonBotCount in threshold check', async () => {
        const guildId = 'test-guild';

        const mixedChannel: any = {
          id: 'mixed',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
            ['bot1', { user: { bot: true } } as GuildMember],
            ['bot2', { user: { bot: true } } as GuildMember],
            ['bot3', { user: { bot: true } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Mixed Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['mixed', mixedChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        // Should count only the 2 non-bot users
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'threshold_check',
            nonBotCount: 2,
            result: true,
          }),
          expect.any(String)
        );
      });

      it('should log threshold_check with result true exactly at threshold', async () => {
        const guildId = 'test-guild';

        const exactThresholdChannel: any = {
          id: 'exact',
          isVoiceBased: () => true,
          members: new Collection([
            ['user1', { user: { bot: false } } as GuildMember],
            ['user2', { user: { bot: false } } as GuildMember],
          ]),
          guild: { id: guildId },
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Exact Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['exact', exactThresholdChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'threshold_check',
            nonBotCount: 2,
            threshold: 2,
            result: true,
          }),
          expect.any(String)
        );
      });

      it('should log threshold_check with result false for empty channels', async () => {
        const guildId = 'test-guild';

        const emptyChannel: any = {
          id: 'empty',
          isVoiceBased: () => true,
          members: new Collection(),
        };

        const mockGuild: any = {
          id: guildId,
          name: 'Empty Guild',
          channels: {
            fetch: vi.fn().mockResolvedValue(new Collection([
              ['empty', emptyChannel],
            ])),
          },
        };

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createMockGuildSettings({ enabled: true, guildId }));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'threshold_check',
            nonBotCount: 0,
            result: false,
          }),
          expect.any(String)
        );
      });
    });
  });
});
