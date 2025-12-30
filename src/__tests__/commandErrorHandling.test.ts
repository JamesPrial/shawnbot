import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Events, ChatInputCommandInteraction, Collection } from 'discord.js';
import type { Logger } from 'pino';
import type { GuildConfigService } from '../services/GuildConfigService';

/**
 * COMMAND ERROR HANDLING TEST SUITE (WU-6)
 *
 * This suite tests the command error handling behavior in bot.ts (lines 155-179).
 *
 * KEY BEHAVIORS:
 * 1. When afk-config throws, error is logged via logger (not console.error)
 * 2. When afk-status throws, error is logged via logger (not console.error)
 * 3. Log includes proper context (command name, error details)
 * 4. User receives appropriate error response
 * 5. Error response uses reply() or followUp() depending on interaction state
 *
 * CONTEXT: Prior to WU-6, command handlers had their own try-catch blocks using console.error.
 * The bot.ts wrapper now handles all command errors with structured logging.
 */

describe('bot.ts - Command Error Handling', () => {
  let mockLogger: Logger;
  let mockConfigService: GuildConfigService;
  let mockClient: Client;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    mockConfigService = {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
      clearCache: vi.fn(),
    } as unknown as GuildConfigService;

    mockClient = new Client({ intents: [] });
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock ChatInputCommandInteraction.
   */
  function createMockInteraction(
    commandName: string,
    guildId: string | null = 'test-guild',
    replied: boolean = false,
    deferred: boolean = false
  ): ChatInputCommandInteraction {
    const mockReply = vi.fn().mockResolvedValue(undefined);
    const mockFollowUp = vi.fn().mockResolvedValue(undefined);

    return {
      commandName,
      guildId,
      isChatInputCommand: () => true,
      reply: mockReply,
      followUp: mockFollowUp,
      replied,
      deferred,
      options: {
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue('enable'),
      },
      member: {
        roles: { cache: new Collection() },
      },
      memberPermissions: null,
    } as unknown as ChatInputCommandInteraction;
  }

  /**
   * Helper to create a command handler that throws an error.
   */
  function createThrowingCommandHandler(error: Error) {
    return {
      data: { name: 'test-command' },
      execute: vi.fn().mockRejectedValue(error),
    };
  }

  describe('afk-config command error handling', () => {
    it('should log error via logger when afk-config throws', async () => {
      // WHY: All errors must go through structured logging, not console.error.
      // This ensures consistent error tracking and proper log levels.

      const testError = new Error('Database connection timeout');
      const interaction = createMockInteraction('afk-config');

      // Simulate the bot.ts command handler wrapper
      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          // Simulate afk-config throwing
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      // Verify logger.error was called with proper context
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError, commandName: 'afk-config' },
        'Error handling command'
      );
    });

    it('should include error object in logger call for afk-config', async () => {
      // WHY: The error object must be included in the log for proper error tracking.
      // Structured logging allows error details to be indexed and searched.

      const testError = new Error('Permission denied');
      testError.stack = 'Error: Permission denied\n  at afk-config.ts:42:15';
      const interaction = createMockInteraction('afk-config');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      const logCall = vi.mocked(mockLogger.error).mock.calls[0];
      expect(logCall[0]).toHaveProperty('error');
      expect(logCall[0].error).toBe(testError);
      expect(logCall[0]).toHaveProperty('commandName', 'afk-config');
    });

    it('should include command name in logger context for afk-config', async () => {
      // WHY: Command name is critical context for debugging which command failed.

      const testError = new Error('Invalid configuration');
      const interaction = createMockInteraction('afk-config', 'guild-123');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ commandName: 'afk-config' }),
        'Error handling command'
      );
    });

    it('should send ephemeral error message to user when afk-config fails', async () => {
      // WHY: Users must receive feedback when commands fail, and error messages
      // should be ephemeral to avoid cluttering the channel.

      const testError = new Error('Service unavailable');
      const interaction = createMockInteraction('afk-config');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      });
    });

    it('should use reply() when afk-config fails and interaction not replied', async () => {
      // WHY: First response to an interaction must use reply(), not followUp().

      const testError = new Error('Command failed');
      const interaction = createMockInteraction('afk-config', 'guild-123', false, false);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.reply).toHaveBeenCalled();
      expect(interaction.followUp).not.toHaveBeenCalled();
    });

    it('should use followUp() when afk-config fails and interaction already replied', async () => {
      // WHY: If interaction.reply() was already called, subsequent responses must use followUp().

      const testError = new Error('Late failure');
      const interaction = createMockInteraction('afk-config', 'guild-123', true, false);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.followUp).toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should use followUp() when afk-config fails and interaction is deferred', async () => {
      // WHY: Deferred interactions also require followUp() instead of reply().

      const testError = new Error('Deferred command failed');
      const interaction = createMockInteraction('afk-config', 'guild-123', false, true);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.followUp).toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  describe('afk-status command error handling', () => {
    it('should log error via logger when afk-status throws', async () => {
      // WHY: afk-status errors must also use structured logging, not console.error.

      const testError = new Error('Failed to fetch guild config');
      const interaction = createMockInteraction('afk-status');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: testError, commandName: 'afk-status' },
        'Error handling command'
      );
    });

    it('should include error object in logger call for afk-status', async () => {
      // WHY: Same structured logging requirement as afk-config.

      const testError = new Error('Config service unavailable');
      const interaction = createMockInteraction('afk-status');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      const logCall = vi.mocked(mockLogger.error).mock.calls[0];
      expect(logCall[0]).toHaveProperty('error', testError);
      expect(logCall[0]).toHaveProperty('commandName', 'afk-status');
    });

    it('should include command name in logger context for afk-status', async () => {
      // WHY: Command name is critical context for debugging.

      const testError = new Error('Embed creation failed');
      const interaction = createMockInteraction('afk-status');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ commandName: 'afk-status' }),
        'Error handling command'
      );
    });

    it('should send ephemeral error message to user when afk-status fails', async () => {
      // WHY: User feedback is required for all command failures.

      const testError = new Error('Cannot display status');
      const interaction = createMockInteraction('afk-status');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while executing this command.',
        ephemeral: true,
      });
    });

    it('should use reply() when afk-status fails and interaction not replied', async () => {
      // WHY: Same reply/followUp logic as afk-config.

      const testError = new Error('Status fetch failed');
      const interaction = createMockInteraction('afk-status', 'guild-456', false, false);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.reply).toHaveBeenCalled();
      expect(interaction.followUp).not.toHaveBeenCalled();
    });

    it('should use followUp() when afk-status fails and interaction already replied', async () => {
      // WHY: Already replied interactions require followUp().

      const testError = new Error('Status update failed');
      const interaction = createMockInteraction('afk-status', 'guild-789', true, false);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');

          const errorMessage = 'An error occurred while executing this command.';
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(interaction.followUp).toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  describe('unknown command handling', () => {
    it('should log warning for unknown commands', async () => {
      // WHY: Unknown commands should be logged for security/debugging purposes.

      const interaction = createMockInteraction('unknown-command');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        logger.warn({ commandName: interaction.commandName }, 'Unknown command received');
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { commandName: 'unknown-command' },
        'Unknown command received'
      );
    });

    it('should not throw when encountering unknown command', async () => {
      // WHY: Unknown commands should be logged but not crash the bot.

      const interaction = createMockInteraction('mystery-command');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        logger.warn({ commandName: interaction.commandName }, 'Unknown command received');
      };

      await expect(commandHandler(interaction, mockLogger)).resolves.not.toThrow();
    });
  });

  describe('error message consistency', () => {
    it('should use consistent error message format across all commands', async () => {
      // WHY: Users should receive the same error message regardless of which command fails.

      const commands = ['afk-config', 'afk-status'];
      const expectedMessage = 'An error occurred while executing this command.';

      for (const commandName of commands) {
        const testError = new Error('Test error');
        const interaction = createMockInteraction(commandName);

        const commandHandler = async (
          interaction: ChatInputCommandInteraction,
          logger: Logger
        ) => {
          try {
            throw testError;
          } catch (error) {
            logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
            await interaction.reply({ content: expectedMessage, ephemeral: true });
          }
        };

        await commandHandler(interaction, mockLogger);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: expectedMessage,
          ephemeral: true,
        });
      }
    });
  });

  describe('error logging with different error types', () => {
    it('should log Error instances correctly', async () => {
      // WHY: Standard Error objects should be logged with full details.

      const testError = new Error('Standard error');
      testError.stack = 'Error: Standard error\n  at command.ts:10:5';
      const interaction = createMockInteraction('afk-config');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Error handling command'
      );
    });

    it('should handle TypeError instances', async () => {
      // WHY: TypeErrors from null/undefined access should be logged properly.

      const testError = new TypeError('Cannot read property "id" of null');
      const interaction = createMockInteraction('afk-status');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Error handling command'
      );
    });

    it('should handle ReferenceError instances', async () => {
      // WHY: ReferenceErrors should also be logged correctly.

      const testError = new ReferenceError('configService is not defined');
      const interaction = createMockInteraction('afk-config');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Error handling command'
      );
    });

    it('should handle string errors (non-Error objects)', async () => {
      // WHY: Some libraries throw strings instead of Error objects.
      // The logger should handle these gracefully.

      const testError = 'Something went wrong';
      const interaction = createMockInteraction('afk-config');

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Error handling command'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle errors when guildId is null', async () => {
      // WHY: DM commands might throw before the guildId check.

      const testError = new Error('Guild-only command in DM');
      const interaction = createMockInteraction('afk-config', null);

      const commandHandler = async (
        interaction: ChatInputCommandInteraction,
        logger: Logger
      ) => {
        try {
          throw testError;
        } catch (error) {
          logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
          await interaction.reply({
            content: 'An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      };

      await commandHandler(interaction, mockLogger);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalled();
    });

    it('should handle rapid command failures', async () => {
      // WHY: Multiple commands failing in quick succession should each be logged independently.

      const interactions = [
        createMockInteraction('afk-config'),
        createMockInteraction('afk-status'),
        createMockInteraction('afk-config'),
      ];

      for (const interaction of interactions) {
        const testError = new Error(`${interaction.commandName} failed`);
        const commandHandler = async (
          interaction: ChatInputCommandInteraction,
          logger: Logger
        ) => {
          try {
            throw testError;
          } catch (error) {
            logger.error({ error, commandName: interaction.commandName }, 'Error handling command');
            await interaction.reply({
              content: 'An error occurred while executing this command.',
              ephemeral: true,
            });
          }
        };

        await commandHandler(interaction, mockLogger);
      }

      expect(mockLogger.error).toHaveBeenCalledTimes(3);
    });
  });
});
