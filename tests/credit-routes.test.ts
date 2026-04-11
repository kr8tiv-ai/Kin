/**
 * Credit Routes — Integration Tests
 *
 * Tests credit management HTTP endpoints using Fastify inject() with
 * in-memory SQLite. Guards against better-sqlite3 load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';

// ---------------------------------------------------------------------------
// K001/K019 skip guard
// ---------------------------------------------------------------------------

let Database: typeof import('better-sqlite3').default;
let CreditDb: typeof import('../fleet/credit-db.js').CreditDb;
let creditRoutesPlugin: typeof import('../fleet/credit-routes.js').default;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ CreditDb } = await import('../fleet/credit-db.js'));
  creditRoutesPlugin = (await import('../fleet/credit-routes.js')).default;
  const probe = new Database(':memory:');
  probe.close();
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping credit-routes tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-for-credit-routes';

async function buildApp(creditDb: InstanceType<typeof CreditDb>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '1h' },
    verify: { algorithms: ['HS256'] },
  });

  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    await protectedApp.register(creditRoutesPlugin, { creditDb });
  });

  return app;
}

function makeToken(app: FastifyInstance, payload = { sub: 'user-test' }): string {
  return app.jwt.sign(payload);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('Credit Routes', () => {
  let db: InstanceType<typeof Database>;
  let creditDb: InstanceType<typeof CreditDb>;
  let app: FastifyInstance;
  let token: string;
  const testUserId = 'user-credit-test';

  beforeEach(async () => {
    db = new Database(':memory:');
    creditDb = new CreditDb(db);
    creditDb.init();

    // Seed a test user with $10.00 balance
    creditDb.addCredits(testUserId, 10.0);

    app = await buildApp(creditDb);
    token = makeToken(app);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  // -------------------------------------------------------------------------
  // GET /fleet/credits/:userId — 200 with balance
  // -------------------------------------------------------------------------

  it('GET /fleet/credits/:userId returns balance (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/fleet/credits/${testUserId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(testUserId);
    expect(body.balanceUsd).toBe(10.0);
    expect(body.tier).toBe('free');
    // camelCase compliance (K005)
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // GET /fleet/credits/:userId — 404 for unknown user
  // -------------------------------------------------------------------------

  it('GET /fleet/credits/:userId returns 404 for unknown user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/fleet/credits/nonexistent-user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found|No credit/i);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/add — balance increases
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/add increases balance (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/add`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 5.0 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(testUserId);
    expect(body.balanceUsd).toBe(15.0);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/add — negative amount → 400
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/add rejects negative amount (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/add`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: -5.0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/greater than 0/i);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/add — zero amount → 400
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/add rejects zero amount (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/add`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/greater than 0/i);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/add — non-numeric amount → 400
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/add rejects non-numeric amount (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/add`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 'not-a-number' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/valid number/i);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/set-tier — tier changes
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/set-tier changes tier (200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/set-tier`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: 'elder' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe(testUserId);
    expect(body.tier).toBe('elder');
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/set-tier — invalid tier → 400
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/set-tier rejects invalid tier (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/credits/${testUserId}/set-tier`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: 'platinum' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid tier/i);
  });

  // -------------------------------------------------------------------------
  // GET /fleet/credits/:userId/usage — returns array
  // -------------------------------------------------------------------------

  it('GET /fleet/credits/:userId/usage returns usage array (200)', async () => {
    // Seed a usage entry via CreditDb directly
    creditDb.logUsage({
      userId: testUserId,
      instanceId: 'inst-test',
      companionId: 'cipher',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.0025,
      balanceAfter: 9.9975,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/fleet/credits/${testUserId}/usage`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].companionId).toBe('cipher');
    expect(body[0].providerId).toBe('openai');
    expect(body[0].costUsd).toBeCloseTo(0.0025, 6);
  });

  // -------------------------------------------------------------------------
  // GET /fleet/credits/:userId/usage — empty for user with no history
  // -------------------------------------------------------------------------

  it('GET /fleet/credits/:userId/usage returns empty array for new user (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/fleet/credits/${testUserId}/usage`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Auth — 401 without token
  // -------------------------------------------------------------------------

  it('returns 401 without JWT token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/fleet/credits/${testUserId}`,
    });

    expect(res.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // POST /fleet/credits/:userId/add creates user if missing
  // -------------------------------------------------------------------------

  it('POST /fleet/credits/:userId/add creates balance for new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/credits/brand-new-user/add',
      headers: { authorization: `Bearer ${token}` },
      payload: { amount: 25.0 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userId).toBe('brand-new-user');
    expect(body.balanceUsd).toBe(25.0);
  });
});
