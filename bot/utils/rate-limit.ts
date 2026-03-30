/**
 * Per-User Rate Limiter — Protects expensive API operations
 * (voice transcription, vision AI, TTS) from abuse.
 *
 * In-memory rate tracking with automatic cleanup.
 */

interface RateBucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, RateBucket>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 3600_000) {
      buckets.delete(key);
    }
  }
}, 300_000);

/**
 * Check if a user has exceeded their rate limit for a given operation.
 *
 * @param userId - Telegram user ID
 * @param operation - Operation type (e.g., 'voice', 'image')
 * @param maxRequests - Maximum requests per window (default: 10)
 * @param windowMs - Time window in ms (default: 1 hour)
 * @returns Object with allowed status and remaining count
 */
export function checkRateLimit(
  userId: string,
  operation: string,
  maxRequests = 10,
  windowMs = 3600_000,
): { allowed: boolean; remaining: number; resetInMs: number } {
  const key = `${userId}:${operation}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  // New window or expired window
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetInMs: windowMs };
  }

  // Within window
  if (bucket.count >= maxRequests) {
    const resetInMs = windowMs - (now - bucket.windowStart);
    return { allowed: false, remaining: 0, resetInMs };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: maxRequests - bucket.count,
    resetInMs: windowMs - (now - bucket.windowStart),
  };
}

// Preset limits for different operations
export const RATE_LIMITS = {
  voice: { maxRequests: 15, windowMs: 3600_000 },     // 15 voice messages/hour
  image: { maxRequests: 20, windowMs: 3600_000 },     // 20 images/hour
  chat: { maxRequests: 60, windowMs: 3600_000 },      // 60 messages/hour
  build: { maxRequests: 5, windowMs: 3600_000 },      // 5 builds/hour
} as const;
