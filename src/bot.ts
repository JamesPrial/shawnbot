import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import { loadConfig, type EnvConfig } from './config';
import { logger as createLogger } from './utils/logger';
import { initDatabase } from './database';
import { createTables } from './database/schema';
import { GuildSettingsRepository } from './database/repositories/GuildSettingsRepository';
import { GuildConfigService } from './services/GuildConfigService';
import { WarningService } from './services/WarningService';
import { AFKDetectionService, MIN_USERS_FOR_AFK_TRACKING } from './services/AFKDetectionService';
import { VoiceMonitorService } from './services/VoiceMonitorService';
import { SpeakingTracker } from './voice/SpeakingTracker';
import { VoiceConnectionManager } from './voice/VoiceConnectionManager';
import { createReadyHandler } from './handlers/events/ready';
import { createVoiceStateUpdateHandler } from './handlers/events/voiceStateUpdate';
import { createGuildCreateHandler } from './handlers/events/guildCreate';
import { afkConfigCommand, afkStatusCommand } from './handlers/commands';
import { RateLimiter } from './utils/RateLimiter';

export interface BotDependencies {
  client: Client;
  database: Database.Database;
  config: EnvConfig;
  logger: Logger;
  rateLimiter: RateLimiter;
  repository: GuildSettingsRepository;
  guildConfigService: GuildConfigService;
  warningService: WarningService;
  afkDetectionService: AFKDetectionService;
  voiceMonitorService: VoiceMonitorService;
  speakingTracker: SpeakingTracker;
  voiceConnectionManager: VoiceConnectionManager;
}

export async function createBot(): Promise<BotDependencies> {
  const config = loadConfig();
  const logger = createLogger;
  const rateLimiter = new RateLimiter(logger, {
    warnThreshold: config.RATE_LIMIT_WARN_THRESHOLD,
    crashThreshold: config.RATE_LIMIT_CRASH_THRESHOLD,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
  });

  logger.info('Initializing Discord AFK kick bot');

  const database = initDatabase(config.DATABASE_PATH);
  createTables(database, logger);
  logger.info({ databasePath: config.DATABASE_PATH }, 'Database initialized');

  const repository = new GuildSettingsRepository(database, logger);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });

  const guildConfigService = new GuildConfigService(repository, logger);
  const speakingTracker = new SpeakingTracker(logger);
  const voiceConnectionManager = new VoiceConnectionManager(
    speakingTracker,
    client,
    logger,
    rateLimiter
  );
  const warningService = new WarningService(client, guildConfigService, logger, rateLimiter);
  const afkDetectionService = new AFKDetectionService(
    warningService,
    guildConfigService,
    client,
    logger,
    rateLimiter
  );
  const voiceMonitorService = new VoiceMonitorService(
    voiceConnectionManager,
    guildConfigService,
    client,
    logger,
    rateLimiter
  );

  speakingTracker.on('userStartedSpeaking', async (userId: string, guildId: string) => {
    if (logger.isLevelEnabled('debug')) {
      logger.debug({ userId, guildId, action: 'speaking_start' }, 'User started speaking, resetting AFK timer');
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Guild not in cache, skipping reset');
        }
        return;
      }

      const member = guild.members.cache.get(userId);
      if (!member) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Member not in cache, skipping reset');
        }
        return;
      }

      const voiceChannel = member.voice?.channel;
      if (!voiceChannel) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Member not in voice channel, skipping reset');
        }
        return;
      }

      const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
      if (nonBotCount < MIN_USERS_FOR_AFK_TRACKING) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId, nonBotCount }, 'Below threshold, skipping reset');
        }
        return;
      }

      await afkDetectionService.resetTimer(guildId, userId);
    } catch (error) {
      logger.error({ error, userId, guildId }, 'Failed to reset timer after user started speaking');
    }
  });

  speakingTracker.on('userStoppedSpeaking', async (userId: string, guildId: string) => {
    if (logger.isLevelEnabled('debug')) {
      logger.debug({ userId, guildId, action: 'speaking_stop' }, 'User stopped speaking, starting AFK tracking');
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Guild not in cache, skipping tracking');
        }
        return;
      }

      const member = guild.members.cache.get(userId);
      if (!member) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Member not in cache, skipping tracking');
        }
        return;
      }

      const voiceChannel = member.voice?.channel;
      if (!voiceChannel) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Member not in voice channel, skipping tracking');
        }
        return;
      }

      const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
      if (nonBotCount < MIN_USERS_FOR_AFK_TRACKING) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId, nonBotCount }, 'Below threshold, skipping tracking');
        }
        return;
      }

      // Skip if already tracking - avoids duplicate starts after threshold events
      if (afkDetectionService.isTracking(guildId, userId)) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Already tracking user, skipping');
        }
        return;
      }

      await afkDetectionService.startTracking(guildId, userId, voiceChannel.id);
    } catch (error) {
      logger.error({ error, userId, guildId }, 'Failed to start tracking after user stopped speaking');
    }
  });

  client.on(Events.ClientReady, createReadyHandler({
    voiceMonitor: voiceMonitorService,
    logger,
  }));

  client.on(Events.VoiceStateUpdate, createVoiceStateUpdateHandler({
    voiceMonitor: voiceMonitorService,
    afkDetection: afkDetectionService,
    guildConfig: guildConfigService,
    logger,
  }));

  client.on(Events.GuildCreate, createGuildCreateHandler({
    voiceMonitor: voiceMonitorService,
    logger,
  }));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      if (interaction.commandName === afkConfigCommand.data.name) {
        await afkConfigCommand.execute(interaction, guildConfigService, logger);
      } else if (interaction.commandName === afkStatusCommand.data.name) {
        await afkStatusCommand.execute(interaction, guildConfigService, logger);
      } else {
        logger.warn({ commandName: interaction.commandName }, 'Unknown command received');
      }
    } catch (error) {
      logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

      const errorMessage = 'An error occurred while executing this command.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });

  logger.info('Bot dependencies created and event handlers registered');

  return {
    client,
    database,
    config,
    logger,
    rateLimiter,
    repository,
    guildConfigService,
    warningService,
    afkDetectionService,
    voiceMonitorService,
    speakingTracker,
    voiceConnectionManager,
  };
}
