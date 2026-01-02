import { Client, GatewayIntentBits, Events } from 'discord.js';
import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import { loadConfig, type EnvConfig } from './config';
import { createServiceLogger } from './utils/logger';
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
import { generateCorrelationId } from './utils/correlation';
import { AdminApiService } from './api/AdminApiService';

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
  adminApiService?: AdminApiService;
}

export async function createBot(): Promise<BotDependencies> {
  const config = loadConfig();

  // Create service-specific loggers
  const rootLogger = createServiceLogger('bot');
  const dbLogger = createServiceLogger('database');
  const voiceLogger = createServiceLogger('voice');
  const afkLogger = createServiceLogger('afk');

  const rateLimiter = new RateLimiter(rootLogger, {
    warnThreshold: config.RATE_LIMIT_WARN_THRESHOLD,
    crashThreshold: config.RATE_LIMIT_CRASH_THRESHOLD,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
  });

  rootLogger.info('Initializing Discord AFK kick bot');

  const database = initDatabase(config.DATABASE_PATH);
  createTables(database, dbLogger);
  rootLogger.info({ databasePath: config.DATABASE_PATH }, 'Database initialized');

  const repository = new GuildSettingsRepository(database, dbLogger);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });

  const guildConfigService = new GuildConfigService(repository, rootLogger);
  const speakingTracker = new SpeakingTracker(voiceLogger);
  const voiceConnectionManager = new VoiceConnectionManager(
    speakingTracker,
    client,
    voiceLogger,
    rateLimiter
  );
  const warningService = new WarningService(client, guildConfigService, afkLogger, rateLimiter);
  const afkDetectionService = new AFKDetectionService(
    warningService,
    guildConfigService,
    client,
    afkLogger,
    rateLimiter
  );
  const voiceMonitorService = new VoiceMonitorService(
    voiceConnectionManager,
    guildConfigService,
    client,
    voiceLogger,
    rateLimiter
  );

  speakingTracker.on('userStartedSpeaking', async (userId: string, guildId: string) => {
    const correlationId = generateCorrelationId();
    const eventLogger = afkLogger.child({ correlationId });

    if (eventLogger.isLevelEnabled('debug')) {
      eventLogger.debug({ userId, guildId, action: 'speaking_start' }, 'User started speaking, resetting AFK timer');
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Guild not in cache, skipping reset');
        }
        return;
      }

      const member = guild.members.cache.get(userId);
      if (!member) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Member not in cache, skipping reset');
        }
        return;
      }

      const voiceChannel = member.voice?.channel;
      if (!voiceChannel) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Member not in voice channel, skipping reset');
        }
        return;
      }

      const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
      if (nonBotCount < MIN_USERS_FOR_AFK_TRACKING) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId, nonBotCount }, 'Below threshold, skipping reset');
        }
        return;
      }

      await afkDetectionService.resetTimer(guildId, userId);
    } catch (error) {
      eventLogger.error({ error, userId, guildId }, 'Failed to reset timer after user started speaking');
    }
  });

  speakingTracker.on('userStoppedSpeaking', async (userId: string, guildId: string) => {
    const correlationId = generateCorrelationId();
    const eventLogger = afkLogger.child({ correlationId });

    if (eventLogger.isLevelEnabled('debug')) {
      eventLogger.debug({ userId, guildId, action: 'speaking_stop' }, 'User stopped speaking, starting AFK tracking');
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Guild not in cache, skipping tracking');
        }
        return;
      }

      const member = guild.members.cache.get(userId);
      if (!member) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Member not in cache, skipping tracking');
        }
        return;
      }

      const voiceChannel = member.voice?.channel;
      if (!voiceChannel) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Member not in voice channel, skipping tracking');
        }
        return;
      }

      const nonBotCount = voiceChannel.members.filter((m) => !m.user.bot).size;
      if (nonBotCount < MIN_USERS_FOR_AFK_TRACKING) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId, nonBotCount }, 'Below threshold, skipping tracking');
        }
        return;
      }

      // Skip if already tracking - avoids duplicate starts after threshold events
      if (afkDetectionService.isTracking(guildId, userId)) {
        if (eventLogger.isLevelEnabled('debug')) {
          eventLogger.debug({ userId, guildId }, 'Already tracking user, skipping');
        }
        return;
      }

      await afkDetectionService.startTracking(guildId, userId, voiceChannel.id);
    } catch (error) {
      eventLogger.error({ error, userId, guildId }, 'Failed to start tracking after user stopped speaking');
    }
  });

  client.on(Events.ClientReady, createReadyHandler({
    voiceMonitor: voiceMonitorService,
    logger: rootLogger,
  }));

  client.on(Events.VoiceStateUpdate, createVoiceStateUpdateHandler({
    voiceMonitor: voiceMonitorService,
    afkDetection: afkDetectionService,
    guildConfig: guildConfigService,
    logger: rootLogger,
  }));

  client.on(Events.GuildCreate, createGuildCreateHandler({
    voiceMonitor: voiceMonitorService,
    logger: rootLogger,
  }));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const correlationId = generateCorrelationId();
    const interactionLogger = rootLogger.child({ correlationId });

    if (interactionLogger.isLevelEnabled('debug')) {
      interactionLogger.debug({
        commandName: interaction.commandName,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: 'interaction_received'
      }, 'Slash command interaction received');
    }

    try {
      if (interaction.commandName === afkConfigCommand.data.name) {
        await afkConfigCommand.execute(interaction, guildConfigService, interactionLogger);
      } else if (interaction.commandName === afkStatusCommand.data.name) {
        await afkStatusCommand.execute(interaction, guildConfigService, interactionLogger);
      } else {
        interactionLogger.warn({ commandName: interaction.commandName }, 'Unknown command received');
      }
    } catch (error) {
      interactionLogger.error({ error, commandName: interaction.commandName }, 'Error handling command');

      const errorMessage = 'An error occurred while executing this command.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });

  rootLogger.info('Bot dependencies created and event handlers registered');

  // Initialize Admin API if enabled
  let adminApiService: AdminApiService | undefined;
  if (config.ADMIN_API_ENABLED) {
    if (config.ADMIN_API_TOKEN === undefined || config.ADMIN_API_TOKEN === '') {
      throw new Error('ADMIN_API_TOKEN is required when ADMIN_API_ENABLED is true');
    }
    adminApiService = new AdminApiService({
      client,
      guildConfigService,
      afkDetectionService,
      voiceConnectionManager,
      logger: createServiceLogger('admin-api'),
      token: config.ADMIN_API_TOKEN,
      port: config.ADMIN_API_PORT,
    });
    rootLogger.info({ port: config.ADMIN_API_PORT }, 'Admin API service initialized');
  }

  return {
    client,
    database,
    config,
    logger: rootLogger,
    rateLimiter,
    repository,
    guildConfigService,
    warningService,
    afkDetectionService,
    voiceMonitorService,
    speakingTracker,
    voiceConnectionManager,
    adminApiService,
  };
}
