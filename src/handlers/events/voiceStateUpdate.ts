import { VoiceState } from 'discord.js';
import { Logger } from 'pino';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';
import type { AFKDetectionService } from '../../services/AFKDetectionService';
import type { GuildConfigService } from '../../services/GuildConfigService';

export interface VoiceStateHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  afkDetection: AFKDetectionService;
  guildConfig: GuildConfigService;
  logger: Logger;
}

export function createVoiceStateUpdateHandler(deps: VoiceStateHandlerDeps) {
  const { voiceMonitor, afkDetection, guildConfig, logger } = deps;

  return async (oldState: VoiceState, newState: VoiceState): Promise<void> => {
    const userId = newState.member?.user.id || oldState.member?.user.id;
    const guildId = newState.guild.id;

    if (!userId) {
      logger.debug('No userId found in voice state update');
      return;
    }

    const isBot = newState.member?.user.bot || oldState.member?.user.bot;
    if (isBot) {
      logger.debug({ userId, guildId }, 'Skipping bot user');
      return;
    }

    const config = await guildConfig.getConfig(guildId);
    if (!config.enabled) {
      logger.debug({ guildId }, 'Guild monitoring not enabled');
      return;
    }

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const oldChannelId = oldChannel?.id;
    const newChannelId = newChannel?.id;

    // User joined a channel
    if (!oldChannel && newChannel) {
      logger.debug({ userId, guildId, channelId: newChannelId }, 'User joined voice channel');

      await voiceMonitor.handleUserJoin(newChannel);
      await afkDetection.startTracking(guildId, userId, newChannelId);
      return;
    }

    // User left a channel
    if (oldChannel && !newChannel) {
      logger.debug({ userId, guildId, channelId: oldChannelId }, 'User left voice channel');

      await afkDetection.stopTracking(guildId, userId);
      await voiceMonitor.handleUserLeave(guildId, oldChannelId);
      return;
    }

    // User switched channels
    if (oldChannel && newChannel && oldChannelId !== newChannelId) {
      logger.debug(
        { userId, guildId, oldChannelId, newChannelId },
        'User switched voice channels'
      );

      await afkDetection.stopTracking(guildId, userId);
      await voiceMonitor.handleUserLeave(guildId, oldChannelId);
      await voiceMonitor.handleUserJoin(newChannel);
      await afkDetection.startTracking(guildId, userId, newChannelId);
      return;
    }

    // Other state changes (mute, deafen, etc.) - no action needed
    logger.debug({ userId, guildId }, 'Voice state updated (no channel change)');
  };
}
