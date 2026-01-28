import {
  guildIdSchema,
  userIdSchema,
  channelIdSchema,
  roleIdSchema,
  type GuildId,
  type UserId,
  type ChannelId,
  type RoleId,
} from '../types/ids';

/**
 * Counter for generating unique snowflakes.
 * Increments with each call to ensure uniqueness within a test run.
 */
let snowflakeCounter = 0;

/**
 * Generates a valid Discord snowflake ID for testing.
 * Snowflakes are 17-19 digit numeric strings.
 *
 * This function guarantees:
 * - Each call returns a unique value within the test run
 * - All values are valid Discord snowflake format (17-19 digits)
 * - Values pass snowflake validation
 *
 * @returns A unique valid Discord snowflake string
 *
 * @example
 * const id1 = createTestSnowflake(); // "10000000000000000001"
 * const id2 = createTestSnowflake(); // "10000000000000000002"
 */
export function createTestSnowflake(): string {
  snowflakeCounter++;
  // Start at 10^17 to ensure 18 digits, add counter for uniqueness
  const snowflake = (100000000000000000n + BigInt(snowflakeCounter)).toString();
  return snowflake;
}

/**
 * Creates a valid GuildId branded type for testing.
 * Each call returns a unique GuildId that passes validation.
 *
 * @returns A unique valid GuildId
 *
 * @example
 * const guildId = createTestGuildId();
 * // Use in tests that require GuildId type
 */
export function createTestGuildId(): GuildId {
  const snowflake = createTestSnowflake();
  return guildIdSchema.parse(snowflake);
}

/**
 * Creates a valid UserId branded type for testing.
 * Each call returns a unique UserId that passes validation.
 *
 * @returns A unique valid UserId
 *
 * @example
 * const userId = createTestUserId();
 * // Use in tests that require UserId type
 */
export function createTestUserId(): UserId {
  const snowflake = createTestSnowflake();
  return userIdSchema.parse(snowflake);
}

/**
 * Creates a valid ChannelId branded type for testing.
 * Each call returns a unique ChannelId that passes validation.
 *
 * @returns A unique valid ChannelId
 *
 * @example
 * const channelId = createTestChannelId();
 * // Use in tests that require ChannelId type
 */
export function createTestChannelId(): ChannelId {
  const snowflake = createTestSnowflake();
  return channelIdSchema.parse(snowflake);
}

/**
 * Creates a valid RoleId branded type for testing.
 * Each call returns a unique RoleId that passes validation.
 *
 * @returns A unique valid RoleId
 *
 * @example
 * const roleId = createTestRoleId();
 * // Use in tests that require RoleId type
 */
export function createTestRoleId(): RoleId {
  const snowflake = createTestSnowflake();
  return roleIdSchema.parse(snowflake);
}

/**
 * Asserts that a value is a valid GuildId at runtime.
 * Throws a descriptive error if validation fails.
 *
 * This is useful in tests to verify that a function returns a properly branded GuildId,
 * not just a plain string.
 *
 * @param value - The value to validate
 * @throws {Error} If the value is not a valid GuildId
 *
 * @example
 * const result = someFunction();
 * assertValidGuildId(result); // Throws if result is not a valid GuildId
 */
export function assertValidGuildId(value: unknown): asserts value is GuildId {
  const result = guildIdSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Expected valid GuildId but got ${JSON.stringify(value)}: ${result.error.message}`
    );
  }
}

/**
 * Asserts that a value is a valid UserId at runtime.
 * Throws a descriptive error if validation fails.
 *
 * @param value - The value to validate
 * @throws {Error} If the value is not a valid UserId
 */
export function assertValidUserId(value: unknown): asserts value is UserId {
  const result = userIdSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Expected valid UserId but got ${JSON.stringify(value)}: ${result.error.message}`
    );
  }
}

/**
 * Asserts that a value is a valid ChannelId at runtime.
 * Throws a descriptive error if validation fails.
 *
 * @param value - The value to validate
 * @throws {Error} If the value is not a valid ChannelId
 */
export function assertValidChannelId(value: unknown): asserts value is ChannelId {
  const result = channelIdSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Expected valid ChannelId but got ${JSON.stringify(value)}: ${result.error.message}`
    );
  }
}

/**
 * Asserts that a value is a valid RoleId at runtime.
 * Throws a descriptive error if validation fails.
 *
 * @param value - The value to validate
 * @throws {Error} If the value is not a valid RoleId
 */
export function assertValidRoleId(value: unknown): asserts value is RoleId {
  const result = roleIdSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Expected valid RoleId but got ${JSON.stringify(value)}: ${result.error.message}`
    );
  }
}

/**
 * Resets the snowflake counter.
 * Useful in test setup to ensure deterministic snowflake generation.
 *
 * @internal
 */
export function resetSnowflakeCounter(): void {
  snowflakeCounter = 0;
}

// ============================================================================
// Array Helpers
// ============================================================================

/**
 * Creates an array of unique test Guild IDs.
 * Useful for testing scenarios with multiple guilds.
 *
 * @param count - Number of guild IDs to generate
 * @returns Array of unique GuildId values
 *
 * @example
 * const guildIds = createTestGuildIds(3);
 * // [GuildId, GuildId, GuildId] - all unique
 */
export function createTestGuildIds(count: number): GuildId[] {
  return Array.from({ length: count }, () => createTestGuildId());
}

/**
 * Creates an array of unique test User IDs.
 * Useful for testing scenarios with multiple users.
 *
 * @param count - Number of user IDs to generate
 * @returns Array of unique UserId values
 *
 * @example
 * const userIds = createTestUserIds(5);
 * // [UserId, UserId, UserId, UserId, UserId] - all unique
 */
export function createTestUserIds(count: number): UserId[] {
  return Array.from({ length: count }, () => createTestUserId());
}

/**
 * Creates an array of unique test Channel IDs.
 * Useful for testing scenarios with multiple channels.
 *
 * @param count - Number of channel IDs to generate
 * @returns Array of unique ChannelId values
 *
 * @example
 * const channelIds = createTestChannelIds(2);
 * // [ChannelId, ChannelId] - all unique
 */
export function createTestChannelIds(count: number): ChannelId[] {
  return Array.from({ length: count }, () => createTestChannelId());
}

/**
 * Creates an array of unique test Role IDs.
 * Useful for testing scenarios with multiple roles.
 *
 * @param count - Number of role IDs to generate
 * @returns Array of unique RoleId values
 *
 * @example
 * const roleIds = createTestRoleIds(3);
 * // [RoleId, RoleId, RoleId] - all unique
 */
export function createTestRoleIds(count: number): RoleId[] {
  return Array.from({ length: count }, () => createTestRoleId());
}
