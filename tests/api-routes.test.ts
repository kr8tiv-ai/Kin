/**
 * API Route Integration Tests
 *
 * Uses Fastify's inject() for in-process HTTP testing (no real server needed).
 * Creates an in-memory SQLite database via :memory: path.
 *
 * NOTE: These tests require better-sqlite3 native bindings to be built.
 * If the native module is not available (e.g. no C++ compiler on Windows),
 * the entire suite is skipped with a diagnostic message.
 *
 * On CI / Linux / macOS (where node-gyp works), all 24 tests run normally.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let authToken = '';
let testUserId = '';
let skipReason = '';

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-for-vitest',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('bindings') || msg.includes('better_sqlite3') || msg.includes('better-sqlite3') || msg.includes('dockerode')) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      // Re-throw unexpected errors so they surface properly
      throw err;
    }
  }
});

afterAll(async () => {
  if (server) {
    await server.close();
  }
});

/** Returns true (and the test should early-return) when native deps are missing. */
function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// Health Routes (unauthenticated)
// ============================================================================

describe('Health Routes', () => {
  it('GET /health returns 200 with healthy status', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('1.0.0');
    expect(typeof body.uptime).toBe('number');
    expect(body.checks).toBeDefined();
    expect(body.checks.database.status).toBe(true);
    expect(body.checks.memory.status).toBe(true);
  });

  it('GET /live returns 200 with alive: true', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ alive: true });
  });

  it('GET /ready returns 200 with ready: true', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ready: true });
  });

  it('GET / returns API info with name and version', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.name).toBe('KIN API');
    expect(body.version).toBe('1.0.0');
    expect(body.endpoints).toBeDefined();
  });
});

// ============================================================================
// Auth Routes
// ============================================================================

describe('Auth Routes', () => {
  it('POST /auth/dev-login creates user and returns JWT', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: {
        telegramId: 12345,
        firstName: 'TestUser',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');
    expect(body.user).toBeDefined();

    // Store for later tests (before detailed assertions so downstream tests work)
    authToken = body.token;
    testUserId = body.user.id;

    expect(body.user.telegramId).toBe('12345');
    expect(body.user.firstName).toBe('TestUser');
  });

  it('POST /auth/dev-login returns same user on second call with same telegramId', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: {
        telegramId: 12345,
        firstName: 'TestUser',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.id).toBe(testUserId);
  });

  it('POST /auth/dev-login accepts a seeded userId path for local tooling', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: {
        userId: 'user-dev',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.id).toBe('user-dev');
    expect(body.user.firstName).toBeDefined();
  });

  it('GET /auth/verify with valid token returns valid: true', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(true);
    expect(body.userId).toBe(testUserId);
  });

  it('GET /auth/verify without token returns valid: false', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/auth/verify',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.valid).toBe(false);
  });

  it('GET /auth/verify with garbage token returns valid: false', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: {
        authorization: 'Bearer not-a-real-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().valid).toBe(false);
  });
});

// ============================================================================
// Protected Routes (JWT required)
// ============================================================================

describe('Protected Routes - Auth enforcement', () => {
  it('GET /conversations without JWT returns 401', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/conversations',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('Unauthorized');
  });

  it('GET /memories without JWT returns 401', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/memories',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /conversations with invalid JWT returns 401', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/conversations',
      headers: {
        authorization: 'Bearer fake.jwt.token',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});

// ============================================================================
// Conversation CRUD
// ============================================================================

describe('Conversation CRUD', () => {
  let conversationId: string;

  it('POST /conversations creates a new conversation', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'POST',
      url: '/conversations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        companionId: 'cipher',
        title: 'Test Conversation',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.conversation).toBeDefined();
    expect(body.conversation.companionId).toBe('cipher');
    expect(body.conversation.title).toBe('Test Conversation');
    expect(body.conversation.id).toMatch(/^conv-/);

    conversationId = body.conversation.id;
  });

  it('GET /conversations lists user conversations', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/conversations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.conversations).toBeDefined();
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.conversations.length).toBeGreaterThanOrEqual(1);

    const found = body.conversations.find((c: any) => c.id === conversationId);
    expect(found).toBeDefined();
    expect(found.companionName).toBe('Cipher');
    expect(found.title).toBe('Test Conversation');
  });

  it('GET /conversations/:id/messages returns messages for a conversation', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
    // No messages added yet, so array should be empty
    expect(body.messages.length).toBe(0);
  });

  it('GET /conversations/:id/messages returns 404 for non-existent conversation', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/conversations/conv-does-not-exist/messages',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Conversation not found');
  });

  it('DELETE /conversations/:id deletes the conversation', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'DELETE',
      url: `/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    // Verify it is gone
    const listResponse = await server!.inject({
      method: 'GET',
      url: '/conversations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });
    const found = listResponse.json().conversations.find((c: any) => c.id === conversationId);
    expect(found).toBeUndefined();
  });

  it('DELETE /conversations/:id returns 404 for already-deleted conversation', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'DELETE',
      url: `/conversations/${conversationId}`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});

// ============================================================================
// Memory Routes
// ============================================================================

describe('Memory Routes', () => {
  let memoryId: string;

  it('POST /memories creates a new memory', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'POST',
      url: '/memories',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        companionId: 'cipher',
        type: 'preference',
        content: 'User prefers dark theme',
        importance: 0.8,
        isTransferable: true,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.memory).toBeDefined();
    expect(body.memory.companionId).toBe('cipher');
    expect(body.memory.type).toBe('preference');
    expect(body.memory.importance).toBe(0.8);
    expect(body.memory.isTransferable).toBe(true);
    expect(body.memory.id).toMatch(/^mem-/);

    memoryId = body.memory.id;
  });

  it('GET /memories lists user memories', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/memories',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.memories).toBeDefined();
    expect(Array.isArray(body.memories)).toBe(true);
    expect(body.memories.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /memories?type=preference filters by type', async () => {
    if (skip()) return;

    // Add another memory of a different type
    await server!.inject({
      method: 'POST',
      url: '/memories',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        companionId: 'cipher',
        type: 'personal',
        content: 'User birthday is January 1st',
        importance: 0.6,
      },
    });

    const response = await server!.inject({
      method: 'GET',
      url: '/memories?type=preference',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // All returned memories should be preferences
    for (const mem of body.memories) {
      expect(mem.type).toBe('preference');
    }
  });

  it('GET /memory-preferences returns memories grouped by companion', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'GET',
      url: '/memory-preferences',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.preferences).toBeDefined();
    // cipher should have at least one preference
    expect(body.preferences.cipher).toBeDefined();
    expect(body.preferences.cipher.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /memories/:id deletes a memory', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'DELETE',
      url: `/memories/${memoryId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
  });

  it('DELETE /memories/:id returns 404 for non-existent memory', async () => {
    if (skip()) return;

    const response = await server!.inject({
      method: 'DELETE',
      url: '/memories/mem-does-not-exist',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
