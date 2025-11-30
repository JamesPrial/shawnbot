import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { GuildConfigService } from '../services/GuildConfigService';

/**
 * Checks if the user has permission to manage AFK settings.
 *
 * A user has permission if they either:
 * 1. Have Discord Administrator permission, or
 * 2. Have one of the configured admin roles
 *
 * @param interaction - The command interaction to check permissions for
 * @param configService - The guild config service to retrieve admin role configuration
 * @returns true if the user has AFK admin permission, false otherwise
 */
export function hasAFKAdminPermission(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): boolean {
  // Must have guildId
  if (!interaction.guildId) {
    return false;
  }

  // Discord Administrator always has access
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Check configured admin roles
  const config = configService.getConfig(interaction.guildId);
  const memberRoles = interaction.member?.roles;

  if (!memberRoles || !('cache' in memberRoles)) {
    return false;
  }

  return config.adminRoleIds.some(roleId => memberRoles.cache.has(roleId));
}
