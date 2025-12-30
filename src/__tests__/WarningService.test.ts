import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Guild, TextChannel, ChannelType, PermissionFlagsBits, PermissionsBitField, Collection, GuildBasedChannel, GuildMember } from 'discord.js';
import { WarningService } from '../services/WarningService';
import { GuildConfigService } from '../services/GuildConfigService';
import type { RateLimiter } from '../utils/RateLimiter';
import { createMockLogger, createMockGuildSettings } from './fixtures';

describe('WarningService', () => {
  let mockClient: Client;
  let mockConfigService: GuildConfigService;
  let mockRateLimiter: RateLimiter;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let service: WarningService;

  beforeEach(() => {
    // Mock the logger
    mockLogger = createMockLogger();

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

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // Verify success was logged and no permission warnings
          expect(mockLogger.info).toHaveBeenCalled();
          expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should include correct warning duration in message', async () => {
          const guildId = 'guild-duration-test';
          const userId = 'user-duration';
          const voiceChannelId = 'voice-duration';
          const warningChannelId = 'warning-duration';
          const warningSecondsBefore = 120; // 2 minutes

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningSecondsBefore,
            warningChannelId,
          });

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

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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
        it.each([
          {
            scenario: 'bot lacks SEND_MESSAGES permission',
            setup: () => {
              const mockPermissions = new PermissionsBitField([PermissionFlagsBits.ViewChannel]);
              const mockBotMember = { id: 'bot-member-id' } as GuildMember;
              return { mockPermissions, mockBotMember };
            },
          },
          {
            scenario: 'bot has no permissions',
            setup: () => {
              const mockPermissions = new PermissionsBitField([]);
              const mockBotMember = { id: 'bot-member-id' } as GuildMember;
              return { mockPermissions, mockBotMember };
            },
          },
          {
            scenario: 'bot has other permissions but not SEND_MESSAGES',
            setup: () => {
              const mockPermissions = new PermissionsBitField([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
              ]);
              const mockBotMember = { id: 'bot-member-id' } as GuildMember;
              return { mockPermissions, mockBotMember };
            },
          },
          {
            scenario: 'permissionsFor returns null',
            setup: () => {
              const mockPermissions = null;
              const mockBotMember = { id: 'bot-member-id' } as GuildMember;
              return { mockPermissions, mockBotMember };
            },
          },
          {
            scenario: 'guild.members.me is null',
            setup: () => {
              const mockPermissions = null;
              const mockBotMember = null;
              return { mockPermissions, mockBotMember };
            },
          },
        ])('should fail gracefully when $scenario', async ({ setup }) => {
          const guildId = 'guild-test';
          const userId = 'user-test';
          const voiceChannelId = 'voice-test';
          const warningChannelId = 'warning-test';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

          const { mockPermissions, mockBotMember } = setup();
          const mockSend = vi.fn();

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

          // Should NOT send message
          expect(mockSend).not.toHaveBeenCalled();

          // Should log warning
          expect(mockLogger.warn).toHaveBeenCalled();

          // Should NOT log success
          expect(mockLogger.info).not.toHaveBeenCalled();
        });
      });
    });

    describe('edge cases', () => {
      it('should handle undefined guild.members gracefully', async () => {
        const guildId = 'guild-no-members';
        const userId = 'user-no-members';
        const voiceChannelId = 'voice-no-members';
        const warningChannelId = 'warning-no-members';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId,
        });

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
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should catch and log errors when guild fetch fails', async () => {
        const guildId = 'guild-fetch-error';
        const userId = 'user-fetch-error';
        const voiceChannelId = 'voice-fetch-error';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId: 'warning-channel',
        });

        const fetchError = new Error('Guild not found');

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockRejectedValue(fetchError);

        // Should not throw
        await expect(
          service.sendWarning(guildId, userId, voiceChannelId)
        ).resolves.not.toThrow();

        // Should log error
        expect(mockLogger.error).toHaveBeenCalled();
      });

      it('should catch and log errors when message send fails', async () => {
        const guildId = 'guild-send-error';
        const userId = 'user-send-error';
        const voiceChannelId = 'voice-send-error';
        const warningChannelId = 'warning-send-error';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId,
        });

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
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('warning channel discovery', () => {
      it('should use configured warning channel when available', async () => {
        const guildId = 'guild-configured';
        const userId = 'user-configured';
        const voiceChannelId = 'voice-configured';
        const warningChannelId = 'warning-configured-123';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId,
        });

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

      it('should fall back to systemChannel when warningChannelId is null', async () => {
        const guildId = 'guild-system-fallback';
        const userId = 'user-system-fallback';
        const voiceChannelId = 'voice-system-fallback';
        const systemChannelId = 'system-channel-123';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId: null, // No configured channel
        });

        const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
        const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
        const mockBotMember = { id: 'bot-member-id' } as GuildMember;

        const mockSystemChannel = {
          id: systemChannelId,
          type: ChannelType.GuildText,
          send: mockSend,
          permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        } as unknown as TextChannel;

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        mockChannelCollection.set(systemChannelId, mockSystemChannel);

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          systemChannel: mockSystemChannel,
          members: {
            me: mockBotMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        await service.sendWarning(guildId, userId, voiceChannelId);

        // Verify message was sent to systemChannel
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend).toHaveBeenCalledWith({
          embeds: [expect.objectContaining({
            data: expect.objectContaining({
              color: 0xFF9900,
              title: 'AFK Warning',
            }),
          })],
        });

        // Verify success was logged
        expect(mockLogger.info).toHaveBeenCalled();
      });

      it('should fall back to first text channel when systemChannel unavailable', async () => {
        const guildId = 'guild-first-channel-fallback';
        const userId = 'user-first-channel';
        const voiceChannelId = 'voice-first-channel';
        const firstTextChannelId = 'first-text-channel-456';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId: null, // No configured channel
        });

        const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
        const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
        const mockBotMember = { id: 'bot-member-id' } as GuildMember;

        const mockVoiceChannel = {
          id: 'voice-other',
          type: ChannelType.GuildVoice,
        } as unknown as GuildBasedChannel;

        const mockFirstTextChannel = {
          id: firstTextChannelId,
          type: ChannelType.GuildText,
          send: mockSend,
          permissionsFor: vi.fn().mockReturnValue(mockPermissions),
        } as unknown as TextChannel;

        const mockChannelCollection = new Collection<string, GuildBasedChannel>();
        // Add voice channel first to ensure we're finding the first TEXT channel
        mockChannelCollection.set('voice-other', mockVoiceChannel);
        mockChannelCollection.set(firstTextChannelId, mockFirstTextChannel);

        const mockGuild = {
          id: guildId,
          channels: {
            cache: mockChannelCollection,
          },
          systemChannel: null,
          members: {
            me: mockBotMember,
          },
        } as unknown as Guild;

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

        await service.sendWarning(guildId, userId, voiceChannelId);

        // Verify message was sent to first text channel
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend).toHaveBeenCalledWith({
          embeds: [expect.objectContaining({
            data: expect.objectContaining({
              color: 0xFF9900,
              title: 'AFK Warning',
            }),
          })],
        });

        // Verify success was logged
        expect(mockLogger.info).toHaveBeenCalled();
      });

      it('should log warning when no warning channel is found', async () => {
        const guildId = 'guild-no-channel';
        const userId = 'user-no-channel';
        const voiceChannelId = 'voice-no-channel';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId: null,
        });

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

        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });

    describe('rate limiting integration', () => {
      it('should record rate limiter actions when sending warning', async () => {
        const guildId = 'guild-rate-limit';
        const userId = 'user-rate-limit';
        const voiceChannelId = 'voice-rate-limit';
        const warningChannelId = 'warning-rate-limit';

        const config = createMockGuildSettings({
          guildId,
          enabled: true,
          warningChannelId,
        });

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

    describe('debug logging (WU-5)', () => {
      describe('warning start logging', () => {
        it('should log warning start with action warning_start', async () => {
          const guildId = 'guild-debug-1';
          const userId = 'user-debug-1';
          const voiceChannelId = 'voice-debug-1';
          const warningChannelId = 'warning-debug-1';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST log the start of warning process with action field
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'warning_start',
              guildId,
              userId,
              voiceChannelId,
            }),
            expect.any(String)
          );
        });

        it('should log warning_start before any other debug logs', async () => {
          const guildId = 'guild-order-test';
          const userId = 'user-order-test';
          const voiceChannelId = 'voice-order-test';
          const warningChannelId = 'warning-order-test';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // First debug call MUST be warning_start
          const firstDebugCall = mockLogger.debug.mock.calls[0];
          if (firstDebugCall) {
            expect(firstDebugCall[0]).toMatchObject({
              action: 'warning_start',
            });
          }
        });
      });

      describe('channel resolution logging', () => {
        it('should log channel resolution with source=configured when using configured channel', async () => {
          const guildId = 'guild-configured-log';
          const userId = 'user-configured-log';
          const voiceChannelId = 'voice-configured-log';
          const warningChannelId = 'warning-configured-log';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST log which channel resolution strategy was used
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              source: 'configured',
              channelId: warningChannelId,
            }),
            expect.any(String)
          );
        });

        it('should log channel resolution with source=system when falling back to system channel', async () => {
          const guildId = 'guild-system-log';
          const userId = 'user-system-log';
          const voiceChannelId = 'voice-system-log';
          const systemChannelId = 'system-channel-log';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId: null, // No configured channel
          });

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockSystemChannel = {
            id: systemChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set(systemChannelId, mockSystemChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            systemChannel: mockSystemChannel,
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // MUST log system channel fallback
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              source: 'system',
              channelId: systemChannelId,
            }),
            expect.any(String)
          );
        });

        it('should log channel resolution with source=first_text when using first text channel', async () => {
          const guildId = 'guild-first-text-log';
          const userId = 'user-first-text-log';
          const voiceChannelId = 'voice-first-text-log';
          const firstTextChannelId = 'first-text-log-456';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId: null, // No configured channel
          });

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockVoiceChannel = {
            id: 'voice-other-log',
            type: ChannelType.GuildVoice,
          } as unknown as GuildBasedChannel;

          const mockFirstTextChannel = {
            id: firstTextChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          mockChannelCollection.set('voice-other-log', mockVoiceChannel);
          mockChannelCollection.set(firstTextChannelId, mockFirstTextChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            systemChannel: null,
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // MUST log first text channel fallback
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              source: 'first_text',
              channelId: firstTextChannelId,
            }),
            expect.any(String)
          );
        });

        it('should log channel resolution failure when no channel found', async () => {
          const guildId = 'guild-no-channel-log';
          const userId = 'user-no-channel-log';
          const voiceChannelId = 'voice-no-channel-log';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId: null,
          });

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

          // MUST log channel resolution failure
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              source: 'none',
            }),
            expect.any(String)
          );
        });

        it('should log when configured channel not found and falls back', async () => {
          const guildId = 'guild-configured-missing';
          const userId = 'user-configured-missing';
          const voiceChannelId = 'voice-configured-missing';
          const warningChannelId = 'warning-nonexistent';
          const systemChannelId = 'system-fallback-456';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId, // Configured but doesn't exist
          });

          const mockSend = vi.fn().mockResolvedValue({ id: 'message-123' });
          const mockPermissions = new PermissionsBitField([PermissionFlagsBits.SendMessages]);
          const mockBotMember = { id: 'bot-member-id' } as GuildMember;

          const mockSystemChannel = {
            id: systemChannelId,
            type: ChannelType.GuildText,
            send: mockSend,
            permissionsFor: vi.fn().mockReturnValue(mockPermissions),
          } as unknown as TextChannel;

          const mockChannelCollection = new Collection<string, GuildBasedChannel>();
          // Configured channel NOT in collection
          mockChannelCollection.set(systemChannelId, mockSystemChannel);

          const mockGuild = {
            id: guildId,
            channels: {
              cache: mockChannelCollection,
            },
            systemChannel: mockSystemChannel,
            members: {
              me: mockBotMember,
            },
          } as unknown as Guild;

          vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
          vi.mocked(mockClient.guilds.fetch).mockResolvedValue(mockGuild);

          await service.sendWarning(guildId, userId, voiceChannelId);

          // MUST log that configured channel was not found
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              configuredChannelId: warningChannelId,
              configuredChannelFound: false,
            }),
            expect.any(String)
          );

          // MUST also log the fallback resolution
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'channel_resolve',
              source: 'system',
              channelId: systemChannelId,
            }),
            expect.any(String)
          );
        });
      });

      describe('permission check logging', () => {
        it('should log permission check with action=permission_check when bot has permissions', async () => {
          const guildId = 'guild-perm-log-yes';
          const userId = 'user-perm-log-yes';
          const voiceChannelId = 'voice-perm-log-yes';
          const warningChannelId = 'warning-perm-log-yes';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST log permission check result
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'permission_check',
              channelId: warningChannelId,
              hasPermission: true,
            }),
            expect.any(String)
          );
        });

        it('should log permission check with hasPermission=false when lacking permissions', async () => {
          const guildId = 'guild-perm-log-no';
          const userId = 'user-perm-log-no';
          const voiceChannelId = 'voice-perm-log-no';
          const warningChannelId = 'warning-perm-log-no';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

          const mockSend = vi.fn();
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

          // MUST log permission check failure
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'permission_check',
              channelId: warningChannelId,
              hasPermission: false,
            }),
            expect.any(String)
          );
        });

        it('should log permission check when permissionsFor returns null', async () => {
          const guildId = 'guild-perm-null';
          const userId = 'user-perm-null';
          const voiceChannelId = 'voice-perm-null';
          const warningChannelId = 'warning-perm-null';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST log when permissions cannot be determined
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'permission_check',
              channelId: warningChannelId,
              hasPermission: false,
              permissionsNull: true,
            }),
            expect.any(String)
          );
        });
      });

      describe('message send logging', () => {
        it('should log message send attempt with action=message_send', async () => {
          const guildId = 'guild-send-log';
          const userId = 'user-send-log';
          const voiceChannelId = 'voice-send-log';
          const warningChannelId = 'warning-send-log';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST log message send attempt BEFORE actually sending
          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'message_send',
              channelId: warningChannelId,
              userId,
              voiceChannelId,
            }),
            expect.any(String)
          );
        });

        it('should log message send attempt occurs after permission check', async () => {
          const guildId = 'guild-send-order';
          const userId = 'user-send-order';
          const voiceChannelId = 'voice-send-order';
          const warningChannelId = 'warning-send-order';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // Find indices of permission_check and message_send debug calls
          const debugCalls = mockLogger.debug.mock.calls;
          const permissionCheckIndex = debugCalls.findIndex(
            (call) => call[0]?.action === 'permission_check'
          );
          const messageSendIndex = debugCalls.findIndex(
            (call) => call[0]?.action === 'message_send'
          );

          // MUST log permission_check before message_send
          expect(permissionCheckIndex).toBeGreaterThanOrEqual(0);
          expect(messageSendIndex).toBeGreaterThanOrEqual(0);
          expect(permissionCheckIndex).toBeLessThan(messageSendIndex);
        });

        it('should not log message_send when permission check fails', async () => {
          const guildId = 'guild-no-send-log';
          const userId = 'user-no-send-log';
          const voiceChannelId = 'voice-no-send-log';
          const warningChannelId = 'warning-no-send-log';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

          const mockSend = vi.fn();
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

          // MUST NOT log message_send when permissions are lacking
          const debugCalls = mockLogger.debug.mock.calls;
          const messageSendCall = debugCalls.find(
            (call) => call[0]?.action === 'message_send'
          );
          expect(messageSendCall).toBeUndefined();
        });
      });

      describe('complete debug logging flow', () => {
        it('should log all debug actions in correct order for successful warning', async () => {
          const guildId = 'guild-complete-flow';
          const userId = 'user-complete-flow';
          const voiceChannelId = 'voice-complete-flow';
          const warningChannelId = 'warning-complete-flow';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
          });

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

          // MUST have all four debug log actions in correct order
          const debugCalls = mockLogger.debug.mock.calls;
          const actions = debugCalls.map((call) => call[0]?.action);

          const warningStartIndex = actions.indexOf('warning_start');
          const channelResolveIndex = actions.indexOf('channel_resolve');
          const permissionCheckIndex = actions.indexOf('permission_check');
          const messageSendIndex = actions.indexOf('message_send');

          // All actions must be present
          expect(warningStartIndex).toBeGreaterThanOrEqual(0);
          expect(channelResolveIndex).toBeGreaterThanOrEqual(0);
          expect(permissionCheckIndex).toBeGreaterThanOrEqual(0);
          expect(messageSendIndex).toBeGreaterThanOrEqual(0);

          // Actions must occur in order
          expect(warningStartIndex).toBeLessThan(channelResolveIndex);
          expect(channelResolveIndex).toBeLessThan(permissionCheckIndex);
          expect(permissionCheckIndex).toBeLessThan(messageSendIndex);
        });

        it('should include all context fields in debug logs', async () => {
          const guildId = 'guild-context-test';
          const userId = 'user-context-test';
          const voiceChannelId = 'voice-context-test';
          const warningChannelId = 'warning-context-test';

          const config = createMockGuildSettings({
            guildId,
            enabled: true,
            warningChannelId,
            warningSecondsBefore: 90,
          });

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

          // All debug logs should include guildId context
          const debugCalls = mockLogger.debug.mock.calls;
          debugCalls.forEach((call) => {
            expect(call[0]).toHaveProperty('guildId', guildId);
          });

          // message_send should include all relevant IDs
          const messageSendCall = debugCalls.find(
            (call) => call[0]?.action === 'message_send'
          );
          expect(messageSendCall?.[0]).toMatchObject({
            action: 'message_send',
            guildId,
            userId,
            voiceChannelId,
            channelId: warningChannelId,
          });
        });
      });
    });
  });
});
