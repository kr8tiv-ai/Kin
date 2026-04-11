/**
 * Frontier Proxy — Integration Tests
 *
 * Tests FrontierProxy HTTP service against mocked providers and
 * real CreditDb with in-memory SQLite.
 *
 * Guards against better-sqlite3 native load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';

// ---------------------------------------------------------------------------
// K001/K019 skip guard — better-sqlite3 may not load on Windows Node v24
// ---------------------------------------------------------------------------
let Database: typeof import('better-sqlite3').default;
let CreditDb: typeof import('../fleet/credit-db.js').CreditDb;
let FleetDb: typeof import('../fleet/db.js').FleetDb;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ CreditDb } = await import('../fleet/credit-db.js'));
  ({ FleetDb } = await import('../fleet/db.js'));
  const probe = new Database(':memory:');
  probe.close();
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping frontier-proxy tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mock providers and circuit breaker BEFORE importing FrontierProxy
// ---------------------------------------------------------------------------

// Mock the provider registry
vi.mock('../inference/providers/index.ts', () => ({
  getProvider: vi.fn(),
  getConfiguredProviders: vi.fn(() => []),
  getAllProviderSpecs: vi.fn(() => []),
  isProviderReady: vi.fn(() => true),
  initializeProviders: vi.fn(),
}));

// Mock the circuit breaker
vi.mock('../inference/providers/circuit-breaker.ts', () => ({
  isProviderHealthy: vi.fn(() => true),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  resetAllCircuits: vi.fn(),
  getProviderHealth: vi.fn(() => []),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { FrontierProxy } from '../fleet/frontier-proxy.js';
import { getProvider } from '../inference/providers/index.js';
import {
  isProviderHealthy,
  recordSuccess,
  recordFailure,
} from '../inference/providers/circuit-breaker.js';

import type {
  FrontierProvider,
  FrontierModelSpec,
  ProviderChatResponse,
} from '../inference/providers/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a fake provider with predictable pricing for cost testing. */
function makeFakeProvider(overrides?: Partial<FrontierModelSpec>): FrontierProvider {
  const spec: FrontierModelSpec = {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    displayName: 'Test Provider',
    contextWindow: 128000,
    pricing: { inputPer1M: 10.0, outputPer1M: 30.0 },
    apiBaseUrl: 'https://api.test.com',
    apiKeyEnvVar: 'TEST_API_KEY',
    ...overrides,
  };

  const cannedResponse: ProviderChatResponse = {
    content: 'Hello from the frontier model!',
    inputTokens: 100,
    outputTokens: 50,
    model: spec.modelId,
    provider: spec.providerId,
    latencyMs: 150,
  };

  return {
    id: spec.providerId,
    spec,
    isConfigured: () => true,
    chat: vi.fn().mockResolvedValue(cannedResponse),
  };
}

/** Send an HTTP request to the proxy and return parsed response. */
function proxyRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          Connection: 'close',
          ...headers,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: { _raw: raw } });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const TEST_PORT = 9876; // Avoid collisions with app ports 3001/3002/8080

