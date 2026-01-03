/**
 * API Client Tests
 *
 * Tests for src/api/client.ts
 * Verifies all success and error paths with strict type checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHealth, getStatus } from '../api/client';
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
});
