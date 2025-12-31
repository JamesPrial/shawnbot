import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import type { Logger } from 'pino';
import { GuildConfigService } from '../../services/GuildConfigService';
import { hasAFKAdminPermission } from '../../utils/permissions';
import { formatError } from '../../utils/errorUtils';

export const data = new SlashCommandBuilder()
  .setName('afk-config')
  .setDescription('Configure AFK kick settings')
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
  )
  .addSubcommandGroup((group) =>
    group
      .setName('admin')
      .setDescription('Manage admin roles')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription('Add an admin role')
          .addRoleOption((option) =>
            option
              .setName('role')
              .setDescription('Role that can manage AFK settings')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('Remove an admin role')
          .addRoleOption((option) =>
            option
              .setName('role')
              .setDescription('Role to remove from admin list')
              .setRequired(true)
          )
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  logger: Logger
): Promise<void> {
  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  if (logger.isLevelEnabled('debug')) {
    logger.debug({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      command: 'afk-config',
      subcommandGroup,
      subcommand,
      action: 'command_invoke'
    }, 'afk-config command invoked');
  }

  if (!interaction.guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;

  if (!hasAFKAdminPermission(interaction, configService)) {
    await interaction.reply({
      content: 'You do not have permission to use this command. You need Administrator permission or an admin role.',
      ephemeral: true,
    });
    return;
  }

  try {
    if (subcommandGroup === 'exempt') {
      await handleExemptSubcommands(interaction, configService, subcommand, guildId);
      return;
    }

    if (subcommandGroup === 'admin') {
      await handleAdminSubcommands(interaction, configService, subcommand, guildId);
      return;
    }

    switch (subcommand) {
      case 'enable':
        await handleEnableCommand(interaction, configService, guildId);
        break;
      case 'disable':
        await handleDisableCommand(interaction, configService, guildId);
        break;
      case 'timeout':
        await handleTimeoutCommand(interaction, configService, guildId);
        break;
      case 'warning':
        await handleWarningCommand(interaction, configService, guildId);
        break;
      case 'channel':
        await handleChannelCommand(interaction, configService, guildId);
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error({ error, guildId, subcommand: interaction.options.getSubcommand() }, 'Error executing afk-config command');
    const errorMessage = formatError(error).message;

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
  configService: GuildConfigService,
  guildId: string
): Promise<void> {
  await configService.updateConfig(guildId, { enabled: true });
  await interaction.reply({
    content: 'AFK detection has been enabled.',
    ephemeral: true,
  });
}

async function handleDisableCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  guildId: string
): Promise<void> {
  await configService.updateConfig(guildId, { enabled: false });
  await interaction.reply({
    content: 'AFK detection has been disabled.',
    ephemeral: true,
  });
}

async function handleTimeoutCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  guildId: string
): Promise<void> {
  const timeoutSeconds = interaction.options.getInteger('seconds', true);
  const currentConfig = configService.getConfig(guildId);

  if (timeoutSeconds <= currentConfig.warningSecondsBefore) {
    await interaction.reply({
      content: `Timeout (${timeoutSeconds}s) must be greater than warning time (${currentConfig.warningSecondsBefore}s).`,
      ephemeral: true,
    });
    return;
  }

  await configService.updateConfig(guildId, {
    afkTimeoutSeconds: timeoutSeconds,
  });

  const timeoutMinutes = Math.floor(timeoutSeconds / 60);
  await interaction.reply({
    content: `AFK timeout set to ${timeoutSeconds} seconds (${timeoutMinutes} minutes).`,
    ephemeral: true,
  });
}

async function handleWarningCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  guildId: string
): Promise<void> {
  const warningSeconds = interaction.options.getInteger('seconds', true);
  const currentConfig = configService.getConfig(guildId);

  if (warningSeconds >= currentConfig.afkTimeoutSeconds) {
    await interaction.reply({
      content: `Warning time (${warningSeconds}s) must be less than timeout (${currentConfig.afkTimeoutSeconds}s).`,
      ephemeral: true,
    });
    return;
  }

  await configService.updateConfig(guildId, {
    warningSecondsBefore: warningSeconds,
  });

  await interaction.reply({
    content: `AFK warning time set to ${warningSeconds} seconds.`,
    ephemeral: true,
  });
}

async function handleChannelCommand(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  guildId: string
): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);

  await configService.updateConfig(guildId, {
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
  subcommand: string,
  guildId: string
): Promise<void> {
  const role = interaction.options.getRole('role', true);
  const currentConfig = configService.getConfig(guildId);

  if (subcommand === 'add') {
    if (currentConfig.exemptRoleIds.includes(role.id)) {
      await interaction.reply({
        content: `Role ${role.name} is already exempt from AFK kicks.`,
        ephemeral: true,
      });
      return;
    }

    const updatedExemptRoles = [...currentConfig.exemptRoleIds, role.id];
    await configService.updateConfig(guildId, {
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
    await configService.updateConfig(guildId, {
      exemptRoleIds: updatedExemptRoles,
    });

    await interaction.reply({
      content: `Role ${role.name} has been removed from AFK kick exemptions.`,
      ephemeral: true,
    });
  }
}

async function handleAdminSubcommands(
  interaction: ChatInputCommandInteraction,
  configService: GuildConfigService,
  subcommand: string,
  guildId: string
): Promise<void> {
  const role = interaction.options.getRole('role', true);
  const currentConfig = configService.getConfig(guildId);

  if (subcommand === 'add') {
    if (currentConfig.adminRoleIds.includes(role.id)) {
      await interaction.reply({
        content: `Role ${role.name} is already an admin role.`,
        ephemeral: true,
      });
      return;
    }

    const updatedAdminRoles = [...currentConfig.adminRoleIds, role.id];
    await configService.updateConfig(guildId, {
      adminRoleIds: updatedAdminRoles,
    });

    await interaction.reply({
      content: `Role ${role.name} has been added to AFK admin roles.`,
      ephemeral: true,
    });
  } else if (subcommand === 'remove') {
    if (!currentConfig.adminRoleIds.includes(role.id)) {
      await interaction.reply({
        content: `Role ${role.name} is not in the admin list.`,
        ephemeral: true,
      });
      return;
    }

    const updatedAdminRoles = currentConfig.adminRoleIds.filter(
      (id) => id !== role.id
    );
    await configService.updateConfig(guildId, {
      adminRoleIds: updatedAdminRoles,
    });

    await interaction.reply({
      content: `Role ${role.name} has been removed from AFK admin roles.`,
      ephemeral: true,
    });
  }
}
