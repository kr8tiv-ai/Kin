/**
 * Proactive Companion API Routes — Integration Tests
 *
 * Uses Fastify's inject() pattern with in-memory SQLite.
 * Tests suggestion listing, feedback, settings CRUD, and calendar disconnect.
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
      jwtSecret: 'test-secret-proactive',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    const db = server.context.db;

    // Apply proactive column migrations (not in CREATE TABLE)
    const addColumnSafe = (col: string, def: string) => {
      try {
        db.prepare(`ALTER TABLE user_preferences ADD COLUMN ${col} ${def}`).run();
      } catch {
        // Column already exists — ignore
      }
    };
    addColumnSafe('proactive_enabled', 'BOOLEAN DEFAULT FALSE');
    addColumnSafe('proactive_quiet_start', 'INTEGER');
    addColumnSafe('proactive_quiet_end', 'INTEGER');
    addColumnSafe('proactive_max_daily', 'INTEGER DEFAULT 5');
    addColumnSafe('proactive_channels', "TEXT DEFAULT '[]'");

    // Seed test users
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-pro-a', 550001, 'ProAlice')`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES ('user-pro-b', 550002, 'ProBob')`,
    ).run();

    // Seed companions
    db.prepare(
      `INSERT OR IGNORE INTO companions (id, name, specialization) VALUES ('cipher', 'Cipher', 'analysis')`,
    ).run();

    // Seed user_preferences for user-pro-a
    db.prepare(
      `INSERT OR IGNORE INTO user_preferences (id, user_id) VALUES ('pref-pro-a', 'user-pro-a')`,
    ).run();

    // JWT tokens
    authToken = server.jwt.sign({ userId: 'user-pro-a' });
    otherUserToken = server.jwt.sign({ userId: 'user-pro-b' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('dockerode')
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
// Helper: seed a suggestion directly via DB
// ============================================================================

function seedSuggestion(overrides: Record<string, unknown> = {}): string {
  const db = server!.context.db;
  const id = `sug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const defaults = {
    id,
    user_id: 'user-pro-a',
    companion_id: 'cipher',
    signal_id: null,
    content: 'Test proactive suggestion',
    delivery_channel: 'api',
    delivery_recipient_id: 'user-pro-a',
    status: 'delivered',
    user_feedback: null,
    created_at: now,
    delivered_at: now,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO proactive_suggestions
      (id, user_id, companion_id, signal_id, content, delivery_channel,
       delivery_recipient_id, status, user_feedback, created_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    defaults.id,
    defaults.user_id,
    defaults.companion_id,
    defaults.signal_id,
    defaults.content,
    defaults.delivery_channel,
    defaults.delivery_recipient_id,
    defaults.status,
    defaults.user_feedback,
    defaults.created_at,
    defaults.delivered_at,
  );

  return id;
}

// ============================================================================
// GET /proactive/suggestions
// ============================================================================

describe('GET /proactive/suggestions', () => {
  it('returns empty suggestions for new user', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/proactive/suggestions',
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.suggestions).toEqual([]);
  });

  it('returns seeded suggestions in camelCase', async () => {
    if (skip()) return;

    const sugId = seedSuggestion();

    const res = await server!.inject({
      method: 'GET',
      url: '/proactive/suggestions',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.suggestions.length).toBeGreaterThanOrEqual(1);

    const sug = body.suggestions.find((s: any) => s.id === sugId);
    expect(sug).toBeDefined();
    expect(sug.userId).toBe('user-pro-a');
    expect(sug.companionId).toBe('cipher');
    expect(sug.deliveryChannel).toBe('api');
    expect(sug.userFeedback).toBeNull();
    // camelCase keys verified
    expect(sug.createdAt).toBeDefined();
    expect(sug.deliveredAt).toBeDefined();
  });

  it('rejects unauthenticated request', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/proactive/suggestions',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// POST /proactive/suggestions/:id/feedback
// ============================================================================

describe('POST /proactive/suggestions/:id/feedback', () => {
  it('updates feedback on owned suggestion', async () => {
    if (skip()) return;

    const sugId = seedSuggestion();

    const res = await server!.inject({
      method: 'POST',
      url: `/proactive/suggestions/${sugId}/feedback`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { feedback: 'helpful' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().feedback).toBe('helpful');

    // Verify in DB
    const row = server!.context.db.prepare(
      `SELECT user_feedback FROM proactive_suggestions WHERE id = ?`,
    ).get(sugId) as { user_feedback: string };
    expect(row.user_feedback).toBe('helpful');
  });

  it('returns 404 for non-existent suggestion', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/proactive/suggestions/nonexistent/feedback',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { feedback: 'helpful' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when updating another user suggestion', async () => {
    if (skip()) return;

    const sugId = seedSuggestion({ user_id: 'user-pro-a' });

    const res = await server!.inject({
      method: 'POST',
      url: `/proactive/suggestions/${sugId}/feedback`,
      headers: { authorization: `Bearer ${otherUserToken}` },
      payload: { feedback: 'not_helpful' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for invalid feedback value', async () => {
    if (skip()) return;

    const sugId = seedSuggestion();

    const res = await server!.inject({
      method: 'POST',
      url: `/proactive/suggestions/${sugId}/feedback`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { feedback: 'invalid' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ============================================================================
// GET /proactive/settings
// ============================================================================

describe('GET /proactive/settings', () => {
  it('returns defaults for user with preferences row', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.proactiveEnabled).toBe(false);
    expect(body.quietStart).toBeNull();
    expect(body.quietEnd).toBeNull();
    expect(body.maxDaily).toBe(5);
    expect(body.channels).toEqual([]);
    expect(typeof body.calendarConnected).toBe('boolean');
  });

  it('returns defaults for user without preferences row', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${otherUserToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.proactiveEnabled).toBe(false);
    expect(body.maxDaily).toBe(5);
    expect(body.calendarConnected).toBe(false);
  });
});

// ============================================================================
// PUT /proactive/settings
// ============================================================================

describe('PUT /proactive/settings', () => {
  it('updates proactive preferences', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'PUT',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        proactiveEnabled: true,
        quietStart: 22,
        quietEnd: 7,
        maxDaily: 10,
        channels: ['telegram', 'api'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.proactiveEnabled).toBe(true);
    expect(body.quietStart).toBe(22);
    expect(body.quietEnd).toBe(7);
    expect(body.maxDaily).toBe(10);
    expect(body.channels).toEqual(['telegram', 'api']);
  });

  it('rejects invalid quietStart', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'PUT',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { quietStart: 25 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('quietStart');
  });

  it('rejects invalid maxDaily', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'PUT',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { maxDaily: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('maxDaily');
  });

  it('rejects maxDaily above 20', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'PUT',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { maxDaily: 25 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('creates preference row for new user', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'PUT',
      url: '/proactive/settings',
      headers: { authorization: `Bearer ${otherUserToken}` },
      payload: { proactiveEnabled: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().proactiveEnabled).toBe(true);
  });
});

// ============================================================================
// DELETE /proactive/calendar
// ============================================================================

describe('DELETE /proactive/calendar', () => {
  it('returns 404 when no calendar connected', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'DELETE',
      url: '/proactive/calendar',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('deletes calendar connection', async () => {
    if (skip()) return;

    // Seed oauth_tokens row
    const db = server!.context.db;
    db.prepare(
      `INSERT OR IGNORE INTO oauth_tokens (id, user_id, provider, encrypted_refresh_token, scopes, created_at, updated_at)
       VALUES ('cal-tok-1', 'user-pro-a', 'google_calendar', 'encrypted', 'calendar.readonly', ?, ?)`,
    ).run(Date.now(), Date.now());

    const res = await server!.inject({
      method: 'DELETE',
      url: '/proactive/calendar',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify removed
    const row = db.prepare(
      `SELECT id FROM oauth_tokens WHERE user_id = 'user-pro-a' AND provider = 'google_calendar'`,
    ).get();
    expect(row).toBeUndefined();
  });
});
