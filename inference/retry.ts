/**
 * Retry & Timeout Utilities — Generic retry-with-backoff and fetch timeout
 *
 * Zero-dependency, composable primitives for resilient HTTP requests.
 * Used by frontier providers and FallbackHandler for transient error recovery.
 *
 * @module inference/retry
 */

// ============================================================================
// Transient Error Detection
// ============================================================================

/**
 * HTTP status codes that indicate a transient (retryable) error.
 * 429 = rate limit, 500/502/503/504 = server errors.
 */
export const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Custom error class for HTTP errors that carries the status code.
 * Enables isTransientError() to inspect the status without string parsing.
 */
export class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Check whether an error is transient and should be retried.
 *
 * Transient conditions:
 * - HttpError with status in TRANSIENT_STATUS_CODES
 * - Generic Error with a numeric `status` property in TRANSIENT_STATUS_CODES
 * - TypeError (network failure from fetch — DNS, connection refused, etc.)
 * - AbortError from fetchWithTimeout (request timed out)
 *
 * Permanent conditions (NOT retried):
 * - 400, 401, 403, 404 and other non-transient HTTP statuses
 * - Any other error type
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors from fetch (DNS failure, connection refused, etc.)
    return true;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    // Timeout from fetchWithTimeout
    return true;
  }

  if (error instanceof HttpError) {
    return TRANSIENT_STATUS_CODES.has(error.status);
  }

  // Support plain Error objects with a `status` property (e.g., from providers)
  if (error instanceof Error) {
    const status = (error as unknown as Record<string, unknown>)['status'];
    if (typeof status === 'number') {
      return TRANSIENT_STATUS_CODES.has(status);
    }
  }

  return false;
}

// ============================================================================
// Retry with Backoff
// ============================================================================

export interface RetryOptions {
  /** Maximum number of retries (default: 2, meaning up to 3 total attempts) */
  maxRetries?: number;
  /** Initial delay in ms before the first retry (default: 1000) */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each retry (default: 2) */
  backoffFactor?: number;
  /** Maximum random jitter in ms added/subtracted from delay (default: 200) */
  jitterMs?: number;
  /** Custom predicate to determine if an error is retryable (default: isTransientError) */
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 2,
  initialDelayMs: 1000,
  backoffFactor: 2,
  jitterMs: 200,
  shouldRetry: isTransientError,
};

/**
 * Execute an async function with exponential backoff retry on transient errors.
 *
 * On each transient failure, waits `initialDelayMs * backoffFactor^attempt ± jitter`
 * before retrying. Permanent errors throw immediately without retrying.
 *
 * @param fn      Async function to execute (called on each attempt)
 * @param opts    Retry configuration (all optional, has sensible defaults)
 * @returns       The result of `fn` on the first successful attempt
 * @throws        The error from the last failed attempt after exhausting retries,
 *                or immediately on permanent errors
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const config = { ...DEFAULT_RETRY, ...opts };
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry permanent errors
      if (!config.shouldRetry(error)) {
        throw error;
      }

      // Don't wait after the last attempt — just throw
      if (attempt >= config.maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const baseDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
      const jitter = (Math.random() * 2 - 1) * config.jitterMs; // ±jitterMs
      const delay = Math.max(0, baseDelay + jitter);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Fetch with Timeout
// ============================================================================

/**
 * Wrap a fetch request with an AbortController-based timeout.
 *
 * If the request takes longer than `timeoutMs`, the fetch is aborted and
 * an AbortError is thrown. The AbortController is cleaned up in the finally
 * block to prevent memory leaks.
 *
 * @param url        Request URL
 * @param init       Fetch init options (headers, body, method, etc.)
 * @param timeoutMs  Timeout in milliseconds (default: 10000)
 * @returns          The fetch Response
 * @throws           DOMException (AbortError) on timeout, TypeError on network error
 */
export async function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  timeoutMs: number = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}
