import pino, { type Logger } from 'pino';

interface PinoPrettyOptions {
  colorize: boolean;
  translateTime: string;
  ignore: string;
}

interface PinoFileOptions {
  destination: string | number;
  mkdir?: boolean;
}

type TransportTarget =
  | { target: 'pino-pretty'; level?: string; options: PinoPrettyOptions }
  | { target: 'pino/file'; level?: string; options: PinoFileOptions };

export function buildTransportTargets(level: string): TransportTarget[] {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logFilePath = process.env.LOG_FILE_PATH;
  const targets: TransportTarget[] = [];

  // Console transport
  if (isDevelopment) {
    targets.push({
      target: 'pino-pretty',
      level,
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    });
  } else {
    targets.push({
      target: 'pino/file',
      level,
      options: {
        destination: 1, // stdout
      },
    });
  }

  // File transport (if configured)
  if (logFilePath) {
    targets.push({
      target: 'pino/file',
      level,
      options: {
        destination: logFilePath,
        mkdir: true,
      },
    });
  }

  return targets;
}

/**
 * Lazy-initialized root logger singleton.
 * Defers reading environment variables until first access,
 * ensuring .env is loaded by dotenv before configuration.
 */
let _logger: Logger | null = null;

function getRootLogger(): Logger {
  if (!_logger) {
    const logLevel = process.env.LOG_LEVEL || 'info';
    _logger = pino({
      level: logLevel,
      transport: {
        targets: buildTransportTargets(logLevel),
      },
    });
  }
  return _logger;
}

/**
 * Backward-compatible proxy that delegates all property access
 * to the lazily-initialized root logger.
 */
export const logger = new Proxy({} as Logger, {
  get(_, prop) {
    return (getRootLogger() as unknown as Record<string, unknown>)[prop as string];
  },
  set(_, prop, value) {
    (getRootLogger() as unknown as Record<string, unknown>)[prop as string] = value;
    return true;
  },
});

/**
 * Factory function for creating service-specific child loggers.
 * Each child logger includes a 'service' field in all log entries.
 *
 * @param serviceName - The name of the service (e.g., 'bot', 'database', 'voice', 'afk')
 * @returns A child logger instance with the service context
 */
export function createServiceLogger(serviceName: string): Logger {
  return getRootLogger().child({ service: serviceName });
}
