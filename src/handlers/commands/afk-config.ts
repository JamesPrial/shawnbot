import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { GuildConfigService } from '../../services/GuildConfigService';

export const data = new SlashCommandBuilder()
  .setName('afk-config')
  .setDescription('Configure AFK kick settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('enable')
      .setDescription('Enable AFK detection')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('disable')
      .setDescription('Disable AFK detection')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('timeout')
      .setDescription('Set AFK timeout duration')
      .addIntegerOption((option) =>
        option
          .setName('seconds')
          .setDescription('Timeout in seconds (60-3600)')
          .setRequired(true)
          .setMinValue(60)
          .setMaxValue(3600)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('warning')
      .setDescription('Set warning time before kick')
      .addIntegerOption((option) =>
        option
          .setName('seconds')
          .setDescription('Warning time in seconds (10-300)')
          .setRequired(true)
          .setMinValue(10)
          .setMaxValue(300)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('channel')
      .setDescription('Set channel for AFK warnings')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel to send warnings to')
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName('exempt')
      .setDescription('Manage exempt roles')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription('Add an exempt role')
          .addRoleOption((option) =>
            option
              .setName('role')
              .setDescription('Role to exempt from AFK kicks')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('Remove an exempt role')
          .addRoleOption((option) =>
            option
              .setName('role')
              .setDescription('Role to remove from exemptions')
              .setRequired(true)
          )
      )
  );

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

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommandGroup === 'exempt') {
      await handleExemptSubcommands(interaction, configService, subcommand);
      return;
    }

    switch (subcommand) {
      case 'enable':
        await handleEnableCommand(interaction, configService);
        break;
      case 'disable':
        await handleDisableCommand(interaction, configService);
        break;
      case 'timeout':
        await handleTimeoutCommand(interaction, configService);
        break;
      case 'warning':
        await handleWarningCommand(interaction, configService);
        break;
      case 'channel':
        await handleChannelCommand(interaction, configService);
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error('Error executing afk-config command:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `Error: ${errorMessage}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Error: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

async function handleEnableCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  await configService.updateConfig(interaction.guildId!, { enabled: true });
  await interaction.reply({
    content: 'AFK detection has been enabled.',
    ephemeral: true,
  });
}

async function handleDisableCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  await configService.updateConfig(interaction.guildId!, { enabled: false });
  await interaction.reply({
    content: 'AFK detection has been disabled.',
    ephemeral: true,
  });
}

async function handleTimeoutCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  const timeoutSeconds = interaction.options.getInteger('seconds', true);
  const currentConfig = await configService.getConfig(interaction.guildId!);

  if (timeoutSeconds <= currentConfig.warningTimeSeconds) {
    await interaction.reply({
      content: `Timeout (${timeoutSeconds}s) must be greater than warning time (${currentConfig.warningTimeSeconds}s).`,
      ephemeral: true,
    });
    return;
  }

  await configService.updateConfig(interaction.guildId!, {
    timeoutSeconds,
  });

  const timeoutMinutes = Math.floor(timeoutSeconds / 60);
  await interaction.reply({
    content: `AFK timeout set to ${timeoutSeconds} seconds (${timeoutMinutes} minutes).`,
    ephemeral: true,
  });
}

async function handleWarningCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  const warningSeconds = interaction.options.getInteger('seconds', true);
  const currentConfig = await configService.getConfig(interaction.guildId!);

  if (warningSeconds >= currentConfig.timeoutSeconds) {
    await interaction.reply({
      content: `Warning time (${warningSeconds}s) must be less than timeout (${currentConfig.timeoutSeconds}s).`,
      ephemeral: true,
    });
    return;
  }

  await configService.updateConfig(interaction.guildId!, {
    warningTimeSeconds: warningSeconds,
  });

  await interaction.reply({
    content: `AFK warning time set to ${warningSeconds} seconds.`,
    ephemeral: true,
  });
}

async function handleChannelCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);

  await configService.updateConfig(interaction.guildId!, {
    warningChannelId: channel.id,
  });

  await interaction.reply({
    content: `AFK warning channel set to <#${channel.id}>.`,
    ephemeral: true,
  });
}

async function handleExemptSubcommands(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  subcommand: string
): Promise<void> {
  const role = interaction.options.getRole('role', true);
  const currentConfig = await configService.getConfig(interaction.guildId!);

  if (subcommand === 'add') {
    if (currentConfig.exemptRoleIds.includes(role.id)) {
      await interaction.reply({
        content: `Role ${role.name} is already exempt from AFK kicks.`,
        ephemeral: true,
      });
      return;
    }

    const updatedExemptRoles = [...currentConfig.exemptRoleIds, role.id];
    await configService.updateConfig(interaction.guildId!, {
      exemptRoleIds: updatedExemptRoles,
    });

    await interaction.reply({
      content: `Role ${role.name} has been added to AFK kick exemptions.`,
      ephemeral: true,
    });
  } else if (subcommand === 'remove') {
    if (!currentConfig.exemptRoleIds.includes(role.id)) {
      await interaction.reply({
        content: `Role ${role.name} is not in the exempt list.`,
        ephemeral: true,
      });
      return;
    }

    const updatedExemptRoles = currentConfig.exemptRoleIds.filter(
      (id) => id !== role.id
    );
    await configService.updateConfig(interaction.guildId!, {
      exemptRoleIds: updatedExemptRoles,
    });

    await interaction.reply({
      content: `Role ${role.name} has been removed from AFK kick exemptions.`,
      ephemeral: true,
    });
  }
}
