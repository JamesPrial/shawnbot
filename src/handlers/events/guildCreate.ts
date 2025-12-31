import { Guild } from 'discord.js';
import { Logger } from 'pino';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';
import { generateCorrelationId } from '../../utils/correlation';

export interface GuildCreateHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  logger: Logger;
}

export function createGuildCreateHandler(deps: GuildCreateHandlerDeps) {
  const { voiceMonitor, logger } = deps;

  return async (guild: Guild): Promise<void> => {
    const correlationId = generateCorrelationId();
    const eventLogger = logger.child({ correlationId });

    try {
      eventLogger.info({ guildId: guild.id, guildName: guild.name }, 'Bot joined new guild');

      // Scan the guild for voice channels to join
      await voiceMonitor.scanGuild(guild);

      if (eventLogger.isLevelEnabled('debug')) {
        eventLogger.debug({ guildId: guild.id, action: 'guild_scan_complete' }, 'Completed guild scan');
      }
    } catch (error) {
      eventLogger.error({ error, guildId: guild.id }, 'Error handling guild create event');
    }
  };
}
