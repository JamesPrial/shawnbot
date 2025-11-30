import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Collection, VoiceBasedChannel, GuildMember } from 'discord.js';
import { VoiceMonitorService } from '../services/VoiceMonitorService';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';

describe('VoiceMonitorService', () => {
  let mockClient: Client;
  let mockConnectionManager: VoiceConnectionManager;
  let mockGuildConfig: GuildConfigService;
  let mockLogger: any;
  let service: VoiceMonitorService;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

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
      mockLogger
    );
  });

  describe('handleUserJoin', () => {
    const createEnabledConfig = (guildId: string): GuildSettings => ({
      guildId,
      enabled: true,
      afkTimeoutSeconds: 300,
      warningSecondsBefore: 60,
      warningChannelId: null,
      exemptRoleIds: [],
      adminRoleIds: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    describe('when monitoring is enabled', () => {
      it('should join channel when user joins and bot is not already connected', async () => {
        const guildId = 'guild-1';
        const channelId = 'channel-1';
        const mockChannel = {
          id: channelId,
          guild: { id: guildId },
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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
        } as VoiceBasedChannel;

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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
        } as VoiceBasedChannel;

        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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
        } as VoiceBasedChannel;

        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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
          expect.objectContaining({ error, guildId, channelId }),
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
    const createEnabledConfig = (guildId: string): GuildSettings => ({
      guildId,
      enabled: true,
      afkTimeoutSeconds: 300,
      warningSecondsBefore: 60,
      warningChannelId: null,
      exemptRoleIds: [],
      adminRoleIds: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    describe('when guild monitoring is disabled', () => {
      it('should skip disabled guilds without joining any channel', async () => {
        const guildId = 'disabled-guild';
        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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
        const disabledConfig: GuildSettings = {
          guildId,
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig(guildId));

        await (service as any).scanGuild(mockGuild);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error,
            guildId,
            guildName: 'Error Guild',
          }),
          'Error scanning guild for voice channels'
        );
      });
    });
  });

  describe('initialize', () => {
    const createEnabledConfig = (guildId: string): GuildSettings => ({
      guildId,
      enabled: true,
      afkTimeoutSeconds: 300,
      warningSecondsBefore: 60,
      warningChannelId: null,
      exemptRoleIds: [],
      adminRoleIds: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('error-guild'));

        await service.initialize();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error }),
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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));

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

        vi.mocked(mockGuildConfig.getConfig).mockReturnValue(createEnabledConfig('guild-1'));
        vi.mocked(mockConnectionManager.hasConnection).mockReturnValue(false);

        await service.initialize();

        expect(mockConnectionManager.joinChannel).toHaveBeenCalledWith(activeChannel);
      });

      it('should respect disabled guild configs during initialization', async () => {
        const disabledConfig: GuildSettings = {
          guildId: 'disabled-guild',
          enabled: false,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

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
});