describe.runIf(canRun)('FrontierProxy', () => {
  let creditDb: InstanceType<typeof CreditDb>;
  let fleetDb: InstanceType<typeof FleetDb>;
  let proxy: FrontierProxy;
  let proxyToken: string;
  let proxyPort = TEST_PORT;
  const userId = 'test-user-001';
  const instanceId = 'inst-001';

  beforeEach(async () => {
    proxyPort += 1;
    // Reset all mocks
    vi.clearAllMocks();

    // In-memory SQLite for both DBs
    const db = new Database(':memory:');
    creditDb = new CreditDb(db);
    creditDb.init();
    fleetDb = new FleetDb(db);
    fleetDb.init();

    // Seed test data: user with $5.00 balance and a proxy token
    creditDb.addCredits(userId, 5.0);
    proxyToken = creditDb.createProxyToken(userId, instanceId);

    // Configure mock provider
    const fakeProvider = makeFakeProvider();
    vi.mocked(getProvider).mockReturnValue(fakeProvider);
    vi.mocked(isProviderHealthy).mockReturnValue(true);

    // Create and start proxy
    proxy = new FrontierProxy({
      creditDb,
      fleetDb,
      port: proxyPort,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    await proxy.start();
  });

  afterEach(async () => {
    await proxy.stop();
    creditDb.close();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('returns 200 with response, cost, and remaining balance for valid request', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      {
        companionId: 'cipher',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Hello from the frontier model!');
    expect(res.body.inputTokens).toBe(100);
    expect(res.body.outputTokens).toBe(50);
    expect(res.body.provider).toBe('openai');
    expect(res.body.model).toBe('gpt-5.4');
    expect(typeof res.body.costUsd).toBe('number');
    expect(typeof res.body.remainingBalance).toBe('number');
    // Cost: (100/1M)*10 + (50/1M)*30 = 0.001 + 0.0015 = 0.0025
    expect(res.body.costUsd).toBeCloseTo(0.0025, 6);
    // Remaining: 5.0 - 0.0025 = 4.9975
    expect(res.body.remainingBalance).toBeCloseTo(4.9975, 4);
  });

  // -----------------------------------------------------------------------
  // Auth failures
  // -----------------------------------------------------------------------

  it('returns 401 when Authorization header is missing', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authorization/i);
  });

  it('returns 401 for invalid proxy token', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: 'Bearer not-a-real-token' },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid proxy token');
  });

  // -----------------------------------------------------------------------
  // Credit / payment failures
  // -----------------------------------------------------------------------

  it('returns 402 when credit balance is zero', async () => {
    // Drain the balance
    creditDb.deductCredits(userId, 5.0);

    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Insufficient credits');
    expect(res.body.remainingBalance).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Validation failures
  // -----------------------------------------------------------------------

  it('returns 400 for unknown companionId', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'nonexistent', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nonexistent/);
  });

  it('returns 400 for malformed JSON body', async () => {
    // Send raw garbage instead of JSON
    const res = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const payload = 'this is not json{{{';
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: proxyPort,
          method: 'POST',
          path: '/v1/chat/completions',
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Connection: 'close',
            Authorization: `Bearer ${proxyToken}`,
          },
        },
        (r) => {
          const chunks: Buffer[] = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve({ status: r.statusCode ?? 0, body: JSON.parse(raw) });
          });
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Malformed/i);
  });

  it('returns 400 for empty messages array', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/messages/i);
  });

  it('returns 400 for missing companionId', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/companionId/i);
  });

  // -----------------------------------------------------------------------
  // Provider failures
  // -----------------------------------------------------------------------

  it('returns 502 and calls recordFailure on provider error', async () => {
    const fakeProvider = makeFakeProvider();
    (fakeProvider.chat as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Upstream timeout'),
    );
    vi.mocked(getProvider).mockReturnValue(fakeProvider);

    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Provider error');
    expect(res.body.details).toBe('Upstream timeout');
    expect(recordFailure).toHaveBeenCalledWith('openai');
  });

  it('returns 503 when circuit breaker is open', async () => {
    vi.mocked(isProviderHealthy).mockReturnValue(false);

    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/i);
    expect(res.body.providerId).toBe('openai');
  });

  // -----------------------------------------------------------------------
  // Cost calculation
  // -----------------------------------------------------------------------

  it('calculates cost correctly from token counts and pricing', async () => {
    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(200);
    // Pricing: inputPer1M=10, outputPer1M=30
    // Input: 100 tokens → (100/1_000_000)*10 = 0.001
    // Output: 50 tokens → (50/1_000_000)*30 = 0.0015
    // Total: 0.0025
    expect(res.body.costUsd).toBeCloseTo(0.0025, 6);
  });

  // -----------------------------------------------------------------------
  // Usage logging
  // -----------------------------------------------------------------------

  it('creates a usage log entry after successful request', async () => {
    await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    const history = creditDb.getUsageHistory(userId);
    expect(history.length).toBe(1);
    expect(history[0].companionId).toBe('cipher');
    expect(history[0].providerId).toBe('openai');
    expect(history[0].modelId).toBe('gpt-5.4');
    expect(history[0].inputTokens).toBe(100);
    expect(history[0].outputTokens).toBe(50);
    expect(history[0].costUsd).toBeCloseTo(0.0025, 6);
  });

  // -----------------------------------------------------------------------
  // recordSuccess called on happy path
  // -----------------------------------------------------------------------

  it('calls recordSuccess on the provider after a successful request', async () => {
    await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(recordSuccess).toHaveBeenCalledWith('openai');
  });

  // -----------------------------------------------------------------------
  // Health endpoint
  // -----------------------------------------------------------------------

  it('GET /health returns 200 ok', async () => {
    const res = await proxyRequest(proxyPort, 'GET', '/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  // -----------------------------------------------------------------------
  // 404 catch-all
  // -----------------------------------------------------------------------

  it('returns 404 for unknown routes', async () => {
    const res = await proxyRequest(proxyPort, 'GET', '/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  // -----------------------------------------------------------------------
  // Negative / boundary tests (Q7)
  // -----------------------------------------------------------------------

  it('returns 401 for revoked token (instance removed)', async () => {
    creditDb.revokeProxyTokens(instanceId);

    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid proxy token');
  });

  it('deduction succeeds when balance exactly equals cost', async () => {
    // Set balance to exactly the cost: 0.0025
    // Current balance is 5.0, deduct 5.0 - 0.0025 = 4.9975
    creditDb.deductCredits(userId, 4.9975);

    const res = await proxyRequest(
      proxyPort,
      'POST',
      '/v1/chat/completions',
      { companionId: 'cipher', messages: [{ role: 'user', content: 'Hi' }] },
      { Authorization: `Bearer ${proxyToken}` },
    );

    expect(res.status).toBe(200);
    expect(res.body.costUsd).toBeCloseTo(0.0025, 6);
    expect(res.body.remainingBalance).toBeCloseTo(0, 6);
  });
});
