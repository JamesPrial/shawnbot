import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../utils/RateLimiter';
import { createMockLogger } from './fixtures';

describe('RateLimiter', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = createMockLogger();
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    mockProcessExit.mockRestore();
  });

  describe('constructor', () => {
    it('should accept default configuration when no config provided', () => {
      const limiter = new RateLimiter(mockLogger);

      // Prove defaults work by testing behavior
      // Default warnThreshold is 20, so 19 actions should not warn
      for (let i = 0; i < 19; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should accept partial config override for windowMs', () => {
      const limiter = new RateLimiter(mockLogger, { windowMs: 30000 });

      // Record 20 actions to trigger warning
      for (let i = 0; i < 20; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.warn).toHaveBeenCalledOnce();

      // Advance 31 seconds - should prune with 30s window
      vi.advanceTimersByTime(31000);

      // Add one more action - count should be 1 now (old ones pruned)
      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(1);
    });

    it('should accept partial config override for warnThreshold', () => {
      const limiter = new RateLimiter(mockLogger, { warnThreshold: 10 });

      // 9 actions should not warn
      for (let i = 0; i < 9; i++) {
        limiter.recordAction();
      }
      expect(mockLogger.warn).not.toHaveBeenCalled();

      // 10th action should warn
      limiter.recordAction();
      expect(mockLogger.warn).toHaveBeenCalledOnce();
    });

    it('should accept partial config override for crashThreshold', () => {
      const limiter = new RateLimiter(mockLogger, { crashThreshold: 25 });

      // 24 actions should not crash
      for (let i = 0; i < 24; i++) {
        limiter.recordAction();
      }
      expect(mockProcessExit).not.toHaveBeenCalled();

      // 25th action should crash
      limiter.recordAction();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should accept multiple config overrides simultaneously', () => {
      const limiter = new RateLimiter(mockLogger, {
        windowMs: 45000,
        warnThreshold: 5,
        crashThreshold: 10,
      });

      // Verify warn threshold
      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }
      expect(mockLogger.warn).toHaveBeenCalledOnce();

      // Verify crash threshold
      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('recordAction', () => {
    describe('warn threshold boundary testing', () => {
      it('should not log warning at 19 actions (just below threshold)', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 19; i++) {
          limiter.recordAction();
        }

        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(limiter.getActionCount()).toBe(19);
      });

      it('should log warning exactly at 20 actions (exactly at threshold)', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 20; i++) {
          limiter.recordAction();
        }

        expect(mockLogger.warn).toHaveBeenCalledOnce();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            actionCount: 20,
            warnThreshold: 20,
          }),
          expect.stringContaining('Rate limit warning')
        );
      });

      it('should continue logging warning at 21 actions (above threshold)', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 21; i++) {
          limiter.recordAction();
        }

        // Should warn at action 20 and 21
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        expect(limiter.getActionCount()).toBe(21);
      });

      it('should continue logging warnings from 21 to 49 actions without crashing', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 49; i++) {
          limiter.recordAction();
        }

        // Should warn from 20 onwards = 30 warnings (20-49 inclusive)
        expect(mockLogger.warn).toHaveBeenCalledTimes(30);
        expect(mockProcessExit).not.toHaveBeenCalled();
        expect(limiter.getActionCount()).toBe(49);
      });
    });

    describe('crash threshold boundary testing', () => {
      it('should not crash at 49 actions (just below crash threshold)', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 49; i++) {
          limiter.recordAction();
        }

        expect(mockProcessExit).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
      });

      it('should log error and call process.exit(1) exactly at 50 actions', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 50; i++) {
          limiter.recordAction();
        }

        expect(mockLogger.error).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            actionCount: 50,
            crashThreshold: 50,
          }),
          expect.stringContaining('Rate limit exceeded')
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
        expect(mockProcessExit).toHaveBeenCalledOnce();
      });

      it('should not call process.exit more than once even if actions continue', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 55; i++) {
          limiter.recordAction();
        }

        // Exit should only be called once at action 50
        expect(mockProcessExit).toHaveBeenCalledOnce();
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });
    });

    describe('action counting accuracy', () => {
      it('should accurately count single action', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction();

        expect(limiter.getActionCount()).toBe(1);
      });

      it('should accurately count multiple actions', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 37; i++) {
          limiter.recordAction();
        }

        expect(limiter.getActionCount()).toBe(37);
      });

      it('should increment count by exactly 1 per action', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 1; i <= 15; i++) {
          limiter.recordAction();
          expect(limiter.getActionCount()).toBe(i);
        }
      });
    });
  });

  describe('sliding window behavior', () => {
    describe('pruning actions older than window', () => {
      it('should prune entries older than 60 seconds (default window)', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 10 actions at t=0
        for (let i = 0; i < 10; i++) {
          limiter.recordAction();
        }
        expect(limiter.getActionCount()).toBe(10);

        // Advance time 61 seconds - all actions should be pruned
        vi.advanceTimersByTime(61000);

        // Trigger pruning by recording new action
        limiter.recordAction();

        // Only the new action should count
        expect(limiter.getActionCount()).toBe(1);
      });

      it('should keep entries within the 60-second window', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 5 actions at t=0
        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // Advance 30 seconds
        vi.advanceTimersByTime(30000);

        // Record 5 more actions at t=30s
        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // All 10 should still be counted
        expect(limiter.getActionCount()).toBe(10);
      });

      it('should prune only actions outside window, keeping recent ones', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 10 actions at t=0
        for (let i = 0; i < 10; i++) {
          limiter.recordAction();
        }

        // Advance 50 seconds
        vi.advanceTimersByTime(50000);

        // Record 8 more actions at t=50s
        for (let i = 0; i < 8; i++) {
          limiter.recordAction();
        }
        expect(limiter.getActionCount()).toBe(18);

        // Advance another 20 seconds (total 70s from first actions)
        vi.advanceTimersByTime(20000);

        // First 10 actions should be pruned (occurred at t=0, now at t=70)
        // The 8 actions at t=50s should remain (only 20s old)
        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(9); // 8 + 1 new
      });

      it('should handle multiple pruning operations correctly', () => {
        const limiter = new RateLimiter(mockLogger);

        // Wave 1: 5 actions at t=0
        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // Advance 70s, add 1 action - wave 1 should be pruned
        vi.advanceTimersByTime(70000);
        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(1);

        // Add 3 more at t=70s
        for (let i = 0; i < 3; i++) {
          limiter.recordAction();
        }
        expect(limiter.getActionCount()).toBe(4);

        // Advance another 70s (t=140s) - actions from t=70 should be pruned
        vi.advanceTimersByTime(70000);
        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(1);
      });
    });

    describe('window boundary edge cases', () => {
      it('should reset count when advancing exactly 61 seconds past all actions', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 15 actions
        for (let i = 0; i < 15; i++) {
          limiter.recordAction();
        }
        expect(limiter.getActionCount()).toBe(15);

        // Advance exactly 61 seconds
        vi.advanceTimersByTime(61000);

        // Add one action to trigger pruning
        limiter.recordAction();

        // Should only count the new action
        expect(limiter.getActionCount()).toBe(1);
      });

      it('should keep actions at exactly 60 seconds old', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction();

        // Advance exactly 60 seconds (boundary)
        vi.advanceTimersByTime(60000);

        // Add another action
        limiter.recordAction();

        // First action should still be within window (timestamp >= now - 60000)
        expect(limiter.getActionCount()).toBe(2);
      });

      it('should prune action at 60001ms (just outside window)', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction();

        // Advance 60.001 seconds
        vi.advanceTimersByTime(60001);

        limiter.recordAction();

        // First action should be pruned
        expect(limiter.getActionCount()).toBe(1);
      });

      it('should handle case: 49 actions, advance 61s, add 1 action → count is 1, no warn', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 49 actions (would warn at 20+, but shouldn't crash)
        for (let i = 0; i < 49; i++) {
          limiter.recordAction();
        }

        // Verify we got warnings but no crash
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockProcessExit).not.toHaveBeenCalled();

        // Clear mock call history
        vi.clearAllMocks();

        // Advance time 61 seconds
        vi.advanceTimersByTime(61000);

        // Add 1 action
        limiter.recordAction();

        // Count should be 1 (all old actions pruned)
        expect(limiter.getActionCount()).toBe(1);

        // No warning should be logged for this single action
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockProcessExit).not.toHaveBeenCalled();
      });

      it('should handle rapid actions near window boundary', () => {
        const limiter = new RateLimiter(mockLogger);

        // Record 10 actions at t=0
        for (let i = 0; i < 10; i++) {
          limiter.recordAction();
        }

        // Advance to t=59.9s (just before window boundary)
        vi.advanceTimersByTime(59900);

        // Add 5 actions
        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // All should be counted
        expect(limiter.getActionCount()).toBe(15);

        // Advance another 200ms (now at t=60.1s)
        vi.advanceTimersByTime(200);

        // Add another action
        limiter.recordAction();

        // First 10 actions should be pruned, 5 recent + 1 new = 6
        expect(limiter.getActionCount()).toBe(6);
      });
    });

    describe('custom window configuration', () => {
      it('should respect custom windowMs of 30 seconds', () => {
        const limiter = new RateLimiter(mockLogger, { windowMs: 30000 });

        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // Advance 31 seconds
        vi.advanceTimersByTime(31000);

        // Actions should be pruned
        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(1);
      });

      it('should respect custom windowMs of 120 seconds', () => {
        const limiter = new RateLimiter(mockLogger, { windowMs: 120000 });

        for (let i = 0; i < 5; i++) {
          limiter.recordAction();
        }

        // Advance 90 seconds (still within 120s window)
        vi.advanceTimersByTime(90000);

        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(6);

        // Advance another 40 seconds (total 130s from start)
        // The first 5 actions at t=0 fall outside the window
        // The action at t=90 is still within window (130-120=10, and 90>=10)
        vi.advanceTimersByTime(40000);

        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(2); // Action at t=90 + new action at t=130
      });
    });
  });

  describe('getActionCount', () => {
    it('should return 0 when no actions recorded', () => {
      const limiter = new RateLimiter(mockLogger);

      expect(limiter.getActionCount()).toBe(0);
    });

    it('should return accurate count after recording actions', () => {
      const limiter = new RateLimiter(mockLogger);

      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(1);

      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(2);

      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(3);
    });

    it('should return count only for actions within window', () => {
      const limiter = new RateLimiter(mockLogger);

      // 10 actions at t=0
      for (let i = 0; i < 10; i++) {
        limiter.recordAction();
      }

      // Advance 70 seconds
      vi.advanceTimersByTime(70000);

      // Should return 0 before new action triggers pruning
      // Note: getActionCount should also trigger pruning
      expect(limiter.getActionCount()).toBe(0);
    });

    it('should not modify state when called (read-only check)', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }

      // Call getActionCount multiple times
      const count1 = limiter.getActionCount();
      const count2 = limiter.getActionCount();
      const count3 = limiter.getActionCount();

      // All should return the same value
      expect(count1).toBe(5);
      expect(count2).toBe(5);
      expect(count3).toBe(5);
    });

    it('should reflect changes immediately after recordAction', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 1; i <= 25; i++) {
        limiter.recordAction();
        expect(limiter.getActionCount()).toBe(i);
      }
    });

    it('should accurately count across threshold boundaries', () => {
      const limiter = new RateLimiter(mockLogger);

      // Count at 19 (below warn)
      for (let i = 0; i < 19; i++) {
        limiter.recordAction();
      }
      expect(limiter.getActionCount()).toBe(19);

      // Count at 20 (at warn)
      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(20);

      // Count at 49 (below crash)
      for (let i = 0; i < 29; i++) {
        limiter.recordAction();
      }
      expect(limiter.getActionCount()).toBe(49);

      // Count at 50 (at crash)
      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(50);
    });
  });

  describe('warning message content', () => {
    it('should include actionCount and warnThreshold in warning message', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 20; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          actionCount: 20,
          warnThreshold: 20,
        }),
        expect.any(String)
      );
    });

    it('should update actionCount in subsequent warnings', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 22; i++) {
        limiter.recordAction();
      }

      // Check that warnings were logged with increasing counts
      expect(mockLogger.warn).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ actionCount: 20 }),
        expect.any(String)
      );

      expect(mockLogger.warn).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ actionCount: 21 }),
        expect.any(String)
      );

      expect(mockLogger.warn).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ actionCount: 22 }),
        expect.any(String)
      );
    });

    it('should reflect custom thresholds in warning message', () => {
      const limiter = new RateLimiter(mockLogger, { warnThreshold: 15 });

      for (let i = 0; i < 15; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          actionCount: 15,
          warnThreshold: 15,
        }),
        expect.any(String)
      );
    });
  });

  describe('error message content', () => {
    it('should include actionCount and crashThreshold in error message', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 50; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          actionCount: 50,
          crashThreshold: 50,
        }),
        expect.any(String)
      );
    });

    it('should reflect custom crashThreshold in error message', () => {
      const limiter = new RateLimiter(mockLogger, { crashThreshold: 30 });

      for (let i = 0; i < 30; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          actionCount: 30,
          crashThreshold: 30,
        }),
        expect.any(String)
      );
    });
  });

  describe('multiple independent limiter instances', () => {
    it('should maintain separate state for different instances', () => {
      const limiter1 = new RateLimiter(mockLogger);
      const limiter2 = new RateLimiter(mockLogger);

      // Record different amounts in each
      for (let i = 0; i < 10; i++) {
        limiter1.recordAction();
      }

      for (let i = 0; i < 25; i++) {
        limiter2.recordAction();
      }

      expect(limiter1.getActionCount()).toBe(10);
      expect(limiter2.getActionCount()).toBe(25);
    });

    it('should trigger thresholds independently', () => {
      const mockLogger1 = createMockLogger();
      const mockLogger2 = createMockLogger();

      const limiter1 = new RateLimiter(mockLogger1, { warnThreshold: 10 });
      const limiter2 = new RateLimiter(mockLogger2, { warnThreshold: 15 });

      // Limiter1 warns at 10
      for (let i = 0; i < 10; i++) {
        limiter1.recordAction();
      }
      expect(mockLogger1.warn).toHaveBeenCalled();

      // Limiter2 doesn't warn at 10
      for (let i = 0; i < 10; i++) {
        limiter2.recordAction();
      }
      expect(mockLogger2.warn).not.toHaveBeenCalled();

      // Limiter2 warns at 15
      for (let i = 0; i < 5; i++) {
        limiter2.recordAction();
      }
      expect(mockLogger2.warn).toHaveBeenCalled();
    });
  });

  describe('stress testing and edge cases', () => {
    it('should handle zero as custom threshold values', () => {
      const limiter = new RateLimiter(mockLogger, {
        warnThreshold: 0,
        crashThreshold: 5
      });

      // Should warn immediately
      limiter.recordAction();
      expect(mockLogger.warn).toHaveBeenCalled();

      // Should crash at 5
      for (let i = 0; i < 4; i++) {
        limiter.recordAction();
      }
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle very large action counts', () => {
      const limiter = new RateLimiter(mockLogger, {
        warnThreshold: 1000,
        crashThreshold: 2000,
      });

      for (let i = 0; i < 1500; i++) {
        limiter.recordAction();
      }

      expect(limiter.getActionCount()).toBe(1500);
      expect(mockLogger.warn).toHaveBeenCalledTimes(501); // 1000-1500
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should handle very small window size (1ms)', () => {
      const limiter = new RateLimiter(mockLogger, { windowMs: 1 });

      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }

      // Advance 2ms
      vi.advanceTimersByTime(2);

      // All should be pruned
      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(1);
    });

    it('should handle alternating record and time advancement', () => {
      const limiter = new RateLimiter(mockLogger, { windowMs: 30000 });

      // Create a pattern of actions spread over time
      for (let i = 0; i < 10; i++) {
        limiter.recordAction();
        vi.advanceTimersByTime(5000); // 5s between actions
      }

      // Total time: 50 seconds
      // Actions within last 30s should be kept
      // Actions at t=0-20s should be pruned (older than 30s from t=50s)
      expect(limiter.getActionCount()).toBe(6); // Actions at t=25,30,35,40,45,50
    });

    it('should handle no time passing between actions', () => {
      const limiter = new RateLimiter(mockLogger);

      // All actions at exactly the same timestamp
      const count = 100;
      for (let i = 0; i < count; i++) {
        limiter.recordAction();
      }

      expect(limiter.getActionCount()).toBe(count);
    });
  });

  describe('interaction between warn and crash thresholds', () => {
    it('should warn before crashing when both thresholds are hit in sequence', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 50; i++) {
        limiter.recordAction();
      }

      // Should have warned first (from 20-49), then crashed at 50
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should stop warning after crash threshold is reached', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 50; i++) {
        limiter.recordAction();
      }

      const warnCallsAt50 = mockLogger.warn.mock.calls.length;

      // Additional actions shouldn't add more warnings (process already exited)
      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }

      // Warning count shouldn't increase after exit was called
      expect(mockLogger.warn).toHaveBeenCalledTimes(warnCallsAt50);
    });

    it('should handle warnThreshold equal to crashThreshold', () => {
      const limiter = new RateLimiter(mockLogger, {
        warnThreshold: 25,
        crashThreshold: 25,
      });

      for (let i = 0; i < 25; i++) {
        limiter.recordAction();
      }

      // Crash happens first and sets exited=true, so warn never fires
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle crashThreshold lower than warnThreshold (unusual but valid)', () => {
      const limiter = new RateLimiter(mockLogger, {
        warnThreshold: 30,
        crashThreshold: 20,
      });

      // Should crash before warning
      for (let i = 0; i < 20; i++) {
        limiter.recordAction();
      }

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('time manipulation edge cases', () => {
    it('should handle time moving backwards (clock skew)', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }

      // Move time forward
      vi.advanceTimersByTime(30000);

      // Record more actions
      for (let i = 0; i < 5; i++) {
        limiter.recordAction();
      }

      // Simulate time going backwards (vitest setSystemTime)
      const pastTime = Date.now() - 40000;
      vi.setSystemTime(pastTime);

      // This shouldn't crash and should handle gracefully
      limiter.recordAction();

      // Count should still be reasonable (implementation-dependent)
      expect(limiter.getActionCount()).toBeGreaterThanOrEqual(1);
    });

    it('should handle very large time jumps forward', () => {
      const limiter = new RateLimiter(mockLogger);

      for (let i = 0; i < 10; i++) {
        limiter.recordAction();
      }

      // Jump far into the future (1 hour)
      vi.advanceTimersByTime(3600000);

      // All old actions should be pruned
      limiter.recordAction();
      expect(limiter.getActionCount()).toBe(1);
    });
  });

  describe('WU-4: debug logging with actionType', () => {
    describe('when actionType parameter is provided', () => {
      it('should accept actionType parameter without error', () => {
        const limiter = new RateLimiter(mockLogger);

        // Prove the parameter is accepted by TypeScript and runtime
        expect(() => {
          limiter.recordAction('guild_fetch');
        }).not.toThrow();

        expect(limiter.getActionCount()).toBe(1);
      });

      it('should include actionType in debug log context', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('guild_fetch');

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: 'guild_fetch',
            actionCount: 1,
          }),
          'Action recorded'
        );
      });

      it('should include actionType in warn log when threshold reached', () => {
        const limiter = new RateLimiter(mockLogger);

        // Push to warn threshold (20 actions)
        for (let i = 0; i < 20; i++) {
          limiter.recordAction('guild_fetch');
        }

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: 'guild_fetch',
            actionCount: 20,
            warnThreshold: 20,
          }),
          expect.stringContaining('Rate limit warning')
        );
      });

      it('should include actionType in error log when crash threshold reached', () => {
        const limiter = new RateLimiter(mockLogger);

        // Push to crash threshold (50 actions)
        for (let i = 0; i < 50; i++) {
          limiter.recordAction('guild_fetch');
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: 'guild_fetch',
            actionCount: 50,
            crashThreshold: 50,
          }),
          expect.stringContaining('Rate limit exceeded')
        );
      });

      it('should track different actionTypes independently in logs', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('guild_fetch');
        limiter.recordAction('channel_fetch');
        limiter.recordAction('user_fetch');

        // All should be logged with their respective actionTypes
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ actionType: 'guild_fetch' }),
          'Action recorded'
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ actionType: 'channel_fetch' }),
          'Action recorded'
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({ actionType: 'user_fetch' }),
          'Action recorded'
        );
      });
    });

    describe('when actionType parameter is omitted', () => {
      it('should accept calls without actionType parameter', () => {
        const limiter = new RateLimiter(mockLogger);

        expect(() => {
          limiter.recordAction();
        }).not.toThrow();

        expect(limiter.getActionCount()).toBe(1);
      });

      it('should include undefined actionType in debug log context', () => {
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction();

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: undefined,
            actionCount: 1,
          }),
          'Action recorded'
        );
      });

      it('should include undefined actionType in warn log', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 20; i++) {
          limiter.recordAction();
        }

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: undefined,
            actionCount: 20,
          }),
          expect.any(String)
        );
      });

      it('should include undefined actionType in error log', () => {
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 50; i++) {
          limiter.recordAction();
        }

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: undefined,
            actionCount: 50,
          }),
          expect.any(String)
        );
      });
    });

    describe('when debug level is disabled', () => {
      it('should not call logger.debug when isLevelEnabled returns false', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('guild_fetch');

        // isLevelEnabled should be checked before logging
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
        // debug should NOT be called when level is disabled
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should still warn when debug is disabled but warn threshold is reached', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 20; i++) {
          limiter.recordAction('guild_fetch');
        }

        // Warn should still fire even with debug disabled
        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should still crash when debug is disabled but crash threshold is reached', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger);

        for (let i = 0; i < 50; i++) {
          limiter.recordAction('guild_fetch');
        }

        // Error should still fire even with debug disabled
        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockProcessExit).toHaveBeenCalledWith(1);
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should check isLevelEnabled on every recordAction call', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction();
        limiter.recordAction();
        limiter.recordAction();

        // Should check level 3 times (once per call)
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(3);
      });
    });

    describe('when debug level is enabled', () => {
      it('should call logger.debug when isLevelEnabled returns true', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(true);
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('channel_fetch');

        expect(mockLogger.isLevelEnabled).toHaveBeenCalledWith('debug');
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            actionType: 'channel_fetch',
            actionCount: 1,
          }),
          'Action recorded'
        );
      });

      it('should include all expected fields in debug log context', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(true);
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('test_action');

        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            actionCount: 1,
            windowMs: 60000, // default window
            actionType: 'test_action',
          }),
          'Action recorded'
        );
      });

      it('should log every action when debug is enabled', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(true);
        const limiter = new RateLimiter(mockLogger);

        limiter.recordAction('action_1');
        limiter.recordAction('action_2');
        limiter.recordAction('action_3');

        // Should log all 3 actions
        expect(mockLogger.debug).toHaveBeenCalledTimes(3);
        expect(mockLogger.debug).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ actionCount: 1, actionType: 'action_1' }),
          'Action recorded'
        );
        expect(mockLogger.debug).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ actionCount: 2, actionType: 'action_2' }),
          'Action recorded'
        );
        expect(mockLogger.debug).toHaveBeenNthCalledWith(
          3,
          expect.objectContaining({ actionCount: 3, actionType: 'action_3' }),
          'Action recorded'
        );
      });
    });

    describe('level guard performance implications', () => {
      it('should minimize overhead by checking level before constructing log context', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger);

        // Record many actions with debug disabled
        for (let i = 0; i < 100; i++) {
          limiter.recordAction('expensive_operation');
        }

        // isLevelEnabled should be called 100 times
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(100);
        // But debug should NEVER be called (saving the cost of object construction)
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('should not skip level check even after exited flag is set', () => {
        vi.mocked(mockLogger.isLevelEnabled).mockReturnValue(false);
        const limiter = new RateLimiter(mockLogger, { crashThreshold: 2 });

        limiter.recordAction();
        limiter.recordAction(); // Should crash here

        // Even though exited=true, the level check should have happened
        expect(mockLogger.isLevelEnabled).toHaveBeenCalledTimes(2);
      });
    });
  });
});
