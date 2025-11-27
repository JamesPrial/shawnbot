import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { GuildConfigService } from '../../services/GuildConfigService';

export const data = new SlashCommandBuilder()
  .setName('afk-status')
  .setDescription('View AFK kick settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

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

  try {
    const config = await configService.getConfig(interaction.guildId);

    const statusColor = config.enabled ? 0x00ff00 : 0xff0000;
    const statusText = config.enabled ? 'Enabled' : 'Disabled';

    const timeoutMinutes = Math.floor(config.timeoutSeconds / 60);
    const timeoutRemainder = config.timeoutSeconds % 60;
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
          value: `${config.timeoutSeconds}s (${timeoutDisplay})`,
          inline: true,
        },
        {
          name: 'Warning Time',
          value: `${config.warningTimeSeconds}s`,
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
