/**
 * DM Security API Route Tests
 *
 * Uses Fastify's inject() with in-memory SQLite.
 * Follows the same skip-if-native-unavailable pattern as api-routes.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let authToken = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-dm-security',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Get a dev JWT
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { userId: 'user-dev' },
    });
    const loginBody = loginRes.json();
    authToken = loginBody.token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('dockerode')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
});

afterAll(async () => {
  if (server) await server.close();
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

function headers() {
  return { authorization: `Bearer ${authToken}` };
}

// ============================================================================
// GET /dm-security/allowlist
// ============================================================================

describe('GET /dm-security/allowlist', () => {
  it('returns empty allowlist initially', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.allowlist).toEqual([]);
  });

  it('returns entries after approve', async () => {
    if (skip()) return;
    // Approve a sender first
    await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'telegram', senderId: 'tg-user-1', displayName: 'Alice' },
    });

    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.allowlist.length).toBeGreaterThanOrEqual(1);

    const entry = body.allowlist.find((e: any) => e.senderId === 'tg-user-1');
    expect(entry).toBeDefined();
    expect(entry.channel).toBe('telegram');
    expect(entry.displayName).toBe('Alice');
    // camelCase keys (K005)
    expect(entry.approvedBy).toBeDefined();
    expect(entry.approvedAt).toBeTypeOf('number');
  });

  it('filters by channel query param', async () => {
    if (skip()) return;
    // Approve on a different channel
    await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'discord', senderId: 'disc-user-1' },
    });

    const resTg = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist?channel=telegram',
      headers: headers(),
    });
    const tgEntries = resTg.json().allowlist;
    expect(tgEntries.every((e: any) => e.channel === 'telegram')).toBe(true);

    const resDisc = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist?channel=discord',
      headers: headers(),
    });
    const discEntries = resDisc.json().allowlist;
    expect(discEntries.every((e: any) => e.channel === 'discord')).toBe(true);
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid channel', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/allowlist?channel=slack',
      headers: headers(),
    });
    expect(res.statusCode).toBe(400);
  });
});

// ============================================================================
// POST /dm-security/approve
// ============================================================================

describe('POST /dm-security/approve', () => {
  it('approves a sender and returns success', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'whatsapp', senderId: 'wa-user-99', displayName: 'Bob' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.senderId).toBe('wa-user-99');
    expect(body.channel).toBe('whatsapp');
  });

  it('returns 400 when channel is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { senderId: 'someone' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when senderId is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'telegram' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid channel', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'irc', senderId: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      payload: { channel: 'telegram', senderId: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// POST /dm-security/revoke
// ============================================================================

describe('POST /dm-security/revoke', () => {
  it('revokes an approved sender', async () => {
    if (skip()) return;
    // First approve
    await server!.inject({
      method: 'POST',
      url: '/dm-security/approve',
      headers: headers(),
      payload: { channel: 'telegram', senderId: 'tg-revoke-me' },
    });

    // Then revoke
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/revoke',
      headers: headers(),
      payload: { channel: 'telegram', senderId: 'tg-revoke-me' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.revoked).toBe(true);
  });

  it('returns revoked: false for non-existent sender', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/revoke',
      headers: headers(),
      payload: { channel: 'telegram', senderId: 'non-existent-user' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.revoked).toBe(false);
  });

  it('returns 400 when channel is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/revoke',
      headers: headers(),
      payload: { senderId: 'someone' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid channel', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/revoke',
      headers: headers(),
      payload: { channel: 'smoke_signal', senderId: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/dm-security/revoke',
      payload: { channel: 'telegram', senderId: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// GET /dm-security/pending
// ============================================================================

describe('GET /dm-security/pending', () => {
  it('returns pending pairing codes (may be empty)', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/pending',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.pending)).toBe(true);
    // camelCase keys in each entry (if any exist)
    for (const entry of body.pending) {
      expect(entry).toHaveProperty('senderId');
      expect(entry).toHaveProperty('createdAt');
      expect(entry).toHaveProperty('expiresAt');
    }
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/pending',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid channel filter', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/dm-security/pending?channel=fax',
      headers: headers(),
    });
    expect(res.statusCode).toBe(400);
  });
});
