import { vi } from 'vitest';
import type { GuildSettings } from '../database/repositories/GuildSettingsRepository';

/**
 * Mock logger interface matching pino's Logger.
 * All methods return vitest mock functions for easy assertions.
 */
export interface MockLogger {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  trace: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
  isLevelEnabled: ReturnType<typeof vi.fn>;
}

/**
 * Creates a fresh mock logger instance with all methods as vitest mocks.
 * Each call returns a new instance to prevent shared mutable state.
 *
 * @returns Mock logger with all pino Logger methods
 */
export function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true), // Default to enabled for most tests
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

/**
 * Mock rate limiter interface matching the RateLimiter utility.
 * All methods return vitest mock functions for easy assertions.
 */
export interface MockRateLimiter {
  recordAction: ReturnType<typeof vi.fn>;
  getActionCount: ReturnType<typeof vi.fn>;
}

/**
 * Creates a fresh mock rate limiter instance.
 * By default, getActionCount returns 0 (not rate limited).
 * Each call returns a new instance to prevent shared mutable state.
 *
 * @returns Mock rate limiter with recordAction and getActionCount methods
 */
export function createMockRateLimiter(): MockRateLimiter {
  return {
    recordAction: vi.fn(),
    getActionCount: vi.fn().mockReturnValue(0),
  };
}

/**
 * Default guild settings values matching GuildConfigService.DEFAULT_CONFIG.
 * These are the values used when no database entry exists for a guild.
 */
const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  guildId: 'test-guild-123',
  enabled: false,
  afkTimeoutSeconds: 300,
  warningSecondsBefore: 60,
  warningChannelId: null,
  exemptRoleIds: [],
  adminRoleIds: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

/**
 * Creates a mock GuildSettings object with default values.
 * Accepts partial overrides to customize specific fields.
 * Each call returns a new object to prevent shared mutable state.
 *
 * @param overrides - Partial GuildSettings to override defaults
 * @returns Complete GuildSettings object with defaults applied
 *
 * @example
 * const config = createMockGuildSettings({ enabled: true, afkTimeoutSeconds: 600 });
 */
export function createMockGuildSettings(overrides?: Partial<GuildSettings>): GuildSettings {
  return {
    ...DEFAULT_GUILD_SETTINGS,
    exemptRoleIds: [...DEFAULT_GUILD_SETTINGS.exemptRoleIds],
    adminRoleIds: [...DEFAULT_GUILD_SETTINGS.adminRoleIds],
    ...overrides,
  };
}

/**
 * Preset configuration for an enabled guild with valid settings.
 * Useful for testing active AFK detection scenarios.
 */
export const ENABLED_CONFIG: GuildSettings = createMockGuildSettings({
  enabled: true,
  afkTimeoutSeconds: 300,
  warningSecondsBefore: 60,
});

/**
 * Preset configuration for a disabled guild.
 * Useful for testing scenarios where AFK detection should not occur.
 */
export const DISABLED_CONFIG: GuildSettings = createMockGuildSettings({
  enabled: false,
});

/**
 * Collection of invalid configuration cases for parameterized tests.
 * Each entry includes a descriptive name and a partial config that violates constraints.
 *
 * Use these for testing validation logic and error handling:
 * - Negative timeout values
 * - Zero timeout values
 * - NaN timeout values
 * - Warning time equal to or exceeding AFK timeout
 */
export const INVALID_CONFIGS: Array<{ name: string; config: Partial<GuildSettings> }> = [
  {
    name: 'negative AFK timeout',
    config: { afkTimeoutSeconds: -100 },
  },
  {
    name: 'zero AFK timeout',
    config: { afkTimeoutSeconds: 0 },
  },
  {
    name: 'NaN AFK timeout',
    config: { afkTimeoutSeconds: NaN },
  },
  {
    name: 'negative warning time',
    config: { warningSecondsBefore: -30 },
  },
  {
    name: 'NaN warning time',
    config: { warningSecondsBefore: NaN },
  },
  {
    name: 'warning time equals AFK timeout',
    config: { afkTimeoutSeconds: 300, warningSecondsBefore: 300 },
  },
  {
    name: 'warning time exceeds AFK timeout',
    config: { afkTimeoutSeconds: 300, warningSecondsBefore: 400 },
  },
];
