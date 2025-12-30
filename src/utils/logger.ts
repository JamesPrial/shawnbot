import pino from 'pino';

// NOTE: Logger initializes as a module-level singleton before loadConfig() runs,
// so we read directly from process.env. These values are also defined in
// src/config/environment.ts for type inference, documentation, and validation
// of the broader application config.
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || 'info';
const logFilePath = process.env.LOG_FILE_PATH;

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
  | { target: 'pino-pretty'; options: PinoPrettyOptions }
  | { target: 'pino/file'; options: PinoFileOptions };

function buildTransportTargets(): TransportTarget[] {
  const targets: TransportTarget[] = [];

  // Console transport
  if (isDevelopment) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: {
        destination: 1, // stdout
      },
    });
  }

  // File transport (if configured)
  if (logFilePath) {
    targets.push({
      target: 'pino/file',
      options: {
        destination: logFilePath,
        mkdir: true,
      },
    });
  }

  return targets;
}

const targets = buildTransportTargets();

export const logger = pino({
  level: logLevel,
  transport: {
    targets,
  },
});

export { buildTransportTargets };
