/**
 * Auth Rate Limiting Middleware
 *
 * In-memory bucket tracking with automatic TTL cleanup.
 * Enforces per-IP limits on authentication endpoints.
 *
 * Limits (defaults):
 *   - 10 attempts / 15 minutes per IP for login
 *   -  5 attempts / hour       per IP for token refresh
 *
 * Returns 429 with Retry-After header when any limit is exceeded.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AuthRateLimitConfig {
  /** Max login attempts per IP within the 15-minute window. Default: 10 */
  loginLimit?: number;
  /** Login window in ms. Default: 900_000 (15 minutes) */
  loginWindowMs?: number;
  /** Max token refresh attempts per IP within the hourly window. Default: 5 */
  refreshLimit?: number;
  /** Refresh window in ms. Default: 3_600_000 (1 hour) */
  refreshWindowMs?: number;
  /** Interval in ms for purging expired entries. Default: 60_000 (1 min) */
  cleanupIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BucketEntry {
  /** Timestamps (epoch ms) of each recorded attempt within the window */
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Bucket store (module-level singleton so all routes share state)
// ---------------------------------------------------------------------------

const loginBuckets = new Map<string, BucketEntry>();
const refreshBuckets = new Map<string, BucketEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Remove entries whose newest timestamp is older than the window. */
function purgeExpired(map: Map<string, BucketEntry>, windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, entry] of map) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      map.delete(key);
    }
  }
}

function ensureCleanup(intervalMs: number, loginWindowMs: number, refreshWindowMs: number): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    purgeExpired(loginBuckets, loginWindowMs);
    purgeExpired(refreshBuckets, refreshWindowMs);
  }, intervalMs);
  // Allow Node to exit even if the timer is pending
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreate(map: Map<string, BucketEntry>, key: string): BucketEntry {
  let entry = map.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    map.set(key, entry);
  }
  return entry;
}

function countInWindow(entry: BucketEntry, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (const t of entry.timestamps) {
    if (t > cutoff) count++;
  }
  return count;
}

function secondsUntilSlotFrees(entry: BucketEntry, windowMs: number): number {
  if (entry.timestamps.length === 0) return 0;
  const cutoff = Date.now() - windowMs;
  let oldest = Infinity;
  for (const t of entry.timestamps) {
    if (t > cutoff && t < oldest) oldest = t;
  }
  if (oldest === Infinity) return 0;
  const freeAt = oldest + windowMs;
  return Math.max(1, Math.ceil((freeAt - Date.now()) / 1000));
}

// ---------------------------------------------------------------------------
// Middleware factory — login
// ---------------------------------------------------------------------------

/**
 * Returns a Fastify `preHandler` hook that enforces login rate limits.
 *
 * 10 attempts per IP per 15 minutes.
 *
 * Usage:
 * ```ts
 * import { loginRateLimit } from '../middleware/auth-rate-limit.js';
 *
 * fastify.post('/auth/login', { preHandler: [loginRateLimit()] }, handler);
 * ```
 */
export function loginRateLimit(config?: AuthRateLimitConfig) {
  const limit = config?.loginLimit ?? 10;
  const windowMs = config?.loginWindowMs ?? 15 * 60 * 1000; // 15 minutes
  const cleanupIntervalMs = config?.cleanupIntervalMs ?? 60_000;
  const refreshWindowMs = config?.refreshWindowMs ?? 60 * 60 * 1000;

  ensureCleanup(cleanupIntervalMs, windowMs, refreshWindowMs);

  return async function loginRateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const ip: string = request.ip;
    const entry = getOrCreate(loginBuckets, ip);

    if (countInWindow(entry, windowMs) >= limit) {
      const retryAfter = secondsUntilSlotFrees(entry, windowMs);
      reply
        .status(429)
        .header('Retry-After', String(retryAfter))
        .send({
          error: 'Too many login attempts. Please try again later.',
          retryAfterSeconds: retryAfter,
        });
      return;
    }

    // Record attempt
    entry.timestamps.push(Date.now());
  };
}

// ---------------------------------------------------------------------------
// Middleware factory — token refresh
// ---------------------------------------------------------------------------

/**
 * Returns a Fastify `preHandler` hook that enforces token refresh rate limits.
 *
 * 5 attempts per IP per hour.
 *
 * Usage:
 * ```ts
 * import { refreshRateLimit } from '../middleware/auth-rate-limit.js';
 *
 * fastify.post('/auth/refresh', { preHandler: [refreshRateLimit()] }, handler);
 * ```
 */
export function refreshRateLimit(config?: AuthRateLimitConfig) {
  const limit = config?.refreshLimit ?? 5;
  const windowMs = config?.refreshWindowMs ?? 60 * 60 * 1000; // 1 hour
  const cleanupIntervalMs = config?.cleanupIntervalMs ?? 60_000;
  const loginWindowMs = config?.loginWindowMs ?? 15 * 60 * 1000;

  ensureCleanup(cleanupIntervalMs, loginWindowMs, windowMs);

  return async function refreshRateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const ip: string = request.ip;
    const entry = getOrCreate(refreshBuckets, ip);

    if (countInWindow(entry, windowMs) >= limit) {
      const retryAfter = secondsUntilSlotFrees(entry, windowMs);
      reply
        .status(429)
        .header('Retry-After', String(retryAfter))
        .send({
          error: 'Too many token refresh attempts. Please try again later.',
          retryAfterSeconds: retryAfter,
        });
      return;
    }

    // Record attempt
    entry.timestamps.push(Date.now());
  };
}
