import { Guild } from 'discord.js';
import { Logger } from 'pino';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';

export interface GuildCreateHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  logger: Logger;
}

export function createGuildCreateHandler(deps: GuildCreateHandlerDeps) {
  const { voiceMonitor, logger } = deps;

  return async (guild: Guild): Promise<void> => {
    try {
      logger.info({ guildId: guild.id, guildName: guild.name }, 'Bot joined new guild');

      // Scan the guild for voice channels to join
      await voiceMonitor.scanGuild(guild);

      logger.debug({ guildId: guild.id }, 'Completed guild scan');
    } catch (error) {
      logger.error({ error, guildId: guild.id }, 'Error handling guild create event');
    }
  };
}
