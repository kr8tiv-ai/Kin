/**
 * Approval API Routes — Integration Tests
 *
 * Uses Fastify's inject() pattern with in-memory SQLite.
 * Tests list, get, approve, reject endpoints (JWT-protected),
 * ownership enforcement, and auth.
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let authToken = '';
let otherUserToken = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'test',
      jwtSecret: 'test-secret-approvals',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Seed test users
    const db = server.context.db;
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-appr-a', 333333, 'Alice')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-appr-b', 444444, 'Bob')`).run();

    // Get JWT tokens for both users
    authToken = server.jwt.sign({ userId: 'user-appr-a' });
    otherUserToken = server.jwt.sign({ userId: 'user-appr-b' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('bindings') || msg.includes('better_sqlite3') || msg.includes('better-sqlite3') || msg.includes('ERR_DLOPEN_FAILED') || msg.includes('dockerode')) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 60_000);

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
// Helper: seed an approval directly via DB
// ============================================================================

function seedApproval(overrides: Record<string, unknown> = {}): string {
  const db = server!.context.db;
  const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const defaults = {
    id,
    user_id: 'user-appr-a',
    skill_name: 'email',
    intent: 'send',
    payload: JSON.stringify({ to: 'test@example.com', subject: 'Hello' }),
    delivery_channel: 'telegram',
    delivery_recipient_id: '333333',
    status: 'pending',
    created_at: now,
    expires_at: now + 30 * 60 * 1000,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO exec_approvals
      (id, user_id, skill_name, intent, payload, delivery_channel,
       delivery_recipient_id, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    defaults.id,
    defaults.user_id,
    defaults.skill_name,
    defaults.intent,
    defaults.payload,
    defaults.delivery_channel,
    defaults.delivery_recipient_id,
    defaults.status,
    defaults.created_at,
    defaults.expires_at,
  );

  return defaults.id as string;
}

// ============================================================================
// GET /approvals — List pending
// ============================================================================

describe('Approval Routes — List', () => {
  it('GET /approvals — returns empty array when no approvals', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/approvals',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.approvals).toBeInstanceOf(Array);
  });

  it('GET /approvals — returns only authenticated user pending approvals', async () => {
    if (skip()) return;

    // Seed approvals for both users
    seedApproval({ user_id: 'user-appr-a' });
    seedApproval({ user_id: 'user-appr-b' });

    const res = await server!.inject({
      method: 'GET',
      url: '/approvals',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    for (const a of body.approvals) {
      expect(a.userId).toBe('user-appr-a');
    }
  });

  it('GET /approvals — returns camelCase keys', async () => {
    if (skip()) return;

    seedApproval();

    const res = await server!.inject({
      method: 'GET',
      url: '/approvals',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const a = res.json().approvals[0];
    expect(a).toHaveProperty('id');
    expect(a).toHaveProperty('userId');
    expect(a).toHaveProperty('skillName');
    expect(a).toHaveProperty('deliveryChannel');
    expect(a).toHaveProperty('deliveryRecipientId');
    expect(a).toHaveProperty('createdAt');
    expect(a).toHaveProperty('expiresAt');
    expect(a).toHaveProperty('resolvedAt');
    expect(a).toHaveProperty('resolvedBy');
  });

  it('GET /approvals — 401 without auth', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/approvals',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// GET /approvals/:id — Single approval
// ============================================================================

describe('Approval Routes — Get Single', () => {
  it('GET /approvals/:id — returns approval', async () => {
    if (skip()) return;

    const id = seedApproval();

    const res = await server!.inject({
      method: 'GET',
      url: `/approvals/${id}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.approval).toBeDefined();
    expect(body.approval.id).toBe(id);
    expect(body.approval.skillName).toBe('email');
    expect(body.approval.intent).toBe('send');
  });

  it('GET /approvals/:id — 404 for non-existent approval', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/approvals/non-existent-id',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });

  it('GET /approvals/:id — 403 for another user approval', async () => {
    if (skip()) return;

    const id = seedApproval({ user_id: 'user-appr-a' });

    const res = await server!.inject({
      method: 'GET',
      url: `/approvals/${id}`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Forbidden/i);
  });
});

// ============================================================================
// POST /approvals/:id/approve
// ============================================================================

describe('Approval Routes — Approve', () => {
  it('POST /approvals/:id/approve — approves a pending approval', async () => {
    if (skip()) return;

    const id = seedApproval();

    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.approval).toBeDefined();
    expect(body.approval.status).toBe('approved');
  });

  it('POST /approvals/:id/approve — 409 on already-approved approval', async () => {
    if (skip()) return;

    const id = seedApproval();

    // First approve
    await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Second approve — should 409
    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already resolved or expired/i);
  });

  it('POST /approvals/:id/approve — 404 for non-existent', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/approvals/non-existent-id/approve',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /approvals/:id/approve — 403 for another user', async () => {
    if (skip()) return;

    const id = seedApproval({ user_id: 'user-appr-a' });

    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /approvals/:id/approve — 401 without auth', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/approvals/any-id/approve',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /approvals/:id/approve — 409 on expired approval', async () => {
    if (skip()) return;

    const id = seedApproval({
      expires_at: Date.now() - 1000, // already expired
    });

    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/approve`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // getApproval auto-expires, so it may return 409 since status is now 'expired'
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already resolved or expired/i);
  });
});

// ============================================================================
// POST /approvals/:id/reject
// ============================================================================

describe('Approval Routes — Reject', () => {
  it('POST /approvals/:id/reject — rejects a pending approval', async () => {
    if (skip()) return;

    const id = seedApproval();

    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/reject`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.approval).toBeDefined();
    expect(body.approval.status).toBe('rejected');
  });

  it('POST /approvals/:id/reject — 409 on already-rejected approval', async () => {
    if (skip()) return;

    const id = seedApproval();

    // First reject
    await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/reject`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Second reject — should 409
    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/reject`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already resolved or expired/i);
  });

  it('POST /approvals/:id/reject — 404 for non-existent', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/approvals/non-existent-id/reject',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /approvals/:id/reject — 403 for another user', async () => {
    if (skip()) return;

    const id = seedApproval({ user_id: 'user-appr-a' });

    const res = await server!.inject({
      method: 'POST',
      url: `/approvals/${id}/reject`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
