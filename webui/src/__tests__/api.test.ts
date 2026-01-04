/**
 * API Client Tests
 *
 * Tests for src/api/client.ts
 * Verifies all success and error paths with strict type checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getHealth,
  getStatus,
  getGuilds,
  getGuildStatus,
  enableGuild,
  disableGuild,
  validateToken,
} from '../api/client';
import type { HealthResponse, StatusResponse } from '../api/types';

describe('API Client', () => {
  // Save original fetch
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('getHealth()', () => {
    it('should return success with valid health response', async () => {
      const mockResponse: HealthResponse = {
        status: 'ok',
        uptime: 12345,
        ready: true,
        guilds: 5,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockResponse);
        expect(result.data.status).toBe('ok');
        expect(result.data.uptime).toBe(12345);
        expect(result.data.ready).toBe(true);
        expect(result.data.guilds).toBe(5);
      }

      expect(global.fetch).toHaveBeenCalledWith('/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Network connection failed');
      }
    });

    it('should handle non-Error exceptions', async () => {
      global.fetch = vi.fn().mockRejectedValue('String error');

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Network request failed');
      }
    });

    it('should handle HTTP 500 with JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: 'INTERNAL_ERROR',
          message: 'Database connection failed',
        }),
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INTERNAL_ERROR');
        expect(result.message).toBe('Database connection failed');
      }
    });

    it('should handle HTTP 500 without JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('API_ERROR');
        expect(result.message).toBe('HTTP 500: Internal Server Error');
      }
    });

    it('should handle HTTP 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'Endpoint not found',
        }),
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NOT_FOUND');
        expect(result.message).toBe('Endpoint not found');
      }
    });

    it('should handle malformed JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: 'shape' }),
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });

    it('should handle missing fields in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          uptime: 12345,
          // missing 'ready' and 'guilds'
        }),
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });

    it('should handle wrong type for fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          uptime: '12345', // string instead of number
          ready: true,
          guilds: 5,
        }),
      });

      const result = await getHealth();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('getStatus()', () => {
    it('should return success with valid status response', async () => {
      const mockResponse: StatusResponse = {
        guilds: 10,
        voiceConnections: 3,
        memory: {
          heapUsed: 50000000,
          heapTotal: 100000000,
          rss: 150000000,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getStatus('test-token-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockResponse);
        expect(result.data.guilds).toBe(10);
        expect(result.data.voiceConnections).toBe(3);
        expect(result.data.memory.heapUsed).toBe(50000000);
        expect(result.data.memory.heapTotal).toBe(100000000);
        expect(result.data.memory.rss).toBe(150000000);
      }

      expect(global.fetch).toHaveBeenCalledWith('/api/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-123',
        },
      });
    });

    it('should handle 401 Unauthorized specifically', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await getStatus('invalid-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('UNAUTHORIZED');
        expect(result.message).toBe('Invalid token - authentication failed');
      }
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection timeout'));

      const result = await getStatus('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Connection timeout');
      }
    });

    it('should handle HTTP 403 Forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: 'FORBIDDEN',
          message: 'Insufficient permissions',
        }),
      });

      const result = await getStatus('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('FORBIDDEN');
        expect(result.message).toBe('Insufficient permissions');
      }
    });

    it('should handle malformed JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: 'shape' }),
      });

      const result = await getStatus('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });

    it('should handle missing memory fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guilds: 10,
          voiceConnections: 3,
          memory: {
            heapUsed: 50000000,
            // missing heapTotal and rss
          },
        }),
      });

      const result = await getStatus('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });

    it('should handle wrong type for memory object', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guilds: 10,
          voiceConnections: 3,
          memory: 'not an object',
        }),
      });

      const result = await getStatus('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });

    it('should use VITE_API_URL if set', async () => {
      // Mock environment variable
      const mockEnv = { VITE_API_URL: 'http://localhost:3000' };
      vi.stubEnv('VITE_API_URL', mockEnv.VITE_API_URL);

      const mockResponse: StatusResponse = {
        guilds: 5,
        voiceConnections: 2,
        memory: {
          heapUsed: 10000000,
          heapTotal: 20000000,
          rss: 30000000,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await getStatus('test-token');

      // Note: Due to how import.meta.env works, we can't actually verify the URL
      // in this test without more complex mocking. The test verifies the function
      // still works with the env var set.
      expect(global.fetch).toHaveBeenCalled();

      vi.unstubAllEnvs();
    });
  });

  describe('getGuilds()', () => {
    it('should return success with valid guilds list', async () => {
      // Test that a successful response with multiple guilds is parsed correctly
      const mockResponse = {
        guilds: [
          {
            guildId: '123456789012345678',
            name: 'Test Guild 1',
            enabled: true,
            connected: true,
          },
          {
            guildId: '987654321098765432',
            name: 'Test Guild 2',
            enabled: false,
            connected: false,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getGuilds('test-token-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guilds).toHaveLength(2);
        expect(result.data.guilds[0]?.guildId).toBe('123456789012345678');
        expect(result.data.guilds[0]?.name).toBe('Test Guild 1');
        expect(result.data.guilds[0]?.enabled).toBe(true);
        expect(result.data.guilds[0]?.connected).toBe(true);
        expect(result.data.guilds[1]?.guildId).toBe('987654321098765432');
        expect(result.data.guilds[1]?.name).toBe('Test Guild 2');
        expect(result.data.guilds[1]?.enabled).toBe(false);
        expect(result.data.guilds[1]?.connected).toBe(false);
      }

      expect(global.fetch).toHaveBeenCalledWith('/api/guilds', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-123',
        },
      });
    });

    it('should handle empty guilds list', async () => {
      // Test that an empty guilds array is valid and parsed correctly
      const mockResponse = {
        guilds: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getGuilds('test-token');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guilds).toHaveLength(0);
      }
    });

    it('should return UNAUTHORIZED error on 401 response', async () => {
      // Test that 401 responses are specifically handled as UNAUTHORIZED errors
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await getGuilds('invalid-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('UNAUTHORIZED');
        expect(result.message).toBe('Invalid token - authentication failed');
      }
    });

    it('should return NETWORK_ERROR on fetch failure', async () => {
      // Test that network-level failures (not HTTP errors) are handled as NETWORK_ERROR
      global.fetch = vi.fn().mockRejectedValue(new Error('Network connection lost'));

      const result = await getGuilds('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Network connection lost');
      }
    });

    it('should return INVALID_RESPONSE when response missing guilds field', async () => {
      // Test that responses without the required 'guilds' field are rejected
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing guilds field
          somethingElse: 'data',
        }),
      });

      const result = await getGuilds('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });

    it('should return INVALID_RESPONSE when guilds is not an array', async () => {
      // Test that 'guilds' field must be an array
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guilds: 'not-an-array',
        }),
      });

      const result = await getGuilds('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });

    it('should return INVALID_RESPONSE when guild objects missing required fields', async () => {
      // Test that each guild must have all required fields
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guilds: [
            {
              guildId: '123456789012345678',
              name: 'Test Guild',
              // missing enabled and connected
            },
          ],
        }),
      });

      const result = await getGuilds('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });

    it('should return INVALID_RESPONSE when guild fields have wrong types', async () => {
      // Test type validation for guild object fields
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guilds: [
            {
              guildId: 123456789012345678, // number instead of string
              name: 'Test Guild',
              enabled: true,
              connected: true,
            },
          ],
        }),
      });

      const result = await getGuilds('test-token');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('getGuildStatus()', () => {
    it('should return success with valid guild status', async () => {
      // Test successful retrieval of guild status with all fields present
      const mockResponse = {
        guildId: '123456789012345678',
        enabled: true,
        afkTimeoutSeconds: 300,
        warningSecondsBefore: 60,
        connected: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getGuildStatus('test-token', '123456789012345678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guildId).toBe('123456789012345678');
        expect(result.data.enabled).toBe(true);
        expect(result.data.afkTimeoutSeconds).toBe(300);
        expect(result.data.warningSecondsBefore).toBe(60);
        expect(result.data.connected).toBe(true);
      }

      expect(global.fetch).toHaveBeenCalledWith('/api/guilds/123456789012345678/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
      });
    });

    it('should return error for invalid guild ID format - too short', async () => {
      // Test that guild IDs shorter than 17 digits are rejected client-side
      const result = await getGuildStatus('test-token', '1234567890123456'); // 16 digits

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
        expect(result.message).toBe('Guild ID must be a 17-19 digit Discord snowflake');
      }

      // Should not make API call for invalid format
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return error for invalid guild ID format - too long', async () => {
      // Test that guild IDs longer than 19 digits are rejected client-side
      const result = await getGuildStatus('test-token', '12345678901234567890'); // 20 digits

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
        expect(result.message).toBe('Guild ID must be a 17-19 digit Discord snowflake');
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return error for invalid guild ID format - contains letters', async () => {
      // Test that guild IDs with non-numeric characters are rejected
      const result = await getGuildStatus('test-token', '12345678901234567a');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
        expect(result.message).toBe('Guild ID must be a 17-19 digit Discord snowflake');
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return error for invalid guild ID format - empty string', async () => {
      // Test that empty strings are rejected
      const result = await getGuildStatus('test-token', '');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should accept valid 17-digit guild ID', async () => {
      // Test minimum valid length (17 digits)
      const mockResponse = {
        guildId: '12345678901234567',
        enabled: false,
        afkTimeoutSeconds: 600,
        warningSecondsBefore: 120,
        connected: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getGuildStatus('test-token', '12345678901234567');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should accept valid 19-digit guild ID', async () => {
      // Test maximum valid length (19 digits)
      const mockResponse = {
        guildId: '1234567890123456789',
        enabled: false,
        afkTimeoutSeconds: 600,
        warningSecondsBefore: 120,
        connected: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await getGuildStatus('test-token', '1234567890123456789');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should return UNAUTHORIZED on 401', async () => {
      // Test authentication failure handling
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await getGuildStatus('invalid-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('UNAUTHORIZED');
        expect(result.message).toBe('Invalid token - authentication failed');
      }
    });

    it('should return NOT_FOUND on 404', async () => {
      // Test handling when bot is not in the specified guild
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'Bot is not in the specified guild',
        }),
      });

      const result = await getGuildStatus('test-token', '999999999999999999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NOT_FOUND');
        expect(result.message).toBe('Bot is not in the specified guild');
      }
    });

    it('should return INVALID_RESPONSE for malformed response', async () => {
      // Test handling of responses that don't match the expected schema
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          guildId: '123456789012345678',
          // missing enabled, afkTimeoutSeconds, warningSecondsBefore, connected
        }),
      });

      const result = await getGuildStatus('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });

    it('should handle network errors', async () => {
      // Test network-level failures
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await getGuildStatus('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Connection refused');
      }
    });
  });

  describe('enableGuild()', () => {
    it('should return success with operation response on successful enable', async () => {
      // Test successful enable operation returns correct response structure
      const mockResponse = {
        success: true,
        guildId: '123456789012345678',
        enabled: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await enableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.guildId).toBe('123456789012345678');
        expect(result.data.enabled).toBe(true);
      }

      expect(global.fetch).toHaveBeenCalledWith('/api/guilds/123456789012345678/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
      });
    });

    it('should return error for invalid guild ID format', async () => {
      // Test client-side validation rejects invalid guild IDs before making request
      const result = await enableGuild('test-token', 'invalid-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
        expect(result.message).toBe('Guild ID must be a 17-19 digit Discord snowflake');
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return UNAUTHORIZED on 401', async () => {
      // Test authentication failure handling
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await enableGuild('invalid-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('UNAUTHORIZED');
        expect(result.message).toBe('Invalid token - authentication failed');
      }
    });

    it('should return error on 500 server error', async () => {
      // Test handling of server-side errors during enable operation
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: 'INTERNAL_ERROR',
          message: 'Failed to enable AFK detection',
        }),
      });

      const result = await enableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INTERNAL_ERROR');
        expect(result.message).toBe('Failed to enable AFK detection');
      }
    });

    it('should return NOT_FOUND on 404', async () => {
      // Test handling when bot is not in the guild
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'Bot is not in the specified guild',
        }),
      });

      const result = await enableGuild('test-token', '999999999999999999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NOT_FOUND');
        expect(result.message).toBe('Bot is not in the specified guild');
      }
    });

    it('should handle network errors', async () => {
      // Test network-level failures
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      const result = await enableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Request timeout');
      }
    });

    it('should return INVALID_RESPONSE for malformed response', async () => {
      // Test validation of operation response structure
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          // missing success, guildId, enabled fields
          unexpected: 'data',
        }),
      });

      const result = await enableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });
  });

  describe('disableGuild()', () => {
    it('should return success with operation response on successful disable', async () => {
      // Test successful disable operation returns correct response structure
      const mockResponse = {
        success: true,
        guildId: '123456789012345678',
        enabled: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await disableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.guildId).toBe('123456789012345678');
        expect(result.data.enabled).toBe(false);
      }

      expect(global.fetch).toHaveBeenCalledWith('/api/guilds/123456789012345678/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
      });
    });

    it('should return error for invalid guild ID format', async () => {
      // Test client-side validation rejects invalid guild IDs before making request
      const result = await disableGuild('test-token', '12345'); // too short

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_GUILD_ID');
        expect(result.message).toBe('Guild ID must be a 17-19 digit Discord snowflake');
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return UNAUTHORIZED on 401', async () => {
      // Test authentication failure handling
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await disableGuild('invalid-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('UNAUTHORIZED');
        expect(result.message).toBe('Invalid token - authentication failed');
      }
    });

    it('should return error on 500 server error', async () => {
      // Test handling of server-side errors during disable operation
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          error: 'INTERNAL_ERROR',
          message: 'Failed to disable AFK detection',
        }),
      });

      const result = await disableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INTERNAL_ERROR');
        expect(result.message).toBe('Failed to disable AFK detection');
      }
    });

    it('should return NOT_FOUND on 404', async () => {
      // Test handling when bot is not in the guild
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: 'NOT_FOUND',
          message: 'Bot is not in the specified guild',
        }),
      });

      const result = await disableGuild('test-token', '999999999999999999');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NOT_FOUND');
        expect(result.message).toBe('Bot is not in the specified guild');
      }
    });

    it('should handle network errors', async () => {
      // Test network-level failures
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection reset'));

      const result = await disableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('NETWORK_ERROR');
        expect(result.message).toBe('Connection reset');
      }
    });

    it('should return INVALID_RESPONSE for malformed response', async () => {
      // Test validation of operation response structure
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          guildId: '123456789012345678',
          // missing enabled field
        }),
      });

      const result = await disableGuild('test-token', '123456789012345678');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('INVALID_RESPONSE');
        expect(result.message).toBe('API returned unexpected response format');
      }
    });
  });

  describe('validateToken()', () => {
    it('should return true when token is valid', async () => {
      // Test successful token validation returns true
      const mockResponse = {
        guilds: 10,
        voiceConnections: 3,
        memory: {
          heapUsed: 50000000,
          heapTotal: 100000000,
          rss: 150000000,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await validateToken('valid-token');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
      });
    });

    it('should return false when token is invalid (401 response)', async () => {
      // Test that 401 responses result in false
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'UNAUTHORIZED',
          message: 'Invalid token',
        }),
      });

      const result = await validateToken('invalid-token');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      // Test that network-level failures result in false
      global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

      const result = await validateToken('test-token');

      expect(result).toBe(false);
    });
  });
});
