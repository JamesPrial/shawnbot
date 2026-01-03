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
