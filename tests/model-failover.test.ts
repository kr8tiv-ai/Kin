/**
 * Model Failover Tests — retry utility, provider failover, metrics recording
 *
 * Covers:
 * - retryWithBackoff: transient vs permanent error handling, backoff timing
 * - fetchWithTimeout: AbortController-based timeout
 * - FallbackHandler: multi-provider iteration on failure
 * - MetricsCollector: request recording integration
 * - /chat/status: circuit breaker health + metrics summary
 *
 * All tests use mocked fetch — no real HTTP calls.
 * Uses vi.useFakeTimers() for deterministic backoff assertions.
 *
 * @module tests/model-failover
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// retryWithBackoff — Pure Function Tests
// ============================================================================

describe('retryWithBackoff', () => {
  let retryWithBackoff: typeof import('../inference/retry.js').retryWithBackoff;
  let HttpError: typeof import('../inference/retry.js').HttpError;
  let isTransientError: typeof import('../inference/retry.js').isTransientError;
  let TRANSIENT_STATUS_CODES: typeof import('../inference/retry.js').TRANSIENT_STATUS_CODES;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../inference/retry.js');
    retryWithBackoff = mod.retryWithBackoff;
    HttpError = mod.HttpError;
    isTransientError = mod.isTransientError;
    TRANSIENT_STATUS_CODES = mod.TRANSIENT_STATUS_CODES;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt — no retry', async () => {
    const fn = vi.fn().mockResolvedValueOnce('ok');
    const result = await retryWithBackoff(fn, { maxRetries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError('Service Unavailable', 503))
      .mockResolvedValueOnce('recovered');

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      initialDelayMs: 1000,
      backoffFactor: 2,
      jitterMs: 0,
    });

    // Advance past the first retry delay (1000ms base * 2^0 = 1000ms)
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 with backoff delay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError('Rate Limited', 429))
      .mockRejectedValueOnce(new HttpError('Rate Limited', 429))
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, {
      maxRetries: 2,
      initialDelayMs: 500,
      backoffFactor: 2,
      jitterMs: 0,
    });

    // First retry: 500ms * 2^0 = 500ms
    await vi.advanceTimersByTimeAsync(600);
    // Second retry: 500ms * 2^1 = 1000ms
    await vi.advanceTimersByTimeAsync(1100);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 400 (permanent error) — throws immediately', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError('Bad Request', 400));

    await expect(
      retryWithBackoff(fn, { maxRetries: 2 })
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 401/403 — throws immediately', async () => {
    const fn401 = vi.fn().mockRejectedValueOnce(new HttpError('Unauthorized', 401));
    await expect(retryWithBackoff(fn401, { maxRetries: 2 })).rejects.toThrow('Unauthorized');
    expect(fn401).toHaveBeenCalledTimes(1);

    const fn403 = vi.fn().mockRejectedValueOnce(new HttpError('Forbidden', 403));
    await expect(retryWithBackoff(fn403, { maxRetries: 2 })).rejects.toThrow('Forbidden');
    expect(fn403).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries — throws after exhausting all attempts', async () => {
    vi.useRealTimers(); // Use real timers to avoid unhandled rejection timing issues
    const fn = vi.fn().mockRejectedValue(new HttpError('Server Error', 503));

    await expect(
      retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10, // Very short delays so the test completes quickly
        backoffFactor: 1,
        jitterMs: 0,
      }),
    ).rejects.toThrow('Server Error');

    // 1 initial + 2 retries = 3 total attempts
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on network TypeError (fetch failure)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce('recovered');

    const promise = retryWithBackoff(fn, {
      maxRetries: 1,
      initialDelayMs: 100,
      jitterMs: 0,
    });

    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// isTransientError — Pure Function Tests
// ============================================================================

describe('isTransientError', () => {
  let HttpError: typeof import('../inference/retry.js').HttpError;
  let isTransientError: typeof import('../inference/retry.js').isTransientError;
  let TRANSIENT_STATUS_CODES: typeof import('../inference/retry.js').TRANSIENT_STATUS_CODES;

  beforeEach(async () => {
    const mod = await import('../inference/retry.js');
    HttpError = mod.HttpError;
    isTransientError = mod.isTransientError;
    TRANSIENT_STATUS_CODES = mod.TRANSIENT_STATUS_CODES;
  });

  it('classifies transient HTTP status codes correctly', () => {
    for (const code of [429, 500, 502, 503, 504]) {
      expect(isTransientError(new HttpError(`Error ${code}`, code))).toBe(true);
    }
  });

  it('classifies permanent HTTP errors as non-transient', () => {
    for (const code of [400, 401, 403, 404, 422]) {
      expect(isTransientError(new HttpError(`Error ${code}`, code))).toBe(false);
    }
  });

  it('classifies TypeError (network failure) as transient', () => {
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true);
  });

  it('classifies AbortError as transient', () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    expect(isTransientError(abortError)).toBe(true);
  });

  it('classifies unknown errors as non-transient', () => {
    expect(isTransientError(new Error('Something random'))).toBe(false);
    expect(isTransientError('string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });

  it('TRANSIENT_STATUS_CODES contains expected codes', () => {
    expect(TRANSIENT_STATUS_CODES.has(429)).toBe(true);
    expect(TRANSIENT_STATUS_CODES.has(500)).toBe(true);
    expect(TRANSIENT_STATUS_CODES.has(502)).toBe(true);
    expect(TRANSIENT_STATUS_CODES.has(503)).toBe(true);
    expect(TRANSIENT_STATUS_CODES.has(504)).toBe(true);
    expect(TRANSIENT_STATUS_CODES.has(400)).toBe(false);
    expect(TRANSIENT_STATUS_CODES.has(401)).toBe(false);
  });
});

// ============================================================================
// fetchWithTimeout — Pure Function Tests
// ============================================================================

describe('fetchWithTimeout', () => {
  let fetchWithTimeout: typeof import('../inference/retry.js').fetchWithTimeout;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../inference/retry.js');
    fetchWithTimeout = mod.fetchWithTimeout;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns response when fetch completes within timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 5000);
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts and throws when fetch exceeds timeout', async () => {
    vi.useRealTimers(); // Use real timers for this test — fake timers + AbortController interact poorly

    // Create a fetch that takes longer than the timeout
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          if (init.signal.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'));
            return;
          }
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
      });
    });

    // Use a very short timeout so the test completes quickly
    await expect(fetchWithTimeout('https://example.com', {}, 50)).rejects.toThrow();
  });

  it('cleans up AbortController on success (no leaked timers)', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const mockResponse = new Response('ok', { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockResponse);

    await fetchWithTimeout('https://example.com', {}, 5000);

    // clearTimeout should have been called in the finally block
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

// ============================================================================
// FallbackHandler — Multi-Provider Iteration
// ============================================================================

describe('FallbackHandler multi-provider iteration', () => {
  let FallbackHandler: typeof import('../inference/fallback-handler.js').FallbackHandler;
  let HttpError: typeof import('../inference/retry.js').HttpError;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.useRealTimers();
    const fbMod = await import('../inference/fallback-handler.js');
    FallbackHandler = fbMod.FallbackHandler;
    const retryMod = await import('../inference/retry.js');
    HttpError = retryMod.HttpError;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('when first provider fails, tries second provider', async () => {
    const handler = new FallbackHandler(
      { preferredProvider: 'openai' },
      {
        openai: { apiKey: 'test-openai-key', model: 'gpt-4' },
        groq: { apiKey: 'test-groq-key', model: 'test-model' },
      },
    );

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('openai.com')) {
        // OpenAI fails with transient error
        return Promise.resolve(new Response('Server Error', { status: 503 }));
      }
      // Groq succeeds
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello from groq' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });

    const result = await handler.chat(
      [{ role: 'user', content: 'hello' }],
    );

    // Response should come from groq (the second provider)
    expect(result.content).toContain('Hello from groq');
    // fetch should have been called multiple times (retries on openai + groq success)
    expect(callCount).toBeGreaterThan(1);
  });

  it('when all providers fail, throws with descriptive error', async () => {
    const handler = new FallbackHandler(
      { preferredProvider: 'openai' },
      {
        openai: { apiKey: 'test-key' },
        anthropic: { apiKey: 'test-key' },
        groq: { apiKey: 'test-key' },
      },
    );

    // Return fresh Response each call (Response body can only be read once)
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Server Error', { status: 503 })),
    );

    await expect(
      handler.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow();
  });

  it('skips providers without API keys', async () => {
    const handler = new FallbackHandler(
      { preferredProvider: 'openai' },
      {
        openai: { apiKey: undefined }, // no key
        anthropic: { apiKey: undefined }, // no key
        groq: { apiKey: 'test-groq-key', model: 'test-model' },
      },
    );

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello from groq' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const result = await handler.chat(
      [{ role: 'user', content: 'hello' }],
    );

    expect(result.content).toContain('Hello from groq');
    // Only groq should have been called (openai and anthropic have no keys)
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    for (const [url] of calls) {
      expect(String(url)).toContain('groq');
    }
  });

  it('throws when no API keys are configured at all', async () => {
    const handler = new FallbackHandler(
      { preferredProvider: 'openai' },
      {
        openai: { apiKey: undefined },
        anthropic: { apiKey: undefined },
        groq: { apiKey: undefined },
      },
    );

    await expect(
      handler.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toThrow(/No API key/);
  });

  it('chatStream iterates providers on failure', async () => {
    const handler = new FallbackHandler(
      { preferredProvider: 'openai' },
      {
        openai: { apiKey: 'test-openai-key' },
        groq: { apiKey: 'test-groq-key' },
      },
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('openai.com')) {
        // OpenAI fails
        return Promise.resolve(new Response('Server Error', { status: 503 }));
      }
      // Groq succeeds with a simple SSE stream
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    });

    const tokens: string[] = [];
    for await (const token of handler.chatStream(
      [{ role: 'user', content: 'hello' }],
    )) {
      tokens.push(token);
    }

    expect(tokens).toContain('Hi');
  });
});

// ============================================================================
// MetricsCollector — Unit Tests
// ============================================================================

describe('MetricsCollector', () => {
  let MetricsCollector: typeof import('../inference/metrics.js').MetricsCollector;

  beforeEach(async () => {
    const mod = await import('../inference/metrics.js');
    MetricsCollector = mod.MetricsCollector;
  });

  it('records a request metric and retrieves it', () => {
    const collector = new MetricsCollector();
    collector.record({
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test-model',
      latencyMs: 150,
      inputTokens: 100,
      outputTokens: 50,
      success: true,
      costUsd: 0.001,
      route: 'fallback',
    });

    const metrics = collector.getMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.avgLatencyMs).toBe(150);
    expect(metrics.totalInputTokens).toBe(100);
    expect(metrics.totalOutputTokens).toBe(50);
  });

  it('records multiple requests and computes aggregated metrics', () => {
    const collector = new MetricsCollector();

    collector.record({
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test-model',
      latencyMs: 100,
      inputTokens: 50,
      outputTokens: 25,
      success: true,
      route: 'fallback',
    });

    collector.record({
      requestId: 'req-2',
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model: 'gpt-4',
      latencyMs: 200,
      inputTokens: 80,
      outputTokens: 40,
      success: true,
      route: 'fallback',
    });

    const metrics = collector.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.successfulRequests).toBe(2);
    expect(metrics.avgLatencyMs).toBe(150); // (100+200)/2
    expect(metrics.totalInputTokens).toBe(130); // 50+80
    expect(metrics.totalOutputTokens).toBe(65); // 25+40
  });

  it('tracks failed requests with success=false', () => {
    const collector = new MetricsCollector();

    collector.record({
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test-model',
      latencyMs: 100,
      inputTokens: 50,
      outputTokens: 0,
      success: false,
      error: 'Service unavailable',
      route: 'fallback',
    });

    const metrics = collector.getMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.failedRequests).toBe(1);
    expect(metrics.successRate).toBe(0);
  });

  it('success rate correctly computes across mixed results', () => {
    const collector = new MetricsCollector();

    // 3 successes, 1 failure
    for (let i = 0; i < 3; i++) {
      collector.record({
        requestId: `req-ok-${i}`,
        timestamp: new Date().toISOString(),
        provider: 'groq',
        model: 'test',
        latencyMs: 100,
        inputTokens: 10,
        outputTokens: 10,
        success: true,
        route: 'fallback',
      });
    }
    collector.record({
      requestId: 'req-fail',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test',
      latencyMs: 5000,
      inputTokens: 10,
      outputTokens: 0,
      success: false,
      route: 'fallback',
    });

    const metrics = collector.getMetrics();
    expect(metrics.totalRequests).toBe(4);
    expect(metrics.successRate).toBe(0.75);
  });

  it('clear() resets all metrics', () => {
    const collector = new MetricsCollector();
    collector.record({
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test',
      latencyMs: 100,
      inputTokens: 10,
      outputTokens: 10,
      success: true,
      route: 'fallback',
    });

    collector.clear();
    const metrics = collector.getMetrics();
    expect(metrics.totalRequests).toBe(0);
  });
});

// ============================================================================
// Chat Status Endpoint — Integration
//
// Tests /chat/status response shape. Requires mocking the modules that
// provide circuit breaker and metrics data to avoid needing a full
// Fastify server with SQLite.
// ============================================================================

describe('/chat/status response shape', () => {
  it('getProviderHealth returns expected shape', async () => {
    const { getProviderHealth, recordFailure, recordSuccess, resetAllCircuits } =
      await import('../inference/providers/circuit-breaker.js');

    resetAllCircuits();

    // Record some activity to populate circuit state
    recordSuccess('groq');
    recordFailure('openai');

    const health = getProviderHealth();
    expect(Array.isArray(health)).toBe(true);

    const groqStatus = health.find(h => h.providerId === 'groq');
    expect(groqStatus).toBeDefined();
    expect(groqStatus!.state).toBe('CLOSED');
    expect(groqStatus!.healthy).toBe(true);

    const openaiStatus = health.find(h => h.providerId === 'openai');
    expect(openaiStatus).toBeDefined();
    expect(openaiStatus!.failures).toBeGreaterThan(0);

    // Each status has the right keys
    for (const status of health) {
      expect(status).toHaveProperty('providerId');
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failures');
      expect(status).toHaveProperty('healthy');
    }

    resetAllCircuits();
  });

  it('MetricsCollector getMetrics returns summary used by /chat/status', async () => {
    const { MetricsCollector } = await import('../inference/metrics.js');
    const collector = new MetricsCollector();

    collector.record({
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
      provider: 'groq',
      model: 'test',
      latencyMs: 250,
      inputTokens: 100,
      outputTokens: 50,
      success: true,
      route: 'fallback',
    });

    const summary = collector.getMetrics();

    // /chat/status uses these three fields
    expect(summary).toHaveProperty('totalRequests');
    expect(summary).toHaveProperty('successRate');
    expect(summary).toHaveProperty('avgLatencyMs');

    expect(summary.totalRequests).toBe(1);
    expect(summary.successRate).toBe(1);
    expect(summary.avgLatencyMs).toBe(250);
  });
});

// ============================================================================
// HttpError — class behavior
// ============================================================================

describe('HttpError', () => {
  it('carries status code and message', async () => {
    const { HttpError } = await import('../inference/retry.js');
    const err = new HttpError('Not Found', 404);
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.name).toBe('HttpError');
    expect(err instanceof Error).toBe(true);
  });
});
