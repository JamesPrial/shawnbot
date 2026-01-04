import { z } from 'zod';
import dotenv from 'dotenv';

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'Discord token is required'),
  CLIENT_ID: z.string().min(1, 'Client ID is required'),
  DATABASE_PATH: z.string().default('./data/bot.db'),
  LOG_LEVEL: logLevelSchema.default('info'),
  LOG_FILE_PATH: z.string().optional(),
  RATE_LIMIT_WARN_THRESHOLD: z.coerce.number().default(20),
  RATE_LIMIT_CRASH_THRESHOLD: z.coerce.number().default(50),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  ADMIN_API_ENABLED: z.preprocess(
    (val) => typeof val === 'string'
      ? val.toLowerCase() === 'true' || val === '1'
      : val === true,
    z.boolean()
  ).default(false),
  ADMIN_API_PORT: z.coerce.number().default(3000),
  ADMIN_API_TOKEN: z.string().optional(),
  ADMIN_API_BIND_ADDRESS: z.string().default('127.0.0.1'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
}).refine(
  (data) => {
    // If either ADMIN_USERNAME or ADMIN_PASSWORD_HASH is set, both must be set
    const hasUsername = data.ADMIN_USERNAME !== undefined && data.ADMIN_USERNAME !== '';
    const hasPasswordHash = data.ADMIN_PASSWORD_HASH !== undefined && data.ADMIN_PASSWORD_HASH !== '';

    if (hasUsername !== hasPasswordHash) {
      return false;
    }

    return true;
  },
  {
    message: 'ADMIN_USERNAME and ADMIN_PASSWORD_HASH must both be set or both be unset',
  }
);

export type EnvConfig = z.infer<typeof environmentSchema>;

export function loadConfig(): EnvConfig {
  dotenv.config();

  const parseResult = environmentSchema.safeParse(process.env);

  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors
      .map((error) => `${error.path.join('.')}: ${error.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return parseResult.data;
}
