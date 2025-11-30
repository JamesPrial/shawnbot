import { Logger } from 'pino';
import type { Client } from 'discord.js';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';

export interface ReadyHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  logger: Logger;
}

export function createReadyHandler(deps: ReadyHandlerDeps) {
  const { voiceMonitor, logger } = deps;

  return async (client: Client) => {
    const botTag = client.user?.tag || 'Unknown Bot';
    logger.info({ botTag }, `Logged in as ${botTag}`);
    logger.info('Ready to monitor voice channels');

    try {
      await voiceMonitor.initialize();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize voice monitoring on startup');
    }
  };
}
