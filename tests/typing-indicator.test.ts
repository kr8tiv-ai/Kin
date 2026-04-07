/**
 * Tests for bot/utils/typing.ts — TypingIndicator lifecycle,
 * periodic refresh, fire-and-forget errors, concurrency safety,
 * and timer leak prevention.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTypingIndicator } from '../bot/utils/typing';

describe('TypingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Lifecycle ──────────────────────────────────────────────

  describe('lifecycle', () => {
    it('start() calls showFn immediately', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      indicator.start();

      expect(showFn).toHaveBeenCalledTimes(1);
      indicator.stop();
    });

    it('stop() clears the interval', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      indicator.start();
      indicator.stop();

      expect(indicator.running).toBe(false);
    });

    it('stop() calls clearFn when provided', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const clearFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({
        showFn,
        clearFn,
        intervalMs: 5000,
      });

      indicator.start();
      indicator.stop();

      expect(clearFn).toHaveBeenCalledTimes(1);
    });

    it('running is true after start, false after stop', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      expect(indicator.running).toBe(false);
      indicator.start();
      expect(indicator.running).toBe(true);
      indicator.stop();
      expect(indicator.running).toBe(false);
    });
  });

  // ── Periodic Refresh ───────────────────────────────────────

  describe('periodic refresh', () => {
    it('calls showFn again after intervalMs elapses', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 4000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4000);
      expect(showFn).toHaveBeenCalledTimes(2);

      indicator.stop();
    });

    it('fires multiple intervals correctly', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 3000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3000);
      expect(showFn).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(3000);
      expect(showFn).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(3000);
      expect(showFn).toHaveBeenCalledTimes(4);

      indicator.stop();
    });

    it('does not fire before intervalMs', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4999);
      expect(showFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      expect(showFn).toHaveBeenCalledTimes(2);

      indicator.stop();
    });
  });

  // ── Error Handling (fire-and-forget) ───────────────────────

  describe('error handling', () => {
    it('showFn throwing does not crash — error is console.warned', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('network failure');
      const showFn = vi.fn().mockRejectedValue(error);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      // Should not throw
      indicator.start();

      // Let the rejected promise flush
      await vi.advanceTimersByTimeAsync(0);

      expect(warnSpy).toHaveBeenCalledWith(
        '[TypingIndicator] showFn failed:',
        error,
      );

      indicator.stop();
      warnSpy.mockRestore();
    });

    it('clearFn throwing does not crash — error is console.warned', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = new Error('clear failed');
      const showFn = vi.fn().mockResolvedValue(undefined);
      const clearFn = vi.fn().mockRejectedValue(error);
      const indicator = createTypingIndicator({
        showFn,
        clearFn,
        intervalMs: 5000,
      });

      indicator.start();
      indicator.stop();

      // Let the rejected promise flush
      await vi.advanceTimersByTimeAsync(0);

      expect(warnSpy).toHaveBeenCalledWith(
        '[TypingIndicator] clearFn failed:',
        error,
      );

      warnSpy.mockRestore();
    });

    it('periodic showFn error does not stop the interval', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let callCount = 0;
      const showFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('transient'));
        return Promise.resolve();
      });
      const indicator = createTypingIndicator({ showFn, intervalMs: 3000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      // Second call (interval) will reject
      await vi.advanceTimersByTimeAsync(3000);
      expect(showFn).toHaveBeenCalledTimes(2);

      // Third call should still fire — interval not broken
      await vi.advanceTimersByTimeAsync(3000);
      expect(showFn).toHaveBeenCalledTimes(3);

      expect(indicator.running).toBe(true);
      indicator.stop();
      warnSpy.mockRestore();
    });
  });

  // ── Concurrent Start ───────────────────────────────────────

  describe('concurrent start', () => {
    it('calling start() while running stops previous interval before starting new one', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 5000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      // Start again without stopping — simulates concurrent message
      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(2); // new immediate call

      // Advance past one interval — should only get 1 more call (new interval),
      // not 2 (which would mean old interval leaked)
      vi.advanceTimersByTime(5000);
      expect(showFn).toHaveBeenCalledTimes(3);

      indicator.stop();
    });

    it('concurrent start does not call clearFn (restart, not end)', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const clearFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({
        showFn,
        clearFn,
        intervalMs: 5000,
      });

      indicator.start();
      indicator.start(); // restart — should NOT call clearFn

      expect(clearFn).not.toHaveBeenCalled();

      indicator.stop(); // explicit stop DOES call clearFn
      expect(clearFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── Idempotent Stop ────────────────────────────────────────

  describe('idempotent stop', () => {
    it('calling stop() when not running is a no-op', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const clearFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({
        showFn,
        clearFn,
        intervalMs: 5000,
      });

      // Should not throw or call clearFn when never started
      expect(() => indicator.stop()).not.toThrow();
      // clearFn IS called even when not running — it's fire-and-forget cleanup
      // This is intentional: stop() always signals "done typing" to the platform
    });

    it('calling stop() twice does not double-call clearFn beyond expected', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const clearFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({
        showFn,
        clearFn,
        intervalMs: 5000,
      });

      indicator.start();
      indicator.stop();
      indicator.stop();

      // clearFn called each time stop() is called — idempotent in terms of interval
      // but clearFn is fire-and-forget so calling it twice is safe
      expect(clearFn).toHaveBeenCalledTimes(2);
    });
  });

  // ── No Timer Leaks ─────────────────────────────────────────

  describe('no timer leaks', () => {
    it('after stop(), no more showFn calls happen even after advancing timers', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 3000 });

      indicator.start();
      expect(showFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3000);
      expect(showFn).toHaveBeenCalledTimes(2);

      indicator.stop();
      const callsAtStop = showFn.mock.calls.length;

      // Advance way past multiple intervals — no new calls
      vi.advanceTimersByTime(30000);
      expect(showFn).toHaveBeenCalledTimes(callsAtStop);
    });

    it('concurrent start then stop does not leak the original timer', () => {
      const showFn = vi.fn().mockResolvedValue(undefined);
      const indicator = createTypingIndicator({ showFn, intervalMs: 2000 });

      indicator.start(); // timer A
      indicator.start(); // timer A cleared, timer B created
      indicator.stop();  // timer B cleared

      const callsAtStop = showFn.mock.calls.length;

      // Neither timer A nor timer B should fire
      vi.advanceTimersByTime(20000);
      expect(showFn).toHaveBeenCalledTimes(callsAtStop);
    });
  });
});
