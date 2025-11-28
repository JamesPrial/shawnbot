import { Logger } from 'pino';
import type { Client } from 'discord.js';

export function createReadyHandler(logger: Logger) {
  return (client: Client) => {
    const botTag = client.user?.tag || 'Unknown Bot';

    logger.info({ botTag }, `Logged in as ${botTag}`);
    logger.info('Ready to monitor voice channels');
  };
}
