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

    const config = guildConfig.getConfig(guildId);
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
      logger.debug({ userId, guildId, channelId: newChannel.id }, 'User joined voice channel');

      await voiceMonitor.handleUserJoin(newChannel);
      await afkDetection.startTracking(guildId, userId, newChannel.id);
      return;
    }

    // User left a channel
    if (oldChannel && !newChannel) {
      logger.debug({ userId, guildId, channelId: oldChannel.id }, 'User left voice channel');

      afkDetection.stopTracking(guildId, userId);
      await voiceMonitor.handleUserLeave(guildId, oldChannel.id);
      return;
    }

    // User switched channels
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      logger.debug(
        { userId, guildId, oldChannelId: oldChannel.id, newChannelId: newChannel.id },
        'User switched voice channels'
      );

      afkDetection.stopTracking(guildId, userId);
      await voiceMonitor.handleUserLeave(guildId, oldChannel.id);
      await voiceMonitor.handleUserJoin(newChannel);
      await afkDetection.startTracking(guildId, userId, newChannel.id);
      return;
    }

    // Other state changes (mute, deafen, etc.) - no action needed
    logger.debug({ userId, guildId }, 'Voice state updated (no channel change)');
  };
}
