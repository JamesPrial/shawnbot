import { VoiceBasedChannel, Client, Guild } from 'discord.js';
import { Logger } from 'pino';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { GuildConfigService } from './GuildConfigService';
import { MIN_USERS_FOR_AFK_TRACKING } from './AFKDetectionService';
import { RateLimiter } from '../utils/RateLimiter';
import { formatError } from '../utils/errorUtils';

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
    const memberCount = channel.members.filter(m => !m.user.bot).size;

    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId, channelId, action: 'user_join', memberCount },
        'Handling user join to voice channel'
      );
    }

    const config = this.guildConfig.getConfig(guildId);
    if (!config.enabled) {
      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug({ guildId, channelId }, 'Guild monitoring not enabled');
      }
      return;
    }

    const isAlreadyInChannel = this.connectionManager.hasConnection(guildId);
    if (isAlreadyInChannel) {
      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug({ guildId, channelId }, 'Bot already in this channel');
      }
      return;
    }

    this.logger.info({ guildId, channelId }, 'Joining voice channel');
    await this.connectionManager.joinChannel(channel);
  }

  async handleUserLeave(guildId: string, channelId: string): Promise<void> {
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { guildId, channelId, action: 'user_leave' },
        'Handling user leave from voice channel'
      );
    }

    const isChannelEmpty = await this.isChannelEmpty(guildId, channelId);
    if (!isChannelEmpty) {
      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug({ guildId, channelId }, 'Channel still has users, staying connected');
      }
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
        if (this.logger.isLevelEnabled('debug')) {
          this.logger.debug({ guildId }, 'Guild monitoring not enabled, skipping scan');
        }
        return;
      }

      // Fetch all channels in the guild
      this.rateLimiter.recordAction('guild.channels.fetch');
      const channels = await guild.channels.fetch();

      const voiceChannelCount = channels.filter(
        (channel) => channel?.isVoiceBased()
      ).size;

      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug(
          { guildId, action: 'guild_scan', voiceChannelCount },
          'Scanning guild for active voice channels'
        );
      }

      // Filter to voice-based channels with 2+ non-bot members
      const eligibleChannels = channels.filter((channel): channel is VoiceBasedChannel => {
        if (channel === null) return false;
        if (!channel.isVoiceBased()) return false;
        const nonBotCount = channel.members.filter(m => !m.user.bot).size;
        const shouldTrack = nonBotCount >= MIN_USERS_FOR_AFK_TRACKING;

        if (this.logger.isLevelEnabled('debug')) {
          this.logger.debug(
            {
              guildId,
              channelId: channel.id,
              action: 'threshold_check',
              nonBotCount,
              threshold: MIN_USERS_FOR_AFK_TRACKING,
              result: shouldTrack
            },
            'Threshold check for AFK tracking'
          );
        }

        return shouldTrack;
      });

      if (eligibleChannels.size === 0) {
        if (this.logger.isLevelEnabled('debug')) {
          this.logger.debug(
            { guildId },
            'No voice channels with sufficient members found during scan'
          );
        }
        return;
      }

      // Check if already connected to this guild
      if (this.connectionManager.hasConnection(guildId)) {
        if (this.logger.isLevelEnabled('debug')) {
          this.logger.debug({ guildId }, 'Bot already connected to guild, skipping scan');
        }
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
          error: formatError(error),
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
            error: formatError(error),
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
      this.rateLimiter.recordAction('client.guilds.fetch');
      const guild = await this.client.guilds.fetch(guildId);
      this.rateLimiter.recordAction('guild.channels.fetch');
      const channel = await guild.channels.fetch(channelId);

      if (!channel?.isVoiceBased()) {
        this.logger.warn({ guildId, channelId }, 'Channel not found or not voice-based');
        return true;
      }

      const nonBotMembers = channel.members.filter(member => !member.user.bot);
      const isEmpty = nonBotMembers.size === 0;

      if (this.logger.isLevelEnabled('debug')) {
        this.logger.debug(
          { guildId, channelId, memberCount: nonBotMembers.size },
          `Channel empty check: ${isEmpty}`
        );
      }

      return isEmpty;
    } catch (error) {
      this.logger.error(
        {
          error: formatError(error),
          guildId,
          channelId
        },
        'Error checking if channel is empty'
      );
      return true;
    }
  }
}
