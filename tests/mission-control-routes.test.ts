/**
 * Mission Control Route Tests
 *
 * Uses Fastify inject() with in-memory SQLite for route-level testing.
 * Follows the K027 skip pattern for optional native dependencies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let authToken = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown — K027 skip guard for native deps
// ============================================================================

beforeAll(async () => {
  try {
    // Race the import against a timeout to avoid hanging in environments
    // where native module resolution stalls (K001, K027)
    const importPromise = import('../api/server.js');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server import timed out — likely native module stall (better-sqlite3/dockerode)')), 12_000),
    );

    const serverModule = await Promise.race([importPromise, timeoutPromise]);
    const { createServer } = serverModule;

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-mc-routes',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Get a dev JWT for authenticated routes
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { userId: 'test-user-mc', displayName: 'MC Test User' },
    });
    const loginBody = loginResponse.json();
    authToken = loginBody.token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('ERR_MODULE_NOT_FOUND') ||
      msg.includes('dockerode') ||
      msg.includes('timed out')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 15_000);

afterAll(async () => {
  if (server) {
    await server.close();
  }
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// GET /mission-control/status
// ============================================================================

describe('GET /mission-control/status', () => {
  it('returns 200 with expected shape', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/mission-control/status',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Verify camelCase keys (K005)
    expect(body).toHaveProperty('connected');
    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('circuitBreakerState');
    expect(body).toHaveProperty('telemetryQueueDepth');
    expect(body).toHaveProperty('agentCount');
    expect(typeof body.connected).toBe('boolean');
    expect(typeof body.enabled).toBe('boolean');
  });

  it('does not expose MC API key in response', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/mission-control/status',
      headers: { authorization: `Bearer ${authToken}` },
    });

    const raw = res.body;
    expect(raw).not.toContain('mcApiKey');
    expect(raw).not.toContain('MC_API_KEY');
    expect(raw).not.toContain('apiKey');
  });

  it('requires authentication', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/mission-control/status',
      // No auth header
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ============================================================================
// POST /mission-control/connect
// ============================================================================

describe('POST /mission-control/connect', () => {
  it('rejects missing mcUrl', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/connect',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { mcApiKey: 'test-key' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('mcUrl');
  });

  it('rejects missing mcApiKey', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/connect',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { mcUrl: 'https://mc.example.com' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('mcApiKey');
  });

  it('accepts valid connect payload and returns status', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/connect',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        mcUrl: 'https://mc.example.com',
        mcApiKey: 'test-api-key-value',
      },
    });

    // Connect may fail at the MC HTTP layer (no real MC server) but
    // the route should still respond with a status object
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('connected');
    expect(body).toHaveProperty('enabled');
    expect(body).toHaveProperty('circuitBreakerState');
  });

  it('requires authentication', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/connect',
      payload: { mcUrl: 'https://mc.example.com', mcApiKey: 'key' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ============================================================================
// POST /mission-control/disconnect
// ============================================================================

describe('POST /mission-control/disconnect', () => {
  it('returns status after disconnect', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/disconnect',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('connected', false);
    expect(body).toHaveProperty('circuitBreakerState');
  });

  it('is idempotent — calling disconnect when not connected succeeds', async () => {
    if (skip()) return;

    // Call disconnect twice — both should succeed
    const res1 = await server!.inject({
      method: 'POST',
      url: '/mission-control/disconnect',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await server!.inject({
      method: 'POST',
      url: '/mission-control/disconnect',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res2.statusCode).toBe(200);
  });

  it('requires authentication', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/mission-control/disconnect',
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
