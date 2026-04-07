/**
 * Scheduler API Routes — Integration Tests
 *
 * Uses Fastify's inject() pattern with in-memory SQLite.
 * Tests CRUD endpoints (JWT-protected) and webhook ingestion (HMAC-protected).
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

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
      jwtSecret: 'test-secret-scheduler',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Seed test users
    const db = server.context.db;
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-test-a', 111111, 'Alice')`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-test-b', 222222, 'Bob')`).run();

    // Get JWT tokens for both users
    authToken = server.jwt.sign({ userId: 'user-test-a' });
    otherUserToken = server.jwt.sign({ userId: 'user-test-b' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('bindings') || msg.includes('better_sqlite3') || msg.includes('better-sqlite3') || msg.includes('ERR_DLOPEN_FAILED') || msg.includes('dockerode')) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
});

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
// Helper: create a job via API
// ============================================================================

async function createJob(overrides: Record<string, unknown> = {}) {
  const body = {
    companionId: 'cipher',
    skillName: 'weather',
    cronExpression: '0 8 * * *',
    deliveryChannel: 'telegram',
    deliveryRecipientId: '111111',
    ...overrides,
  };

  const res = await server!.inject({
    method: 'POST',
    url: '/scheduler/jobs',
    headers: { authorization: `Bearer ${authToken}` },
    payload: body,
  });

  return res;
}

// ============================================================================
// Scheduler CRUD Endpoints (JWT-protected)
// ============================================================================

describe('Scheduler CRUD Routes', () => {
  it('POST /scheduler/jobs — creates a scheduled job', async () => {
    if (skip()) return;

    const res = await createJob();
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.job).toBeDefined();
    expect(body.job.skillName).toBe('weather');
    expect(body.job.cronExpression).toBe('0 8 * * *');
    expect(body.job.deliveryChannel).toBe('telegram');
    expect(body.job.status).toBe('active');
    expect(body.job.userId).toBe('user-test-a');
  });

  it('POST /scheduler/jobs — returns camelCase keys', async () => {
    if (skip()) return;

    const res = await createJob();
    const body = res.json();
    const job = body.job;

    // Verify camelCase keys are present (id is the job identifier)
    expect(job).toHaveProperty('id');
    expect(job).toHaveProperty('skillName');
    expect(job).toHaveProperty('cronExpression');
    expect(job).toHaveProperty('deliveryChannel');
    expect(job).toHaveProperty('deliveryRecipientId');
    expect(job).toHaveProperty('runCount');
    expect(job).toHaveProperty('lastRunAt');
    expect(job).toHaveProperty('nextRunAt');
    expect(job).toHaveProperty('errorCount');
    expect(job).toHaveProperty('lastError');
    expect(job).toHaveProperty('createdAt');
  });

  it('POST /scheduler/jobs — 400 on missing required fields', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/scheduler/jobs',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' }, // missing skillName, cronExpression, etc.
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Missing required field/);
  });

  it('POST /scheduler/jobs — 400 on invalid cron expression', async () => {
    if (skip()) return;

    const res = await createJob({ cronExpression: 'not-a-cron' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/[Ii]nvalid cron/);
  });

  it('GET /scheduler/jobs — lists jobs for authenticated user', async () => {
    if (skip()) return;

    // Create a job first
    await createJob();

    const res = await server!.inject({
      method: 'GET',
      url: '/scheduler/jobs',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.jobs).toBeInstanceOf(Array);
    expect(body.jobs.length).toBeGreaterThanOrEqual(1);
    // All returned jobs should belong to user-test-a
    for (const job of body.jobs) {
      expect(job.userId).toBe('user-test-a');
    }
  });

  it('GET /scheduler/jobs — 401 without auth', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/scheduler/jobs',
    });

    expect(res.statusCode).toBe(401);
  });

  it('DELETE /scheduler/jobs/:id — deletes own job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    const res = await server!.inject({
      method: 'DELETE',
      url: `/scheduler/jobs/${jobId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(204);
  });

  it('DELETE /scheduler/jobs/:id — 403 when deleting another user\'s job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    // Try deleting with Bob's token
    const res = await server!.inject({
      method: 'DELETE',
      url: `/scheduler/jobs/${jobId}`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Forbidden/);
  });

  it('DELETE /scheduler/jobs/:id — 404 for non-existent job', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'DELETE',
      url: '/scheduler/jobs/non-existent-id',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /scheduler/jobs/:id/pause — pauses a job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    const res = await server!.inject({
      method: 'POST',
      url: `/scheduler/jobs/${jobId}/pause`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().job.status).toBe('paused');
  });

  it('POST /scheduler/jobs/:id/pause — 403 for another user\'s job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    const res = await server!.inject({
      method: 'POST',
      url: `/scheduler/jobs/${jobId}/pause`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /scheduler/jobs/:id/resume — resumes a paused job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    // Pause first
    await server!.inject({
      method: 'POST',
      url: `/scheduler/jobs/${jobId}/pause`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Resume
    const res = await server!.inject({
      method: 'POST',
      url: `/scheduler/jobs/${jobId}/resume`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().job.status).toBe('active');
  });

  it('POST /scheduler/jobs/:id/resume — 403 for another user\'s job', async () => {
    if (skip()) return;

    const createRes = await createJob();
    const jobId = createRes.json().job.id;

    const res = await server!.inject({
      method: 'POST',
      url: `/scheduler/jobs/${jobId}/resume`,
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ============================================================================
// Webhook Routes (HMAC-protected, no JWT)
// ============================================================================

describe('Webhook Routes', () => {
  function createWebhookTrigger(hookId: string, hmacSecret: string, overrides: Record<string, unknown> = {}) {
    const db = server!.context.db;
    const defaults = {
      user_id: 'user-test-a',
      companion_id: 'cipher',
      skill_name: 'weather',
      skill_args: '{}',
      delivery_channel: 'api',
      delivery_recipient_id: '111111',
      is_active: 1,
    };
    const row = { ...defaults, ...overrides };

    db.prepare(`
      INSERT INTO webhook_triggers (id, user_id, companion_id, skill_name, skill_args, hmac_secret, delivery_channel, delivery_recipient_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hookId,
      row.user_id,
      row.companion_id,
      row.skill_name,
      row.skill_args,
      hmacSecret,
      row.delivery_channel,
      row.delivery_recipient_id,
      row.is_active,
    );
  }

  function signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  it('POST /webhooks/:hookId — 200 with valid HMAC signature', async () => {
    if (skip()) return;

    const hookId = `hook-valid-${Date.now()}`;
    const secret = 'test-hmac-secret-valid';
    createWebhookTrigger(hookId, secret);

    const body = JSON.stringify({ event: 'test' });
    const signature = signPayload(body, secret);

    const res = await server!.inject({
      method: 'POST',
      url: `/webhooks/${hookId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
  });

  it('POST /webhooks/:hookId — 401 with invalid HMAC signature', async () => {
    if (skip()) return;

    const hookId = `hook-invalid-sig-${Date.now()}`;
    const secret = 'test-hmac-secret-invalid';
    createWebhookTrigger(hookId, secret);

    const body = JSON.stringify({ event: 'test' });
    const wrongSignature = signPayload(body, 'wrong-secret');

    const res = await server!.inject({
      method: 'POST',
      url: `/webhooks/${hookId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': wrongSignature,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/[Ii]nvalid.*signature/);
  });

  it('POST /webhooks/:hookId — 401 with missing signature header', async () => {
    if (skip()) return;

    const hookId = `hook-no-sig-${Date.now()}`;
    const secret = 'test-hmac-secret-nosig';
    createWebhookTrigger(hookId, secret);

    const res = await server!.inject({
      method: 'POST',
      url: `/webhooks/${hookId}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'test' }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/[Mm]issing.*signature/);
  });

  it('POST /webhooks/:hookId — 404 for non-existent hook', async () => {
    if (skip()) return;

    const body = JSON.stringify({ event: 'test' });

    const res = await server!.inject({
      method: 'POST',
      url: '/webhooks/non-existent-hook',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'deadbeef',
      },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /webhooks/:hookId — 404 for inactive hook', async () => {
    if (skip()) return;

    const hookId = `hook-inactive-${Date.now()}`;
    const secret = 'test-hmac-secret-inactive';
    createWebhookTrigger(hookId, secret, { is_active: 0 });

    const body = JSON.stringify({ event: 'test' });
    const signature = signPayload(body, secret);

    const res = await server!.inject({
      method: 'POST',
      url: `/webhooks/${hookId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /webhooks/:hookId — updates trigger_count after successful trigger', async () => {
    if (skip()) return;

    const hookId = `hook-count-${Date.now()}`;
    const secret = 'test-hmac-secret-count';
    createWebhookTrigger(hookId, secret);

    const body = JSON.stringify({ event: 'test' });
    const signature = signPayload(body, secret);

    await server!.inject({
      method: 'POST',
      url: `/webhooks/${hookId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      payload: body,
    });

    // Check the DB was updated
    const db = server!.context.db;
    const row = db.prepare('SELECT trigger_count, last_triggered_at FROM webhook_triggers WHERE id = ?').get(hookId) as any;
    expect(row.trigger_count).toBe(1);
    expect(row.last_triggered_at).toBeGreaterThan(0);
  });
});
