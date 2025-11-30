import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Guild } from 'discord.js';
import type { VoiceMonitorService } from '../services/VoiceMonitorService';
import type { Logger } from 'pino';
import { createGuildCreateHandler } from '../handlers/events/guildCreate';

/**
 * These tests verify the guildCreate event handler behavior for WU-1.
 *
 * KEY BEHAVIORS:
 * 1. When the bot joins a guild, it should scan the guild for active voice channels
 * 2. It should log information about the guild being joined
 * 3. It should gracefully handle errors from the scan operation
 *
 * PURPOSE: The guildCreate handler ensures the bot automatically joins active voice channels
 * when added to a new server, without requiring manual configuration.
 */

// Type for the handler function we're testing
type GuildCreateHandler = (guild: Guild) => Promise<void>;

describe('createGuildCreateHandler', () => {
  let mockVoiceMonitor: VoiceMonitorService;
  let mockLogger: Logger;
  let mockGuild: Partial<Guild>;
  let handler: GuildCreateHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVoiceMonitor = {
      scanGuild: vi.fn().mockResolvedValue(undefined),
    } as unknown as VoiceMonitorService;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

    mockGuild = {
      id: '123456789',
      name: 'Test Guild',
    };

    handler = createGuildCreateHandler({ voiceMonitor: mockVoiceMonitor, logger: mockLogger });
  });

  describe('when bot joins a guild', () => {
    it('should call voiceMonitor.scanGuild with the guild object', async () => {
      // WHY: The primary purpose of the guildCreate handler is to scan the new guild
      // for active voice channels so the bot can join them immediately.

      await handler(mockGuild as Guild);

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledWith(mockGuild);
      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledTimes(1);
    });

    it('should log info about the guild being joined with guildId and guildName', async () => {
      // WHY: Logging helps administrators track when the bot is added to new servers
      // and provides audit trail for guild membership changes.

      await handler(mockGuild as Guild);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { guildId: '123456789', guildName: 'Test Guild' },
        'Bot joined new guild'
      );
    });

    it('should log before scanning the guild', async () => {
      // WHY: If scanGuild fails, we still want to know the bot attempted to join.
      // The log order proves we always record the join event.

      const callOrder: string[] = [];

      vi.mocked(mockLogger.info).mockImplementation(() => {
        callOrder.push('log');
      });

      vi.mocked(mockVoiceMonitor.scanGuild).mockImplementation(async () => {
        callOrder.push('scan');
      });

      await handler(mockGuild as Guild);

      expect(callOrder).toEqual(['log', 'scan']);
    });

    it('should handle guilds with different names and IDs correctly', async () => {
      // WHY: Edge case verification - ensures the handler works with various guild data.

      const guildVariations = [
        { id: '000000000', name: 'Empty ID Start' },
        { id: '999999999999999999', name: 'Max Snowflake' },
        { id: '111111111', name: 'Guild with special chars: !@#$%^&*()' },
        { id: '222222222', name: '' }, // Empty name edge case
      ];

      for (const guildData of guildVariations) {
        vi.clearAllMocks();
        await handler(guildData as Guild);

        expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledWith(guildData);
        expect(mockLogger.info).toHaveBeenCalledWith(
          { guildId: guildData.id, guildName: guildData.name },
          'Bot joined new guild'
        );
      }
    });
  });

  describe('error handling', () => {
    it('should catch and log errors from scanGuild without throwing', async () => {
      // WHY: The bot should remain functional even if scanning one guild fails.
      // The handler must not propagate errors to prevent Discord.js from logging warnings.

      const scanError = new Error('Failed to fetch voice channels');
      vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(scanError);

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          error: scanError,
          guildId: '123456789',
        },
        'Error handling guild create event'
      );
    });

    it('should log errors with guild context for debugging', async () => {
      // WHY: When scanning fails, operators need to know WHICH guild failed
      // so they can investigate guild-specific issues (permissions, etc).

      const scanError = new Error('Permission denied');
      vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(scanError);

      await handler(mockGuild as Guild);

      const errorCall = vi.mocked(mockLogger.error).mock.calls[0];
      const logContext = errorCall[0];

      expect(logContext).toMatchObject({
        error: scanError,
        guildId: '123456789',
      });
      expect(errorCall[1]).toBe('Error handling guild create event');
    });

    it('should handle different error types gracefully', async () => {
      // WHY: scanGuild might throw various error types - strings, Error objects, or unknown values.
      // The handler should handle all cases without crashing.

      const errorVariations = [
        new Error('Standard Error'),
        new TypeError('Type Error'),
        'String error',
        { message: 'Object error' },
        null,
        undefined,
      ];

      for (const error of errorVariations) {
        vi.clearAllMocks();
        vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(error);

        await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: error,
            guildId: '123456789',
          }),
          'Error handling guild create event'
        );
      }
    });

    it('should still log info even if scanGuild throws', async () => {
      // WHY: The info log should always fire, regardless of scan outcome.
      // This ensures we have a record of the join event even when scanning fails.

      vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(new Error('Scan failed'));

      await handler(mockGuild as Guild);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { guildId: '123456789', guildName: 'Test Guild' },
        'Bot joined new guild'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle network errors from scanGuild', async () => {
      // WHY: Network errors are common when the bot first joins a guild
      // (Discord API might be temporarily unavailable or slow to return guild data).

      const networkError = new Error('Network timeout');
      networkError.name = 'NetworkError';
      vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(networkError);

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: networkError,
        }),
        'Error handling guild create event'
      );
    });

    it('should handle permission errors from scanGuild', async () => {
      // WHY: The bot might not have VIEW_CHANNEL or CONNECT permissions in all guilds.
      // The handler should gracefully handle permission-related failures.

      const permissionError = new Error('Missing Access');
      permissionError.name = 'PermissionError';
      vi.mocked(mockVoiceMonitor.scanGuild).mockRejectedValue(permissionError);

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: permissionError,
          guildId: '123456789',
        }),
        'Error handling guild create event'
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle successful scan without errors', async () => {
      // WHY: Happy path - verify the handler completes successfully when everything works.

      vi.mocked(mockVoiceMonitor.scanGuild).mockResolvedValue(undefined);

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { guildId: '123456789' },
        'Completed guild scan'
      );
      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledWith(mockGuild);
    });

    it('should not call logger.error when scanGuild succeeds', async () => {
      // WHY: Error logging should only occur on actual errors, not successful operations.

      await handler(mockGuild as Guild);

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should complete quickly even if scanGuild is slow', async () => {
      // WHY: The handler should await scanGuild properly, but the test verifies
      // that the async behavior is correct (no race conditions).

      let scanCompleted = false;
      vi.mocked(mockVoiceMonitor.scanGuild).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        scanCompleted = true;
      });

      await handler(mockGuild as Guild);

      expect(scanCompleted).toBe(true);
    });
  });

  describe('boundary conditions', () => {
    it('should handle guild with minimal data', async () => {
      // WHY: Edge case - guild object might have minimal properties in some scenarios.

      const minimalGuild = {
        id: '1',
        name: 'G',
      };

      await handler(minimalGuild as Guild);

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledWith(minimalGuild);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { guildId: '1', guildName: 'G' },
        'Bot joined new guild'
      );
    });

    it('should handle guild with very long name', async () => {
      // WHY: Discord allows guild names up to 100 characters - ensure logging doesn't truncate.

      const longNameGuild = {
        id: '999999999',
        name: 'A'.repeat(100),
      };

      await handler(longNameGuild as Guild);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { guildId: '999999999', guildName: 'A'.repeat(100) },
        'Bot joined new guild'
      );
    });

    it('should handle consecutive guild joins', async () => {
      // WHY: The bot might be added to multiple guilds in quick succession.
      // Each should be handled independently.

      const guild1 = { id: '111', name: 'Guild 1' };
      const guild2 = { id: '222', name: 'Guild 2' };
      const guild3 = { id: '333', name: 'Guild 3' };

      await handler(guild1 as Guild);
      await handler(guild2 as Guild);
      await handler(guild3 as Guild);

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledTimes(3);

      // Verify each guild was scanned correctly
      expect(mockVoiceMonitor.scanGuild).toHaveBeenNthCalledWith(1, guild1);
      expect(mockVoiceMonitor.scanGuild).toHaveBeenNthCalledWith(2, guild2);
      expect(mockVoiceMonitor.scanGuild).toHaveBeenNthCalledWith(3, guild3);
    });

    it('should handle guild join followed by immediate error', async () => {
      // WHY: Edge case where scanGuild fails immediately (sync error thrown).

      vi.mocked(mockVoiceMonitor.scanGuild).mockImplementation(() => {
        throw new Error('Immediate sync error');
      });

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('voiceMonitor.scanGuild interaction', () => {
    it('should await scanGuild completion before resolving', async () => {
      // WHY: The handler should properly await the async scanGuild operation
      // to ensure proper error handling and sequencing.

      let scanStarted = false;
      let scanCompleted = false;

      vi.mocked(mockVoiceMonitor.scanGuild).mockImplementation(async () => {
        scanStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        scanCompleted = true;
      });

      expect(scanStarted).toBe(false);
      expect(scanCompleted).toBe(false);

      await handler(mockGuild as Guild);

      expect(scanStarted).toBe(true);
      expect(scanCompleted).toBe(true);
    });

    it('should pass the exact guild object to scanGuild', async () => {
      // WHY: The guild object should not be modified or wrapped before passing to scanGuild.

      await handler(mockGuild as Guild);

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledWith(mockGuild);

      // Verify it's the same reference, not a copy
      const callArg = vi.mocked(mockVoiceMonitor.scanGuild).mock.calls[0][0];
      expect(callArg).toBe(mockGuild);
    });

    it('should handle scanGuild returning a promise', async () => {
      // WHY: scanGuild is async and returns a Promise - verify proper handling.

      const scanPromise = Promise.resolve();
      vi.mocked(mockVoiceMonitor.scanGuild).mockReturnValue(scanPromise);

      await expect(handler(mockGuild as Guild)).resolves.not.toThrow();

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalled();
    });

    it('should not call scanGuild multiple times for one guild join', async () => {
      // WHY: Each guildCreate event should trigger exactly one scan.
      // Multiple scans could cause race conditions or duplicate voice connections.

      await handler(mockGuild as Guild);

      expect(mockVoiceMonitor.scanGuild).toHaveBeenCalledTimes(1);
    });
  });
});
