/**
 * API type definitions for the Admin REST API.
 * This module serves as the single source of truth for all API request/response contracts.
 *
 * All types maintain strict compatibility with the existing AdminApiService implementation.
 */

import { z } from 'zod';
import {
  type GuildId,
  type ChannelId,
  type RoleId,
  channelIdSchema,
  roleIdSchema,
} from './ids';

// ============================================================================
// Health & Status Responses
// ============================================================================

/**
 * Response from the /health endpoint.
 * Public endpoint that provides basic health metrics without authentication.
 */
export interface HealthResponse {
  status: 'ok';
  uptime: number;
  ready: boolean;
  guilds: number;
}

/**
 * Response from the /api/status endpoint.
 * Provides bot-wide metrics including memory usage and connection counts.
 */
export interface StatusResponse {
  guilds: number;
  voiceConnections: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

// ============================================================================
// Guild Status & Summary Types
// ============================================================================

/**
 * Guild-specific tracking status.
 * Returned by GET /api/guilds/:id/status.
 */
export interface GuildStatusResponse {
  guildId: GuildId;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  connected: boolean;
}

/**
 * Lightweight guild summary for list views.
 * Used internally; see GuildListItem for the full list response type.
 */
export interface GuildSummary {
  guildId: GuildId;
  name: string;
  enabled: boolean;
  connected: boolean;
}

/**
 * Guild list item with member count.
 * Returned in the guilds array by GET /api/guilds.
 */
export interface GuildListItem {
  guildId: GuildId;
  name: string;
  memberCount: number;
  enabled: boolean;
  connected: boolean;
}

/**
 * Response from GET /api/guilds.
 * Lists all guilds the bot is a member of.
 */
export interface GuildsListResponse {
  guilds: GuildListItem[];
  total: number;
}

// ============================================================================
// Guild Configuration Types
// ============================================================================

/**
 * Full guild configuration response.
 * Returned by GET /api/guilds/:id/config and PUT /api/guilds/:id/config.
 */
export interface GuildConfigResponse {
  guildId: GuildId;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  warningChannelId: ChannelId | null;
  exemptRoleIds: RoleId[];
  adminRoleIds: RoleId[];
}

/**
 * Zod schema for guild configuration update requests.
 * Validates PUT /api/guilds/:id/config request bodies.
 *
 * Validation rules:
 * - enabled: boolean (optional)
 * - afkTimeoutSeconds: number >= 1 (optional)
 * - warningSecondsBefore: number >= 0 (optional)
 * - warningChannelId: valid channel ID or null (optional)
 * - exemptRoleIds: array of valid role IDs (optional)
 * - adminRoleIds: array of valid role IDs (optional)
 * - No unknown fields allowed (strict mode)
 * - At least one field must be provided
 */
export const guildConfigUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    afkTimeoutSeconds: z.number().int().min(1, 'afkTimeoutSeconds must be greater than 0').optional(),
    warningSecondsBefore: z
      .number()
      .int()
      .min(0, 'warningSecondsBefore must be greater than or equal to 0')
      .optional(),
    warningChannelId: z.union([channelIdSchema, z.null()]).optional(),
    exemptRoleIds: z.array(roleIdSchema).optional(),
    adminRoleIds: z.array(roleIdSchema).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

/**
 * Type for guild configuration update requests.
 * Inferred from the Zod schema to ensure consistency.
 */
export type GuildConfigUpdateRequest = z.infer<typeof guildConfigUpdateSchema>;

/**
 * Response from DELETE /api/guilds/:id/config.
 * Indicates successful reset of guild configuration to defaults.
 */
export interface ConfigResetResponse {
  success: boolean;
  guildId: GuildId;
  message: string;
}

// ============================================================================
// Operation Response Types
// ============================================================================

/**
 * Generic operation success response.
 * Returned by POST /api/guilds/:id/enable and POST /api/guilds/:id/disable.
 */
export interface OperationResponse {
  success: boolean;
  guildId: GuildId;
  enabled: boolean;
}

/**
 * Generic error response structure.
 * Returned for all error conditions (4xx and 5xx responses).
 */
export interface ErrorResponse {
  error: string;
  message: string;
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Zod schema for login requests.
 * Validates POST /api/auth/login request bodies.
 *
 * Validation rules:
 * - username: non-empty string
 * - password: non-empty string
 * - No unknown fields allowed (strict mode)
 */
export const loginRequestSchema = z
  .object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

/**
 * Type for login requests.
 * Inferred from the Zod schema to ensure consistency.
 */
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Response from POST /api/auth/login.
 * Contains a session token and its expiration timestamp.
 */
export interface LoginResponse {
  token: string;
  expiresAt: number;
}

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export ID types for convenience.
 * Consumers can import all API types from a single module.
 */
export type { GuildId, ChannelId, RoleId };

/**
 * Type alias for guild configuration updates with validated types.
 * This is the recommended type to use in application code.
 */
export type GuildConfigUpdate = GuildConfigUpdateRequest;
