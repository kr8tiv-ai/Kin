/**
 * Memory Timeline API — Integration Tests
 *
 * Tests GET /memories with sort, offset, companionId query params,
 * POST /memories/batch-delete, and lastAccessedAt in response.
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let userToken = '';
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
      jwtSecret: 'test-secret-memory-timeline',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    const db = server.context.db;

    // Seed test users
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-timeline-1', 500001, 'TimelineUser')`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-timeline-2', 500002, 'OtherUser')`,
    ).run();

    // Generate JWT tokens
    userToken = server.jwt.sign({ userId: 'user-timeline-1' });
    otherUserToken = server.jwt.sign({ userId: 'user-timeline-2' });

    // Seed companion
    db.prepare(
      `INSERT OR IGNORE INTO companions (id, name, type, specialization, personality_prompt)
       VALUES ('cipher', 'Cipher', 'code_kraken', 'web_design', 'Test prompt')`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO companions (id, name, type, specialization, personality_prompt)
       VALUES ('forge', 'Forge', 'cyber_unicorn', 'development', 'Test prompt')`,
    ).run();

    const now = Date.now();

    // Seed memories with varying timestamps and companions
    // mem-1 is oldest, mem-5 is newest
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-1', 'user-timeline-1', 'cipher', 'context', 'First memory', 0.3, 0, ?, ?, 1)`,
    ).run(now - 50000, now - 40000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-2', 'user-timeline-1', 'cipher', 'preference', 'Second memory', 0.9, 1, ?, ?, 5)`,
    ).run(now - 40000, now - 30000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-3', 'user-timeline-1', 'forge', 'event', 'Third memory forge', 0.7, 1, ?, ?, 3)`,
    ).run(now - 30000, now - 20000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-4', 'user-timeline-1', 'cipher', 'personal', 'Fourth memory', 0.5, 0, ?, ?, 2)`,
    ).run(now - 20000, now - 10000);
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-5', 'user-timeline-1', 'forge', 'context', 'Fifth memory forge', 0.1, 1, ?, ?, 0)`,
    ).run(now - 10000, now - 5000);

    // Seed a memory for the other user (ownership test)
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable, created_at, last_accessed_at, access_count)
       VALUES ('mem-tl-other', 'user-timeline-2', 'cipher', 'context', 'Other user memory', 0.5, 1, ?, ?, 0)`,
    ).run(now - 5000, now - 5000);

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
// GET /memories — sort param
// ============================================================================

describe('GET /memories — sort param', () => {
  it('defaults to importance_desc sort (backward compatible)', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { memories } = res.json();
    // mem-tl-2 has importance 0.9 (highest), should be first
    expect(memories[0].id).toBe('mem-tl-2');
    // Verify importance is descending
    for (let i = 1; i < memories.length; i++) {
      expect(memories[i - 1].importance).toBeGreaterThanOrEqual(memories[i].importance);
    }
  });

  it('sorts by created_at_desc for timeline view', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?sort=created_at_desc',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { memories } = res.json();
    // mem-tl-5 is newest, should be first
    expect(memories[0].id).toBe('mem-tl-5');
    // Verify chronological descending
    for (let i = 1; i < memories.length; i++) {
      expect(new Date(memories[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(memories[i].createdAt).getTime()
      );
    }
  });
});

// ============================================================================
// GET /memories — offset param
// ============================================================================

describe('GET /memories — offset param', () => {
  it('skips correct number of rows with offset', async () => {
    if (skip()) return;
    // Get all first
    const allRes = await server!.inject({
      method: 'GET',
      url: '/memories?sort=created_at_desc',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const allMemories = allRes.json().memories;
    expect(allMemories.length).toBe(5);

    // Get with offset=2
    const offsetRes = await server!.inject({
      method: 'GET',
      url: '/memories?sort=created_at_desc&offset=2',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const offsetMemories = offsetRes.json().memories;
    expect(offsetMemories.length).toBe(3);
    expect(offsetMemories[0].id).toBe(allMemories[2].id);
  });

  it('returns empty array when offset exceeds total', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?offset=999',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().memories).toEqual([]);
  });

  it('clamps negative offset to 0', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?offset=-5',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    // Should return all 5 memories (offset clamped to 0)
    expect(res.json().memories.length).toBe(5);
  });
});

// ============================================================================
// GET /memories — companionId param
// ============================================================================

describe('GET /memories — companionId param', () => {
  it('filters by companionId', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?companionId=forge',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const { memories } = res.json();
    // We seeded 2 forge memories for this user (mem-tl-3, mem-tl-5)
    expect(memories.length).toBe(2);
    for (const m of memories) {
      expect(m.companionId).toBe('forge');
    }
  });

  it('returns empty array for non-existent companionId', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?companionId=nonexistent',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().memories).toEqual([]);
  });
});

// ============================================================================
// GET /memories — lastAccessedAt in response
// ============================================================================

describe('GET /memories — lastAccessedAt in response', () => {
  it('includes lastAccessedAt as ISO string', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?limit=1',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const memory = res.json().memories[0];
    expect(memory).toHaveProperty('lastAccessedAt');
    // Should be a valid ISO string (not null since we seeded a value)
    expect(typeof memory.lastAccessedAt).toBe('string');
    expect(new Date(memory.lastAccessedAt).toISOString()).toBe(memory.lastAccessedAt);
  });

  it('includes accessCount and isTransferable fields', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/memories?limit=1',
      headers: { authorization: `Bearer ${userToken}` },
    });
    const memory = res.json().memories[0];
    expect(memory).toHaveProperty('accessCount');
    expect(typeof memory.accessCount).toBe('number');
    expect(memory).toHaveProperty('isTransferable');
    expect(typeof memory.isTransferable).toBe('boolean');
  });
});

// ============================================================================
// POST /memories/batch-delete
// ============================================================================

describe('POST /memories/batch-delete', () => {
  it('deletes multiple memories in one call', async () => {
    if (skip()) return;
    // First seed extra memories to delete
    const db = server!.context.db;
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, created_at, last_accessed_at)
       VALUES ('mem-del-1', 'user-timeline-1', 'cipher', 'context', 'Delete me 1', 0.5, ${Date.now()}, ${Date.now()})`,
    ).run();
    db.prepare(
      `INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, created_at, last_accessed_at)
       VALUES ('mem-del-2', 'user-timeline-1', 'cipher', 'context', 'Delete me 2', 0.5, ${Date.now()}, ${Date.now()})`,
    ).run();

    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: ['mem-del-1', 'mem-del-2'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(2);

    // Verify they're gone
    const check = db.prepare(
      `SELECT id FROM memories WHERE id IN ('mem-del-1', 'mem-del-2')`,
    ).all();
    expect(check.length).toBe(0);
  });

  it('returns error for empty ids array', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/non-empty/i);
  });

  it('returns error for more than 100 ids', async () => {
    if (skip()) return;
    const ids = Array.from({ length: 101 }, (_, i) => `mem-${i}`);
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/100/);
  });

  it('returns error for non-string ids', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: [123, 456] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/string/i);
  });

  it('respects ownership — cannot delete other user memories', async () => {
    if (skip()) return;
    // Try to delete other user's memory with our token
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: ['mem-tl-other'] },
    });
    expect(res.statusCode).toBe(200);
    // Should delete 0 since the memory belongs to another user
    expect(res.json().deleted).toBe(0);

    // Verify the other user's memory still exists
    const check = server!.context.db.prepare(
      `SELECT id FROM memories WHERE id = 'mem-tl-other'`,
    ).get();
    expect(check).toBeTruthy();
  });

  it('returns deleted=0 for non-existent ids', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { ids: ['nonexistent-id-1', 'nonexistent-id-2'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(0);
  });

  it('returns 401 without auth', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'POST',
      url: '/memories/batch-delete',
      payload: { ids: ['mem-tl-1'] },
    });
    expect(res.statusCode).toBe(401);
  });
});
