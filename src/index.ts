import 'dotenv/config'; // MUST be first - loads .env before other imports
import { REST, Routes } from 'discord.js';
import { createBot } from './bot';
import { loadConfig } from './config/environment';
import { commands } from './handlers/commands';

async function main(): Promise<void> {
  const config = loadConfig();

  const { client, logger, voiceConnectionManager, speakingTracker, database, adminApiService } = await createBot();

  logger.info('Registering slash commands with Discord API');

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  try {
    const commandsData = commands.map((command) => command.toJSON());

    await rest.put(
      Routes.applicationCommands(config.CLIENT_ID),
      { body: commandsData }
    );

    logger.info({ commandCount: commandsData.length }, 'Slash commands registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands');
    throw error;
  }

  await client.login(config.DISCORD_TOKEN);
  logger.info('Bot started successfully');

  // Start Admin API if enabled
  if (adminApiService) {
    await adminApiService.start();
  }

  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Received shutdown signal, cleaning up');

    try {
      speakingTracker.clear();
      voiceConnectionManager.disconnectAll();
      client.destroy();

      // Stop Admin API before closing database
      if (adminApiService) {
        await adminApiService.stop();
      }

      database.close();
      logger.info('Bot shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((error) => {
  // Logger may not be initialized yet, so use console.error for fatal startup errors
  console.error('Fatal error starting bot:', error);
  process.exit(1);
});
