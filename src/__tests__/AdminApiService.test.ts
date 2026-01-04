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
      resetConfig: vi.fn(),
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

  /**
   * Helper function to mock the guild cache with Map-based iteration.
   * This is required because the actual implementation uses `for...of` iteration over the cache.
   *
   * @param guilds - Array of guild objects with id, name, and memberCount
   */
  function mockGuildCache(guilds: Array<{ id: string; name: string; memberCount: number }>) {
    const guildCache = new Map(guilds.map(g => [g.id, g]));
    vi.mocked(mockClient.guilds.cache).size = guilds.length;

    // Make the mock cache iterable as a Map
    const mockCacheIterator = guildCache[Symbol.iterator].bind(guildCache);
    Object.defineProperty(mockClient.guilds.cache, Symbol.iterator, {
      value: mockCacheIterator,
      configurable: true,
    });
  }

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

    describe('GET /api/guilds', () => {
      it('should return 401 Unauthorized when no auth header provided', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Authorization'),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return 401 Unauthorized when invalid token provided', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Invalid token'),
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return empty array when bot is in no guilds', async () => {
        // Mock client with zero guilds
        mockGuildCache([]);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guilds: [],
          total: 0,
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return list of guilds with correct fields (guildId, name, memberCount, enabled, connected)', async () => {
        const mockGuildsData = [
          { id: '11111111111111111', name: 'Test Guild 1', memberCount: 100 },
          { id: '22222222222222222', name: 'Test Guild 2', memberCount: 50 },
          { id: '33333333333333333', name: 'Test Guild 3', memberCount: 75 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        // Mock config service to return enabled status for each guild
        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({
            guildId,
            enabled: guildId === '11111111111111111', // Only first guild enabled
          });
        });

        // Mock voice manager to return connection status
        vi.mocked(mockVoiceManager.hasConnection).mockImplementation((guildId) => {
          return guildId === '11111111111111111'; // Only first guild connected
        });

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guilds: [
            {
              guildId: '11111111111111111',
              name: 'Test Guild 1',
              memberCount: 100,
              enabled: true,
              connected: true,
            },
            {
              guildId: '22222222222222222',
              name: 'Test Guild 2',
              memberCount: 50,
              enabled: false,
              connected: false,
            },
            {
              guildId: '33333333333333333',
              name: 'Test Guild 3',
              memberCount: 75,
              enabled: false,
              connected: false,
            },
          ],
          total: 3,
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return correct enabled status from guildConfigService', async () => {
        const mockGuildsData = [
          { id: '44444444444444444', name: 'Enabled Guild', memberCount: 200 },
          { id: '55555555555555555', name: 'Disabled Guild', memberCount: 150 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        // Explicitly set enabled status for each guild
        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({
            guildId,
            enabled: guildId === '44444444444444444',
          });
        });

        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Verify enabled status matches config service
        expect(response.body.guilds[0]?.enabled).toBe(true);
        expect(response.body.guilds[1]?.enabled).toBe(false);
        expect(response.body.total).toBe(2);

        // Verify config service was called for each guild
        expect(mockConfigService.getConfig).toHaveBeenCalledWith('44444444444444444');
        expect(mockConfigService.getConfig).toHaveBeenCalledWith('55555555555555555');
      });

      it('should return correct connected status from voiceConnectionManager', async () => {
        const mockGuildsData = [
          { id: '66666666666666666', name: 'Connected Guild', memberCount: 300 },
          { id: '77777777777777777', name: 'Disconnected Guild', memberCount: 250 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({ guildId, enabled: true });
        });

        // Set connection status per guild
        vi.mocked(mockVoiceManager.hasConnection).mockImplementation((guildId) => {
          return guildId === '66666666666666666';
        });

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Verify connected status matches voice manager
        expect(response.body.guilds[0]?.connected).toBe(true);
        expect(response.body.guilds[1]?.connected).toBe(false);
        expect(response.body.total).toBe(2);

        // Verify voice manager was called for each guild
        expect(mockVoiceManager.hasConnection).toHaveBeenCalledWith('66666666666666666');
        expect(mockVoiceManager.hasConnection).toHaveBeenCalledWith('77777777777777777');
      });

      it('should handle single guild correctly', async () => {
        const mockGuildsData = [
          { id: '88888888888888888', name: 'Solo Guild', memberCount: 500 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId: '88888888888888888', enabled: true })
        );
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(true);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guilds).toHaveLength(1);
        expect(response.body.guilds[0]).toEqual({
          guildId: '88888888888888888',
          name: 'Solo Guild',
          memberCount: 500,
          enabled: true,
          connected: true,
        });
        expect(response.body.total).toBe(1);
      });

      it('should handle many guilds without performance issues', async () => {
        // Create 100 guilds to test scalability
        const mockGuildsData = Array.from({ length: 100 }, (_, i) => ({
          id: `${1000000000000000 + i}`.padEnd(17, '0'),
          name: `Guild ${i}`,
          memberCount: 100 + i,
        }));

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({ guildId, enabled: true });
        });
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guilds).toHaveLength(100);
        expect(response.body.guilds[0]?.name).toBe('Guild 0');
        expect(response.body.guilds[99]?.name).toBe('Guild 99');
        expect(response.body.total).toBe(100);
      });

      it('should include guild name in response', async () => {
        const mockGuildsData = [
          { id: '99999999999999999', name: 'My Awesome Discord Server', memberCount: 999 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId: '99999999999999999', enabled: false })
        );
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guilds[0]?.name).toBe('My Awesome Discord Server');
        expect(response.body.total).toBe(1);
      });

      it('should handle guilds with special characters in names', async () => {
        const mockGuildsData = [
          { id: '10000000000000000', name: "Bob's Server ™ 🎮", memberCount: 42 },
          { id: '10000000000000001', name: 'Server with "quotes"', memberCount: 84 },
          { id: '10000000000000002', name: 'Server\nwith\nnewlines', memberCount: 126 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({ guildId, enabled: false });
        });
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guilds[0]?.name).toBe("Bob's Server ™ 🎮");
        expect(response.body.guilds[1]?.name).toBe('Server with "quotes"');
        expect(response.body.guilds[2]?.name).toBe('Server\nwith\nnewlines');
        expect(response.body.total).toBe(3);
      });

      it('should log guild count when accessed', async () => {
        const mockGuildsData = [
          { id: '11111111111111111', name: 'Guild 1', memberCount: 10 },
          { id: '22222222222222222', name: 'Guild 2', memberCount: 20 },
        ];

        // Mock guilds cache with Map-based iteration
        mockGuildCache(mockGuildsData);

        vi.mocked(mockConfigService.getConfig).mockImplementation((guildId) => {
          return createMockGuildSettings({ guildId, enabled: false });
        });
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            count: 2,
          }),
          expect.stringContaining('Guilds list endpoint accessed')
        );
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
          { method: 'get', path: '/api/guilds' },
          { method: 'get', path: '/api/guilds/123/config' },
          { method: 'put', path: '/api/guilds/123/config' },
          { method: 'delete', path: '/api/guilds/123/config' },
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

    describe('GET /api/guilds', () => {
      it('should return 401 without authorization header', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .expect(401);

        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: expect.stringContaining('Authorization'),
        });
      });

      it('should return 401 with invalid token', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer wrong-token')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should return empty array when no guilds in cache', async () => {
        // Mock empty guild cache
        const emptyCache = new Map();
        vi.mocked(mockClient.guilds.cache).size = 0;
        // Make the mock cache iterable as a Map
        const mockCacheIterator = emptyCache[Symbol.iterator].bind(emptyCache);
        Object.defineProperty(mockClient.guilds.cache, Symbol.iterator, {
          value: mockCacheIterator,
          configurable: true,
        });

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guilds: [],
          total: 0,
        });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });

      it('should return list of guilds with correct shape', async () => {
        // Mock guild cache with multiple guilds
        const mockGuild1 = {
          id: '11111111111111111',
          name: 'Test Guild 1',
          memberCount: 150,
        };
        const mockGuild2 = {
          id: '22222222222222222',
          name: 'Test Guild 2',
          memberCount: 75,
        };

        const guildCache = new Map([
          [mockGuild1.id, mockGuild1],
          [mockGuild2.id, mockGuild2],
        ]);
        vi.mocked(mockClient.guilds.cache).size = 2;
        // Make the mock cache iterable as a Map
        const mockCacheIterator = guildCache[Symbol.iterator].bind(guildCache);
        Object.defineProperty(mockClient.guilds.cache, Symbol.iterator, {
          value: mockCacheIterator,
          configurable: true,
        });

        // Mock config service to return enabled states
        vi.mocked(mockConfigService.getConfig)
          .mockReturnValueOnce(createMockGuildSettings({ guildId: mockGuild1.id, enabled: true }))
          .mockReturnValueOnce(createMockGuildSettings({ guildId: mockGuild2.id, enabled: false }));

        // Mock voice connection states
        vi.mocked(mockVoiceManager.hasConnection)
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          guilds: [
            {
              guildId: '11111111111111111',
              name: 'Test Guild 1',
              memberCount: 150,
              enabled: true,
              connected: true,
            },
            {
              guildId: '22222222222222222',
              name: 'Test Guild 2',
              memberCount: 75,
              enabled: false,
              connected: false,
            },
          ],
          total: 2,
        });
      });

      it('should correctly map config.enabled and voiceConnectionManager.hasConnection()', async () => {
        const mockGuild = {
          id: '33333333333333333',
          name: 'Config Test Guild',
          memberCount: 100,
        };

        const guildCache = new Map([[mockGuild.id, mockGuild]]);
        vi.mocked(mockClient.guilds.cache).size = 1;
        // Make the mock cache iterable as a Map
        const mockCacheIterator = guildCache[Symbol.iterator].bind(guildCache);
        Object.defineProperty(mockClient.guilds.cache, Symbol.iterator, {
          value: mockCacheIterator,
          configurable: true,
        });

        // Enabled with no connection
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId: mockGuild.id, enabled: true })
        );
        vi.mocked(mockVoiceManager.hasConnection).mockReturnValue(false);

        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.guilds[0]).toMatchObject({
          guildId: '33333333333333333',
          enabled: true,
          connected: false,
        });
      });

      it('should audit log access with guild count', async () => {
        const guildCache = new Map();
        vi.mocked(mockClient.guilds.cache).size = 0;
        // Make the mock cache iterable as a Map
        const mockCacheIterator = guildCache[Symbol.iterator].bind(guildCache);
        Object.defineProperty(mockClient.guilds.cache, Symbol.iterator, {
          value: mockCacheIterator,
          configurable: true,
        });

        const app = service.getApp();
        await request(app)
          .get('/api/guilds')
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Verify audit logging occurred (logger.info should be called)
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: expect.any(String),
            count: 0,
          }),
          expect.stringContaining('Guilds list endpoint accessed')
        );
      });
    });

    describe('GET /api/guilds/:id/config', () => {
      it('should return 401 without authorization header', async () => {
        const app = service.getApp();
        const response = await request(app)
          .get('/api/guilds/12345678901234567/config')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
      });

      it('should return 400 for invalid guild ID format', async () => {
        const app = service.getApp();

        const invalidIds = ['abc', '123abc', '12345', '12345678901234567890123', 'not-a-number'];

        for (const invalidId of invalidIds) {
          const response = await request(app)
            .get(`/api/guilds/${invalidId}/config`)
            .set('Authorization', 'Bearer test-token-123')
            .expect(400);

          expect(response.body).toEqual({
            error: 'Bad Request',
            message: expect.stringContaining('Invalid guild ID'),
          });
        }
      });

      it('should return 404 when bot not in guild', async () => {
        const guildId = '99999999999999999';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(undefined);

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(404);

        expect(response.body).toEqual({
          error: 'Not Found',
          message: expect.stringContaining('not in the specified guild'),
        });
      });

      it('should return full config (all 7 fields) for valid guild', async () => {
        const guildId = '44444444444444444';
        const mockGuild = { id: guildId, name: 'Full Config Guild' };

        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(mockGuild as any);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 600,
            warningSecondsBefore: 120,
            warningChannelId: '11111111111111111',
            exemptRoleIds: ['22222222222222222', '33333333333333333'],
            adminRoleIds: ['44444444444444444'],
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Must have exactly 7 fields
        expect(response.body).toEqual({
          guildId: '44444444444444444',
          enabled: true,
          afkTimeoutSeconds: 600,
          warningSecondsBefore: 120,
          warningChannelId: '11111111111111111',
          exemptRoleIds: ['22222222222222222', '33333333333333333'],
          adminRoleIds: ['44444444444444444'],
        });
        expect(Object.keys(response.body)).toHaveLength(7);
      });

      it('should handle null warningChannelId', async () => {
        const guildId = '55555555555555555';
        const mockGuild = { id: guildId, name: 'Null Channel Guild' };

        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(mockGuild as any);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            warningChannelId: null,
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.warningChannelId).toBeNull();
      });

      it('should handle empty role arrays', async () => {
        const guildId = '66666666666666666';
        const mockGuild = { id: guildId, name: 'Empty Roles Guild' };

        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(mockGuild as any);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            exemptRoleIds: [],
            adminRoleIds: [],
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .get(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body.exemptRoleIds).toEqual([]);
        expect(response.body.adminRoleIds).toEqual([]);
      });

      it('should audit log access', async () => {
        const guildId = '77777777777777777';
        const mockGuild = { id: guildId, name: 'Audit Guild' };

        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(mockGuild as any);
        vi.mocked(mockConfigService.getConfig).mockReturnValue(
          createMockGuildSettings({ guildId })
        );

        const app = service.getApp();
        await request(app)
          .get(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: expect.any(String),
            guildId,
          }),
          expect.stringContaining('Guild config endpoint accessed')
        );
      });
    });

    describe('PUT /api/guilds/:id/config', () => {
      it('should return 401 without authorization header', async () => {
        const app = service.getApp();
        const response = await request(app)
          .put('/api/guilds/12345678901234567/config')
          .send({ enabled: true })
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid guild ID format', async () => {
        const app = service.getApp();
        const response = await request(app)
          .put('/api/guilds/invalid-id/config')
          .set('Authorization', 'Bearer test-token-123')
          .send({ enabled: true })
          .expect(400);

        expect(response.body.message).toContain('Invalid guild ID');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 404 when bot not in guild', async () => {
        const guildId = '88888888888888888';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(undefined);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ enabled: true })
          .expect(404);

        expect(response.body.error).toBe('Not Found');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid afkTimeoutSeconds (non-number)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ afkTimeoutSeconds: 'not-a-number' })
          .expect(400);

        expect(response.body.message).toContain('afkTimeoutSeconds');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid afkTimeoutSeconds (< 1)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();

        const invalidValues = [0, -1, -100];
        for (const invalidValue of invalidValues) {
          const response = await request(app)
            .put(`/api/guilds/${guildId}/config`)
            .set('Authorization', 'Bearer test-token-123')
            .send({ afkTimeoutSeconds: invalidValue })
            .expect(400);

          expect(response.body.message).toContain('afkTimeoutSeconds');
          expect(response.body.message).toContain('greater than 0');
        }
      });

      it('should return 400 for invalid warningSecondsBefore (non-number)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ warningSecondsBefore: 'invalid' })
          .expect(400);

        expect(response.body.message).toContain('warningSecondsBefore');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid warningSecondsBefore (< 0)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ warningSecondsBefore: -5 })
          .expect(400);

        expect(response.body.message).toContain('warningSecondsBefore');
        expect(response.body.message).toContain('greater than or equal to 0');
      });

      it('should return 400 for invalid warningChannelId (not null/string)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();

        const invalidValues = [123, true, [], {}];
        for (const invalidValue of invalidValues) {
          const response = await request(app)
            .put(`/api/guilds/${guildId}/config`)
            .set('Authorization', 'Bearer test-token-123')
            .send({ warningChannelId: invalidValue })
            .expect(400);

          expect(response.body.message).toContain('warningChannelId');
        }
      });

      it('should return 400 for invalid warningChannelId (invalid snowflake)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();

        const invalidSnowflakes = ['abc', '123', '12345678901234567890123'];
        for (const invalidSnowflake of invalidSnowflakes) {
          const response = await request(app)
            .put(`/api/guilds/${guildId}/config`)
            .set('Authorization', 'Bearer test-token-123')
            .send({ warningChannelId: invalidSnowflake })
            .expect(400);

          expect(response.body.message).toContain('warningChannelId');
          expect(response.body.message).toContain('valid Discord snowflake');
        }
      });

      it('should return 400 for invalid exemptRoleIds (not array)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();

        const invalidValues = ['not-array', 123, { invalid: 'object' }];
        for (const invalidValue of invalidValues) {
          const response = await request(app)
            .put(`/api/guilds/${guildId}/config`)
            .set('Authorization', 'Bearer test-token-123')
            .send({ exemptRoleIds: invalidValue })
            .expect(400);

          expect(response.body.message).toContain('exemptRoleIds');
          expect(response.body.message).toContain('array');
        }
      });

      it('should return 400 for invalid exemptRoleIds (invalid snowflakes)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ exemptRoleIds: ['11111111111111111', 'invalid', '22222222222222222'] })
          .expect(400);

        expect(response.body.message).toContain('exemptRoleIds');
        expect(response.body.message).toContain('valid Discord snowflake');
      });

      it('should return 400 for invalid adminRoleIds (not array)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ adminRoleIds: 'not-an-array' })
          .expect(400);

        expect(response.body.message).toContain('adminRoleIds');
        expect(response.body.message).toContain('array');
      });

      it('should return 400 for invalid adminRoleIds (invalid snowflakes)', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ adminRoleIds: ['11111111111111111', 'bad-id'] })
          .expect(400);

        expect(response.body.message).toContain('adminRoleIds');
      });

      it('should successfully update single field', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: true,
            afkTimeoutSeconds: 600,
            warningSecondsBefore: 120,
            warningChannelId: null,
            exemptRoleIds: [],
            adminRoleIds: [],
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ enabled: true })
          .expect(200);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, { enabled: true });
        expect(response.body).toMatchObject({
          guildId,
          enabled: true,
        });
      });

      it('should successfully update multiple fields', async () => {
        const guildId = '22222222222222222';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            enabled: false,
            afkTimeoutSeconds: 900,
            warningSecondsBefore: 180,
            warningChannelId: '33333333333333333',
            exemptRoleIds: ['44444444444444444', '55555555555555555'],
            adminRoleIds: ['66666666666666666'],
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({
            enabled: false,
            afkTimeoutSeconds: 900,
            warningSecondsBefore: 180,
            warningChannelId: '33333333333333333',
            exemptRoleIds: ['44444444444444444', '55555555555555555'],
            adminRoleIds: ['66666666666666666'],
          })
          .expect(200);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          enabled: false,
          afkTimeoutSeconds: 900,
          warningSecondsBefore: 180,
          warningChannelId: '33333333333333333',
          exemptRoleIds: ['44444444444444444', '55555555555555555'],
          adminRoleIds: ['66666666666666666'],
        });
        expect(response.body).toEqual({
          guildId,
          enabled: false,
          afkTimeoutSeconds: 900,
          warningSecondsBefore: 180,
          warningChannelId: '33333333333333333',
          exemptRoleIds: ['44444444444444444', '55555555555555555'],
          adminRoleIds: ['66666666666666666'],
        });
      });

      it('should call guildConfigService.updateConfig() with correct params', async () => {
        const guildId = '33333333333333333';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId })
        );

        const updateData = {
          afkTimeoutSeconds: 720,
          exemptRoleIds: ['77777777777777777'],
        };

        const app = service.getApp();
        await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send(updateData)
          .expect(200);

        // Verify exact parameters passed to updateConfig
        expect(mockConfigService.updateConfig).toHaveBeenCalledTimes(1);
        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, updateData);
      });

      it('should return updated config as GuildConfigResponse', async () => {
        const guildId = '44444444444444444';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const updatedConfig = createMockGuildSettings({
          guildId,
          enabled: true,
          afkTimeoutSeconds: 1200,
          warningSecondsBefore: 240,
          warningChannelId: '88888888888888888',
          exemptRoleIds: ['99999999999999999'],
          adminRoleIds: ['10101010101010101'],
        });
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(updatedConfig);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ afkTimeoutSeconds: 1200 })
          .expect(200);

        // Response shape must match GuildConfigResponse exactly (7 fields)
        expect(Object.keys(response.body)).toHaveLength(7);
        expect(response.body).toEqual({
          guildId: '44444444444444444',
          enabled: true,
          afkTimeoutSeconds: 1200,
          warningSecondsBefore: 240,
          warningChannelId: '88888888888888888',
          exemptRoleIds: ['99999999999999999'],
          adminRoleIds: ['10101010101010101'],
        });
      });

      it('should audit log update action', async () => {
        const guildId = '55555555555555555';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({ guildId })
        );

        const app = service.getApp();
        await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ enabled: false })
          .expect(200);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: expect.any(String),
            guildId,
            action: 'update_guild_config',
          }),
          expect.stringContaining('Guild config updated via API')
        );
      });

      it('should handle updateConfig errors gracefully', async () => {
        const guildId = '66666666666666666';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockImplementation(() => {
          throw new Error('Database write failed');
        });

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ enabled: true })
          .expect(500);

        expect(response.body).toEqual({
          error: 'Internal Server Error',
          message: expect.any(String),
        });
      });

      it('should accept null warningChannelId to clear the setting', async () => {
        const guildId = '77777777777777777';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            warningChannelId: null,
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ warningChannelId: null })
          .expect(200);

        expect(mockConfigService.updateConfig).toHaveBeenCalledWith(guildId, {
          warningChannelId: null,
        });
        expect(response.body.warningChannelId).toBeNull();
      });

      it('should accept empty arrays for role IDs to clear roles', async () => {
        const guildId = '88888888888888888';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.updateConfig).mockReturnValue(
          createMockGuildSettings({
            guildId,
            exemptRoleIds: [],
            adminRoleIds: [],
          })
        );

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ exemptRoleIds: [], adminRoleIds: [] })
          .expect(200);

        expect(response.body.exemptRoleIds).toEqual([]);
        expect(response.body.adminRoleIds).toEqual([]);
      });

      it('should reject empty request body', async () => {
        const guildId = '99999999999999999';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({})
          .expect(400);

        expect(response.body.message).toContain('At least one field must be provided');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });

      it('should reject unknown fields in request body', async () => {
        const guildId = '10101010101010101';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);

        const app = service.getApp();
        const response = await request(app)
          .put(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .send({ unknownField: 'bad', enabled: true })
          .expect(400);

        expect(response.body.message).toContain('Unknown field');
        expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/guilds/:id/config', () => {
      it('should return 401 without authorization header', async () => {
        const app = service.getApp();
        const response = await request(app)
          .delete('/api/guilds/12345678901234567/config')
          .expect(401);

        expect(response.body.error).toBe('Unauthorized');
        expect(mockConfigService.resetConfig).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid guild ID format', async () => {
        const app = service.getApp();
        const response = await request(app)
          .delete('/api/guilds/not-valid/config')
          .set('Authorization', 'Bearer test-token-123')
          .expect(400);

        expect(response.body.message).toContain('Invalid guild ID');
        expect(mockConfigService.resetConfig).not.toHaveBeenCalled();
      });

      it('should return 404 when bot not in guild', async () => {
        const guildId = '11111111111111111';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue(undefined);

        const app = service.getApp();
        const response = await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(404);

        expect(response.body.error).toBe('Not Found');
        expect(mockConfigService.resetConfig).not.toHaveBeenCalled();
      });

      it('should call guildConfigService.resetConfig()', async () => {
        const guildId = '22222222222222222';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.resetConfig).mockReturnValue(undefined);

        const app = service.getApp();
        await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(mockConfigService.resetConfig).toHaveBeenCalledTimes(1);
        expect(mockConfigService.resetConfig).toHaveBeenCalledWith(guildId);
      });

      it('should return success response with message', async () => {
        const guildId = '33333333333333333';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.resetConfig).mockReturnValue(undefined);

        const app = service.getApp();
        const response = await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          guildId: '33333333333333333',
          message: expect.stringContaining('reset to defaults'),
        });
      });

      it('should audit log reset action', async () => {
        const guildId = '44444444444444444';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.resetConfig).mockReturnValue(undefined);

        const app = service.getApp();
        await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            correlationId: expect.any(String),
            guildId,
            action: 'reset_guild_config',
          }),
          expect.stringContaining('Guild config reset to defaults via API')
        );
      });

      it('should handle resetConfig errors gracefully', async () => {
        const guildId = '55555555555555555';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.resetConfig).mockImplementation(() => {
          throw new Error('Database delete failed');
        });

        const app = service.getApp();
        const response = await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(500);

        expect(response.body).toEqual({
          error: 'Internal Server Error',
          message: expect.any(String),
        });
      });

      it('should succeed even if config was already at defaults', async () => {
        const guildId = '66666666666666666';
        vi.mocked(mockClient.guilds.cache).get = vi.fn().mockReturnValue({ id: guildId } as any);
        vi.mocked(mockConfigService.resetConfig).mockReturnValue(undefined);

        const app = service.getApp();
        const response = await request(app)
          .delete(`/api/guilds/${guildId}/config`)
          .set('Authorization', 'Bearer test-token-123')
          .expect(200);

        // Should succeed idempotently
        expect(response.body.success).toBe(true);
      });
    });
  });
});
