import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import crypto from 'crypto';
import type { Logger } from 'pino';
import type { Client } from 'discord.js';
import { GuildConfigService } from '../services/GuildConfigService';
import { AFKDetectionService } from '../services/AFKDetectionService';
import { VoiceConnectionManager } from '../voice/VoiceConnectionManager';
import { generateCorrelationId } from '../utils/correlation';

/**
 * Dependencies required for AdminApiService.
 * All dependencies are injected via constructor to facilitate testing and maintainability.
 */
export interface AdminApiDependencies {
  client: Client;
  guildConfigService: GuildConfigService;
  afkDetectionService: AFKDetectionService;
  voiceConnectionManager: VoiceConnectionManager;
  logger: Logger;
  token: string;
  port: number;
}

/**
 * Extended Express Request type with correlation ID.
 */
interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

/**
 * Health check response structure.
 */
interface HealthResponse {
  status: 'ok';
  uptime: number;
  ready: boolean;
  guilds: number;
}

/**
 * Bot status response structure.
 */
interface StatusResponse {
  guilds: number;
  voiceConnections: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

/**
 * Guild status response structure.
 */
interface GuildStatusResponse {
  guildId: string;
  enabled: boolean;
  afkTimeoutSeconds: number;
  warningSecondsBefore: number;
  connected: boolean;
}

/**
 * Error response structure.
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Success response structure for enable/disable operations.
 */
interface OperationResponse {
  success: boolean;
  guildId: string;
  enabled: boolean;
}

/**
 * AdminApiService provides a REST API for bot administration.
 * Implements security best practices including:
 * - Localhost-only binding (127.0.0.1)
 * - Bearer token authentication with timing-safe comparison
 * - Request correlation IDs for tracing
 * - Audit logging for all operations
 */
export class AdminApiService {
  private readonly client: Client;
  private readonly guildConfigService: GuildConfigService;
  private readonly afkDetectionService: AFKDetectionService;
  private readonly voiceConnectionManager: VoiceConnectionManager;
  private readonly logger: Logger;
  private readonly token: string;
  private readonly port: number;
  private readonly app: Express;
  private readonly startTime: number;
  private server: Server | null = null;

