/**
 * Mint Rate Limiting Middleware
 *
 * In-memory bucket tracking with automatic TTL cleanup.
 * Enforces per-user, per-IP, and per-user value caps on mint operations.
 *
 * Limits (defaults):
 *   - 3 mints / hour per user
 *   - 6 mints / day  per user
 *   - 5 mints / hour per IP
 *   - $100 / day      per user (value cap)
 *
 * Returns 429 with Retry-After header when any limit is exceeded.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MintRateLimitConfig {
  /** Max mints per user within the hourly window. Default: 3 */
  userHourlyLimit?: number;
  /** Max mints per user within the daily window. Default: 6 */
  userDailyLimit?: number;
  /** Max mints per IP within the hourly window. Default: 5 */
  ipHourlyLimit?: number;
  /** Max USD value of mints per user per day. Default: 100 (dollars) */
  userDailyValueCapUsd?: number;
  /** Default mint value in USD (used when request body lacks an amount). Default: 9.99 */
  defaultMintValueUsd?: number;
  /** Interval in ms for purging expired entries. Default: 60_000 (1 min) */
  cleanupIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BucketEntry {
  /** Timestamps (epoch ms) of each recorded mint within the window */
  timestamps: number[];
  /** Cumulative USD value within the daily window */
  dailyValueUsd: number;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bucket store (module-level singleton so all routes share state)
// ---------------------------------------------------------------------------

const userHourlyBuckets = new Map<string, BucketEntry>();
const userDailyBuckets = new Map<string, BucketEntry>();
const ipHourlyBuckets = new Map<string, BucketEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Remove entries whose newest timestamp is older than the window. */
function purgeExpired(map: Map<string, BucketEntry>, windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, entry] of map) {
    // Drop timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      map.delete(key);
    }
  }
}

function ensureCleanup(intervalMs: number): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    purgeExpired(userHourlyBuckets, ONE_HOUR_MS);
    purgeExpired(userDailyBuckets, ONE_DAY_MS);
    purgeExpired(ipHourlyBuckets, ONE_HOUR_MS);
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
    entry = { timestamps: [], dailyValueUsd: 0 };
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

function dailyValueInWindow(entry: BucketEntry): number {
  const cutoff = Date.now() - ONE_DAY_MS;
  // Prune stale timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  if (entry.timestamps.length === 0) {
    entry.dailyValueUsd = 0;
  }
  return entry.dailyValueUsd;
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
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns a Fastify `preHandler` hook that enforces mint rate limits.
 *
 * Usage:
 * ```ts
 * import { mintRateLimit } from '../middleware/rate-limit.js';
 *
 * fastify.post('/nft/mint', { preHandler: [mintRateLimit()] }, handler);
 * ```
 */
export function mintRateLimit(config?: MintRateLimitConfig) {
  const userHourlyLimit = config?.userHourlyLimit ?? 3;
  const userDailyLimit = config?.userDailyLimit ?? 6;
  const ipHourlyLimit = config?.ipHourlyLimit ?? 5;
  const userDailyValueCapUsd = config?.userDailyValueCapUsd ?? 100;
  const defaultMintValueUsd = config?.defaultMintValueUsd ?? 9.99;
  const cleanupIntervalMs = config?.cleanupIntervalMs ?? 60_000;

  ensureCleanup(cleanupIntervalMs);

  return async function mintRateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const now = Date.now();
    const userId: string | undefined =
      (request.user as { userId?: string } | undefined)?.userId;
    const ip: string = request.ip;

    // ------------------------------------------------------------------
    // 1. Per-IP hourly limit
    // ------------------------------------------------------------------
    const ipEntry = getOrCreate(ipHourlyBuckets, ip);
    if (countInWindow(ipEntry, ONE_HOUR_MS) >= ipHourlyLimit) {
      const retryAfter = secondsUntilSlotFrees(ipEntry, ONE_HOUR_MS);
      reply
        .status(429)
        .header('Retry-After', String(retryAfter))
        .send({
          error: 'Too many mint requests from this IP. Please try again later.',
          retryAfterSeconds: retryAfter,
        });
      return;
    }

    // ------------------------------------------------------------------
    // 2. Per-user limits (only when authenticated)
    // ------------------------------------------------------------------
    if (userId) {
      // Hourly
      const userHourly = getOrCreate(userHourlyBuckets, userId);
      if (countInWindow(userHourly, ONE_HOUR_MS) >= userHourlyLimit) {
        const retryAfter = secondsUntilSlotFrees(userHourly, ONE_HOUR_MS);
        reply
          .status(429)
          .header('Retry-After', String(retryAfter))
          .send({
            error: 'Hourly mint limit reached. Please try again later.',
            retryAfterSeconds: retryAfter,
          });
        return;
      }

      // Daily
      const userDaily = getOrCreate(userDailyBuckets, userId);
      if (countInWindow(userDaily, ONE_DAY_MS) >= userDailyLimit) {
        const retryAfter = secondsUntilSlotFrees(userDaily, ONE_DAY_MS);
        reply
          .status(429)
          .header('Retry-After', String(retryAfter))
          .send({
            error: 'Daily mint limit reached. Please try again tomorrow.',
            retryAfterSeconds: retryAfter,
          });
        return;
      }

      // Value cap
      const mintValue =
        (request.body as { amountUsd?: number } | undefined)?.amountUsd ??
        defaultMintValueUsd;

      if (dailyValueInWindow(userDaily) + mintValue > userDailyValueCapUsd) {
        const retryAfter = secondsUntilSlotFrees(userDaily, ONE_DAY_MS);
        reply
          .status(429)
          .header('Retry-After', String(retryAfter))
          .send({
            error: `Daily mint value cap ($${userDailyValueCapUsd}) exceeded. Please try again tomorrow.`,
            retryAfterSeconds: retryAfter,
          });
        return;
      }

      // Record in user buckets
      userHourly.timestamps.push(now);
      userDaily.timestamps.push(now);
      userDaily.dailyValueUsd += mintValue;
    }

    // Record in IP bucket
    ipEntry.timestamps.push(now);
  };
}
