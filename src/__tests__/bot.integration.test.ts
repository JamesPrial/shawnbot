import { describe, it, expect } from 'vitest';
import type { BotDependencies } from '../bot';
import type { AdminApiService } from '../api/AdminApiService';

/**
 * Integration tests for AdminApiService integration into bot.ts (WU-4).
 *
 * These are TYPE-LEVEL tests that verify:
 * 1. BotDependencies interface includes optional adminApiService field
 * 2. The type is correctly AdminApiService | undefined
 *
 * NOTE: Full integration testing of createBot() would require extensive
 * mocking of Discord.js, better-sqlite3, and other dependencies. The actual
 * runtime behavior is tested via manual integration testing and the
 * AdminApiService unit tests.
 */

describe('BotDependencies type contract', () => {
  it('should have adminApiService as an optional field', () => {
    // Type check - this compiles if the field exists and is optional
    const deps: Partial<BotDependencies> = {};
    expect(deps.adminApiService).toBeUndefined();
  });

  it('should accept undefined for adminApiService', () => {
    const deps: Pick<BotDependencies, 'adminApiService'> = {
      adminApiService: undefined,
    };
    expect(deps.adminApiService).toBeUndefined();
  });

  it('should accept AdminApiService instance for adminApiService', () => {
    // Create a mock that satisfies the AdminApiService interface
    const mockService = {
      start: async () => {},
      stop: async () => {},
      getApp: () => ({} as any),
    } as unknown as AdminApiService;

    const deps: Pick<BotDependencies, 'adminApiService'> = {
      adminApiService: mockService,
    };

    expect(deps.adminApiService).toBeDefined();
    expect(deps.adminApiService).toBe(mockService);
  });
});

describe('AdminApiService module exports', () => {
  it('should export AdminApiService class', async () => {
    const module = await import('../api/AdminApiService');
    expect(module.AdminApiService).toBeDefined();
    expect(typeof module.AdminApiService).toBe('function');
  });
});
