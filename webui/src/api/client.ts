/**
 * API Client
 *
 * Typed fetch wrapper for the ShawnBot Admin API.
 * All functions return ApiResult<T> for type-safe error handling.
 */

import type {
  ApiResult,
  HealthResponse,
  StatusResponse,
  ErrorResponse,
} from './types';

/**
 * Base URL for API requests
 * Defaults to empty string to use Vite proxy in development
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Parse JSON error response from the API
 * Falls back to generic error if parsing fails
 */
async function parseErrorResponse(response: Response): Promise<{ error: string; message: string }> {
  try {
    const json: unknown = await response.json();

    // Type guard for ErrorResponse shape
    if (
      json !== null &&
      typeof json === 'object' &&
      'error' in json &&
      'message' in json &&
      typeof json.error === 'string' &&
      typeof json.message === 'string'
    ) {
      return { error: json.error, message: json.message };
    }

    // JSON parsed but doesn't match ErrorResponse shape
    return {
      error: 'API_ERROR',
      message: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch {
    // Failed to parse JSON
    return {
      error: 'API_ERROR',
      message: `HTTP ${response.status}: ${response.statusText}`,
    };
  }
}

/**
 * Fetch health status from the bot
 * Public endpoint - no authentication required
 *
 * @returns Health status or error
 *
 * @example
 * ```typescript
 * const result = await getHealth();
 * if (result.success) {
 *   console.log(`Bot uptime: ${result.data.uptime}s`);
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export async function getHealth(): Promise<ApiResult<HealthResponse>> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      return {
        success: false,
        error: errorData.error,
        message: errorData.message,
      };
    }

    const data: unknown = await response.json();

    // Type guard for HealthResponse
    if (
      data !== null &&
      typeof data === 'object' &&
      'status' in data &&
      'uptime' in data &&
      'ready' in data &&
      'guilds' in data &&
      data.status === 'ok' &&
      typeof data.uptime === 'number' &&
      typeof data.ready === 'boolean' &&
      typeof data.guilds === 'number'
    ) {
      return {
        success: true,
        data: data as HealthResponse,
      };
    }

    return {
      success: false,
      error: 'INVALID_RESPONSE',
      message: 'API returned unexpected response format',
    };
  } catch (error) {
    // Network error or fetch exception
    const message = error instanceof Error ? error.message : 'Network request failed';
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message,
    };
  }
}

/**
 * Fetch bot status (guilds, voice connections, memory usage)
 * Authenticated endpoint - requires bearer token
 *
 * @param token - Bearer token for authentication
 * @returns Bot status or error
 *
 * @example
 * ```typescript
 * const result = await getStatus('my-secret-token');
 * if (result.success) {
 *   console.log(`Connected to ${result.data.guilds} guilds`);
 * } else if (result.error === 'UNAUTHORIZED') {
 *   console.error('Invalid token');
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export async function getStatus(token: string): Promise<ApiResult<StatusResponse>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    // Handle 401 Unauthorized specifically
    if (response.status === 401) {
      return {
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid token - authentication failed',
      };
    }

    if (!response.ok) {
      const errorData = await parseErrorResponse(response);
      return {
        success: false,
        error: errorData.error,
        message: errorData.message,
      };
    }

    const data: unknown = await response.json();

    // Type guard for StatusResponse
    if (
      data !== null &&
      typeof data === 'object' &&
      'guilds' in data &&
      'voiceConnections' in data &&
      'memory' in data &&
      typeof data.guilds === 'number' &&
      typeof data.voiceConnections === 'number' &&
      data.memory !== null &&
      typeof data.memory === 'object' &&
      'heapUsed' in data.memory &&
      'heapTotal' in data.memory &&
      'rss' in data.memory &&
      typeof data.memory.heapUsed === 'number' &&
      typeof data.memory.heapTotal === 'number' &&
      typeof data.memory.rss === 'number'
    ) {
      return {
        success: true,
        data: data as StatusResponse,
      };
    }

    return {
      success: false,
      error: 'INVALID_RESPONSE',
      message: 'API returned unexpected response format',
    };
  } catch (error) {
    // Network error or fetch exception
    const message = error instanceof Error ? error.message : 'Network request failed';
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message,
    };
  }
}

/**
 * Validate a bearer token
 * Attempts to call /api/status to verify token is valid
 *
 * @param token - Bearer token to validate
 * @returns true if token is valid, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await validateToken('my-token');
 * if (isValid) {
 *   console.log('Token is valid');
 * } else {
 *   console.log('Token is invalid');
 * }
 * ```
 */
export async function validateToken(token: string): Promise<boolean> {
  const result = await getStatus(token);
  return result.success;
}
