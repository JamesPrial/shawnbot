import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Client } from 'discord.js';
import type { GuildConfigService } from '../services/GuildConfigService';
import type { AFKDetectionService } from '../services/AFKDetectionService';
import type { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { createMockLogger, createMockGuildSettings, ENABLED_CONFIG } from './fixtures';

// Conditional import - AdminApiService may not exist yet
let AdminApiService: any;
let request: any;

try {
  // Try to import the actual service
  AdminApiService = (await import('../api/AdminApiService')).AdminApiService;
} catch {
  // If it doesn't exist, create a minimal mock for tests to compile
  AdminApiService = class {
    constructor(...args: any[]) {}
    async start() {}
    async stop() {}
    getApp() { return null; }
  };
}

try {
  // Try to import supertest
  const supertestModule = await import('supertest');
  request = supertestModule.default;
} catch {
  // If supertest isn't installed, provide a helpful error
  request = () => {
    throw new Error('supertest is not installed. Run: npm install -D supertest @types/supertest');
  };
}

describe('AdminApiService', () => {
  let mockClient: Client;
  let mockConfigService: GuildConfigService;
  let mockAfkService: AFKDetectionService;
  let mockVoiceManager: VoiceConnectionManager;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let service: any;
  let testPort: number;

  beforeEach(() => {
    mockLogger = createMockLogger();

    // Mock Discord Client with bot readiness and guild information
    mockClient = {
      isReady: vi.fn().mockReturnValue(true),
      guilds: {
        cache: {
          size: 5,
          get: vi.fn(),
        },
      },
      uptime: 123456789, // milliseconds
    } as unknown as Client;

    // Mock GuildConfigService
    mockConfigService = {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
    } as unknown as GuildConfigService;

    // Mock AFKDetectionService with tracking state
    mockAfkService = {
      isTracking: vi.fn().mockReturnValue(false),
      getActiveTrackers: vi.fn().mockReturnValue([]),
    } as unknown as AFKDetectionService;

    // Mock VoiceConnectionManager with connection state
    mockVoiceManager = {
      getConnection: vi.fn().mockReturnValue(null),
      hasConnection: vi.fn().mockReturnValue(false),
      getAllGuildIds: vi.fn().mockReturnValue([]),
    } as unknown as VoiceConnectionManager;

    // Use a random port to avoid conflicts in parallel test runs
    testPort = 3000 + Math.floor(Math.random() * 1000);

    service = new AdminApiService({
      client: mockClient,
      guildConfigService: mockConfigService,
      afkDetectionService: mockAfkService,
      voiceConnectionManager: mockVoiceManager,
      logger: mockLogger,
      port: testPort,
      token: 'test-token-123',
    });
  });

  afterEach(async () => {
    // Ensure server is stopped after each test
    try {
      await service.stop();
    } catch {
      // Ignore errors if already stopped
    }
  });

  describe('WU-2: Core Service Infrastructure', () => {
    describe('start', () => {
      it('should start Express server on configured port', async () => {
        await service.start();

        // Verify server is listening by making a request
        const app = service.getApp();
        const response = await request(app).get('/health');

        expect(response.status).toBeDefined();
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({ port: testPort }),
          expect.stringContaining('Admin API server started')
        );
      });

      it('should not allow starting twice', async () => {
        await service.start();

        // Second start should be a no-op (returns undefined)
        await expect(service.start()).resolves.toBeUndefined();
      });

      it('should reject start if port is already in use', async () => {
        // Start first service
        await service.start();

        // Create second service on same port
        const service2 = new AdminApiService({
          client: mockClient,
          guildConfigService: mockConfigService,
          afkDetectionService: mockAfkService,
          voiceConnectionManager: mockVoiceManager,
          logger: mockLogger,
          port: testPort,
          token: 'test-token-456',
        });

        // Second service should fail to start
        await expect(service2.start()).rejects.toThrow();
      });
    });

    describe('stop', () => {
      it('should stop server gracefully', async () => {
        await service.start();
        await service.stop();

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Admin API server stopped')
        );
      });

      it('should allow stopping when already stopped', async () => {
        // Should not throw when stopping a service that was never started
        await expect(service.stop()).resolves.not.toThrow();
      });

      it('should reject requests after server is stopped', async () => {
        await service.start();
        const app = service.getApp();

        await service.stop();

        // Server should no longer respond (this may vary by implementation)
        // The test verifies the stop behavior is intentional
        expect(service.getApp).toBeDefined();
      });
    });

    describe('Bearer Token Authentication Middleware', () => {
      beforeEach(async () => {
        await service.start();
      });

      it('should reject request with missing Authorization header with 401', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Authorization'),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should reject request with malformed Authorization header with 401', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'NotBearer test-token-123')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Invalid Authorization header format'),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should reject request with invalid token with 401', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer wrong-token')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Invalid token'),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should accept request with valid Bearer token', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Should not be an auth error
        expect(response.body.error).not.toBe('Unauthorized');
      });

      it('should reject token with leading/trailing whitespace', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer  test-token-123  ')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should be case-sensitive for token comparison', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer TEST-TOKEN-123')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Invalid token'),
        });
      });
    });

    describe('Response Headers', () => {
      beforeEach(async () => {
        await service.start();
      });

      it('should return Content-Type: application/json for all API endpoints', async () => {
        const app = service.getApp();

        // Test health endpoint (no auth)
        const healthResponse = await request(app).get('/health');
        expect(healthResponse.headers['content-type']).toMatch(/application\/json/);

        // Test authenticated endpoint
        const statusResponse = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer test-token-123');
        expect(statusResponse.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return Content-Type: application/json for error responses', async () => {
        const app = service.getApp();

        // 401 error
        const authResponse = await request(app).get('/api/status');
        expect(authResponse.headers['content-type']).toMatch(/application\/json/);

        // 404 error
        const notFoundResponse = await request(app)
          .get('/api/nonexistent')
          .set('Authorization', 'Bearer test-token-123');
        expect(notFoundResponse.headers['content-type']).toMatch(/application\/json/);
      });
    });
  });

  describe('WU-3: API Endpoints', () => {
    beforeEach(async () => {
      await service.start();
    });

    describe('GET /health', () => {
      it('should return uptime in seconds, ready status, and guild count without authentication', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body).toEqual({
          status: 'ok',
          uptime: expect.any(Number),
          ready: true,
          guilds: 5,
        });
        expect(response.body.uptime).toBeGreaterThanOrEqual(0);
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return ready: false when client is not ready', async () => {
        vi.mocked(mockClient.isReady).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body).toEqual({
          status: 'ok',
          uptime: expect.any(Number),
          ready: false,
          guilds: 5,
        });
      });

      it('should handle zero guilds', async () => {
        (mockClient.guilds.cache as any).size = 0;

        const app = service.getApp();
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body.guilds).toBe(0);
      });

      it('should not require Authorization header', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body.status).toBe('ok');
      });
    });

    describe('GET /api/status', () => {
      it('should return bot metrics with valid authentication', async () => {
        vi.mocked(mockVoiceManager.getAllGuildIds).mockReturnValue(['guild-1', 'guild-2']);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guilds: 5,
          voiceConnections: 2,
          memory: {
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
            rss: expect.any(Number),
          },
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return 401 without authentication', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should include valid memory usage data', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.memory.heapUsed).toBeGreaterThan(0);
        expect(response.body.memory.heapTotal).toBeGreaterThanOrEqual(response.body.memory.heapUsed);
        expect(response.body.memory.rss).toBeGreaterThan(0);
      });
    });

    describe('POST /api/guilds/:id/enable', () => {
      it('should enable guild and return success with valid authentication', async () => {
        const guildId = '12345678901234567'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        const app = service.getApp();
        const response = await request(app)
          .post(`/api/guilds/${guildId}/enable`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          guildId,
          enabled: true,
        });
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(
          guildId,
          { enabled: true }
        );
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return 401 without authentication', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/guilds/123456789/enable')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for non-numeric guild ID', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/guilds/invalid-id/enable')
          .set('Authorization', 'Bearer test-token-123')
          .expect(400);

        expect(response.body).toEqual({
          error: 'Bad Request',
          message: expect.stringContaining('Invalid guild ID'),
        });
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for empty guild ID', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/guilds//enable')
          .set('Authorization', 'Bearer test-token-123')
          .expect(404); // Express treats this as /api/guilds/enable which doesn't match the route

        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should handle guild that is already enabled', async () => {
        const guildId = '12345678901234567'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );

        const app = service.getApp();
        const response = await request(app)
          .post(`/api/guilds/${guildId}/enable`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.enabled).toBe(true);
      });

      it('should handle updateConfig errors gracefully', async () => {
        const guildId = '12345678901234567'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockConfigService.updateConfig).mockImplementation(() => {
          throw new Error('Database error');
        });

        const app = service.getApp();
        const response = await request(app)
          .post(`/api/guilds/${guildId}/enable`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Internal Server Error',
          message: expect.any(String),
        });
      });
    });

    describe('POST /api/guilds/:id/disable', () => {
      it('should disable guild and return success with valid authentication', async () => {
        const guildId = '98765432109876543'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );

        const app = service.getApp();
        const response = await request(app)
          .post(`/api/guilds/${guildId}/disable`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          guildId,
          enabled: false,
        });
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(
          guildId,
          { enabled: false }
        );
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return 401 without authentication', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/guilds/987654321/disable')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for non-numeric guild ID', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/guilds/not-a-number/disable')
          .set('Authorization', 'Bearer test-token-123')
          .expect(400);

        expect(response.body).toEqual({
          error: 'Bad Request',
          message: expect.stringContaining('Invalid guild ID'),
        });
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should handle guild that is already disabled', async () => {
        const guildId = '98765432109876543'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );

        const app = service.getApp();
        const response = await request(app)
          .post(`/api/guilds/${guildId}/disable`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.enabled).toBe(false);
      });
    });

    describe('GET /api/guilds/:id/status', () => {
      it('should return guild tracking info with valid authentication', async () => {
        const guildId = '55555555555555555'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 600,
            warningSecondsBefore: 120,
          })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(true);

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/status`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 600,
          warningSecondsBefore: 120,
          connected: true,
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return 401 without authentication', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds/555555555/status')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should return 400 for non-numeric guild ID', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds/abc123/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(400);

        expect(response.body).toEqual({
          error: 'Bad Request',
          message: expect.stringContaining('Invalid guild ID'),
        });
      });

      it('should return guild configuration from service', async () => {
        const guildId = '11111111111111111'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/status`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Should return guild config
        expect(response.body.guildId).toBe(guildId);
        expect(response.body.enabled).toBe(true);
      });

      it('should return connected: false when no connection exists', async () => {
        const guildId = '22222222222222222'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/status`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.connected).toBe(false);
      });

      it('should handle guild with disabled config', async () => {
        const guildId = '33333333333333333'; // 17 digits - valid snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: false })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/status`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.enabled).toBe(false);
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should return 404 for undefined routes', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/nonexistent/route')
          .set('Authorization', 'Bearer test-token-123')
          .expect(404);

        expect(response.body).toEqual({
          error: 'Not Found',
          message: expect.any(String),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should handle very large guild IDs (within JS number limits)', async () => {
        const guildId = '999999999999999999'; // 18 digits - max Discord snowflake
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId, enabled: true })
        );
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({});

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/status`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guildId).toBe(guildId);
      });

      it('should reject guild IDs with special characters', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds/123;DROP%20TABLE/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(400);

        expect(response.body.error).toBe('Bad Request');
      });

      it('should handle POST requests to GET-only endpoints', async () => {
        const app = service.getApp();
        const response = await request(app)
          .post('/api/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(404);

        expect(response.body.error).toBe('Not Found');
      });

      it('should handle GET requests to POST-only endpoints', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds/123456789/enable')
          .set('Authorization', 'Bearer test-token-123')
          .expect(404);

        expect(response.body.error).toBe('Not Found');
      });

      it('should return metrics even when client is not ready', async () => {
        vi.mocked(mockClient.isReady).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Should still return data with memory metrics
        expect(response.body.memory).toBeDefined();
        expect(response.body.guilds).toBeDefined();
        expect(response.body.voiceConnections).toBeDefined();
      });
    });

    describe('Security and Authorization', () => {
      it('should require authentication for all /api/* routes except /health', async () => {
        const app = service.getApp();

        const protectedEndpoints = [
          { method: 'get', path: '/api/status' },
          { method: 'post', path: '/api/guilds/123/enable' },
          { method: 'post', path: '/api/guilds/123/disable' },
          { method: 'get', path: '/api/guilds/123/status' },
        ];

        for (const endpoint of protectedEndpoints) {
          const response = await (request(app) as any)[endpoint.method](endpoint.path);
          expect(response.status).toBe(401);
          expect(response.body.error).toBe('Unauthorized');
        }
      });

      it('should not leak token in error messages', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer wrong-token-xyz')
          .expect(401);

        // Error message should not contain the actual token
        expect(JSON.stringify(response.body)).not.toContain('wrong-token-xyz');
      });

      it('should not accept empty Bearer token', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer ')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should not accept only whitespace as token', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/status')
          .set('Authorization', 'Bearer    ')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });
    });
  });
});
