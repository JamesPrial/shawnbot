import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { GuildConfigService } from '../../services/GuildConfigService';
import { hasAFKAdminPermission } from '../../utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('afk-status')
  .setDescription('View AFK kick settings');

export async function execute(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  if (!hasAFKAdminPermission(interaction, configService)) {
    await interaction.reply({
      content: 'You do not have permission to use this command. You need Administrator permission or an admin role.',
      ephemeral: true,
    });
    return;
  }

  try {
    const config = configService.getConfig(interaction.guildId);

    const statusColor = config.enabled ? 0x00ff00 : 0xff0000;
    const statusText = config.enabled ? 'Enabled' : 'Disabled';

    const timeoutMinutes = Math.floor(config.afkTimeoutSeconds / 60);
    const timeoutRemainder = config.afkTimeoutSeconds % 60;
    const timeoutDisplay =
      timeoutRemainder > 0
        ? `${timeoutMinutes}m ${timeoutRemainder}s`
        : `${timeoutMinutes}m`;

    const warningChannelDisplay = config.warningChannelId
      ? `<#${config.warningChannelId}>`
      : 'Not set';

    let exemptRolesDisplay = 'None';
    if (config.exemptRoleIds.length > 0) {
      exemptRolesDisplay = config.exemptRoleIds
        .map((roleId) => `<@&${roleId}>`)
        .join(', ');
    }

    let adminRolesDisplay = 'None';
    if (config.adminRoleIds.length > 0) {
      adminRolesDisplay = config.adminRoleIds
        .map((roleId) => `<@&${roleId}>`)
        .join(', ');
    }

    const embed = new EmbedBuilder()
      .setTitle('AFK Kick Configuration')
      .setColor(statusColor)
      .addFields(
        {
          name: 'Status',
          value: statusText,
          inline: true,
        },
        {
          name: 'Timeout',
          value: `${config.afkTimeoutSeconds}s (${timeoutDisplay})`,
          inline: true,
        },
        {
          name: 'Warning Time',
          value: `${config.warningSecondsBefore}s`,
          inline: true,
        },
        {
          name: 'Warning Channel',
          value: warningChannelDisplay,
          inline: false,
        },
        {
          name: 'Exempt Roles',
          value: exemptRolesDisplay,
          inline: false,
        },
        {
          name: 'Admin Roles',
          value: adminRolesDisplay,
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error executing afk-status command:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';

    await interaction.reply({
      content: `Error retrieving AFK status: ${errorMessage}`,
      ephemeral: true,
    });
  }
}
