import { Client, EmbedBuilder, TextChannel, ChannelType, Guild, GuildBasedChannel } from 'discord.js';
import type { Logger } from 'pino';
import { GuildConfigService } from './GuildConfigService';

export class WarningService {
  private client: Client;
  private configService: GuildConfigService;
  private logger: Logger;

  constructor(client: Client, configService: GuildConfigService, logger: Logger) {
    this.client = client;
    this.configService = configService;
    this.logger = logger;
  }

  async sendWarning(guildId: string, userId: string, voiceChannelId: string): Promise<void> {
    try {
      const config = this.configService.getConfig(guildId);
      const guild = await this.client.guilds.fetch(guildId);

      if (!guild) {
        this.logger.error({ guildId }, 'Guild not found for warning');
        return;
      }

      const warningChannel = await this.findWarningChannel(guild, config.warningChannelId);

      if (!warningChannel) {
        this.logger.warn({ guildId }, 'No warning channel found');
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

  private async findWarningChannel(guild: Guild, warningChannelId: string | null): Promise<TextChannel | null> {
    if (warningChannelId) {
      const channel = guild.channels.cache.get(warningChannelId);
      if (channel && channel.type === ChannelType.GuildText) {
        return channel as TextChannel;
      }
    }

    if (guild.systemChannel && guild.systemChannel.type === ChannelType.GuildText) {
      return guild.systemChannel as TextChannel;
    }

    const firstTextChannel = guild.channels.cache.find(
      (channel: GuildBasedChannel) => channel.type === ChannelType.GuildText
    );

    return firstTextChannel ? (firstTextChannel as TextChannel) : null;
  }
}
