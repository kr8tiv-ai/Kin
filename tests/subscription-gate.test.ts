/**
 * Subscription Gate Middleware Tests
 *
 * Covers: loadUserTier(), requireSubscription(), requireFrontierAccess(),
 *         enforceMessageLimit()
 *
 * Uses Fastify inject() with in-memory SQLite. Registers minimal test routes
 * that exercise each preHandler factory, then verifies correct tier resolution,
 * gate enforcement, and message limit behavior.
 *
 * NOTE: Requires better-sqlite3 native bindings. Skips gracefully when unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'subgate-test-secret';
const TEST_USER_ID = 'user-subgate-test';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let server: FastifyInstance | null = null;
let authToken = '';
let skipReason = '';

beforeAll(async () => {
  try {
    // Mock external dependencies before importing server
    vi.mock('../api/lib/solana-mint.js', () => ({
      mintCompanionNFT: vi.fn().mockResolvedValue({
        mintAddress: 'mock-mint-address-subgate',
        source: 'mock',
      }),
    }));

    vi.mock('dockerode', () => {
      return {
        default: class Docker {
          listContainers() { return Promise.resolve([]); }
          getContainer() { return { inspect: () => Promise.resolve({}) }; }
          createContainer() { return Promise.resolve({ start: () => Promise.resolve() }); }
        },
      };
    });

    const { createServer } = await import('../api/server.js');

    // Import middleware before creating server so we can register routes pre-ready
    const { requireSubscription, requireFrontierAccess, enforceMessageLimit } =
      await import('../api/middleware/subscription-gate.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: TEST_JWT_SECRET,
      databasePath: ':memory:',
      rateLimitMax: 100000,
    });

    // JWT verification preHandler — mirrors the onRequest hook in server.ts protected scope
    const jwtVerify = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    };

    // Register test routes BEFORE .ready() — Fastify rejects routes after listen/ready
    server.get('/test/require-hatchling', {
      preHandler: [jwtVerify, requireSubscription('hatchling')],
    }, async () => ({ ok: true, route: 'hatchling' }));

    server.get('/test/require-elder', {
      preHandler: [jwtVerify, requireSubscription('elder')],
    }, async () => ({ ok: true, route: 'elder' }));

    server.get('/test/require-hero', {
      preHandler: [jwtVerify, requireSubscription('hero')],
    }, async () => ({ ok: true, route: 'hero' }));

    server.get('/test/frontier', {
      preHandler: [jwtVerify, requireFrontierAccess()],
    }, async () => ({ ok: true, route: 'frontier' }));

    server.post('/test/message-limit', {
      preHandler: [jwtVerify, enforceMessageLimit()],
    }, async () => ({ ok: true, route: 'message-limit' }));

    await server.ready();

    // Insert test user
    server.context.db.prepare(`
      INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
      VALUES (?, 999888, 'SubGateTester', 'free')
    `).run(TEST_USER_ID);

    authToken = server.jwt.sign({ userId: TEST_USER_ID });
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
  vi.restoreAllMocks();
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helper: set user subscription state
// ---------------------------------------------------------------------------

function clearSubscriptionState() {
  if (!server) return;
  server.context.db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(TEST_USER_ID);
  server.context.db.prepare('DELETE FROM nft_ownership WHERE user_id = ?').run(TEST_USER_ID);
}

function insertSubscription(plan: string, status: string) {
  if (!server) return;
  server.context.db.prepare(`
    INSERT OR REPLACE INTO subscriptions (id, user_id, plan, status)
    VALUES (?, ?, ?, ?)
  `).run(`sub-test-${plan}`, TEST_USER_ID, plan, status);
}

function insertNft() {
  if (!server) return;
  server.context.db.prepare(`
    INSERT OR IGNORE INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet)
    VALUES (?, ?, 'cipher', 'mint-test-addr', 'wallet-test-addr')
  `).run(`nft-test-${TEST_USER_ID}`, TEST_USER_ID);
}

function insertMessagesForToday(count: number) {
  if (!server) return;
  const db = server.context.db;

  // Ensure a conversation exists for the user
  db.prepare(`
    INSERT OR IGNORE INTO conversations (id, user_id, companion_id)
    VALUES ('conv-test-subgate', ?, 'cipher')
  `).run(TEST_USER_ID);

  // Insert user messages with timestamps in the current UTC day
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, timestamp)
      VALUES (?, 'conv-test-subgate', 'user', 'test message', ?)
    `).run(`msg-limit-${i}-${Date.now()}`, now - i * 1000);
  }
}

function clearMessages() {
  if (!server) return;
  server.context.db.prepare(
    "DELETE FROM messages WHERE conversation_id = 'conv-test-subgate'"
  ).run();
}

// ---------------------------------------------------------------------------
// loadUserTier() tests (tested indirectly through middleware)
// ---------------------------------------------------------------------------

describe('loadUserTier()', () => {
  it('returns free when no subscription and no NFT', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('free');
  });

  it('returns plan name for active subscription', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertSubscription('elder', 'active');
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('elder');
  });

  it('returns plan name for trialing subscription', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertSubscription('hatchling', 'trialing');
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('hatchling');
  });

  it('returns plan name for past_due subscription (grace period)', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertSubscription('hero', 'past_due');
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('hero');
  });

  it('returns free for canceled subscription', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertSubscription('elder', 'canceled');
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('free');
  });

  it('returns nft for NFT holder with no subscription', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertNft();
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('nft');
  });

  it('prefers subscription over NFT when both exist', async () => {
    if (skip()) return;
    const { loadUserTier } = await import('../api/middleware/subscription-gate.js');
    clearSubscriptionState();
    insertSubscription('hatchling', 'active');
    insertNft();
    const tier = loadUserTier(server!.context.db, TEST_USER_ID);
    expect(tier).toBe('hatchling');
  });
});

// ---------------------------------------------------------------------------
// requireSubscription() tests
// ---------------------------------------------------------------------------

describe('requireSubscription()', () => {
  it('returns 403 for free user on hatchling-gated route', async () => {
    if (skip()) return;
    clearSubscriptionState();
    const res = await server!.inject({
      method: 'GET',
      url: '/test/require-hatchling',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe('UPGRADE_REQUIRED');
    expect(body.currentPlan).toBe('free');
    expect(body.requiredPlan).toBe('hatchling');
  });

  it('passes elder user on hatchling-gated route', async () => {
    if (skip()) return;
    clearSubscriptionState();
    insertSubscription('elder', 'active');
    const res = await server!.inject({
      method: 'GET',
      url: '/test/require-hatchling',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('passes hero user on hero-gated route', async () => {
    if (skip()) return;
    clearSubscriptionState();
    insertSubscription('hero', 'active');
    const res = await server!.inject({
      method: 'GET',
      url: '/test/require-hero',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('passes NFT holder on hatchling-gated route (nft rank = hero)', async () => {
    if (skip()) return;
    clearSubscriptionState();
    insertNft();
    const res = await server!.inject({
      method: 'GET',
      url: '/test/require-hatchling',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    if (skip()) return;
    const res = await server!.inject({
      method: 'GET',
      url: '/test/require-hatchling',
    });
    // Fastify JWT authenticate hook returns 401 before our middleware runs
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// requireFrontierAccess() tests
// ---------------------------------------------------------------------------

describe('requireFrontierAccess()', () => {
  it('returns 403 for free user', async () => {
    if (skip()) return;
    clearSubscriptionState();
    const res = await server!.inject({
      method: 'GET',
      url: '/test/frontier',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('UPGRADE_REQUIRED');
  });

  it('passes for hatchling user', async () => {
    if (skip()) return;
    clearSubscriptionState();
    insertSubscription('hatchling', 'active');
    const res = await server!.inject({
      method: 'GET',
      url: '/test/frontier',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('passes for NFT holder', async () => {
    if (skip()) return;
    clearSubscriptionState();
    insertNft();
    const res = await server!.inject({
      method: 'GET',
      url: '/test/frontier',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// enforceMessageLimit() tests
// ---------------------------------------------------------------------------

describe('enforceMessageLimit()', () => {
  it('allows free user under limit', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(10);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 429 for free user at limit (50 messages)', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(50);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.code).toBe('MESSAGE_LIMIT_REACHED');
    expect(body.limit).toBe(50);
    expect(body.used).toBe(50);
    expect(body.resetsAt).toBeDefined();
    // resetsAt should be a valid ISO date string
    expect(new Date(body.resetsAt).toISOString()).toBe(body.resetsAt);
  });

  it('returns 429 for free user over limit (55 messages)', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(55);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe('MESSAGE_LIMIT_REACHED');
  });

  it('skips check for paid user regardless of message count', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertSubscription('hatchling', 'active');
    insertMessagesForToday(100);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('skips check for NFT holder regardless of message count', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertNft();
    insertMessagesForToday(100);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('allows free user at exactly 49 messages', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(49);
    const res = await server!.inject({
      method: 'POST',
      url: '/test/message-limit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Chat route integration: enforceMessageLimit wired as preHandler
// ---------------------------------------------------------------------------

describe('Chat route message limit enforcement (integration)', () => {
  it('POST /chat returns 429 for free user at message limit', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(50);
    const res = await server!.inject({
      method: 'POST',
      url: '/chat',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { companionId: 'cipher', message: 'Hello from test' },
    });
    // enforceMessageLimit preHandler short-circuits before handler runs
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.code).toBe('MESSAGE_LIMIT_REACHED');
    expect(body.limit).toBe(50);
  });

  it('POST /chat/stream returns 429 for free user at message limit', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertMessagesForToday(50);
    const res = await server!.inject({
      method: 'POST',
      url: '/chat/stream',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { companionId: 'cipher', message: 'Hello from stream test' },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.code).toBe('MESSAGE_LIMIT_REACHED');
  });

  it('POST /chat allows paid user past the free message limit', async () => {
    if (skip()) return;
    clearSubscriptionState();
    clearMessages();
    insertSubscription('hatchling', 'active');
    insertMessagesForToday(100);
    // The preHandler allows paid users through — the handler itself will
    // attempt supervisedChat which may fail without providers configured,
    // but a 429 would mean the gate blocked them. Any non-429 status proves
    // the paid user bypassed the message limit.
    const res = await server!.inject({
      method: 'POST',
      url: '/chat',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { companionId: 'cipher', message: 'Hello from paid test' },
    });
    // Paid user must NOT get 429 — they bypass the limit
    expect(res.statusCode).not.toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Chat route integration: userTier wiring verification
// ---------------------------------------------------------------------------

describe('Chat route userTier wiring (static verification)', () => {
  it('chat module imports loadUserTier from subscription-gate', async () => {
    if (skip()) return;
    // Read the chat route source and verify the import + usage
    const fs = await import('fs');
    const chatSource = fs.readFileSync('api/routes/chat.ts', 'utf-8');

    // Import statement
    expect(chatSource).toContain("import { loadUserTier, enforceMessageLimit } from '../middleware/subscription-gate.js'");

    // userTier loaded and passed to supervisedChat in POST /chat
    expect(chatSource).toContain('const userTier = loadUserTier(fastify.context.db, userId)');
    // userTier appears inside the options object passed to supervisedChat
    expect(chatSource).toMatch(/supervisedChat\([\s\S]*?userTier[\s\S]*?\)/);

    // userTier loaded in streaming fallback too
    expect(chatSource).toContain('const streamUserTier = loadUserTier(fastify.context.db, userId)');
    expect(chatSource).toContain('userTier: streamUserTier');

    // enforceMessageLimit in both route options
    const preHandlerMatches = chatSource.match(/preHandler:\s*\[enforceMessageLimit\(\)\]/g);
    expect(preHandlerMatches).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// TypeScript compilation regression test
// ---------------------------------------------------------------------------

describe('TypeScript compilation', () => {
  it('produces no type errors (regression check)', async () => {
    // This test is verified by `npx tsc --noEmit` in the verification step.
    // Here we just confirm the module exports the expected shape.
    const gate = await import('../api/middleware/subscription-gate.js');
    expect(typeof gate.loadUserTier).toBe('function');
    expect(typeof gate.requireSubscription).toBe('function');
    expect(typeof gate.requireFrontierAccess).toBe('function');
    expect(typeof gate.enforceMessageLimit).toBe('function');
    expect(gate.PLAN_RANK).toBeDefined();
    expect(gate.PLAN_RANK.free).toBe(0);
    expect(gate.PLAN_RANK.nft).toBe(3);
  });
});
