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
import { AFKDetectionService } from './services/AFKDetectionService';
import { VoiceMonitorService } from './services/VoiceMonitorService';
import { SpeakingTracker } from './voice/SpeakingTracker';
import { VoiceConnectionManager } from './voice/VoiceConnectionManager';
import { createReadyHandler } from './handlers/events/ready';
import { createVoiceStateUpdateHandler } from './handlers/events/voiceStateUpdate';
import { afkConfigCommand, afkStatusCommand } from './handlers/commands';

export interface BotDependencies {
  client: Client;
  database: Database.Database;
  config: EnvConfig;
  logger: Logger;
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

  logger.info('Initializing Discord AFK kick bot');

  const database = initDatabase(config.DATABASE_PATH);
  createTables(database);
  logger.info({ databasePath: config.DATABASE_PATH }, 'Database initialized');

  const repository = new GuildSettingsRepository(database);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
  });

  const guildConfigService = new GuildConfigService(repository);
  const speakingTracker = new SpeakingTracker(logger);
  const voiceConnectionManager = new VoiceConnectionManager(
    speakingTracker,
    client,
    logger
  );
  const warningService = new WarningService(client, guildConfigService, logger);
  const afkDetectionService = new AFKDetectionService(
    warningService,
    guildConfigService,
    client,
    logger
  );
  const voiceMonitorService = new VoiceMonitorService(
    voiceConnectionManager,
    guildConfigService,
    client,
    logger
  );

  speakingTracker.on('userStartedSpeaking', async (userId: string, guildId: string) => {
    logger.debug({ userId, guildId }, 'User started speaking, resetting AFK timer');
    await afkDetectionService.resetTimer(guildId, userId);
  });

  speakingTracker.on('userStoppedSpeaking', async (userId: string, guildId: string) => {
    logger.debug({ userId, guildId }, 'User stopped speaking, starting AFK tracking');

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);

      if (member.voice.channel) {
        await afkDetectionService.startTracking(guildId, userId, member.voice.channel.id);
      }
    } catch (error) {
      logger.error({ error, userId, guildId }, 'Failed to start tracking after user stopped speaking');
    }
  });

  client.on(Events.ClientReady, createReadyHandler(logger));

  client.on(Events.VoiceStateUpdate, createVoiceStateUpdateHandler({
    voiceMonitor: voiceMonitorService,
    afkDetection: afkDetectionService,
    guildConfig: guildConfigService,
    logger,
  }));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      if (interaction.commandName === afkConfigCommand.data.name) {
        await afkConfigCommand.execute(interaction, guildConfigService);
      } else if (interaction.commandName === afkStatusCommand.data.name) {
        await afkStatusCommand.execute(interaction, guildConfigService);
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
    repository,
    guildConfigService,
    warningService,
    afkDetectionService,
    voiceMonitorService,
    speakingTracker,
    voiceConnectionManager,
  };
}
