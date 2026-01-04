/**
 * API Type Definitions
 *
 * These types mirror the AdminApiService responses from the parent bot.
 * All types are strict - no optional fields unless the API actually returns them as optional.
 */

/**
 * Response from GET /health
 * Public endpoint with no authentication required
 */
export interface HealthResponse {
  status: 'ok';
  uptime: number;
  ready: boolean;
  guilds: number;
}

/**
 * Response from GET /api/status
 * Authenticated endpoint requiring bearer token
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

/**
 * Response from GET /api/guilds/:id/status
 * Authenticated endpoint requiring bearer token
 */
export interface GuildStatusResponse {
  guildId: string;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  connected: boolean;
}

/**
 * Response from POST /api/guilds/:id/enable or /api/guilds/:id/disable
 * Authenticated endpoint requiring bearer token
 */
export interface OperationResponse {
  success: boolean;
  guildId: string;
  enabled: boolean;
}

/**
 * Summary information for a single guild (lightweight, without memberCount)
 */
export interface GuildSummary {
  guildId: string;
  name: string;
  enabled: boolean;
  connected: boolean;
}

/**
 * Error response format returned by the API
 * Returned for HTTP 4xx/5xx responses with JSON body
 */
export interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Discriminated union type for API call results
 * Allows type-safe handling of success/failure cases
 *
 * @example
 * ```typescript
 * const result = await getHealth();
 * if (result.success) {
 *   console.log(result.data.uptime);
 * } else {
 *   console.error(result.error, result.message);
 * }
 * ```
 */
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; message: string };

/**
 * Individual guild summary for the guilds list endpoint
 */
export interface GuildListItem {
  guildId: string;
  name: string;
  memberCount: number;
  enabled: boolean;
  connected: boolean;
}

/**
 * Response from GET /api/guilds
 * Authenticated endpoint requiring bearer token
 */
export interface GuildsListResponse {
  guilds: GuildListItem[];
  total: number;
}

/**
 * Response from GET /api/guilds/:id/config
 * Full guild configuration including all fields
 */
export interface GuildConfigResponse {
  guildId: string;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  warningChannelId: string | null;
  exemptRoleIds: string[];
  adminRoleIds: string[];
}

/**
 * Request body for PUT /api/guilds/:id/config
 * All fields are optional - only provided fields will be updated
 */
export interface GuildConfigUpdate {
  enabled?: boolean;
  afkTimeoutSeconds?: number;
  warningSecondsBefore?: number;
  warningChannelId?: string | null;
  exemptRoleIds?: string[];
  adminRoleIds?: string[];
}

/**
 * Response from DELETE /api/guilds/:id/config
 */
export interface ConfigResetResponse {
  success: boolean;
  guildId: string;
  message: string;
}