  constructor(deps: AdminApiDependencies) {
    this.client = deps.client;
    this.guildConfigService = deps.guildConfigService;
    this.afkDetectionService = deps.afkDetectionService;
    this.voiceConnectionManager = deps.voiceConnectionManager;
    this.logger = deps.logger;
    this.token = deps.token;
    this.port = deps.port;
    this.startTime = Date.now();

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Configures Express middleware.
   */
  private setupMiddleware(): void {
    // Parse JSON bodies with size limit
    this.app.use(express.json({ limit: '1kb' }));

    // Add correlation ID to all requests
    this.app.use((req: RequestWithCorrelation, _res: Response, next: NextFunction) => {
      req.correlationId = generateCorrelationId();
      next();
    });

    // Request logging
    this.app.use((req: RequestWithCorrelation, _res: Response, next: NextFunction) => {
      this.logger.debug(
        {
          correlationId: req.correlationId,
          method: req.method,
          path: req.path,
          ip: req.ip,
        },
        'API request received'
      );
      next();
    });
  }

  /**
   * Configures API routes.
   */
  private setupRoutes(): void {
    // Public health check (no auth required)
    this.app.get('/health', this.handleHealth.bind(this));

    // Protected endpoints (auth required)
    this.app.get('/api/status', this.authMiddleware.bind(this), this.handleStatus.bind(this));
    this.app.get('/api/guilds/:id/status', this.authMiddleware.bind(this), this.handleGuildStatus.bind(this));
    this.app.post('/api/guilds/:id/enable', this.authMiddleware.bind(this), this.handleGuildEnable.bind(this));
    this.app.post('/api/guilds/:id/disable', this.authMiddleware.bind(this), this.handleGuildDisable.bind(this));

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
      } satisfies ErrorResponse);
    });

    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.app.use((err: Error, req: RequestWithCorrelation, res: Response, _next: NextFunction) => {
      this.logger.error(
        {
          correlationId: req.correlationId,
          error: err.message,
          stack: err.stack,
        },
        'Unhandled error in API request'
      );

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      } satisfies ErrorResponse);
    });
  }

  /**
   * Authentication middleware using Bearer token.
   * Uses crypto.timingSafeEqual to prevent timing attacks.
   */
  private authMiddleware(req: RequestWithCorrelation, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (authHeader === undefined || authHeader === '') {
      this.logger.warn(
        {
          correlationId: req.correlationId,
          ip: req.ip,
          path: req.path,
        },
        'API auth failure: missing Authorization header'
      );

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      } satisfies ErrorResponse);
      return;
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || token === undefined || token === '') {
      this.logger.warn(
        {
          correlationId: req.correlationId,
          ip: req.ip,
          path: req.path,
        },
        'API auth failure: invalid Authorization header format'
      );

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format',
      } satisfies ErrorResponse);
      return;
    }

    // Timing-safe token comparison using HMAC to normalize length
    const hmac = (data: string): Buffer => {
      return crypto.createHmac('sha256', 'token-comparison').update(data).digest();
    };

    const providedHash = hmac(token);
    const expectedHash = hmac(this.token);

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(providedHash, expectedHash);
    } catch {
      // Should never happen with HMAC since lengths are always equal
      isValid = false;
    }

    if (!isValid) {
      this.logger.warn(
        {
          correlationId: req.correlationId,
          ip: req.ip,
          path: req.path,
        },
        'API auth failure: invalid token'
      );

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      } satisfies ErrorResponse);
      return;
    }

    // Authentication successful
    this.logger.debug(
      {
        correlationId: req.correlationId,
        ip: req.ip,
        path: req.path,
      },
      'API auth success'
    );

    next();
  }

  /**
   * GET /health - Public health check endpoint.
   */
  private handleHealth(_req: Request, res: Response): void {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const ready = this.client.isReady();
    const guilds = this.client.guilds.cache.size;

    res.json({
      status: 'ok',
      uptime,
      ready,
      guilds,
    } satisfies HealthResponse);
  }

  /**
   * GET /api/status - Bot metrics and status.
   */
  private handleStatus(req: RequestWithCorrelation, res: Response): void {
    const guilds = this.client.guilds.cache.size;
    const voiceConnections = this.voiceConnectionManager.getAllGuildIds().length;
    const memoryUsage = process.memoryUsage();

    this.logger.info(
      {
        correlationId: req.correlationId,
        ip: req.ip,
        guilds,
        voiceConnections,
      },
      'Status endpoint accessed'
    );

    res.json({
      guilds,
      voiceConnections,
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
      },
    } satisfies StatusResponse);
  }

  /**
   * GET /api/guilds/:id/status - Guild-specific tracking status.
   */
  private handleGuildStatus(req: RequestWithCorrelation, res: Response): void {
    const guildId = req.params['id'];

    if (guildId === undefined || guildId === '' || !this.isValidGuildId(guildId)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid guild ID format',
      } satisfies ErrorResponse);
      return;
    }

    // Check if bot is in the guild
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Bot is not in the specified guild',
      } satisfies ErrorResponse);
      return;
    }

    const config = this.guildConfigService.getConfig(guildId);
    const connected = this.voiceConnectionManager.hasConnection(guildId);

    this.logger.info(
      {
        correlationId: req.correlationId,
        ip: req.ip,
        guildId,
        enabled: config.enabled,
        connected,
      },
      'Guild status endpoint accessed'
    );

    res.json({
      guildId,
      enabled: config.enabled,
      afkTimeoutSeconds: config.afkTimeoutSeconds,
      warningSecondsBefore: config.warningSecondsBefore,
      connected,
    } satisfies GuildStatusResponse);
  }

  /**
   * POST /api/guilds/:id/enable - Enable AFK detection for a guild.
   */
  private handleGuildEnable(req: RequestWithCorrelation, res: Response): void {
    const guildId = req.params['id'];

    if (guildId === undefined || guildId === '' || !this.isValidGuildId(guildId)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid guild ID format',
      } satisfies ErrorResponse);
      return;
    }

    // Check if bot is in the guild
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Bot is not in the specified guild',
      } satisfies ErrorResponse);
      return;
    }

    try {
      const updatedConfig = this.guildConfigService.updateConfig(guildId, { enabled: true });

      this.logger.info(
        {
          correlationId: req.correlationId,
          ip: req.ip,
          guildId,
          action: 'enable_afk_detection',
        },
        'AFK detection enabled via API'
      );

      res.json({
        success: true,
        guildId,
        enabled: updatedConfig.enabled,
      } satisfies OperationResponse);
    } catch (error) {
      this.logger.error(
        {
          correlationId: req.correlationId,
          error,
          guildId,
        },
        'Failed to enable AFK detection'
      );

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to enable AFK detection',
      } satisfies ErrorResponse);
    }
  }

  /**
   * POST /api/guilds/:id/disable - Disable AFK detection for a guild.
   */
  private handleGuildDisable(req: RequestWithCorrelation, res: Response): void {
    const guildId = req.params['id'];

    if (guildId === undefined || guildId === '' || !this.isValidGuildId(guildId)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid guild ID format',
      } satisfies ErrorResponse);
      return;
    }

    // Check if bot is in the guild
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Bot is not in the specified guild',
      } satisfies ErrorResponse);
      return;
    }

    try {
      const updatedConfig = this.guildConfigService.updateConfig(guildId, { enabled: false });

      this.logger.info(
        {
          correlationId: req.correlationId,
          ip: req.ip,
          guildId,
          action: 'disable_afk_detection',
        },
        'AFK detection disabled via API'
      );

      res.json({
        success: true,
        guildId,
        enabled: updatedConfig.enabled,
      } satisfies OperationResponse);
    } catch (error) {
      this.logger.error(
        {
          correlationId: req.correlationId,
          error,
          guildId,
        },
        'Failed to disable AFK detection'
      );

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to disable AFK detection',
      } satisfies ErrorResponse);
    }
  }

  /**
   * Validates that a guild ID is a valid Discord snowflake (17-19 digit numeric string).
   */
  private isValidGuildId(guildId: string): boolean {
    return /^\d{17,19}$/.test(guildId);
  }

  /**
   * Starts the Express server on localhost (127.0.0.1).
   */
  public async start(): Promise<void> {
    if (this.server) {
      this.logger.warn('Admin API server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = createServer(this.app);

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error(
              { port: this.port },
              'Admin API port is already in use'
            );
            reject(new Error(`Port ${this.port} is already in use`));
          } else {
            this.logger.error({ error }, 'Admin API server error');
            reject(error);
          }
        });

        // Bind to localhost only (127.0.0.1) for security
        this.server.listen(this.port, '127.0.0.1', () => {
          this.logger.info(
            { port: this.port, host: '127.0.0.1' },
            'Admin API server started'
          );
          resolve();
        });
      } catch (error) {
        this.logger.error({ error }, 'Failed to start Admin API server');
        reject(error);
      }
    });
  }

  /**
   * Stops the Express server gracefully.
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      this.logger.warn('Admin API server is not running');
      return;
    }

    return new Promise((resolve, reject) => {
      const server = this.server;
      if (!server) {
        resolve();
        return;
      }
      server.close((error) => {
        if (error) {
          this.logger.error({ error }, 'Error stopping Admin API server');
          reject(error);
          return;
        }

        this.logger.info('Admin API server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Returns the Express app for testing purposes.
   */
  public getApp(): Express {
    return this.app;
  }
}
