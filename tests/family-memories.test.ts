/**
 * Family Shared Memories & Activity — Integration Tests
 *
 * Tests GET /family/shared-memories (parent-only, family_visible memories)
 * and GET /family/activity (parent-only, per-member activity summary).
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let parentToken = '';
let childToken = '';
let outsiderToken = '';
let skipReason = '';
let familyGroupId = '';
let childUserId = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'test',
      jwtSecret: 'test-secret-family-memories',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    const db = server.context.db;

    // Seed test users
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-fmem-parent', 300001, 'MemParent')`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-fmem-outsider', 300003, 'Outsider')`,
    ).run();

    // Generate JWT tokens
    parentToken = server.jwt.sign({ userId: 'user-fmem-parent' });
    outsiderToken = server.jwt.sign({ userId: 'user-fmem-outsider' });

    // Create a family group with parent
    const createRes = await server.inject({
      method: 'POST',
      url: '/family/create',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { name: 'Memory Test Family' },
    });
    const createBody = JSON.parse(createRes.body);
    familyGroupId = createBody.familyGroupId;

    // Create a child account via the family endpoint
    const childRes = await server.inject({
      method: 'POST',
      url: '/family/child-account',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { firstName: 'ChildKid', ageBracket: 'under_13', familyGroupId },
    });
    const childBody = JSON.parse(childRes.body);
    childUserId = childBody.childUserId;
    childToken = childBody.token;

    // Seed companion
    db.prepare(
      `INSERT OR IGNORE INTO companions (id, name, type, specialization, personality_prompt)
       VALUES ('cipher', 'Cipher', 'code_kraken', 'web_design', 'Test prompt')`,
    ).run();

    // Seed conversations for parent and child
    db.prepare(
      `INSERT OR IGNORE INTO conversations (id, user_id, companion_id, title)
       VALUES ('conv-parent-1', 'user-fmem-parent', 'cipher', 'Parent Conv')`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO conversations (id, user_id, companion_id, title)
       VALUES ('conv-child-1', ?, 'cipher', 'Child Conv')`,
    ).run(childUserId);

    // Seed messages for activity summary
    const now = Date.now();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp)
       VALUES ('msg-p1', 'conv-parent-1', 'user', 'Hello from parent', ?)`,
    ).run(now - 3000);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp)
       VALUES ('msg-p2', 'conv-parent-1', 'assistant', 'Hi parent!', ?)`,
    ).run(now - 2000);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp)
       VALUES ('msg-c1', 'conv-child-1', 'user', 'Hello from child', ?)`,
    ).run(now - 1000);

    // Seed memories — some family_visible, some not
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, family_visible, created_at, last_accessed_at)
       VALUES ('mem-p-visible', 'user-fmem-parent', 'cipher', 'context', 'Parent loves coding projects', 0.7, 1, ?, ?)`,
    ).run(now - 5000, now - 5000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, family_visible, created_at, last_accessed_at)
       VALUES ('mem-p-private', 'user-fmem-parent', 'cipher', 'personal', 'Parent private thought', 0.5, 0, ?, ?)`,
    ).run(now - 4000, now - 4000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, family_visible, created_at, last_accessed_at)
       VALUES ('mem-c-visible', ?, 'cipher', 'context', 'Child enjoys dinosaurs and science', 0.8, 1, ?, ?)`,
    ).run(childUserId, now - 3000, now - 3000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, family_visible, created_at, last_accessed_at)
       VALUES ('mem-c-private', ?, 'cipher', 'personal', 'Child private memory', 0.4, 0, ?, ?)`,
    ).run(childUserId, now - 2000, now - 2000);
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
// GET /family/shared-memories
// ============================================================================

describe('GET /family/shared-memories', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for child accounts (non-parent)', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${childToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/parent/i);
  });

  it('returns 404 for user not in any family', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns only family_visible memories for parent', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.familyGroupId).toBe(familyGroupId);
    expect(body.memories).toBeInstanceOf(Array);
    expect(body.memories.length).toBe(2); // only the 2 family_visible ones

    // Verify all returned memories are family_visible (we seeded 2 visible, 2 private)
    const ids = body.memories.map((m: any) => m.id);
    expect(ids).toContain('mem-p-visible');
    expect(ids).toContain('mem-c-visible');
    expect(ids).not.toContain('mem-p-private');
    expect(ids).not.toContain('mem-c-private');
  });

  it('returns camelCase keys in memory objects', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const body = res.json();
    const mem = body.memories[0];
    expect(mem).toHaveProperty('userId');
    expect(mem).toHaveProperty('companionId');
    expect(mem).toHaveProperty('memoryType');
    expect(mem).toHaveProperty('createdAt');
    expect(mem).toHaveProperty('lastAccessedAt');
    expect(mem).toHaveProperty('accessCount');
    expect(mem).toHaveProperty('authorFirstName');
  });

  it('includes authorFirstName from joined users table', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const body = res.json();
    const parentMem = body.memories.find((m: any) => m.id === 'mem-p-visible');
    const childMem = body.memories.find((m: any) => m.id === 'mem-c-visible');
    expect(parentMem.authorFirstName).toBe('MemParent');
    expect(childMem.authorFirstName).toBe('ChildKid');
  });

  it('returns memories ordered by created_at DESC', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/shared-memories',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const body = res.json();
    const timestamps = body.memories.map((m: any) => m.createdAt);
    // Verify descending order
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });
});

// ============================================================================
// GET /family/activity
// ============================================================================

describe('GET /family/activity', () => {
  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for child accounts', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${childToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/parent/i);
  });

  it('returns 404 for user not in any family', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns per-member activity summary for parent', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.familyGroupId).toBe(familyGroupId);
    expect(body.members).toBeInstanceOf(Array);
    expect(body.members.length).toBe(2); // parent + child

    // Find parent and child in the activity list
    const parentActivity = body.members.find((m: any) => m.userId === 'user-fmem-parent');
    const childActivity = body.members.find((m: any) => m.userId === childUserId);

    expect(parentActivity).toBeDefined();
    expect(parentActivity.firstName).toBe('MemParent');
    expect(parentActivity.role).toBe('parent');
    expect(parentActivity.messageCount).toBe(2); // msg-p1 and msg-p2

    expect(childActivity).toBeDefined();
    expect(childActivity.firstName).toBe('ChildKid');
    expect(childActivity.role).toBe('child');
    expect(childActivity.ageBracket).toBe('under_13');
    expect(childActivity.messageCount).toBe(1); // msg-c1
  });

  it('returns lastActive timestamp per member', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const body = res.json();

    const parentActivity = body.members.find((m: any) => m.userId === 'user-fmem-parent');
    const childActivity = body.members.find((m: any) => m.userId === childUserId);

    expect(parentActivity.lastActive).toBeTypeOf('number');
    expect(childActivity.lastActive).toBeTypeOf('number');
    // Parent's last message was more recent than child's in our seed data
    // msg-p2 at now-2000, msg-c1 at now-1000 — child is actually more recent
    expect(childActivity.lastActive).toBeGreaterThan(parentActivity.lastActive);
  });

  it('returns topicKeywords array per member', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const body = res.json();

    for (const member of body.members) {
      expect(member.topicKeywords).toBeInstanceOf(Array);
      // Keywords are strings
      for (const kw of member.topicKeywords) {
        expect(typeof kw).toBe('string');
      }
    }

    // Parent has memories about "coding projects" — expect "coding" or "projects"
    const parentActivity = body.members.find((m: any) => m.userId === 'user-fmem-parent');
    expect(parentActivity.topicKeywords.length).toBeGreaterThan(0);

    // Child has memories about "dinosaurs and science" — expect relevant keywords
    const childActivity = body.members.find((m: any) => m.userId === childUserId);
    expect(childActivity.topicKeywords.length).toBeGreaterThan(0);
  });

  it('returns camelCase keys in activity objects', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/family/activity',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    const member = res.json().members[0];
    expect(member).toHaveProperty('userId');
    expect(member).toHaveProperty('firstName');
    expect(member).toHaveProperty('messageCount');
    expect(member).toHaveProperty('lastActive');
    expect(member).toHaveProperty('topicKeywords');
    expect(member).toHaveProperty('ageBracket');
  });
});
