import { Client } from 'discord.js';
import { Logger } from 'pino';

export function createReadyHandler(logger: Logger) {
  return () => {
    const botTag = logger.bindings().client?.user?.tag || 'Unknown Bot';

    logger.info({ botTag }, `Logged in as ${botTag}`);
    logger.info('Ready to monitor voice channels');
  };
}
