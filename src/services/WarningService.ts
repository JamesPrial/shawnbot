import { Client, EmbedBuilder, TextChannel, ChannelType, Guild, GuildBasedChannel, PermissionFlagsBits } from 'discord.js';
import type { Logger } from 'pino';
import { GuildConfigService } from './GuildConfigService';
import { RateLimiter } from '../utils/RateLimiter';

export class WarningService {
  private client: Client;
  private configService: GuildConfigService;
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor(client: Client, configService: GuildConfigService, logger: Logger, rateLimiter: RateLimiter) {
    this.client = client;
    this.configService = configService;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  async sendWarning(guildId: string, userId: string, voiceChannelId: string): Promise<void> {
    this.logger.debug({ guildId, userId, voiceChannelId, action: 'warning_start' }, 'Starting to send AFK warning');

    try {
      const config = this.configService.getConfig(guildId);
      this.rateLimiter.recordAction('client.guilds.fetch');
      const guild = await this.client.guilds.fetch(guildId);

      if (!guild) {
        this.logger.error({ guildId }, 'Guild not found for warning');
        return;
      }

      const warningChannel = await this.findWarningChannel(guild, config.warningChannelId, guildId);

      if (!warningChannel) {
        this.logger.warn({ guildId }, 'No warning channel found');
        return;
      }

      // Check if bot has SEND_MESSAGES permission in the warning channel
      const botMember = guild.members.me;
      if (!botMember) {
        this.logger.warn({ guildId }, 'Bot member not cached in guild');
        return;
      }
      const botPermissions = warningChannel.permissionsFor(botMember);
      const hasPermission = botPermissions?.has(PermissionFlagsBits.SendMessages) ?? false;
      const permissionsNull = botPermissions === null;

      this.logger.debug(
        {
          guildId,
          channelId: warningChannel.id,
          action: 'permission_check',
          hasPermission,
          ...(permissionsNull && { permissionsNull: true })
        },
        'Checking bot permissions in warning channel'
      );

      if (!hasPermission) {
        this.logger.warn(
          { guildId, channelId: warningChannel.id },
          'Bot lacks SEND_MESSAGES permission in warning channel'
        );
        return;
      }

      const voiceChannel = guild.channels.cache.get(voiceChannelId);
      const voiceChannelMention = voiceChannel ? `<#${voiceChannelId}>` : 'voice channel';

      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('AFK Warning')
        .setDescription(
          `<@${userId}> you will be disconnected from ${voiceChannelMention} in ${config.warningSecondsBefore} seconds due to inactivity.`
        )
        .setTimestamp();

      this.logger.debug({ guildId, channelId: warningChannel.id, userId, voiceChannelId, action: 'message_send' }, 'Sending warning message');

      this.rateLimiter.recordAction('channel.send');
      await warningChannel.send({ embeds: [embed] });

      this.logger.info(
        { guildId, userId, channelId: voiceChannelId },
        'Warning sent to user'
      );
    } catch (error) {
      this.logger.error(
        { error, guildId, userId, voiceChannelId },
        'Failed to send warning'
      );
    }
  }

  private async findWarningChannel(guild: Guild, warningChannelId: string | null, guildId: string): Promise<TextChannel | null> {
    if (warningChannelId) {
      const channel = guild.channels.cache.get(warningChannelId);
      if (channel && channel.type === ChannelType.GuildText) {
        this.logger.debug({ guildId, channelId: warningChannelId, action: 'channel_resolve', source: 'configured' }, 'Using configured warning channel');
        return channel as TextChannel;
      }
      // Configured channel not found - log and fall back
      this.logger.debug(
        { guildId, configuredChannelId: warningChannelId, configuredChannelFound: false, action: 'channel_resolve' },
        'Configured warning channel not found, falling back'
      );
    }

    if (guild.systemChannel && guild.systemChannel.type === ChannelType.GuildText) {
      this.logger.debug({ guildId, channelId: guild.systemChannel.id, action: 'channel_resolve', source: 'system' }, 'Using system channel as warning channel');
      return guild.systemChannel as TextChannel;
    }

    const firstTextChannel = guild.channels.cache.find(
      (channel: GuildBasedChannel) => channel.type === ChannelType.GuildText
    );

    if (firstTextChannel) {
      this.logger.debug({ guildId, channelId: firstTextChannel.id, action: 'channel_resolve', source: 'first_text' }, 'Using first text channel as warning channel');
      return firstTextChannel as TextChannel;
    }

    // No channel found at all
    this.logger.debug({ guildId, action: 'channel_resolve', source: 'none' }, 'No warning channel found');
    return null;
  }
}
