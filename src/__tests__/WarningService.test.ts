import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Guild, TextChannel, ChannelType, PermissionFlagsBits, PermissionsBitField, Collection, GuildBasedChannel, GuildMember } from 'discord.js';
import { WarningService } from '../services/WarningService';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import type { RateLimiter } from '../utils/RateLimiter';

describe('WarningService', () => {
  let mockClient: Client;
  let mockConfigService: GuildConfigService;
  let mockRateLimiter: RateLimiter;
  let mockLogger: any;
  let service: WarningService;

  beforeEach(() => {
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

    // Mock the GuildConfigService
    mockConfigService = {
      getConfig: vi.fn(),
    } as unknown as GuildConfigService;

    // Mock the RateLimiter
    mockRateLimiter = {
      recordAction: vi.fn(),
      getActionCount: vi.fn().mockReturnValue(0),
    } as unknown as RateLimiter;

    service = new WarningService(
      mockClient,
      mockConfigService,
      mockLogger,
      mockRateLimiter
    );
  });

  describe('sendWarning', () => {
    describe('permission checks before sending', () => {
      describe('when bot has SEND_MESSAGES permission', () => {
        it('should send warning message when bot has required permissions', async () => {
          const guildId = 'guild-123';
          const userId = 'user-456';
          const voiceChannelId = 'voice-789';
          const warningChannelId = 'warning-channel-101';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // Verify permission check was performed
          expect(mockWarningChannel.permissionsFor).toHaveBeenCalledWith(mockBotMember);

          // Verify message was sent
          expect(mockSend).toHaveBeenCalledTimes(1);
          expect(mockSend).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({
              data: expect.objectContaining({
                color: 0xFF9900,
                title: 'AFK Warning',
                description: expect.stringContaining(`<@${userId}>`),
              }),
            })],
          });

          // Verify success was logged
          expect(mockLogger.info).toHaveBeenCalledWith(
            { guildId, userId, channelId: voiceChannelId },
            'Warning sent to user'
          );

          // Verify no warning about permissions
          expect(mockLogger.warn).not.toHaveBeenCalledWith(
            expect.objectContaining({
              guildId,
              channelId: warningChannelId,
            }),
            expect.stringContaining('permission')
          );
        });

        it('should include correct warning duration in message', async () => {
          const guildId = 'guild-duration-test';
          const userId = 'user-duration';
          const voiceChannelId = 'voice-duration';
          const warningChannelId = 'warning-duration';
          const warningSecondsBefore = 120; // 2 minutes

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          expect(mockSend).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({
              data: expect.objectContaining({
                description: expect.stringContaining(`${warningSecondsBefore} seconds`),
              }),
            })],
          });
        });

        it('should mention voice channel in warning message when channel exists', async () => {
          const guildId = 'guild-mention-test';
          const userId = 'user-mention';
          const voiceChannelId = 'voice-mention-123';
          const warningChannelId = 'warning-mention';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockVoiceChannel = {
            id: voiceChannelId,
            type: ChannelType.GuildVoice,
          } as unknown as GuildBasedChannel;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);
          mockChannelCollection.set(voiceChannelId, mockVoiceChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          expect(mockSend).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({
              data: expect.objectContaining({
                description: expect.stringContaining(`<#${voiceChannelId}>`),
              }),
            })],
          });
        });

        it('should use generic text when voice channel not found', async () => {
          const guildId = 'guild-no-voice';
          const userId = 'user-no-voice';
          const voiceChannelId = 'voice-nonexistent';
          const warningChannelId = 'warning-no-voice';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);
          // voice channel NOT in collection

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          expect(mockSend).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({
              data: expect.objectContaining({
                description: expect.stringContaining('voice channel'),
              }),
            })],
          });

          // Should NOT contain channel mention
          expect(mockSend).toHaveBeenCalledWith({
            embeds: [expect.objectContaining({
              data: expect.objectContaining({
                description: expect.not.stringContaining(`<#${voiceChannelId}>`),
              }),
            })],
          });
        });
      });

      describe('when bot lacks SEND_MESSAGES permission', () => {
        it('should NOT send message when bot lacks SEND_MESSAGES permission', async () => {
          const guildId = 'guild-no-perms';
          const userId = 'user-no-perms';
          const voiceChannelId = 'voice-no-perms';
          const warningChannelId = 'warning-no-perms';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          // Bot has READ_MESSAGES but NOT SendMessages
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.ViewChannel]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // CRITICAL: Verify permission check was performed
          expect(mockWarningChannel.permissionsFor).toHaveBeenCalledWith(mockBotMember);

          // CRITICAL: Verify message was NOT sent
          expect(mockSend).not.toHaveBeenCalled();

          // CRITICAL: Verify info log was NOT called (message wasn't sent)
          expect(mockLogger.info).not.toHaveBeenCalled();
        });

        it('should log warning when SEND_MESSAGES permission is missing', async () => {
          const guildId = 'guild-log-test';
          const userId = 'user-log-test';
          const voiceChannelId = 'voice-log-test';
          const warningChannelId = 'warning-log-test';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          const mockPermissions = new PermissionsBitField([]); // No permissions
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // CRITICAL: Verify warning was logged with correct context
          expect(mockLogger.warn).toHaveBeenCalledWith(
            { guildId, channelId: warningChannelId },
            'Bot lacks SEND_MESSAGES permission in warning channel'
          );
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        });

        it('should NOT throw error when permission is missing', async () => {
          const guildId = 'guild-no-throw';
          const userId = 'user-no-throw';
          const voiceChannelId = 'voice-no-throw';
          const warningChannelId = 'warning-no-throw';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          const mockPermissions = new PermissionsBitField([]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          // CRITICAL: Should not throw
          await expect(
            service.sendWarning(guildId, userId, voiceChannelId)
          ).resolves.not.toThrow();

          // CRITICAL: Should return cleanly (undefined/void)
          const result = await service.sendWarning(guildId, userId, voiceChannelId);
          expect(result).toBeUndefined();
        });

        it('should handle bot having other permissions but not SEND_MESSAGES', async () => {
          const guildId = 'guild-other-perms';
          const userId = 'user-other-perms';
          const voiceChannelId = 'voice-other-perms';
          const warningChannelId = 'warning-other-perms';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          // Bot has many permissions, but not the one we need
          const mockPermissions = new PermissionsBitField([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            // Deliberately missing: PermissionFlagsBits.SendMessages
          ]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // Should NOT send despite having other permissions
          expect(mockSend).not.toHaveBeenCalled();
          expect(mockLogger.warn).toHaveBeenCalledWith(
            { guildId, channelId: warningChannelId },
            'Bot lacks SEND_MESSAGES permission in warning channel'
          );
        });
      });
    });

    describe('edge cases', () => {
      describe('when guild.members.me is null', () => {
        it('should handle gracefully when guild.members.me is null', async () => {
          const guildId = 'guild-null-member';
          const userId = 'user-null-member';
          const voiceChannelId = 'voice-null-member';
          const warningChannelId = 'warning-null-member';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(null), // Will return null because member is null
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: null, // CRITICAL: Bot member is null
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          // CRITICAL: Should not throw
          await expect(
            service.sendWarning(guildId, userId, voiceChannelId)
          ).resolves.not.toThrow();

          // Should NOT send message (can't verify permissions)
          expect(mockSend).not.toHaveBeenCalled();

          // Should log warning about missing permissions
          expect(mockLogger.warn).toHaveBeenCalledWith(
            { guildId, channelId: warningChannelId },
            'Bot lacks SEND_MESSAGES permission in warning channel'
          );
        });

        it('should NOT throw error when guild.members.me is null', async () => {
          const guildId = 'guild-null-no-throw';
          const userId = 'user-null-no-throw';
          const voiceChannelId = 'voice-null-no-throw';
          const warningChannelId = 'warning-null-no-throw';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: vi.fn(),
            permissionsFor: vi.fn().mockReturnValue(null),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: null,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          const result = await service.sendWarning(guildId, userId, voiceChannelId);

          // Should complete and return undefined
          expect(result).toBeUndefined();

          // Should NOT call error logger (this is expected behavior, not an error)
          expect(mockLogger.error).not.toHaveBeenCalled();
        });
      });

      describe('when permissionsFor returns null', () => {
        it('should handle gracefully when permissionsFor returns null', async () => {
          const guildId = 'guild-null-perms';
          const userId = 'user-null-perms';
          const voiceChannelId = 'voice-null-perms';
          const warningChannelId = 'warning-null-perms';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            // CRITICAL: permissionsFor explicitly returns null
            permissionsFor: vi.fn().mockReturnValue(null),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          // CRITICAL: Should not throw
          await expect(
            service.sendWarning(guildId, userId, voiceChannelId)
          ).resolves.not.toThrow();

          // Verify permissionsFor was called
          expect(mockWarningChannel.permissionsFor).toHaveBeenCalledWith(mockBotMember);

          // Should NOT send message (can't verify permissions)
          expect(mockSend).not.toHaveBeenCalled();

          // Should log warning
          expect(mockLogger.warn).toHaveBeenCalledWith(
            { guildId, channelId: warningChannelId },
            'Bot lacks SEND_MESSAGES permission in warning channel'
          );
        });

        it('should NOT throw error when permissionsFor returns null', async () => {
          const guildId = 'guild-perms-null-no-throw';
          const userId = 'user-perms-null';
          const voiceChannelId = 'voice-perms-null';
          const warningChannelId = 'warning-perms-null';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: vi.fn(),
            permissionsFor: vi.fn().mockReturnValue(null),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          const result = await service.sendWarning(guildId, userId, voiceChannelId);

          // Should complete and return undefined
          expect(result).toBeUndefined();

          // Should NOT call error logger
          expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it('should treat null permissions same as lacking SEND_MESSAGES', async () => {
          const guildId = 'guild-null-equals-no-perm';
          const userId = 'user-test';
          const voiceChannelId = 'voice-test';
          const warningChannelId = 'warning-test';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockSend = vi.fn();
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(null),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // Behavior should be identical to having no permissions:
          // 1. No message sent
          expect(mockSend).not.toHaveBeenCalled();

          // 2. Warning logged
          expect(mockLogger.warn).toHaveBeenCalledWith(
            { guildId, channelId: warningChannelId },
            'Bot lacks SEND_MESSAGES permission in warning channel'
          );

          // 3. No error thrown (completed successfully)
          // 4. No info log (message wasn't sent)
          expect(mockLogger.info).not.toHaveBeenCalled();
        });
      });

      describe('combined edge cases', () => {
        it('should handle undefined guild.members gracefully', async () => {
          const guildId = 'guild-no-members';
          const userId = 'user-no-members';
          const voiceChannelId = 'voice-no-members';
          const warningChannelId = 'warning-no-members';

          const config: GuildSettings = {
            guildId,
            enabled: true,
            afkTimeoutSeconds: 300,
            warningSecondsBefore: 60,
            warningChannelId,
            exemptRoleIds: [],
            adminRoleIds: [],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          };

          const mockWarningChannel = {
            id: warningChannelId,
            type: ChannelType.GuildText,
            send: vi.fn(),
            permissionsFor: vi.fn().mockReturnValue(null),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(warningChannelId, mockWarningChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            members: undefined, // Entire members object is undefined
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          // Should not throw
          await expect(
            service.sendWarning(guildId, userId, voiceChannelId)
          ).resolves.not.toThrow();

          // Implementation correctly logs error when guild.members is undefined
          expect(mockLogger.error).toHaveBeenCalledWith(
            expect.objectContaining({
              guildId,
              userId,
              voiceChannelId,
            }),
            'Failed to send warning'
          );
        });
      });
    });

    describe('error handling', () => {
      it('should catch and log errors when guild fetch fails', async () => {
        const guildId = 'guild-fetch-error';
        const userId = 'user-fetch-error';
        const voiceChannelId = 'voice-fetch-error';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: 'warning-channel',
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const fetchError = new Error('Guild not found');

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(fetchError);

        // Should not throw
        await expect(
          service.sendWarning(guildId, userId, voiceChannelId)
        ).resolves.not.toThrow();

        // Should log error
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: fetchError, guildId, userId, voiceChannelId },
          'Failed to send warning'
        );
      });

      it('should catch and log errors when message send fails', async () => {
        const guildId = 'guild-send-error';
        const userId = 'user-send-error';
        const voiceChannelId = 'voice-send-error';
        const warningChannelId = 'warning-send-error';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const sendError = new Error('Missing Access');
        const mockSend = vi.fn().mockRejectedValue(sendError);
        const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
        const mockBotMember = { id: 'bot-member-id' } as GuildMember;

        const mockWarningChannel = {
          id: warningChannelId,
          type: ChannelType.GuildText,
          send: mockSend,
          permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        } as unknown as TextChannel;

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        mockChannelCollection.set(warningChannelId, mockWarningChannel);

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          members: {
            me: mockBotMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        // Should not throw
        await expect(
          service.sendWarning(guildId, userId, voiceChannelId)
        ).resolves.not.toThrow();

        // Should log error
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: sendError, guildId, userId, voiceChannelId },
          'Failed to send warning'
        );
      });
    });

    describe('warning channel discovery', () => {
      it('should use configured warning channel when available', async () => {
        const guildId = 'guild-configured';
        const userId = 'user-configured';
        const voiceChannelId = 'voice-configured';
        const warningChannelId = 'warning-configured-123';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
        const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
        const mockBotMember = { id: 'bot-member-id' } as GuildMember;

        const mockWarningChannel = {
          id: warningChannelId,
          type: ChannelType.GuildText,
          send: mockSend,
          permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        } as unknown as TextChannel;

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        mockChannelCollection.set(warningChannelId, mockWarningChannel);

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          members: {
            me: mockBotMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        await service.sendWarning(guildId, userId, voiceChannelId);

        // Should use the configured channel
        expect(mockSend).toHaveBeenCalled();
      });

      it('should log warning when no warning channel is found', async () => {
        const guildId = 'guild-no-channel';
        const userId = 'user-no-channel';
        const voiceChannelId = 'voice-no-channel';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId: null,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        // No text channels in guild

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          systemChannel: null,
          members: {
            me: { id: 'bot-id' } as GuildMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        await service.sendWarning(guildId, userId, voiceChannelId);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          { guildId },
          'No warning channel found'
        );
      });
    });

    describe('rate limiting integration', () => {
      it('should record rate limiter actions when sending warning', async () => {
        const guildId = 'guild-rate-limit';
        const userId = 'user-rate-limit';
        const voiceChannelId = 'voice-rate-limit';
        const warningChannelId = 'warning-rate-limit';

        const config: GuildSettings = {
          guildId,
          enabled: true,
          afkTimeoutSeconds: 300,
          warningSecondsBefore: 60,
          warningChannelId,
          exemptRoleIds: [],
          adminRoleIds: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
        const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
        const mockBotMember = { id: 'bot-member-id' } as GuildMember;

        const mockWarningChannel = {
          id: warningChannelId,
          type: ChannelType.GuildText,
          send: mockSend,
          permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        } as unknown as TextChannel;

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        mockChannelCollection.set(warningChannelId, mockWarningChannel);

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          members: {
            me: mockBotMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        await service.sendWarning(guildId, userId, voiceChannelId);

        // Should record action twice: once for guild fetch, once for message send
        expect(mockRateLimiter.recordAction).toHaveBeenCalledTimes(2);
      });
    });
  });
});
