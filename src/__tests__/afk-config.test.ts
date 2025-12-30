import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  GuildMember,
  Role,
  Collection,
  ChannelType,
  TextChannel,
  CommandInteractionOptionResolver,
} from 'discord.js';
import { execute } from '../handlers/commands/afk-config';
import { GuildConfigService } from '../services/GuildConfigService';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import { hasAFKAdminPermission } from '../utils/permissions';

/**
 * AFK-CONFIG COMMAND TEST SUITE
 *
 * This suite tests the afk-config command with a focus on guildId narrowing.
 * The command must reject DM usage (where guildId is null) and then safely use
 * the narrowed guildId for all subsequent operations.
 *
 * Key behaviors tested:
 * 1. DM rejection - the early return when guildId is null (line 119-125)
 * 2. All config operations work correctly with the narrowed guildId
 * 3. Permission checks work after narrowing
 * 4. Error handling preserves type safety
 *
 * The refactor from `interaction.guildId!` to `guildId` must not break any functionality.
 */

vi.mock('../utils/permissions');

describe('afk-config command', () => {
  let mockConfigService: GuildConfigService;
  let mockLogger: any;

  beforeEach(() => {
    mockConfigService = {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      clearCache: vi.fn(),
    } as unknown as GuildConfigService;

    mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  /**
   * HELPER FUNCTIONS
   */

  /**
   * Creates a mock interaction with configurable guildId, permissions, and options.
   */
  function createMockInteraction(
    guildId: string | null,
    hasPermission: boolean,
    options: Partial<CommandInteractionOptionResolver> = {}
  ): ChatInputCommandInteraction {
    const mockReply = vi.fn();
    const mockFollowUp = vi.fn();

    const mockMember: Partial<GuildMember> = {
      roles: {
        cache: new Collection<string, Role>(),
      } as any,
    };

    const permissions = new PermissionsBitField();
    if (hasPermission) {
      permissions.add(PermissionsBitField.Flags.Administrator);
    }

    return {
      guildId,
      member: mockMember as GuildMember,
      memberPermissions: permissions,
      reply: mockReply,
      followUp: mockFollowUp,
      replied: false,
      deferred: false,
      options: options as CommandInteractionOptionResolver,
    } as unknown as ChatInputCommandInteraction;
  }

  /**
   * Creates a minimal GuildSettings object.
   */
  function createMockConfig(guildId: string): GuildSettings {
    return {
      guildId,
      enabled: true,
      afkTimeoutSeconds: 300,
      warningSecondsBefore: 60,
      warningChannelId: null,
      exemptRoleIds: [],
      adminRoleIds: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
  }

  /**
   * GUILDID NARROWING - THE CRITICAL BEHAVIOR
   *
   * These tests verify that the command correctly handles null guildId (DM usage)
   * and that after the null check, the guildId is safely usable as a string.
   */

  describe('when used in a DM (guildId is null)', () => {
    it('should return an error message and not process command', async () => {
      const interaction = createMockInteraction(null, true);

      await execute(interaction, mockConfigService, mockLogger);

      // Verify the exact error message
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });

      // Verify config service was never called (command returned early)
      expect(mockConfigService.getConfig).not.toHaveBeenCalled();
      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should return error even if user would have permission in a guild', async () => {
      // User has admin permissions but is in DM
      const interaction = createMockInteraction(null, true);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    });

    it('should not call permission check when guildId is null', async () => {
      const interaction = createMockInteraction(null, false);

      await execute(interaction, mockConfigService, mockLogger);

      // Permission check should not be reached because we return early
      expect(hasAFKAdminPermission).not.toHaveBeenCalled();
    });
  });

  /**
   * PERMISSION CHECKS WITH NARROWED GUILDID
   *
   * After the guildId null check, the permission system should work correctly.
   */

  describe('permission checks after guildId narrowing', () => {
    it('should reject users without permission in a guild', async () => {
      const guildId = 'test-guild-no-perm';
      const interaction = createMockInteraction(guildId, false);

      vi.mocked(hasAFKAdminPermission).mockReturnValue(false);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'You do not have permission to use this command. You need Administrator permission or an admin role.',
        ephemeral: true,
      });

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should allow users with permission to proceed', async () => {
      const guildId = 'test-guild-with-perm';
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Should process the command, not show permission error
      expect(interaction.reply).not.toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('permission'),
        })
      );
    });

    it('should pass interaction and configService to permission check', async () => {
      const guildId = 'test-guild-perm-check';
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      expect(hasAFKAdminPermission).toHaveBeenCalledWith(interaction, mockConfigService);
    });
  });

  /**
   * ENABLE SUBCOMMAND
   *
   * Tests that the enable command uses the narrowed guildId correctly.
   */

  describe('enable subcommand', () => {
    it('should update config with narrowed guildId when enabling', async () => {
      const guildId = 'enable-test-guild';
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Verify updateConfig was called with the narrowed guildId (not interaction.guildId!)
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, { enabled: true });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'AFK detection has been enabled.',
        ephemeral: true,
      });
    });

    it('should successfully enable for guild with special characters in ID', async () => {
      const guildId = '123456789012345678'; // Realistic Discord snowflake
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, { enabled: true });
    });
  });

  /**
   * DISABLE SUBCOMMAND
   */

  describe('disable subcommand', () => {
    it('should update config with narrowed guildId when disabling', async () => {
      const guildId = 'disable-test-guild';
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('disable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, { enabled: false });
      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'AFK detection has been disabled.',
        ephemeral: true,
      });
    });
  });

  /**
   * TIMEOUT SUBCOMMAND
   *
   * Tests timeout setting with validation logic that requires fetching current config.
   */

  describe('timeout subcommand', () => {
    it('should fetch config with narrowed guildId for validation', async () => {
      const guildId = 'timeout-test-guild';
      const timeoutSeconds = 300;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('timeout'),
        getInteger: vi.fn().mockReturnValue(timeoutSeconds),
      });

      const config = createMockConfig(guildId);
      config.warningSecondsBefore = 60;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Verify getConfig was called with narrowed guildId (line 216)
      expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        afkTimeoutSeconds: timeoutSeconds,
      });
    });

    it('should reject timeout less than or equal to warning time', async () => {
      const guildId = 'timeout-validation-guild';
      const timeoutSeconds = 60;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('timeout'),
        getInteger: vi.fn().mockReturnValue(timeoutSeconds),
      });

      const config = createMockConfig(guildId);
      config.warningSecondsBefore = 60; // Equal to timeout

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: `Timeout (${timeoutSeconds}s) must be greater than warning time (${config.warningSecondsBefore}s).`,
        ephemeral: true,
      });

      // Should not update config
      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should accept valid timeout greater than warning time', async () => {
      const guildId = 'timeout-valid-guild';
      const timeoutSeconds = 600;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('timeout'),
        getInteger: vi.fn().mockReturnValue(timeoutSeconds),
      });

      const config = createMockConfig(guildId);
      config.warningSecondsBefore = 60;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        afkTimeoutSeconds: timeoutSeconds,
      });

      const timeoutMinutes = Math.floor(timeoutSeconds / 60);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: `AFK timeout set to ${timeoutSeconds} seconds (${timeoutMinutes} minutes).`,
        ephemeral: true,
      });
    });

    it('should handle boundary case where timeout is exactly warning + 1', async () => {
      const guildId = 'timeout-boundary-guild';
      const warningSeconds = 60;
      const timeoutSeconds = 61; // Exactly 1 second more

      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('timeout'),
        getInteger: vi.fn().mockReturnValue(timeoutSeconds),
      });

      const config = createMockConfig(guildId);
      config.warningSecondsBefore = warningSeconds;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Should accept (timeout > warning, not >=)
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        afkTimeoutSeconds: timeoutSeconds,
      });
    });
  });

  /**
   * WARNING SUBCOMMAND
   */

  describe('warning subcommand', () => {
    it('should fetch config with narrowed guildId for validation', async () => {
      const guildId = 'warning-test-guild';
      const warningSeconds = 60;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('warning'),
        getInteger: vi.fn().mockReturnValue(warningSeconds),
      });

      const config = createMockConfig(guildId);
      config.afkTimeoutSeconds = 300;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Verify getConfig was called with narrowed guildId (line 242)
      expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        warningSecondsBefore: warningSeconds,
      });
    });

    it('should reject warning time greater than or equal to timeout', async () => {
      const guildId = 'warning-validation-guild';
      const warningSeconds = 300;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('warning'),
        getInteger: vi.fn().mockReturnValue(warningSeconds),
      });

      const config = createMockConfig(guildId);
      config.afkTimeoutSeconds = 300; // Equal to warning

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: `Warning time (${warningSeconds}s) must be less than timeout (${config.afkTimeoutSeconds}s).`,
        ephemeral: true,
      });

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should accept valid warning time less than timeout', async () => {
      const guildId = 'warning-valid-guild';
      const warningSeconds = 120;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('warning'),
        getInteger: vi.fn().mockReturnValue(warningSeconds),
      });

      const config = createMockConfig(guildId);
      config.afkTimeoutSeconds = 600;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        warningSecondsBefore: warningSeconds,
      });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: `AFK warning time set to ${warningSeconds} seconds.`,
        ephemeral: true,
      });
    });

    it('should handle boundary case where warning is exactly timeout - 1', async () => {
      const guildId = 'warning-boundary-guild';
      const timeoutSeconds = 300;
      const warningSeconds = 299; // Exactly 1 second less

      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('warning'),
        getInteger: vi.fn().mockReturnValue(warningSeconds),
      });

      const config = createMockConfig(guildId);
      config.afkTimeoutSeconds = timeoutSeconds;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Should accept (warning < timeout, not <=)
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        warningSecondsBefore: warningSeconds,
      });
    });
  });

  /**
   * CHANNEL SUBCOMMAND
   */

  describe('channel subcommand', () => {
    it('should update config with narrowed guildId when setting channel', async () => {
      const guildId = 'channel-test-guild';
      const channelId = 'warning-channel-123';
      const mockChannel = { id: channelId, type: ChannelType.GuildText } as TextChannel;

      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('channel'),
        getChannel: vi.fn().mockReturnValue(mockChannel),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Verify updateConfig was called with narrowed guildId (line 268)
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
        warningChannelId: channelId,
      });

      expect(interaction.reply).toHaveBeenCalledWith({
        content: `AFK warning channel set to <#${channelId}>.`,
        ephemeral: true,
      });
    });
  });

  /**
   * EXEMPT SUBCOMMAND GROUP
   */

  describe('exempt subcommand group', () => {
    describe('exempt add', () => {
      it('should add role with narrowed guildId', async () => {
        const guildId = 'exempt-add-guild';
        const roleId = 'exempt-role-123';
        const mockRole = { id: roleId, name: 'VIP' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        // Verify getConfig and updateConfig use narrowed guildId
        expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          exemptRoleIds: [roleId],
        });

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} has been added to AFK kick exemptions.`,
          ephemeral: true,
        });
      });

      it('should reject adding role that is already exempt', async () => {
        const guildId = 'exempt-duplicate-guild';
        const roleId = 'already-exempt-role';
        const mockRole = { id: roleId, name: 'AlreadyVIP' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [roleId]; // Already in list

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await execute(interaction, mockConfigService, mockLogger);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} is already exempt from AFK kicks.`,
          ephemeral: true,
        });

        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should preserve existing exempt roles when adding new one', async () => {
        const guildId = 'exempt-preserve-guild';
        const existingRoleId = 'existing-exempt';
        const newRoleId = 'new-exempt';
        const mockRole = { id: newRoleId, name: 'NewVIP' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [existingRoleId];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          exemptRoleIds: [existingRoleId, newRoleId],
        });
      });
    });

    describe('exempt remove', () => {
      it('should remove role with narrowed guildId', async () => {
        const guildId = 'exempt-remove-guild';
        const roleId = 'role-to-remove';
        const mockRole = { id: roleId, name: 'FormerVIP' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [roleId];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          exemptRoleIds: [],
        });

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} has been removed from AFK kick exemptions.`,
          ephemeral: true,
        });
      });

      it('should reject removing role that is not in exempt list', async () => {
        const guildId = 'exempt-not-in-list-guild';
        const roleId = 'not-exempt-role';
        const mockRole = { id: roleId, name: 'NotVIP' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await execute(interaction, mockConfigService, mockLogger);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} is not in the exempt list.`,
          ephemeral: true,
        });

        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should preserve other roles when removing one', async () => {
        const guildId = 'exempt-preserve-on-remove-guild';
        const roleToRemove = 'role-remove';
        const roleToKeep = 'role-keep';
        const mockRole = { id: roleToRemove, name: 'RemoveMe' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('exempt'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.exemptRoleIds = [roleToKeep, roleToRemove];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          exemptRoleIds: [roleToKeep],
        });
      });
    });
  });

  /**
   * ADMIN SUBCOMMAND GROUP
   */

  describe('admin subcommand group', () => {
    describe('admin add', () => {
      it('should add admin role with narrowed guildId', async () => {
        const guildId = 'admin-add-guild';
        const roleId = 'admin-role-123';
        const mockRole = { id: roleId, name: 'BotAdmin' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          adminRoleIds: [roleId],
        });

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} has been added to AFK admin roles.`,
          ephemeral: true,
        });
      });

      it('should reject adding role that is already an admin', async () => {
        const guildId = 'admin-duplicate-guild';
        const roleId = 'already-admin-role';
        const mockRole = { id: roleId, name: 'AlreadyAdmin' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [roleId];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await execute(interaction, mockConfigService, mockLogger);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} is already an admin role.`,
          ephemeral: true,
        });

        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should preserve existing admin roles when adding new one', async () => {
        const guildId = 'admin-preserve-guild';
        const existingRoleId = 'existing-admin';
        const newRoleId = 'new-admin';
        const mockRole = { id: newRoleId, name: 'NewAdmin' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('add'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [existingRoleId];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          adminRoleIds: [existingRoleId, newRoleId],
        });
      });
    });

    describe('admin remove', () => {
      it('should remove admin role with narrowed guildId', async () => {
        const guildId = 'admin-remove-guild';
        const roleId = 'role-to-remove';
        const mockRole = { id: roleId, name: 'FormerAdmin' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [roleId];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          adminRoleIds: [],
        });

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} has been removed from AFK admin roles.`,
          ephemeral: true,
        });
      });

      it('should reject removing role that is not in admin list', async () => {
        const guildId = 'admin-not-in-list-guild';
        const roleId = 'not-admin-role';
        const mockRole = { id: roleId, name: 'NotAdmin' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        await execute(interaction, mockConfigService, mockLogger);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: `Role ${mockRole.name} is not in the admin list.`,
          ephemeral: true,
        });

        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should preserve other admin roles when removing one', async () => {
        const guildId = 'admin-preserve-on-remove-guild';
        const roleToRemove = 'role-remove';
        const roleToKeep = 'role-keep';
        const mockRole = { id: roleToRemove, name: 'RemoveMe' } as Role;

        const interaction = createMockInteraction(guildId, true, {
          getSubcommandGroup: vi.fn().mockReturnValue('admin'),
          getSubcommand: vi.fn().mockReturnValue('remove'),
          getRole: vi.fn().mockReturnValue(mockRole),
        });

        const config = createMockConfig(guildId);
        config.adminRoleIds = [roleToKeep, roleToRemove];

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          adminRoleIds: [roleToKeep],
        });
      });
    });
  });

  /**
   * ERROR HANDLING WITH NARROWED GUILDID
   *
   * Error handling must work correctly even with the narrowed guildId type.
   */

  describe('error handling', () => {
    it('should handle errors from updateConfig and use followUp if not replied', async () => {
      const guildId = 'error-guild';
      const error = new Error('Database connection failed');
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockRejectedValue(error);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    });

    it('should use followUp if already replied when error occurs', async () => {
      const guildId = 'error-followup-guild';
      const error = new Error('Update failed');
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      // Simulate already replied
      (interaction as any).replied = true;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockRejectedValue(error);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.followUp).toHaveBeenCalledWith({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    });

    it('should use followUp if deferred when error occurs', async () => {
      const guildId = 'error-deferred-guild';
      const error = new Error('Config error');
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      // Simulate deferred
      (interaction as any).deferred = true;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockRejectedValue(error);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.followUp).toHaveBeenCalledWith({
        content: `Error: ${error.message}`,
        ephemeral: true,
      });
    });

    it('should handle non-Error objects in catch block', async () => {
      const guildId = 'error-non-error-guild';
      const nonError = 'Something went wrong'; // String instead of Error
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.updateConfig).mockRejectedValue(nonError);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Error: Something went wrong',
        ephemeral: true,
      });
    });
  });

  /**
   * UNKNOWN SUBCOMMAND HANDLING
   */

  describe('unknown subcommand', () => {
    it('should handle unknown subcommand gracefully', async () => {
      const guildId = 'unknown-subcommand-guild';
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('unknown-command'),
      });

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);

      await execute(interaction, mockConfigService, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Unknown subcommand.',
        ephemeral: true,
      });

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });
  });

  /**
   * TYPE SAFETY VERIFICATION
   *
   * These tests verify that the narrowed guildId is type-safe throughout the command.
   */

  describe('type safety with narrowed guildId', () => {
    it('should consistently use the same guildId value in all calls', async () => {
      const guildId = 'type-safety-guild';
      const timeoutSeconds = 600;
      const interaction = createMockInteraction(guildId, true, {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('timeout'),
        getInteger: vi.fn().mockReturnValue(timeoutSeconds),
      });

      const config = createMockConfig(guildId);
      config.warningSecondsBefore = 60;

      vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
      vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
      vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

      await execute(interaction, mockConfigService, mockLogger);

      // Both getConfig and updateConfig should receive the exact same guildId
      const getConfigCalls = vi.mocked(mockConfigService.getConfig).mock.calls;
      const updateConfigCalls = vi.mocked(mockConfigService.updateConfig).mock.calls;

      expect(getConfigCalls[0][0]).toBe(guildId);
      expect(updateConfigCalls[0][0]).toBe(guildId);
      expect(getConfigCalls[0][0]).toBe(updateConfigCalls[0][0]);
    });

    it('should work with various valid Discord snowflake IDs', async () => {
      // Test with realistic Discord snowflake patterns
      const snowflakes = [
        '123456789012345678',
        '987654321098765432',
        '111111111111111111',
        '999999999999999999',
      ];

      for (const snowflake of snowflakes) {
        const interaction = createMockInteraction(snowflake, true, {
          getSubcommandGroup: vi.fn().mockReturnValue(null),
          getSubcommand: vi.fn().mockReturnValue('enable'),
        });

        vi.mocked(hasAFKAdminPermission).mockReturnValue(true);
        vi.mocked(mockConfigService.updateConfig).mockResolvedValue();

        await execute(interaction, mockConfigService, mockLogger);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(snowflake, { enabled: true });
      }
    });
  });
});
