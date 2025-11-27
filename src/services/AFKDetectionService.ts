import { Client } from 'discord.js';
import type { Logger } from 'pino';
import { WarningService } from './WarningService';
import { GuildConfigService } from './GuildConfigService';

interface UserTrackingState {
  userId: string;
  guildId: string;
  channelId: string;
  warningTimer: NodeJS.Timeout | null;
  kickTimer: NodeJS.Timeout | null;
  warned: boolean;
}

export class AFKDetectionService {
  private warningService: WarningService;
  private configService: GuildConfigService;
  private client: Client;
  private logger: Logger;
  private tracking: Map<string, UserTrackingState>;

  constructor(
    warningService: WarningService,
    configService: GuildConfigService,
    client: Client,
    logger: Logger
  ) {
    this.warningService = warningService;
    this.configService = configService;
    this.client = client;
    this.logger = logger;
    this.tracking = new Map();
  }

  startTracking(guildId: string, userId: string, channelId: string): void {
    const key = this.getTrackingKey(guildId, userId);

    this.stopTracking(guildId, userId);

    const config = this.configService.getConfig(guildId);

    if (!config.enabled) {
      return;
    }

    const warningTimeMs = (config.afkTimeoutSeconds - config.warningSecondsBefore) * 1000;
    const kickTimeMs = config.afkTimeoutSeconds * 1000;

    const warningTimer = setTimeout(() => {
      this.handleWarning(key);
    }, warningTimeMs);

    const kickTimer = setTimeout(() => {
      this.handleKick(key);
    }, kickTimeMs);

    this.tracking.set(key, {
      userId,
      guildId,
      channelId,
      warningTimer,
      kickTimer,
      warned: false,
    });

    this.logger.debug(
      { guildId, userId, channelId, warningTimeMs, kickTimeMs },
      'Started tracking user for AFK'
    );
  }

  resetTimer(guildId: string, userId: string): void {
    const key = this.getTrackingKey(guildId, userId);
    const state = this.tracking.get(key);

    if (!state) {
      return;
    }

    this.logger.debug({ guildId, userId }, 'User activity detected, resetting timer');

    this.startTracking(guildId, userId, state.channelId);
  }

  stopTracking(guildId: string, userId: string): void {
    const key = this.getTrackingKey(guildId, userId);
    const state = this.tracking.get(key);

    if (!state) {
      return;
    }

    if (state.warningTimer) {
      clearTimeout(state.warningTimer);
    }

    if (state.kickTimer) {
      clearTimeout(state.kickTimer);
    }

    this.tracking.delete(key);

    this.logger.debug({ guildId, userId }, 'Stopped tracking user');
  }

  isTracking(guildId: string, userId: string): boolean {
    const key = this.getTrackingKey(guildId, userId);
    return this.tracking.has(key);
  }

  private async handleWarning(key: string): Promise<void> {
    const state = this.tracking.get(key);

    if (!state) {
      return;
    }

    try {
      await this.warningService.sendWarning(state.guildId, state.userId, state.channelId);
      state.warned = true;

      this.logger.info(
        { guildId: state.guildId, userId: state.userId },
        'Warning sent for AFK user'
      );
    } catch (error) {
      this.logger.error(
        { error, guildId: state.guildId, userId: state.userId },
        'Failed to send warning'
      );
    }
  }

  private async handleKick(key: string): Promise<void> {
    const state = this.tracking.get(key);

    if (!state) {
      return;
    }

    try {
      const guild = await this.client.guilds.fetch(state.guildId);
      const member = await guild.members.fetch(state.userId);

      if (member.voice.channel) {
        await member.voice.disconnect('AFK timeout');

        this.logger.info(
          { guildId: state.guildId, userId: state.userId, channelId: state.channelId },
          'User disconnected due to AFK timeout'
        );
      } else {
        this.logger.debug(
          { guildId: state.guildId, userId: state.userId },
          'User already disconnected when kick timer fired'
        );
      }
    } catch (error) {
      this.logger.error(
        { error, guildId: state.guildId, userId: state.userId },
        'Failed to kick AFK user'
      );
    } finally {
      this.tracking.delete(key);
    }
  }

  private getTrackingKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }
}
