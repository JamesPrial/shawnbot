import type { Logger } from 'pino';

interface RateLimiterConfig {
  readonly windowMs: number;
  readonly warnThreshold: number;
  readonly crashThreshold: number;
}

/**
 * Default rate limiter configuration.
 *
 * These values are calibrated for Discord API rate limits to prevent API bans:
 *
 * - `windowMs: 60_000` (1 minute): Discord enforces per-resource rate limits
 *   typically in 1-minute windows. This matches Discord's rate limit window.
 *
 * - `warnThreshold: 20`: Provides early warning when approaching limits.
 *   Most Discord endpoints allow 5-50 requests per minute. 20 requests/min
 *   is conservative enough to warn before hitting most limits.
 *
 * - `crashThreshold: 50`: Hard limit to prevent API bans. Discord's global
 *   rate limit is 50 requests/second across all endpoints, but per-endpoint
 *   limits are lower. Crashing at 50 requests/min (< 1/sec) ensures we stay
 *   well below both per-endpoint and global limits.
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  windowMs: 60_000,
  warnThreshold: 20,
  crashThreshold: 50,
};

/**
 * Rate limiter using a sliding window counter algorithm.
 *
 * Tracks action timestamps and enforces thresholds:
 * - Warns when approaching the configured threshold
 * - Crashes the process when exceeding the crash threshold to prevent API bans
 */
export class RateLimiter {
  private readonly logger: Logger;
  private readonly config: RateLimiterConfig;
  private readonly timestamps: number[];
  private exited: boolean = false;

  constructor(logger: Logger, config?: Partial<RateLimiterConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timestamps = [];
  }

  /**
   * Records an action and checks rate limit thresholds.
   *
   * Prunes old timestamps outside the sliding window, adds the current timestamp,
   * and enforces warn/crash thresholds.
   *
   * @param actionType - Optional description of the action being rate-limited for debug logging
   */
  recordAction(actionType?: string): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Prune timestamps outside the sliding window
    let firstTimestamp = this.timestamps[0];
    while (firstTimestamp !== undefined && firstTimestamp < windowStart) {
      this.timestamps.shift();
      firstTimestamp = this.timestamps[0];
    }

    // Record the current action
    this.timestamps.push(now);

    const count = this.timestamps.length;

    // Guard debug log with level check since this is called frequently
    if (this.logger.isLevelEnabled('debug')) {
      this.logger.debug(
        { actionCount: count, windowMs: this.config.windowMs, actionType },
        'Action recorded'
      );
    }

    // Check crash threshold first (more severe)
    if (count >= this.config.crashThreshold && !this.exited) {
      this.exited = true;
      this.logger.error(
        { actionCount: count, crashThreshold: this.config.crashThreshold, actionType },
        'Rate limit exceeded - crashing bot to prevent API ban'
      );
      process.exit(1);
    }

    // Check warn threshold
    if (count >= this.config.warnThreshold && !this.exited) {
      this.logger.warn(
        { actionCount: count, warnThreshold: this.config.warnThreshold, actionType },
        'Rate limit warning: approaching threshold'
      );
    }
  }

  /**
   * Returns the current number of actions within the sliding window.
   * Primarily intended for testing purposes.
   */
  getActionCount(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Count timestamps within the window without mutating the array
    return this.timestamps.filter((timestamp) => timestamp >= windowStart).length;
  }
}
