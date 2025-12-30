import { VoiceState, VoiceBasedChannel } from 'discord.js';
import { Logger } from 'pino';
import type { VoiceMonitorService } from '../../services/VoiceMonitorService';
import type { AFKDetectionService } from '../../services/AFKDetectionService';
import { MIN_USERS_FOR_AFK_TRACKING } from '../../services/AFKDetectionService';
import type { GuildConfigService } from '../../services/GuildConfigService';

export interface VoiceStateHandlerDeps {
  voiceMonitor: VoiceMonitorService;
  afkDetection: AFKDetectionService;
  guildConfig: GuildConfigService;
  logger: Logger;
}

const countNonBotMembers = (channel: VoiceBasedChannel): number =>
  channel.members.filter(m => !m.user.bot).size;

export function createVoiceStateUpdateHandler(deps: VoiceStateHandlerDeps) {
  const { voiceMonitor, afkDetection, guildConfig, logger } = deps;

  return async (oldState: VoiceState, newState: VoiceState): Promise<void> => {
    try {
      const userId = newState.member?.user.id || oldState.member?.user.id;
      const guildId = newState.guild.id;

      if (logger.isLevelEnabled('debug')) {
        const eventType = !oldState.channel && newState.channel ? 'join'
          : oldState.channel && !newState.channel ? 'leave'
          : oldState.channelId !== newState.channelId ? 'switch'
          : 'other';
        logger.debug({ guildId, userId, action: 'voice_state_change', eventType }, 'Processing voice state update');
      }

      if (!userId) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug('No userId found in voice state update');
        }
        return;
      }

      const isBot = newState.member?.user.bot || oldState.member?.user.bot;
      if (isBot) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ userId, guildId }, 'Skipping bot user');
        }
        return;
      }

      const config = guildConfig.getConfig(guildId);
      if (!config.enabled) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug({ guildId }, 'Guild monitoring not enabled');
        }
        return;
      }

      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

    // User joined a channel
    if (!oldChannel && newChannel) {
      if (logger.isLevelEnabled('debug')) {
        logger.debug({ userId, guildId, channelId: newChannel.id }, 'User joined voice channel');
      }

      await voiceMonitor.handleUserJoin(newChannel);

      const count = countNonBotMembers(newChannel);
      if (count === MIN_USERS_FOR_AFK_TRACKING) {
        // Just reached threshold - start tracking all users
        const userIds = Array.from(newChannel.members.filter(m => !m.user.bot).keys());
        await afkDetection.startTrackingAllInChannel(guildId, newChannel.id, userIds);
      } else if (count > MIN_USERS_FOR_AFK_TRACKING) {
        // Already above threshold - track just the new user
        await afkDetection.startTracking(guildId, userId, newChannel.id);
      }
      // If count < MIN_USERS_FOR_AFK_TRACKING, don't start tracking

      return;
    }

    // User left a channel
    if (oldChannel && !newChannel) {
      if (logger.isLevelEnabled('debug')) {
        logger.debug({ userId, guildId, channelId: oldChannel.id }, 'User left voice channel');
      }

      const remainingCount = countNonBotMembers(oldChannel);
      if (remainingCount < MIN_USERS_FOR_AFK_TRACKING) {
        // Dropped below threshold - stop tracking everyone in channel
        afkDetection.stopAllTrackingForChannel(guildId, oldChannel.id);
      } else {
        // Still above threshold - just stop tracking the leaving user
        afkDetection.stopTracking(guildId, userId);
      }

      await voiceMonitor.handleUserLeave(guildId, oldChannel.id);
      return;
    }

    // User switched channels
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      if (logger.isLevelEnabled('debug')) {
        logger.debug(
          { userId, guildId, oldChannelId: oldChannel.id, newChannelId: newChannel.id },
          'User switched voice channels'
        );
      }

      // Apply leave logic to old channel
      const oldCount = countNonBotMembers(oldChannel);
      if (oldCount < MIN_USERS_FOR_AFK_TRACKING) {
        // Dropped below threshold - stop tracking everyone in channel
        afkDetection.stopAllTrackingForChannel(guildId, oldChannel.id);
      } else {
        // Still above threshold - just stop tracking the leaving user
        afkDetection.stopTracking(guildId, userId);
      }
      await voiceMonitor.handleUserLeave(guildId, oldChannel.id);

      // Apply join logic to new channel
      await voiceMonitor.handleUserJoin(newChannel);
      const newCount = countNonBotMembers(newChannel);
      if (newCount === MIN_USERS_FOR_AFK_TRACKING) {
        // Just reached threshold - start tracking all users
        const userIds = Array.from(newChannel.members.filter(m => !m.user.bot).keys());
        await afkDetection.startTrackingAllInChannel(guildId, newChannel.id, userIds);
      } else if (newCount > MIN_USERS_FOR_AFK_TRACKING) {
        // Already above threshold - track just the new user
        await afkDetection.startTracking(guildId, userId, newChannel.id);
      }

      return;
    }

      // Other state changes (mute, deafen, etc.) - no action needed
      if (logger.isLevelEnabled('debug')) {
        logger.debug({ userId, guildId }, 'Voice state updated (no channel change)');
      }
    } catch (error) {
      const userId = newState.member?.user.id || oldState.member?.user.id;
      const guildId = newState.guild.id;
      const oldChannelId = oldState.channel?.id;
      const newChannelId = newState.channel?.id;

      logger.error(
        { error, userId, guildId, oldChannelId, newChannelId },
        'Error handling voice state update'
      );
    }
  };
}
