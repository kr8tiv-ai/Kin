/**
 * Pipeline API Routes — Integration Tests
 *
 * Uses Fastify's inject() pattern with in-memory SQLite.
 * Tests CRUD endpoints (JWT-protected), manual run trigger (202),
 * run history, ownership enforcement, and auth.
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
      jwtSecret: 'test-secret-pipelines',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Seed test users
    const db = server.context.db;
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-pipe-a', 111111, 'Alice')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-pipe-b', 222222, 'Bob')`).run();

    // Get JWT tokens for both users
    authToken = server.jwt.sign({ userId: 'user-pipe-a' });
    otherUserToken = server.jwt.sign({ userId: 'user-pipe-b' });
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
// Helper: create a pipeline via API
// ============================================================================

async function createPipeline(overrides: Record<string, unknown> = {}, token?: string) {
  const body = {
    companionId: 'cipher',
    name: `test-pipeline-${Date.now()}`,
    steps: [{ skillName: 'weather' }, { skillName: 'summarize' }],
    deliveryChannel: 'telegram',
    deliveryRecipientId: '111111',
    ...overrides,
  };

  const res = await server!.inject({
    method: 'POST',
    url: '/pipelines',
    headers: { authorization: `Bearer ${token ?? authToken}` },
    payload: body,
  });

  return res;
}

// ============================================================================
// Pipeline CRUD Endpoints
// ============================================================================

describe('Pipeline CRUD Routes', () => {
  it('POST /pipelines — creates a pipeline', async () => {
    if (skip()) return;

    const res = await createPipeline({ name: 'morning-routine' });
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.pipeline).toBeDefined();
    expect(body.pipeline.name).toBe('morning-routine');
    expect(body.pipeline.steps).toHaveLength(2);
    expect(body.pipeline.steps[0].skillName).toBe('weather');
    expect(body.pipeline.deliveryChannel).toBe('telegram');
    expect(body.pipeline.status).toBe('active');
    expect(body.pipeline.userId).toBe('user-pipe-a');
  });

  it('POST /pipelines — returns camelCase keys', async () => {
    if (skip()) return;

    const res = await createPipeline();
    const p = res.json().pipeline;

    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('userId');
    expect(p).toHaveProperty('companionId');
    expect(p).toHaveProperty('triggerType');
    expect(p).toHaveProperty('cronExpression');
    expect(p).toHaveProperty('deliveryChannel');
    expect(p).toHaveProperty('deliveryRecipientId');
    expect(p).toHaveProperty('runCount');
    expect(p).toHaveProperty('errorCount');
    expect(p).toHaveProperty('lastRunAt');
    expect(p).toHaveProperty('lastError');
    expect(p).toHaveProperty('createdAt');
    expect(p).toHaveProperty('updatedAt');
  });

  it('POST /pipelines — 400 on missing name', async () => {
    if (skip()) return;

    const res = await createPipeline({ name: '' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/name/i);
  });

  it('POST /pipelines — 400 on missing steps', async () => {
    if (skip()) return;

    const res = await createPipeline({ steps: [] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/steps/i);
  });

  it('POST /pipelines — 400 on invalid steps shape', async () => {
    if (skip()) return;

    const res = await createPipeline({ steps: [{ notSkillName: 'oops' }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/steps|skillName/i);
  });

  it('POST /pipelines — 400 on invalid cron expression', async () => {
    if (skip()) return;

    const res = await createPipeline({
      triggerType: 'cron',
      cronExpression: 'not-a-cron',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/cron/i);
  });

  it('POST /pipelines — creates cron pipeline with valid expression', async () => {
    if (skip()) return;

    const res = await createPipeline({
      name: 'daily-cron',
      triggerType: 'cron',
      cronExpression: '0 8 * * *',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().pipeline.triggerType).toBe('cron');
    expect(res.json().pipeline.cronExpression).toBe('0 8 * * *');
  });

  it('GET /pipelines — lists only authenticated user pipelines', async () => {
    if (skip()) return;

    // Create pipelines for both users
    await createPipeline({ name: 'alice-pipe' }, authToken);
    await createPipeline({ name: 'bob-pipe' }, otherUserToken);

    const res = await server!.inject({
      method: 'GET',
      url: '/pipelines',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pipelines).toBeInstanceOf(Array);
    expect(body.pipelines.length).toBeGreaterThanOrEqual(1);
    // All returned pipelines should belong to user-pipe-a
    for (const p of body.pipelines) {
      expect(p.userId).toBe('user-pipe-a');
    }
  });

  it('GET /pipelines — 401 without auth', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/pipelines',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /pipelines/:id — returns pipeline with runs', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'detail-pipe' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'GET',
      url: `/pipelines/${pipelineId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pipeline).toBeDefined();
    expect(body.pipeline.id).toBe(pipelineId);
    expect(body.runs).toBeInstanceOf(Array);
  });

  it('GET /pipelines/:id — 404 for non-existent pipeline', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/pipelines/non-existent-id',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /pipelines/:id — 403 for another user pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'alice-only' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'GET',
      url: `/pipelines/${pipelineId}`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Forbidden/);
  });
});

// ============================================================================
// Delete
// ============================================================================

describe('Pipeline Delete', () => {
  it('DELETE /pipelines/:id — deletes own pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'delete-me' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'DELETE',
      url: `/pipelines/${pipelineId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const getRes = await server!.inject({
      method: 'GET',
      url: `/pipelines/${pipelineId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('DELETE /pipelines/:id — 403 for another user pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'no-delete' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'DELETE',
      url: `/pipelines/${pipelineId}`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Forbidden/);
  });

  it('DELETE /pipelines/:id — 404 for non-existent pipeline', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'DELETE',
      url: '/pipelines/non-existent-id',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ============================================================================
// Manual Run (POST /pipelines/:id/run)
// ============================================================================

describe('Pipeline Manual Run', () => {
  it('POST /pipelines/:id/run — 202 accepted', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'run-me' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'POST',
      url: `/pipelines/${pipelineId}/run`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.pipelineId).toBe(pipelineId);
  });

  it('POST /pipelines/:id/run — 404 for non-existent pipeline', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/pipelines/non-existent-id/run',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /pipelines/:id/run — 403 for another user pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'no-run' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'POST',
      url: `/pipelines/${pipelineId}/run`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /pipelines/:id/run — 401 without auth', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/pipelines/any-id/run',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// Run History (GET /pipelines/:id/runs)
// ============================================================================

describe('Pipeline Run History', () => {
  it('GET /pipelines/:id/runs — returns empty array for new pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'no-runs-yet' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'GET',
      url: `/pipelines/${pipelineId}/runs`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().runs).toEqual([]);
  });

  it('GET /pipelines/:id/runs — 404 for non-existent pipeline', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/pipelines/non-existent-id/runs',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /pipelines/:id/runs — 403 for another user pipeline', async () => {
    if (skip()) return;

    const createRes = await createPipeline({ name: 'secret-runs' });
    const pipelineId = createRes.json().pipeline.id;

    const res = await server!.inject({
      method: 'GET',
      url: `/pipelines/${pipelineId}/runs`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
