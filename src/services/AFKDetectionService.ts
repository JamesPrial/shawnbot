import { Client } from 'discord.js';
import type { Logger } from 'pino';
import { WarningService } from './WarningService';
import { GuildConfigService } from './GuildConfigService';
import { RateLimiter } from '../utils/RateLimiter';

export const MIN_USERS_FOR_AFK_TRACKING = 2;

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
  private rateLimiter: RateLimiter;
  private tracking: Map<string, UserTrackingState>;

  constructor(
    warningService: WarningService,
    configService: GuildConfigService,
    client: Client,
    logger: Logger,
    rateLimiter: RateLimiter
  ) {
    this.warningService = warningService;
    this.configService = configService;
    this.client = client;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.tracking = new Map();
  }

  async startTracking(guildId: string, userId: string, channelId: string): Promise<void> {
    const key = this.getTrackingKey(guildId, userId);

    this.stopTracking(guildId, userId);

    const config = this.configService.getConfig(guildId);

    if (!config.enabled) {
      return;
    }

    // Check exempt roles
    if (config.exemptRoleIds.length > 0) {
      try {
        this.rateLimiter.recordAction();
        const guild = await this.client.guilds.fetch(guildId);
        this.rateLimiter.recordAction();
        const member = await guild.members.fetch(userId);
        const isExempt = member.roles.cache.some(role =>
          config.exemptRoleIds.includes(role.id)
        );
        if (isExempt) {
          this.logger.debug({ guildId, userId }, 'User is exempt from AFK tracking');
          return;
        }
      } catch (error) {
        this.logger.error(
          { error, guildId, userId },
          'Failed to check exempt roles'
        );
        return;
      }
    }

    // Validate config before creating timers
    if (Number.isNaN(config.afkTimeoutSeconds) || Number.isNaN(config.warningSecondsBefore)) {
      this.logger.error(
        { guildId, afkTimeoutSeconds: config.afkTimeoutSeconds, warningSecondsBefore: config.warningSecondsBefore },
        'Invalid config: timeout and warning must be valid numbers'
      );
      return;
    }

    if (config.afkTimeoutSeconds <= 0 || config.warningSecondsBefore < 0) {
      this.logger.error(
        { guildId, afkTimeoutSeconds: config.afkTimeoutSeconds, warningSecondsBefore: config.warningSecondsBefore },
        'Invalid config: timeout must be positive and warning must be non-negative'
      );
      return;
    }

    if (config.warningSecondsBefore >= config.afkTimeoutSeconds) {
      this.logger.error(
        { guildId, afkTimeoutSeconds: config.afkTimeoutSeconds, warningSecondsBefore: config.warningSecondsBefore },
        'Invalid config: warning time must be less than timeout'
      );
      return;
    }

    const warningTimeMs = (config.afkTimeoutSeconds - config.warningSecondsBefore) * 1000;
    const kickTimeMs = config.afkTimeoutSeconds * 1000;

    const warningTimer = setTimeout(() => {
      this.handleWarning(key).catch((error) => {
        this.logger.error(
          { error, key, guildId, userId },
          'Unhandled error in warning timer callback'
        );
      });
    }, warningTimeMs);

    const kickTimer = setTimeout(() => {
      this.handleKick(key).catch((error) => {
        this.logger.error(
          { error, key, guildId, userId },
          'Unhandled error in kick timer callback'
        );
      });
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

  async resetTimer(guildId: string, userId: string): Promise<void> {
    const key = this.getTrackingKey(guildId, userId);
    const state = this.tracking.get(key);

    if (!state) {
      return;
    }

    this.logger.debug({ guildId, userId }, 'User activity detected, resetting timer');

    await this.startTracking(guildId, userId, state.channelId);
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

  stopAllTrackingForChannel(guildId: string, channelId: string): void {
    const keysToStop: string[] = [];

    for (const [key, state] of this.tracking.entries()) {
      if (state.guildId === guildId && state.channelId === channelId) {
        keysToStop.push(key);
      }
    }

    for (const key of keysToStop) {
      const state = this.tracking.get(key);
      if (state) {
        this.stopTracking(state.guildId, state.userId);
      }
    }

    this.logger.debug(
      { guildId, channelId, count: keysToStop.length },
      'Stopped tracking all users in channel'
    );
  }

  async startTrackingAllInChannel(
    guildId: string,
    channelId: string,
    userIds: string[]
  ): Promise<void> {
    this.logger.debug(
      { guildId, channelId, userCount: userIds.length },
      'Starting tracking for all users in channel'
    );

    for (const userId of userIds) {
      await this.startTracking(guildId, userId, channelId);
    }
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
      this.rateLimiter.recordAction();
      const guild = await this.client.guilds.fetch(state.guildId);
      this.rateLimiter.recordAction();
      const member = await guild.members.fetch(state.userId);

      if (member.voice.channel) {
        this.rateLimiter.recordAction();
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
