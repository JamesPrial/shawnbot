import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  GuildMember,
  Role,
  Collection,
} from 'discord.js';
import { GuildConfigService } from '../services/GuildConfigService';
import { hasAFKAdminPermission } from '../utils/permissions';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';
import { createMockGuildSettings } from './fixtures';

/**
 * ADMIN ROLES FEATURE TEST SUITE
 *
 * This test suite verifies the admin roles permission system, which allows guilds to configure
 * which roles can use AFK management commands beyond just Discord Administrators.
 *
 * Key behaviors tested:
 * 1. Permission checking logic (Discord Admin, configured admin roles, rejection)
 * 2. Integration with production hasAFKAdminPermission function
 * 3. Edge cases and role matching behavior
 */

describe('Admin Roles Feature', () => {
  let mockConfigService: GuildConfigService;

  beforeEach(() => {
    mockConfigService = {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      clearCache: vi.fn(),
    } as unknown as GuildConfigService;
  });

  /**
   * HELPER FUNCTIONS
   *
   * These utilities create realistic mocks that match Discord.js behavior patterns.
   */

  /**
   * Creates a mock ChatInputCommandInteraction with configurable permissions and roles.
   *
   * @param guildId - The guild ID for the interaction
   * @param hasAdministrator - Whether the user has Discord Administrator permission
   * @param userRoleIds - Array of role IDs the user has
   * @returns Mock interaction object
   */
  function createMockInteraction(
    guildId: string | null,
    hasAdministrator: boolean,
    userRoleIds: string[]
  ): Partial<ChatInputCommandInteraction> {
    // Create a collection of roles the user has
    const memberRoles = new Collection<string, Role>();
    userRoleIds.forEach((roleId) => {
      const mockRole = { id: roleId, name: `Role-${roleId}` } as Role;
      memberRoles.set(roleId, mockRole);
    });

    // Create permission bit field
    const permissions = new PermissionsBitField();
    if (hasAdministrator) {
      permissions.add(PermissionsBitField.Flags.Administrator);
    }

    const mockMember: Partial<GuildMember> = {
      roles: {
        cache: memberRoles,
      } as any,
    };

    return {
      guildId,
      user: { id: 'mock-user-id' },
      member: mockMember as GuildMember,
      memberPermissions: permissions,
      reply: vi.fn(),
    };
  }

  describe('Permission Checks', () => {
    const guildId = 'test-guild-123';

    describe('when user has Discord Administrator permission', () => {
      it('should allow access when no admin roles are configured', () => {
        const interaction = createMockInteraction(guildId, true, []);
        const config = createMockGuildSettings({ guildId, adminRoleIds: [] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access when admin roles are configured but user does not have them', () => {
        const interaction = createMockInteraction(guildId, true, ['user-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access when admin roles are configured and user has them', () => {
        const interaction = createMockInteraction(guildId, true, ['admin-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access even when user has no roles at all', () => {
        const interaction = createMockInteraction(guildId, true, []);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        // Administrator permission alone should be sufficient
        expect(result).toBe(true);
      });
    });

    describe('when user has configured admin role', () => {
      it('should allow access when user has one of the admin roles', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access when user has multiple roles including an admin role', () => {
        const interaction = createMockInteraction(guildId, false, ['regular-role', 'admin-role-2', 'other-role']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access when user has any of multiple configured admin roles', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-3']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2', 'admin-role-3'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should allow access when user has all configured admin roles', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-1', 'admin-role-2']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });
    });

    describe('when user lacks both Administrator permission and admin roles', () => {
      it('should deny access when user has no roles and no admin roles configured', () => {
        const interaction = createMockInteraction(guildId, false, []);
        const config = createMockGuildSettings({ guildId, adminRoleIds: [] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        // No admin roles configured + no Administrator permission = denied
        expect(result).toBe(false);
      });

      it('should deny access when user has roles but none are admin roles', () => {
        const interaction = createMockInteraction(guildId, false, ['regular-role-1', 'regular-role-2']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(false);
      });

      it('should deny access when user has no roles and admin roles are configured', () => {
        const interaction = createMockInteraction(guildId, false, []);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(false);
      });

      it('should deny access when user has similar but not exact admin role ID', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-1-similar']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        // Role IDs must match exactly
        expect(result).toBe(false);
      });
    });

    describe('default behavior with empty admin roles list', () => {
      it('should deny access to non-Administrators when admin roles list is empty', () => {
        const interaction = createMockInteraction(guildId, false, ['some-role']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: [] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(false);
      });

      it('should only allow Administrators when admin roles list is empty', () => {
        const adminInteraction = createMockInteraction(guildId, true, []);
        const regularInteraction = createMockInteraction(guildId, false, ['moderator-role']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: [] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        expect(hasAFKAdminPermission(adminInteraction as ChatInputCommandInteraction, mockConfigService)).toBe(true);
        expect(hasAFKAdminPermission(regularInteraction as ChatInputCommandInteraction, mockConfigService)).toBe(false);
      });
    });

    describe('edge cases in permission checking', () => {
      it('should deny access when guildId is null', () => {
        const interaction = createMockInteraction(null, false, ['admin-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        // No guild ID means no access
        expect(result).toBe(false);
      });

      it('should handle user with empty roles array correctly', () => {
        const interaction = createMockInteraction(guildId, false, []);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(false);
      });

      it('should handle config with single admin role', () => {
        const allowedInteraction = createMockInteraction(guildId, false, ['the-one-role']);
        const deniedInteraction = createMockInteraction(guildId, false, ['other-role']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['the-one-role'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        expect(hasAFKAdminPermission(allowedInteraction as ChatInputCommandInteraction, mockConfigService)).toBe(true);
        expect(hasAFKAdminPermission(deniedInteraction as ChatInputCommandInteraction, mockConfigService)).toBe(false);
      });

      it('should handle config with many admin roles', () => {
        const manyRoles = Array.from({ length: 20 }, (_, i) => `admin-role-${i}`);
        const interaction = createMockInteraction(guildId, false, ['admin-role-15']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: manyRoles });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should correctly handle role ID string matching', () => {
        // Discord role IDs are strings, not numbers
        const interaction = createMockInteraction(guildId, false, ['123456789']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['123456789'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should be case-sensitive for role IDs', () => {
        const interaction = createMockInteraction(guildId, false, ['AdminRole']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['adminrole'] }); // Different case

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        // Discord IDs are case-sensitive
        expect(result).toBe(false);
      });
    });

    describe('permission check performance with role matching', () => {
      it('should correctly match when user has first role in admin list', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2', 'admin-role-3'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should correctly match when user has last role in admin list', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-3']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2', 'admin-role-3'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should correctly match when user has middle role in admin list', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-2']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1', 'admin-role-2', 'admin-role-3'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });
    });
  });

  describe('Integration scenarios', () => {
    const guildId = 'test-guild-123';

    describe('permission checks with different user scenarios', () => {
      it('should handle server owner with Administrator permission', () => {
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['moderator-role'] });
        const ownerInteraction = createMockInteraction(guildId, true, ['owner-role']);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(ownerInteraction as ChatInputCommandInteraction, mockConfigService);

        // Owner with Administrator should always have permission
        expect(result).toBe(true);
      });

      it('should handle moderator with admin role but not Administrator', () => {
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['moderator-role'] });
        const modInteraction = createMockInteraction(guildId, false, ['moderator-role']);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(modInteraction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });

      it('should handle regular user with no special permissions', () => {
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role'] });
        const regularInteraction = createMockInteraction(guildId, false, ['everyone-role']);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(regularInteraction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(false);
      });

      it('should handle user with multiple roles where one is admin', () => {
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['staff-role'] });
        const userInteraction = createMockInteraction(guildId, false, [
          'everyone-role',
          'verified-role',
          'staff-role',
          'active-role',
        ]);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        const result = hasAFKAdminPermission(userInteraction as ChatInputCommandInteraction, mockConfigService);

        expect(result).toBe(true);
      });
    });

    describe('config changes and permission behavior', () => {
      it('should reflect permission changes when admin roles config is updated', () => {
        const interaction = createMockInteraction(guildId, false, ['moderator-role']);

        // Initially no admin roles
        let config = createMockGuildSettings({ guildId, adminRoleIds: [] });
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        expect(hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService)).toBe(false);

        // Config updated to include moderator role
        config = createMockGuildSettings({ guildId, adminRoleIds: ['moderator-role'] });
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        expect(hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService)).toBe(true);

        // Config updated to remove moderator role
        config = createMockGuildSettings({ guildId, adminRoleIds: ['different-role'] });
        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);
        expect(hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService)).toBe(false);
      });

      it('should call getConfig with correct guild ID', () => {
        const interaction = createMockInteraction(guildId, false, ['admin-role-1']);
        const config = createMockGuildSettings({ guildId, adminRoleIds: ['admin-role-1'] });

        vi.mocked(mockConfigService.getConfig).mockReturnValue(config);

        hasAFKAdminPermission(interaction as ChatInputCommandInteraction, mockConfigService);

        expect(mockConfigService.getConfig).toHaveBeenCalledWith(guildId);
      });
    });
  });
});
