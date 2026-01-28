import { z } from 'zod';

/**
 * Discord snowflakes are 17-19 digit numeric strings.
 * This is the standard format for all Discord IDs (guilds, users, channels, roles, etc).
 */
const SNOWFLAKE_REGEX = /^\d{17,19}$/;

/**
 * Base snowflake schema for Discord IDs.
 * All Discord IDs follow this format.
 */
const snowflakeSchema = z.string().regex(SNOWFLAKE_REGEX, 'Invalid Discord snowflake format');

// ============================================================================
// Branded Type Schemas
// ============================================================================

/**
 * Schema for validating and branding Guild IDs.
 * Guild IDs are Discord snowflakes that uniquely identify a Discord server.
 */
export const guildIdSchema = snowflakeSchema.brand<'GuildId'>();

/**
 * Branded type for Guild IDs.
 * This type is distinct from plain strings at compile time, preventing accidental mixing of ID types.
 */
export type GuildId = z.infer<typeof guildIdSchema>;

/**
 * Schema for validating and branding User IDs.
 * User IDs are Discord snowflakes that uniquely identify a Discord user.
 */
export const userIdSchema = snowflakeSchema.brand<'UserId'>();

/**
 * Branded type for User IDs.
 * This type is distinct from plain strings at compile time, preventing accidental mixing of ID types.
 */
export type UserId = z.infer<typeof userIdSchema>;

/**
 * Schema for validating and branding Channel IDs.
 * Channel IDs are Discord snowflakes that uniquely identify a Discord channel.
 */
export const channelIdSchema = snowflakeSchema.brand<'ChannelId'>();

/**
 * Branded type for Channel IDs.
 * This type is distinct from plain strings at compile time, preventing accidental mixing of ID types.
 */
export type ChannelId = z.infer<typeof channelIdSchema>;

/**
 * Schema for validating and branding Role IDs.
 * Role IDs are Discord snowflakes that uniquely identify a Discord role.
 */
export const roleIdSchema = snowflakeSchema.brand<'RoleId'>();

/**
 * Branded type for Role IDs.
 * This type is distinct from plain strings at compile time, preventing accidental mixing of ID types.
 */
export type RoleId = z.infer<typeof roleIdSchema>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid GuildId.
 * Performs runtime validation against the snowflake format.
 *
 * @param value - The value to check
 * @returns True if the value is a valid GuildId
 */
export function isGuildId(value: unknown): value is GuildId {
  const result = guildIdSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard to check if a value is a valid UserId.
 * Performs runtime validation against the snowflake format.
 *
 * @param value - The value to check
 * @returns True if the value is a valid UserId
 */
export function isUserId(value: unknown): value is UserId {
  const result = userIdSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard to check if a value is a valid ChannelId.
 * Performs runtime validation against the snowflake format.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ChannelId
 */
export function isChannelId(value: unknown): value is ChannelId {
  const result = channelIdSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard to check if a value is a valid RoleId.
 * Performs runtime validation against the snowflake format.
 *
 * @param value - The value to check
 * @returns True if the value is a valid RoleId
 */
export function isRoleId(value: unknown): value is RoleId {
  const result = roleIdSchema.safeParse(value);
  return result.success;
}

// ============================================================================
// Factory Functions (Throwing)
// ============================================================================

/**
 * Converts a string to a GuildId, throwing if invalid.
 * Use this when you expect the value to always be valid (e.g., from Discord.js objects).
 *
 * @param value - The string to convert
 * @returns The validated GuildId
 * @throws {z.ZodError} If the value is not a valid Discord snowflake
 */
export function asGuildId(value: string): GuildId {
  return guildIdSchema.parse(value);
}

/**
 * Converts a string to a UserId, throwing if invalid.
 * Use this when you expect the value to always be valid (e.g., from Discord.js objects).
 *
 * @param value - The string to convert
 * @returns The validated UserId
 * @throws {z.ZodError} If the value is not a valid Discord snowflake
 */
export function asUserId(value: string): UserId {
  return userIdSchema.parse(value);
}

/**
 * Converts a string to a ChannelId, throwing if invalid.
 * Use this when you expect the value to always be valid (e.g., from Discord.js objects).
 *
 * @param value - The string to convert
 * @returns The validated ChannelId
 * @throws {z.ZodError} If the value is not a valid Discord snowflake
 */
export function asChannelId(value: string): ChannelId {
  return channelIdSchema.parse(value);
}

/**
 * Converts a string to a RoleId, throwing if invalid.
 * Use this when you expect the value to always be valid (e.g., from Discord.js objects).
 *
 * @param value - The string to convert
 * @returns The validated RoleId
 * @throws {z.ZodError} If the value is not a valid Discord snowflake
 */
export function asRoleId(value: string): RoleId {
  return roleIdSchema.parse(value);
}

// ============================================================================
// Safe Factory Functions (Returning null)
// ============================================================================

/**
 * Safely converts a string to a GuildId, returning null if invalid.
 * Use this when handling user input or untrusted data.
 *
 * @param value - The string to convert
 * @returns The validated GuildId, or null if invalid
 */
export function toGuildId(value: string): GuildId | null {
  const result = guildIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Safely converts a string to a UserId, returning null if invalid.
 * Use this when handling user input or untrusted data.
 *
 * @param value - The string to convert
 * @returns The validated UserId, or null if invalid
 */
export function toUserId(value: string): UserId | null {
  const result = userIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Safely converts a string to a ChannelId, returning null if invalid.
 * Use this when handling user input or untrusted data.
 *
 * @param value - The string to convert
 * @returns The validated ChannelId, or null if invalid
 */
export function toChannelId(value: string): ChannelId | null {
  const result = channelIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * Safely converts a string to a RoleId, returning null if invalid.
 * Use this when handling user input or untrusted data.
 *
 * @param value - The string to convert
 * @returns The validated RoleId, or null if invalid
 */
export function toRoleId(value: string): RoleId | null {
  const result = roleIdSchema.safeParse(value);
  return result.success ? result.data : null;
}
