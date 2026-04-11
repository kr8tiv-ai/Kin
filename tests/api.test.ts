/**
 * KIN API Integration Tests
 *
 * Covers server creation, auth flow, protected routes, validation,
 * skills, heartbeat, support chat, GDPR export, and rate limiting.
 *
 * All requests use Fastify's built-in `app.inject()` helper — no live
 * HTTP server is started.
 *
 * NOTE: The dev-login route is only registered when environment === 'development',
 * so the primary test server must use that environment value.
 * A second, short-lived server instance is created exclusively for the
 * rate-limiting test where `environment === 'production'` is needed to
 * activate the configurable limit (non-production always uses 1000).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createServer } from '../api/server.js';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let app: Awaited<ReturnType<typeof createServer>>;
let authToken: string;
let canRunSqlite = true;

try {
  const probe = new Database(':memory:');
  probe.close();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3') || msg.includes('NODE_MODULE_VERSION')) {
    console.warn(
      `⚠ Skipping api integration tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
    canRunSqlite = false;
  } else {
    throw err;
  }
}

const describeSqlite = canRunSqlite ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  app = await createServer({
    environment: 'development',
    databasePath: ':memory:',
    jwtSecret: 'test-secret-key',
  });
  await app.ready();

  // Create a test user via the dev-login shortcut (only available in development).
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { telegramId: 12345, firstName: 'TestUser' },
  });

  const loginBody = JSON.parse(loginRes.body);
  authToken = loginBody.token;
});

afterAll(async () => {
  await app?.close();
});

// ---------------------------------------------------------------------------
// 1. Server creation
// ---------------------------------------------------------------------------

describeSqlite('Server creation', () => {
  it('createServer() returns a Fastify instance with a ready state', async () => {
    // The server was created in beforeAll — verify it has the Fastify shape.
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe('function');
    expect(typeof app.close).toBe('function');
    // The custom context decorator should be present.
    expect(app.context).toBeDefined();
    expect(app.context.db).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Health endpoint
// ---------------------------------------------------------------------------

describeSqlite('Health endpoint', () => {
  it('GET /health returns 200 with a status field', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
  });
});

// ---------------------------------------------------------------------------
// 3. Auth flow — dev-login creates user and returns JWT
// ---------------------------------------------------------------------------

describeSqlite('Auth flow', () => {
  it('POST /auth/dev-login creates a user and returns a JWT token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 99999, firstName: 'NewUser' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
  });

  // ---------------------------------------------------------------------------
  // 4. Auth verify — valid token returns user info
  // ---------------------------------------------------------------------------

  it('GET /auth/verify with a valid token returns user data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body).toHaveProperty('userId');
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
  });

  // ---------------------------------------------------------------------------
  // 5. Auth reject — protected routes return 401 without token
  // ---------------------------------------------------------------------------

  it('protected routes return 401 when no auth token is provided', async () => {
    // /chat/export is a protected route — hit it without a token.
    const res = await app.inject({
      method: 'GET',
      url: '/chat/export',
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// 6. Chat validation — empty message
// ---------------------------------------------------------------------------

describeSqlite('Chat validation', () => {
  it('POST /chat rejects an empty message with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: { companionId: 'cipher', message: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    // Fastify sensible wraps the message — accept either shape.
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/message/);
  });

  // ---------------------------------------------------------------------------
  // 7. Chat validation — message too long
  // ---------------------------------------------------------------------------

  it('POST /chat rejects a message longer than 4000 characters with 400', async () => {
    const longMessage = 'a'.repeat(4001);

    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: { companionId: 'cipher', message: longMessage },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/too long|4000/);
  });
});

// ---------------------------------------------------------------------------
// 8. Skills list
// ---------------------------------------------------------------------------

describeSqlite('Skills', () => {
  it('GET /skills returns an array of approved skills', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/skills',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    // The schema seeds 10 approved skills — there should be at least some.
    expect(body.length).toBeGreaterThan(0);
    // Each item should have the expected shape.
    const first = body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('displayName');
    expect(first).toHaveProperty('category');
  });

  // ---------------------------------------------------------------------------
  // 9. Skills toggle — no auth returns 401
  // ---------------------------------------------------------------------------

  it('POST /skills/:id/toggle without auth returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/skill-calculator/toggle',
      payload: { active: true },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 10. Heartbeat — UPSERT works
// ---------------------------------------------------------------------------

describeSqlite('Heartbeat', () => {
  it('POST /heartbeat with valid payload returns ack and serverTime', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/heartbeat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: {
        kinId: 'test-kin-001',
        timestamp: Date.now(),
        services: { ollama: 'ok', telegram: 'ok' },
        version: '1.0.0',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ack).toBe(true);
    expect(body).toHaveProperty('serverTime');
    expect(typeof body.serverTime).toBe('number');
  });

  it('POST /heartbeat UPSERT updates an existing heartbeat for the same kinId', async () => {
    // First beat
    await app.inject({
      method: 'POST',
      url: '/heartbeat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: {
        kinId: 'test-kin-upsert',
        timestamp: Date.now(),
        services: { ollama: 'warn' },
        version: '0.9.0',
      },
    });

    // Second beat — same kinId, different data
    const res2 = await app.inject({
      method: 'POST',
      url: '/heartbeat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: {
        kinId: 'test-kin-upsert',
        timestamp: Date.now(),
        services: { ollama: 'ok' },
        version: '1.0.0',
      },
    });

    expect(res2.statusCode).toBe(200);
    const body = JSON.parse(res2.body);
    expect(body.ack).toBe(true);

    // Confirm only one row exists in the DB for this kinId.
    const rows = app.context.db
      .prepare('SELECT COUNT(*) as c FROM heartbeats WHERE kin_id = ?')
      .get('test-kin-upsert') as { c: number };
    expect(rows.c).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Support chat — POST /support/chat requires message
// ---------------------------------------------------------------------------

describeSqlite('Support chat', () => {
  it('POST /support/chat returns 400 when message is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/support/chat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/message/);
  });

  it('POST /support/chat returns 400 for an empty message string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/support/chat',
      headers: { authorization: 'Bearer ' + authToken },
      payload: { message: '   ' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 12. FAQ endpoint
// ---------------------------------------------------------------------------

describeSqlite('FAQ endpoint', () => {
  it('GET /support/faq returns an array of FAQ entries', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/support/faq',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    // The schema seeds 10 FAQ entries.
    expect(body.length).toBeGreaterThanOrEqual(10);
    const first = body[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('question');
    expect(first).toHaveProperty('answer');
    expect(first).toHaveProperty('category');
  });

  it('GET /support/faq with search query returns filtered results', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/support/faq?search=billing',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    // At least the billing FAQ entry should match.
    expect(body.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 13. Chat status — GET /chat/status returns provider info
// ---------------------------------------------------------------------------

describeSqlite('Chat status', () => {
  it('GET /chat/status returns provider configuration info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/status',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('providers');
    expect(body.providers).toHaveProperty('groq');
    expect(body.providers).toHaveProperty('openai');
    expect(body.providers).toHaveProperty('anthropic');
    expect(body).toHaveProperty('preferredProvider');
    expect(typeof body.preferredProvider).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 14. Rate limiting — global limit returns 429 after threshold
// ---------------------------------------------------------------------------

describeSqlite('Rate limiting', () => {
  it('returns 429 after exceeding the configured rate limit', async () => {
    // Spin up a dedicated server with a very low rate limit in production mode
    // so the limit activates. The primary test server uses development mode
    // which hard-codes 1000 requests per minute.
    const rateLimitApp = await createServer({
      environment: 'production',
      databasePath: ':memory:',
      jwtSecret: 'rate-limit-test-secret',
      rateLimitMax: 2,
    });
    await rateLimitApp.ready();

    try {
      // Fire three requests — the third should be rate-limited.
      const results = await Promise.all([
        rateLimitApp.inject({ method: 'GET', url: '/health' }),
        rateLimitApp.inject({ method: 'GET', url: '/health' }),
        rateLimitApp.inject({ method: 'GET', url: '/health' }),
      ]);

      const statusCodes = results.map((r) => r.statusCode);
      expect(statusCodes).toContain(429);
    } finally {
      await rateLimitApp.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 15. GDPR export — GET /chat/export returns user data structure
// ---------------------------------------------------------------------------

describeSqlite('GDPR data export', () => {
  it('GET /chat/export returns the correct data export structure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/export',
      headers: { authorization: 'Bearer ' + authToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; exportedAt: string };
      conversations: unknown[];
      memories: unknown[];
    };

    // Top-level shape
    expect(body).toHaveProperty('user');
    expect(body).toHaveProperty('conversations');
    expect(body).toHaveProperty('memories');

    // User block
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('exportedAt');
    // exportedAt should be a valid ISO 8601 date string
    expect(() => new Date(body.user.exportedAt)).not.toThrow();
    expect(new Date(body.user.exportedAt).toISOString()).toBe(body.user.exportedAt);

    // Collections are arrays (may be empty for a fresh test user)
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(Array.isArray(body.memories)).toBe(true);
  });

  it('GET /chat/export returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/chat/export',
    });

    expect(res.statusCode).toBe(401);
  });
});
