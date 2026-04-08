/**
 * Family CRUD Routes — Integration Tests
 *
 * Uses Fastify's inject() pattern with in-memory SQLite.
 * Tests POST /family/create, POST /family/invite, POST /family/join,
 * GET /family, DELETE /family/members/:memberId — including auth,
 * validation, and parent-only authorization.
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let parentToken = '';
let memberToken = '';
let outsiderToken = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'test',
      jwtSecret: 'test-secret-family',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    const db = server.context.db;

    // Seed test users
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-parent', 100001, 'Alice')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name, last_name) VALUES ('user-member', 100002, 'Bob', 'Smith')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-outsider', 100003, 'Charlie')`).run();

    // Generate JWT tokens
    parentToken = server.jwt.sign({ userId: 'user-parent' });
    memberToken = server.jwt.sign({ userId: 'user-member' });
    outsiderToken = server.jwt.sign({ userId: 'user-outsider' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') || msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') || msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('dockerode') || msg.includes('ERR_MODULE_NOT_FOUND')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 60_000);

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

// ============================================================================
// POST /family/create
// ============================================================================

describe('POST /family/create', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      payload: { name: 'Test Family' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/name/i);
  });

  it('returns 400 when name is empty', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when name exceeds 100 chars', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'A'.repeat(101) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('creates a family group and assigns caller as parent', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'The Smiths' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.familyGroupId).toBeTruthy();
    expect(body.name).toBe('The Smiths');
    expect(body.role).toBe('parent');
    expect(body.createdAt).toBeTypeOf('number');
  });

  it('returns 409 if user is already in a family group', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Another Family' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/already/i);
  });
});

// ============================================================================
// POST /family/invite
// ============================================================================

describe('POST /family/invite', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      payload: { familyGroupId: 'anything' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when familyGroupId is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for non-parent user', async () => {
    if (skip()) return;
    // Get the family group id
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const familyGroupId = familyRes.json().familyGroupId;

    // Outsider tries to invite
    const res = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { familyGroupId },
    });
    expect(res.statusCode).toBe(403);
  });

  it('generates an invite code for parent', async () => {
    if (skip()) return;
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const familyGroupId = familyRes.json().familyGroupId;

    const res = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { familyGroupId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBeTruthy();
    expect(body.code.length).toBe(6);
    expect(body.expiresAt).toBeTypeOf('number');
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// POST /family/join
// ============================================================================

describe('POST /family/join', () => {
  let inviteCode = '';

  beforeAll(async () => {
    if (skipReason) return;
    // Generate a fresh invite code
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const familyGroupId = familyRes.json().familyGroupId;

    const invRes = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { familyGroupId },
    });
    inviteCode = invRes.json().code;
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      payload: { code: inviteCode },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when code is missing', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for invalid code', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { code: 'XXXXXX' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('joins the family group with a valid code', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { code: inviteCode },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.familyGroupId).toBeTruthy();
    expect(body.familyName).toBe('The Smiths');
    expect(body.role).toBe('member');
    expect(body.joinedAt).toBeTypeOf('number');
  });

  it('returns 410 when code is already used', async () => {
    if (skip()) return;
    // outsider tries the same code
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { code: inviteCode },
    });
    expect(res.statusCode).toBe(410);
  });

  it('returns 409 if user is already in a family group', async () => {
    if (skip()) return;
    // Generate a new invite code for testing
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const familyGroupId = familyRes.json().familyGroupId;

    const invRes = await server!.inject({
      method: 'POST',
      url: '/family/invite',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { familyGroupId },
    });
    const newCode = invRes.json().code;

    // member tries to join again (already in a group)
    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { code: newCode },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 410 for expired invite code', async () => {
    if (skip()) return;
    // Manually insert an expired code
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const familyGroupId = familyRes.json().familyGroupId;

    const db = server!.context.db;
    db.prepare(`
      INSERT INTO family_invite_codes (id, family_group_id, code, created_by, status, created_at, expires_at)
      VALUES ('finv-expired', ?, 'EXPIRD', 'user-parent', 'active', ?, ?)
    `).run(familyGroupId, Date.now() - 100000, Date.now() - 50000);

    const res = await server!.inject({
      method: 'POST',
      url: '/family/join',
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { code: 'EXPIRD' },
    });
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toMatch(/expired/i);
  });
});

// ============================================================================
// GET /family
// ============================================================================

describe('GET /family', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for user not in a family', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns family details with members and activity', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.familyGroupId).toBeTruthy();
    expect(body.familyName).toBe('The Smiths');
    expect(body.createdBy).toBe('user-parent');
    expect(body.myRole).toBe('parent');
    expect(body.members).toBeInstanceOf(Array);
    expect(body.members.length).toBe(2);

    // Check parent member
    const parent = body.members.find((m: any) => m.role === 'parent');
    expect(parent).toBeTruthy();
    expect(parent.userId).toBe('user-parent');
    expect(parent.firstName).toBe('Alice');
    expect(parent.messageCount).toBeTypeOf('number');

    // Check regular member
    const member = body.members.find((m: any) => m.role === 'member');
    expect(member).toBeTruthy();
    expect(member.userId).toBe('user-member');
    expect(member.firstName).toBe('Bob');
    expect(member.lastName).toBe('Smith');
  });

  it('member can also view the family', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.myRole).toBe('member');
    expect(body.members.length).toBe(2);
  });
});

// ============================================================================
// DELETE /family/members/:memberId
// ============================================================================

describe('DELETE /family/members/:memberId', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'DELETE',
      url: '/family/members/some-id',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for non-existent member', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'DELETE',
      url: '/family/members/fm-nonexistent',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for non-parent user', async () => {
    if (skip()) return;
    // Get the parent's member id
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const parentMember = familyRes.json().members.find((m: any) => m.role === 'parent');

    const res = await server!.inject({
      method: 'DELETE',
      url: `/family/members/${parentMember.memberId}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when parent tries to remove themselves', async () => {
    if (skip()) return;
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const parentMember = familyRes.json().members.find((m: any) => m.role === 'parent');

    const res = await server!.inject({
      method: 'DELETE',
      url: `/family/members/${parentMember.memberId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/yourself/i);
  });

  it('parent can remove a member', async () => {
    if (skip()) return;
    const familyRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const memberEntry = familyRes.json().members.find((m: any) => m.role === 'member');

    const res = await server!.inject({
      method: 'DELETE',
      url: `/family/members/${memberEntry.memberId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBe(true);

    // Verify member is gone
    const afterRes = await server!.inject({
      method: 'GET',
      url: '/family',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(afterRes.json().members.length).toBe(1);
  });
});
