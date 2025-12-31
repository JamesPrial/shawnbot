import { Logger } from 'pino';
import type { Client } from 'discord.js';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';
import { generateCorrelationId } from '../../utils/correlation';

export interface ReadyHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  logger: Logger;
}

export function createReadyHandler(deps: ReadyHandlerDeps) {
  const { voiceMonitor, logger } = deps;

  return async (client: Client) => {
    const correlationId = generateCorrelationId();
    const eventLogger = logger.child({ correlationId });

    const botTag = client.user?.tag || 'Unknown Bot';
    eventLogger.info({ botTag }, `Logged in as ${botTag}`);
    eventLogger.info('Ready to monitor voice channels');

    try {
      await voiceMonitor.initialize();
    } catch (error) {
      eventLogger.error({ error }, 'Failed to initialize voice monitoring on startup');
    }
  };
}
