import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatInputCommandInteraction, Collection } from 'discord.js';
import type { Logger } from 'pino';
import type { GuildConfigService } from '../services/GuildConfigService';
import { createMockLogger, createMockGuildSettings } from './fixtures';
import * as afkConfigCommand from '../handlers/commands/afk-config';
import * as afkStatusCommand from '../handlers/commands/afk-status';

/**
 * COMMAND HANDLER DEBUG LOGGING TEST SUITE (WU-4)
 *
 * This suite tests the debug logging behavior added to command handlers in WU-4.
 *
 * KEY BEHAVIORS:
 * 1. afk-config execute() logs 'command_invoke' with correct context at debug level
 * 2. afk-status execute() logs 'command_invoke' with correct context at debug level
 * 3. Logging is conditional on logger.isLevelEnabled('debug')
 * 4. Debug logs include guildId, userId, command name, and subcommand info
 *
 * WHY: Debug logging provides visibility into command invocations without performance
 * impact when debug is disabled. The isLevelEnabled check prevents expensive object
 * construction when debug logging is off.
 */

describe('Command Handler Debug Logging (WU-4)', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockConfigService: GuildConfigService;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfigService = {
      getConfig: vi.fn().mockReturnValue(createMockGuildSettings({ enabled: true })),
      updateConfig: vi.fn().mockResolvedValue(undefined),
      clearCache: vi.fn(),
    } as unknown as GuildConfigService;
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock ChatInputCommandInteraction for afk-config command.
   */
  function createAfkConfigInteraction(
    subcommand: string = 'enable',
    subcommandGroup: string | null = null,
    guildId: string = 'test-guild-123',
    userId: string = 'user-456'
  ): ChatInputCommandInteraction {
    return {
      commandName: 'afk-config',
      guildId,
      user: { id: userId },
      isChatInputCommand: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: false,
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue(subcommandGroup),
        getSubcommand: vi.fn().mockReturnValue(subcommand),
        getInteger: vi.fn().mockReturnValue(600),
        getChannel: vi.fn().mockReturnValue({ id: 'channel-789' }),
        getRole: vi.fn().mockReturnValue({ id: 'role-999', name: 'TestRole' }),
      },
      member: {
        roles: { cache: new Collection() },
      },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
    } as unknown as ChatInputCommandInteraction;
  }

  /**
   * Helper to create a mock ChatInputCommandInteraction for afk-status command.
   */
  function createAfkStatusInteraction(
    guildId: string = 'test-guild-123',
    userId: string = 'user-456'
  ): ChatInputCommandInteraction {
    return {
      commandName: 'afk-status',
      guildId,
      user: { id: userId },
      isChatInputCommand: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: false,
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue(null),
      },
      member: {
        roles: { cache: new Collection() },
      },
      memberPermissions: {
        has: vi.fn().mockReturnValue(true),
      },
    } as unknown as ChatInputCommandInteraction;
  }

  describe('afk-config debug logging', () => {
    it('should check if debug level is enabled before logging', async () => {
      // WHY: Prevents expensive log object construction when debug is disabled
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createAfkConfigInteraction('enable');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
      // When debug is disabled, debug() should not be called
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log command_invoke action when debug enabled', async () => {
      // WHY: Provides visibility into which commands are being invoked
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('enable', null, 'guild-123', 'user-789');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-123',
          userId: 'user-789',
          command: 'afk-config',
          subcommand: 'enable',
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });

    it('should include subcommandGroup when present', async () => {
      // WHY: Subcommand groups (like 'exempt' or 'admin') are important context
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('add', 'exempt', 'guild-456', 'user-123');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-456',
          userId: 'user-123',
          command: 'afk-config',
          subcommandGroup: 'exempt',
          subcommand: 'add',
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });

    it('should include null subcommandGroup when not present', async () => {
      // WHY: Distinguishes between top-level commands and subcommand groups
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('timeout', null);

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          subcommandGroup: null,
          subcommand: 'timeout'
        }),
        'afk-config command invoked'
      );
    });

    it('should log before command execution', async () => {
      // WHY: Debug log should appear before any command logic runs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('enable');
      let debugLogCalled = false;
      let replyCallOrder = 0;

      mockLogger.debug.mockImplementation(() => {
        debugLogCalled = true;
      });

      interaction.reply = vi.fn().mockImplementation(() => {
        // Verify debug log was called before reply
        expect(debugLogCalled).toBe(true);
        replyCallOrder++;
        return Promise.resolve(undefined);
      });

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(replyCallOrder).toBe(1);
    });

    it('should not call debug logger when debug disabled', async () => {
      // WHY: Performance optimization - avoid object construction overhead
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createAfkConfigInteraction('disable');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle null guildId in debug log', async () => {
      // WHY: Commands in DMs have null guildId, should still log correctly
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('enable', null, null as unknown as string, 'user-999');

      // This will fail the guildId check and return early, but should still log
      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      // Debug log should still be called with null guildId
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: null,
          userId: 'user-999',
          command: 'afk-config',
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });

    it('should log for all subcommand types', async () => {
      // WHY: All subcommands should have debug logging
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const subcommands = ['enable', 'disable', 'timeout', 'warning', 'channel'];

      for (const subcommand of subcommands) {
        vi.clearAllMocks();
        mockLogger.isLevelEnabled.mockReturnValue(true);
        const interaction = createAfkConfigInteraction(subcommand);

        await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            subcommand,
            action: 'command_invoke'
          }),
          'afk-config command invoked'
        );
      }
    });

    it('should log for exempt subcommand group', async () => {
      // WHY: Subcommand groups should be logged with both group and subcommand
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('add', 'exempt');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          subcommandGroup: 'exempt',
          subcommand: 'add',
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });

    it('should log for admin subcommand group', async () => {
      // WHY: Admin subcommand group should also be logged
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('remove', 'admin');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          subcommandGroup: 'admin',
          subcommand: 'remove',
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });
  });

  describe('afk-status debug logging', () => {
    it('should check if debug level is enabled before logging', async () => {
      // WHY: Same performance optimization as afk-config
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createAfkStatusInteraction();

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log command_invoke action when debug enabled', async () => {
      // WHY: Provides visibility into status command invocations
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction('guild-789', 'user-321');

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-789',
          userId: 'user-321',
          command: 'afk-status',
          action: 'command_invoke'
        }),
        'afk-status command invoked'
      );
    });

    it('should not include subcommandGroup or subcommand fields', async () => {
      // WHY: afk-status has no subcommands, should only have basic fields
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction();

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      const logCall = vi.mocked(mockLogger.debug).mock.calls[0];
      expect(logCall[0]).toHaveProperty('guildId');
      expect(logCall[0]).toHaveProperty('userId');
      expect(logCall[0]).toHaveProperty('command', 'afk-status');
      expect(logCall[0]).toHaveProperty('action', 'command_invoke');
      // Should not have subcommand fields
      expect(logCall[0]).not.toHaveProperty('subcommandGroup');
      expect(logCall[0]).not.toHaveProperty('subcommand');
    });

    it('should log before command execution', async () => {
      // WHY: Debug log should appear before any command logic runs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction();
      let debugLogCalled = false;

      mockLogger.debug.mockImplementation(() => {
        debugLogCalled = true;
      });

      interaction.reply = vi.fn().mockImplementation(() => {
        expect(debugLogCalled).toBe(true);
        return Promise.resolve(undefined);
      });

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should not call debug logger when debug disabled', async () => {
      // WHY: Performance optimization
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createAfkStatusInteraction();

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle null guildId in debug log', async () => {
      // WHY: Commands in DMs should still log with null guildId
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction(null as unknown as string, 'user-555');

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: null,
          userId: 'user-555',
          command: 'afk-status',
          action: 'command_invoke'
        }),
        'afk-status command invoked'
      );
    });

    it('should include exact command name in log', async () => {
      // WHY: Command name should match exactly for searchability in logs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction();

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'afk-status'
        }),
        'afk-status command invoked'
      );
    });
  });

  describe('debug logging consistency', () => {
    it('should use consistent action field value across commands', async () => {
      // WHY: All command invocations should use the same 'command_invoke' action
      mockLogger.isLevelEnabled.mockReturnValue(true);

      const afkConfigInteraction = createAfkConfigInteraction();
      await afkConfigCommand.execute(afkConfigInteraction, mockConfigService, mockLogger as unknown as Logger);

      vi.clearAllMocks();
      mockLogger.isLevelEnabled.mockReturnValue(true);

      const afkStatusInteraction = createAfkStatusInteraction();
      await afkStatusCommand.execute(afkStatusInteraction, mockConfigService, mockLogger as unknown as Logger);

      // Both should use 'command_invoke' action
      const afkConfigCall = vi.mocked(mockLogger.debug).mock.calls[0];
      const afkStatusCall = vi.mocked(mockLogger.debug).mock.calls[0];

      expect(afkConfigCall[0].action).toBe('command_invoke');
      expect(afkStatusCall[0].action).toBe('command_invoke');
    });

    it('should always include guildId and userId in context', async () => {
      // WHY: These are critical fields for tracking command usage
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction('enable', null, 'guild-999', 'user-888');

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-999',
          userId: 'user-888'
        }),
        expect.any(String)
      );
    });

    it('should always include command name in context', async () => {
      // WHY: Command name is essential for filtering logs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkStatusInteraction();

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'afk-status'
        }),
        expect.any(String)
      );
    });

    it('should always include action field in context', async () => {
      // WHY: Action field enables filtering by operation type
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction();

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'command_invoke'
        }),
        expect.any(String)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long user IDs in logs', async () => {
      // WHY: Discord IDs can be very long numbers
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const longUserId = '999999999999999999';
      const interaction = createAfkConfigInteraction('enable', null, 'guild-123', longUserId);

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: longUserId
        }),
        expect.any(String)
      );
    });

    it('should handle very long guild IDs in logs', async () => {
      // WHY: Discord guild IDs can also be very long
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const longGuildId = '888888888888888888';
      const interaction = createAfkStatusInteraction(longGuildId, 'user-123');

      await afkStatusCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: longGuildId
        }),
        expect.any(String)
      );
    });

    it('should log even when command execution fails', async () => {
      // WHY: Debug log should still be written even if command throws error
      mockLogger.isLevelEnabled.mockReturnValue(true);
      mockConfigService.updateConfig = vi.fn().mockRejectedValue(new Error('Database error'));
      const interaction = createAfkConfigInteraction('enable');

      try {
        await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);
      } catch (error) {
        // Expected to throw
      }

      // Debug log should still have been called
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });

    it('should log even when permission check fails', async () => {
      // WHY: Debug log happens before permission checks
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createAfkConfigInteraction();
      interaction.memberPermissions = {
        has: vi.fn().mockReturnValue(false),
      } as any;

      await afkConfigCommand.execute(interaction, mockConfigService, mockLogger as unknown as Logger);

      // Debug log should still be called even though permission check fails
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'command_invoke'
        }),
        'afk-config command invoked'
      );
    });
  });
});
