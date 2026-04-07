/**
 * PinkBrain / KIN Credits Route Tests
 *
 * Uses Fastify inject() with in-memory SQLite for route-level testing.
 * Follows the K027 skip pattern for optional native dependencies.
 * Tests: GET /kin-credits/status, POST /kin-credits/provision,
 *        POST /kin-credits/revoke, GET /kin-credits/providers
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
    const importPromise = import('../api/server.js');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Server import timed out — likely native module stall (better-sqlite3/dockerode)',
            ),
          ),
        12_000,
      ),
    );

    const serverModule = await Promise.race([importPromise, timeoutPromise]);
    const { createServer } = serverModule;

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-pb-routes',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Get a dev JWT for authenticated routes
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { userId: 'test-user-pb', displayName: 'PB Test User' },
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
// GET /kin-credits/status
// ============================================================================

describe('GET /kin-credits/status', () => {
  it('requires authentication', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/status',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns status shape with system and userCredentials', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // system status shape
    expect(body.system).toBeDefined();
    expect(typeof body.system.totalCredentials).toBe('number');
    expect(typeof body.system.activeCredentials).toBe('number');
    expect(body.system.providerBreakdown).toBeDefined();
    // userCredentials is an array
    expect(Array.isArray(body.userCredentials)).toBe(true);
  });
});

// ============================================================================
// POST /kin-credits/provision
// ============================================================================

describe('POST /kin-credits/provision', () => {
  it('requires authentication', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      payload: {
        providerId: 'openai',
        credentialType: 'cli',
        credential: 'sk-test',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates providerId is required', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { credentialType: 'cli', credential: 'sk-test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('providerId');
  });

  it('validates providerId is a known provider', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'fake-provider',
        credentialType: 'cli',
        credential: 'sk-test',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid providerId');
  });

  it('validates credentialType is required', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { providerId: 'openai', credential: 'sk-test' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('credentialType');
  });

  it('validates credentialType is cli or api', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'openai',
        credentialType: 'invalid',
        credential: 'sk-test',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid credentialType');
  });

  it('validates credential is required', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { providerId: 'openai', credentialType: 'cli' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('credential');
  });

  it('rejects free-tier plan', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'openai',
        credentialType: 'cli',
        credential: 'sk-test',
        planTier: 'free',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Free-tier');
  });

  it('provisions a credential and returns success shape', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'openai',
        credentialType: 'cli',
        credential: 'sk-test-provision-key',
        planTier: 'pro',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.credentialId).toMatch(/^kc-/);
    expect(body.providerId).toBe('openai');
    expect(body.credentialType).toBe('cli');
  });

  it('status reflects provisioned credential (redacted)', async () => {
    if (skip()) return;
    // Provision first
    await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'anthropic',
        credentialType: 'api',
        credential: 'ak-secret-anthropic-key',
      },
    });
    // Check status
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/status',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    const anthropicCred = body.userCredentials.find(
      (c: { providerId: string }) => c.providerId === 'anthropic',
    );
    expect(anthropicCred).toBeDefined();
    expect(anthropicCred.status).toBe('active');
    // Credential value must NOT be in the response
    expect(JSON.stringify(body)).not.toContain('ak-secret-anthropic-key');
  });
});

// ============================================================================
// POST /kin-credits/revoke
// ============================================================================

describe('POST /kin-credits/revoke', () => {
  it('requires authentication', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/revoke',
      payload: { providerId: 'openai', credentialType: 'cli' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates providerId is required', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/revoke',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { credentialType: 'cli' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('providerId');
  });

  it('returns 404 for non-existent credential', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/revoke',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { providerId: 'mistral', credentialType: 'cli' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('No matching');
  });

  it('revokes a provisioned credential', async () => {
    if (skip()) return;
    // Provision first
    await server!.inject({
      method: 'POST',
      url: '/kin-credits/provision',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        providerId: 'deepseek',
        credentialType: 'api',
        credential: 'ds-revoke-test',
      },
    });
    // Revoke
    const res = await server!.inject({
      method: 'POST',
      url: '/kin-credits/revoke',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { providerId: 'deepseek', credentialType: 'api' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('revoked');
  });
});

// ============================================================================
// GET /kin-credits/providers
// ============================================================================

describe('GET /kin-credits/providers', () => {
  it('requires authentication', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/providers',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns provider list with camelCase keys (K005)', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/providers',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);

    // Check shape of first provider
    const first = body.providers[0];
    expect(first.providerId).toBeTypeOf('string');
    expect(first.displayName).toBeTypeOf('string');
    expect(first.modelId).toBeTypeOf('string');
    expect(first.contextWindow).toBeTypeOf('number');
    expect(first.pricing).toBeDefined();
    expect(typeof first.apiConfigured).toBe('boolean');
    expect(first.userProvisioned).toBeDefined();
    expect(typeof first.userProvisioned.cli).toBe('boolean');
    expect(typeof first.userProvisioned.api).toBe('boolean');
  });

  it('includes openrouter in provider list', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/kin-credits/providers',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const body = res.json();
    const openrouter = body.providers.find(
      (p: { providerId: string }) => p.providerId === 'openrouter',
    );
    expect(openrouter).toBeDefined();
    expect(openrouter.displayName).toContain('OpenRouter');
  });
});
