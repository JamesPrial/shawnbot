import { VoiceBasedChannel, Client } from 'discord.js';
import { Logger } from 'pino';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { GuildConfigService } from './GuildConfigService';

export class VoiceMonitorService {
  constructor(
    private connectionManager: VoiceConnectionManager,
    private guildConfig: GuildConfigService,
    private client: Client,
    private logger: Logger
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

  async initialize(): Promise<void> {
    this.logger.info('Initializing VoiceMonitorService');
    // Placeholder for startup recovery logic
    // Future implementation will:
    // - Scan all guilds
    // - Find users in voice channels
    // - Join channels and start tracking
    this.logger.info('VoiceMonitorService initialization complete');
  }

  private async isChannelEmpty(guildId: string, channelId: string): Promise<boolean> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
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
        { error, guildId, channelId },
        'Error checking if channel is empty'
      );
      return true;
    }
  }
}
