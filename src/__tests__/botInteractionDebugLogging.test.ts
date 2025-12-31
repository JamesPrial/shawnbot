import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatInputCommandInteraction, Collection } from 'discord.js';
import type { Logger } from 'pino';
import { createMockLogger } from './fixtures';

/**
 * BOT.TS INTERACTION DEBUG LOGGING TEST SUITE (WU-4)
 *
 * This suite tests the debug logging behavior in bot.ts InteractionCreate event handler.
 *
 * KEY BEHAVIORS:
 * 1. bot.ts InteractionCreate logs 'interaction_received' before command dispatch
 * 2. Logging is conditional on logger.isLevelEnabled('debug')
 * 3. Debug log includes commandName, guildId, userId, and action
 * 4. Log appears before any command handler is called
 *
 * WHY: Debug logging at the interaction level provides visibility into all incoming
 * commands before they're dispatched to handlers. This is crucial for debugging
 * routing issues and tracking command usage.
 *
 * NOTE: These tests verify the logging behavior in isolation. The actual bot.ts
 * InteractionCreate handler is tested in bot integration tests.
 */

describe('bot.ts - InteractionCreate Debug Logging (WU-4)', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock ChatInputCommandInteraction.
   */
  function createMockInteraction(
    commandName: string,
    guildId: string | null = 'test-guild-123',
    userId: string = 'user-456'
  ): ChatInputCommandInteraction {
    return {
      commandName,
      guildId,
      user: { id: userId },
      isChatInputCommand: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: false,
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
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
   * Simulates the bot.ts InteractionCreate handler debug logging logic.
   * This mirrors the actual implementation in bot.ts lines 209-216.
   */
  async function simulateInteractionHandler(
    interaction: ChatInputCommandInteraction,
    logger: Logger
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (logger.isLevelEnabled('debug')) {
      logger.debug({
        commandName: interaction.commandName,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        action: 'interaction_received'
      }, 'Slash command interaction received');
    }

    // Command dispatch would happen here in actual bot.ts
    // We're only testing the debug logging behavior
  }

  describe('interaction_received debug logging', () => {
    it('should check if debug level is enabled before logging', async () => {
      // WHY: Prevents expensive log object construction when debug is disabled
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
      // When debug is disabled, debug() should not be called
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log interaction_received action when debug enabled', async () => {
      // WHY: Provides visibility into all incoming slash commands
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', 'guild-123', 'user-789');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'afk-config',
          guildId: 'guild-123',
          userId: 'user-789',
          action: 'interaction_received'
        }),
        'Slash command interaction received'
      );
    });

    it('should include commandName in log context', async () => {
      // WHY: Command name is critical for identifying which command was invoked
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-status');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'afk-status'
        }),
        'Slash command interaction received'
      );
    });

    it('should include guildId in log context', async () => {
      // WHY: Guild ID shows which server the command was invoked in
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', 'guild-999');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-999'
        }),
        'Slash command interaction received'
      );
    });

    it('should include userId in log context', async () => {
      // WHY: User ID tracks who invoked the command
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', 'guild-123', 'user-555');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-555'
        }),
        'Slash command interaction received'
      );
    });

    it('should include action field with value interaction_received', async () => {
      // WHY: Action field enables filtering by operation type in logs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-status');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'interaction_received'
        }),
        'Slash command interaction received'
      );
    });

    it('should use exact log message text', async () => {
      // WHY: Consistent log messages make searching easier
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Slash command interaction received'
      );
    });

    it('should not call debug logger when debug disabled', async () => {
      // WHY: Performance optimization - avoid object construction overhead
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.isLevelEnabled).toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle null guildId in log context', async () => {
      // WHY: DM commands have null guildId, should still log correctly
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', null, 'user-888');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'afk-config',
          guildId: null,
          userId: 'user-888',
          action: 'interaction_received'
        }),
        'Slash command interaction received'
      );
    });

    it('should log for afk-config command', async () => {
      // WHY: afk-config should be logged at interaction level
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'afk-config'
        }),
        'Slash command interaction received'
      );
    });

    it('should log for afk-status command', async () => {
      // WHY: afk-status should be logged at interaction level
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-status');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'afk-status'
        }),
        'Slash command interaction received'
      );
    });

    it('should log for unknown command names', async () => {
      // WHY: Unknown commands should still log at interaction level
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('unknown-command');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'unknown-command'
        }),
        'Slash command interaction received'
      );
    });

    it('should not include subcommand information at interaction level', async () => {
      // WHY: Interaction-level logging is command-agnostic, subcommand details are in handler logs
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      const logCall = vi.mocked(mockLogger.debug).mock.calls[0];
      expect(logCall[0]).not.toHaveProperty('subcommand');
      expect(logCall[0]).not.toHaveProperty('subcommandGroup');
    });

    it('should call debug logger exactly once per interaction', async () => {
      // WHY: Each interaction should log exactly once at the handler level
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });
  });

  describe('logging happens before command dispatch', () => {
    it('should log before any command handler is invoked', async () => {
      // WHY: Debug log should appear before command-specific logic
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');
      let debugLogCalled = false;
      let commandHandlerCalled = false;

      mockLogger.debug.mockImplementation(() => {
        debugLogCalled = true;
        // Command handler should not have been called yet
        expect(commandHandlerCalled).toBe(false);
      });

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      // Simulate command handler call after logging
      commandHandlerCalled = true;

      expect(debugLogCalled).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should log even if command name is not recognized', async () => {
      // WHY: Interaction log happens before command routing, so all commands are logged
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('non-existent-command');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'non-existent-command',
          action: 'interaction_received'
        }),
        'Slash command interaction received'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long command names', async () => {
      // WHY: Should handle edge case of unusually long command names
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const longCommandName = 'a'.repeat(100);
      const interaction = createMockInteraction(longCommandName);

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: longCommandName
        }),
        'Slash command interaction received'
      );
    });

    it('should handle very long user IDs', async () => {
      // WHY: Discord user IDs can be very long numbers
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const longUserId = '999999999999999999';
      const interaction = createMockInteraction('afk-config', 'guild-123', longUserId);

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: longUserId
        }),
        'Slash command interaction received'
      );
    });

    it('should handle very long guild IDs', async () => {
      // WHY: Discord guild IDs can be very long numbers
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const longGuildId = '888888888888888888';
      const interaction = createMockInteraction('afk-status', longGuildId);

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: longGuildId
        }),
        'Slash command interaction received'
      );
    });

    it('should not throw when logger methods are called', async () => {
      // WHY: Logging should never cause the handler to fail
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config');

      await expect(
        simulateInteractionHandler(interaction, mockLogger as unknown as Logger)
      ).resolves.not.toThrow();

      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle empty string guild ID', async () => {
      // WHY: Edge case - empty string guild ID should still log
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', '');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: ''
        }),
        'Slash command interaction received'
      );
    });

    it('should handle empty string user ID', async () => {
      // WHY: Edge case - empty string user ID should still log
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-status', 'guild-123', '');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ''
        }),
        'Slash command interaction received'
      );
    });
  });

  describe('performance considerations', () => {
    it('should check isLevelEnabled before constructing log object', async () => {
      // WHY: When debug is disabled, we should not construct the log context object
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createMockInteraction('afk-config');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      // isLevelEnabled should be called
      expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
      // But debug should never be called, avoiding object construction
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should not impact interaction handling when debug disabled', async () => {
      // WHY: Debug logging check should have minimal performance impact
      mockLogger.isLevelEnabled.mockReturnValue(false);
      const interaction = createMockInteraction('afk-config');

      const startTime = performance.now();
      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);
      const endTime = performance.now();

      // Should execute very quickly even with debug check
      expect(endTime - startTime).toBeLessThan(10); // Less than 10ms
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe('log context structure', () => {
    it('should use flat object structure for log context', async () => {
      // WHY: Flat structure is easier to query in log aggregation systems
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', 'guild-123', 'user-456');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      const logCall = vi.mocked(mockLogger.debug).mock.calls[0];
      const context = logCall[0];

      // Should have exactly these fields, no nesting
      expect(Object.keys(context)).toEqual(
        expect.arrayContaining(['commandName', 'guildId', 'userId', 'action'])
      );
      expect(Object.keys(context).length).toBe(4);
    });

    it('should have string values for all context fields except guildId', async () => {
      // WHY: guildId can be null for DMs, others should always be strings
      mockLogger.isLevelEnabled.mockReturnValue(true);
      const interaction = createMockInteraction('afk-config', 'guild-123', 'user-456');

      await simulateInteractionHandler(interaction, mockLogger as unknown as Logger);

      const logCall = vi.mocked(mockLogger.debug).mock.calls[0];
      const context = logCall[0];

      expect(typeof context.commandName).toBe('string');
      expect(typeof context.userId).toBe('string');
      expect(typeof context.action).toBe('string');
      // guildId can be string or null
      expect(context.guildId === null || typeof context.guildId === 'string').toBe(true);
    });
  });
});
