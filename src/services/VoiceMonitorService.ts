import { VoiceBasedChannel, Client, Guild } from 'discord.js';
import { Logger } from 'pino';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { GuildConfigService } from './GuildConfigService';
import { MIN_USERS_FOR_AFK_TRACKING } from './AFKDetectionService';
import { RateLimiter } from '../utils/RateLimiter';

export class VoiceMonitorService {
  constructor(
    private connectionManager: VoiceConnectionManager,
    private guildConfig: GuildConfigService,
    private client: Client,
    private logger: Logger,
    private rateLimiter: RateLimiter
  ) {}

  async handleUserJoin(channel: VoiceBasedChannel): Promise<void> {
    const guildId = channel.guild.id;
    const channelId = channel.id;

    const config = this.guildConfig.getConfig(guildId);
    if (!config.enabled) {
      this.logger.debug({ guildId, channelId }, 'Guild monitoring not enabled');
      return;
    }

    const isAlreadyInChannel = this.connectionManager.hasConnection(guildId);
    if (isAlreadyInChannel) {
      this.logger.debug({ guildId, channelId }, 'Bot already in this channel');
      return;
    }

    this.logger.info({ guildId, channelId }, 'Joining voice channel');
    await this.connectionManager.joinChannel(channel);
  }

  async handleUserLeave(guildId: string, channelId: string): Promise<void> {
    const isChannelEmpty = await this.isChannelEmpty(guildId, channelId);
    if (!isChannelEmpty) {
      this.logger.debug({ guildId, channelId }, 'Channel still has users, staying connected');
      return;
    }

    this.logger.info({ guildId, channelId }, 'Channel empty, leaving voice channel');
    await this.connectionManager.leaveChannel(guildId);
  }

  async scanGuild(guild: Guild): Promise<void> {
    try {
      const guildId = guild.id;
      const config = this.guildConfig.getConfig(guildId);

      if (!config.enabled) {
        this.logger.debug({ guildId }, 'Guild monitoring not enabled, skipping scan');
        return;
      }

      // Fetch all channels in the guild
      this.rateLimiter.recordAction();
      const channels = await guild.channels.fetch();

      // Filter to voice-based channels with 2+ non-bot members
      const eligibleChannels = channels.filter((channel): channel is VoiceBasedChannel => {
        if (channel === null) return false;
        if (!channel.isVoiceBased()) return false;
        const nonBotCount = channel.members.filter(m => !m.user.bot).size;
        return nonBotCount >= MIN_USERS_FOR_AFK_TRACKING;
      });

      if (eligibleChannels.size === 0) {
        this.logger.debug(
          { guildId },
          'No voice channels with sufficient members found during scan'
        );
        return;
      }

      // Check if already connected to this guild
      if (this.connectionManager.hasConnection(guildId)) {
        this.logger.debug({ guildId }, 'Bot already connected to guild, skipping scan');
        return;
      }

      // Join the first matching channel
      const firstChannel = eligibleChannels.first();
      if (firstChannel) {
        this.logger.info(
          { guildId, channelId: firstChannel.id, channelName: firstChannel.name },
          'Joining voice channel during guild scan'
        );
        await this.connectionManager.joinChannel(firstChannel);
      }
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          guildId: guild.id,
          guildName: guild.name
        },
        'Error scanning guild for voice channels'
      );
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing VoiceMonitorService');

    // Scan all guilds for active voice channels
    for (const [guildId, guild] of this.client.guilds.cache) {
      try {
        await this.scanGuild(guild);
      } catch (error) {
        this.logger.error(
          {
            error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
            guildId,
            guildName: guild.name
          },
          'Error during guild scan in initialization'
        );
        // Continue with other guilds even if one fails
      }
    }

    this.logger.info('VoiceMonitorService initialization complete');
  }

  private async isChannelEmpty(guildId: string, channelId: string): Promise<boolean> {
    try {
      this.rateLimiter.recordAction();
      const guild = await this.client.guilds.fetch(guildId);
      this.rateLimiter.recordAction();
      const channel = await guild.channels.fetch(channelId);

      if (!channel?.isVoiceBased()) {
        this.logger.warn({ guildId, channelId }, 'Channel not found or not voice-based');
        return true;
      }

      const nonBotMembers = channel.members.filter(member => !member.user.bot);
      const isEmpty = nonBotMembers.size === 0;

      this.logger.debug(
        { guildId, channelId, memberCount: nonBotMembers.size },
        `Channel empty check: ${isEmpty}`
      );

      return isEmpty;
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          guildId,
          channelId
        },
        'Error checking if channel is empty'
      );
      return true;
    }
  }
}
