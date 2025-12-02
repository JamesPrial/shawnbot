import type { Logger } from 'pino';

interface RateLimiterConfig {
  readonly windowMs: number;
  readonly warnThreshold: number;
  readonly crashThreshold: number;
}

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
   */
  recordAction(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Prune timestamps outside the sliding window
    while (this.timestamps.length > 0 && this.timestamps[0] < windowStart) {
      this.timestamps.shift();
    }

    // Record the current action
    this.timestamps.push(now);

    const count = this.timestamps.length;

    // Check crash threshold first (more severe)
    if (count >= this.config.crashThreshold && !this.exited) {
      this.exited = true;
      this.logger.error(
        { actionCount: count, crashThreshold: this.config.crashThreshold },
        'Rate limit exceeded - crashing bot to prevent API ban'
      );
      process.exit(1);
    }

    // Check warn threshold
    if (count >= this.config.warnThreshold && !this.exited) {
      this.logger.warn(
        { actionCount: count, warnThreshold: this.config.warnThreshold },
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
