/**
 * NFT Rebinding Test Suite
 *
 * Covers the full rebinding lifecycle: checkout, webhook payment confirmation,
 * data migration pipeline (rebind-execute), status queries, and completion.
 *
 * Uses Fastify inject() with in-memory SQLite. Stripe API calls are mocked
 * via vi.spyOn(globalThis, 'fetch'). Two test users: seller (owns NFT) and
 * buyer (initiates rebinding).
 *
 * NOTE: Requires better-sqlite3 native bindings. Skips gracefully when unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'rebinding-test-secret';
const TEST_SELLER_ID = 'user-seller-001';
const TEST_BUYER_ID = 'user-buyer-002';
const TEST_STRIPE_KEY = 'sk_test_rebind_fake';
const TEST_WEBHOOK_SECRET = 'whsec_rebind_fake';
const TEST_HATCHLING_PRICE = 'price_hatchling_rebind';
const TEST_ELDER_PRICE = 'price_elder_rebind';
const TEST_HERO_PRICE = 'price_hero_rebind';

const MINT_ADDRESS = 'mint-rebind-test-001';
const COMPANION_ID = 'cipher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid Stripe webhook signature for the given payload + secret. */
function buildStripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signed = `${timestamp}.${payload}`;
  const v1 = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Build a webhook event body for Stripe. */
function buildWebhookEvent(type: string, dataObject: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_test_${crypto.randomUUID().slice(0, 8)}`,
    type,
    data: { object: dataObject },
  });
}

/** Create a mock Response matching the Fetch API shape. */
function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: () => mockFetchResponse(body, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let server: FastifyInstance | null = null;
let sellerToken = '';
let buyerToken = '';
let skipReason = '';
let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = TEST_STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.STRIPE_HATCHLING_PRICE_ID = TEST_HATCHLING_PRICE;
  process.env.STRIPE_ELDER_PRICE_ID = TEST_ELDER_PRICE;
  process.env.STRIPE_HERO_PRICE_ID = TEST_HERO_PRICE;

  try {
    vi.mock('../api/lib/solana-mint.js', () => ({
      mintCompanionNFT: vi.fn().mockResolvedValue({
        mintAddress: 'mock-mint-address-rebind',
        source: 'mock',
      }),
    }));

    vi.mock('../api/lib/ipfs-pin.js', () => ({
      pinJSON: vi.fn().mockResolvedValue({ cid: 'Qm-mock-cid' }),
    }));

    vi.mock('../api/lib/chain-anchor.js', () => ({
      anchorHash: vi.fn().mockResolvedValue({ txSig: 'mock-tx-sig' }),
    }));

    vi.mock('dockerode', () => ({
      default: class Docker {
        listContainers() { return Promise.resolve([]); }
        getContainer() { return { inspect: () => Promise.resolve({}) }; }
        createContainer() { return Promise.resolve({ start: () => Promise.resolve() }); }
      },
    }));

    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: TEST_JWT_SECRET,
      databasePath: ':memory:',
      rateLimitMax: 100000,
    });
    await server.ready();

    const db = server.context.db;

    // Insert test users
    db.prepare(`
      INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
      VALUES (?, 111111, 'Seller', 'free')
    `).run(TEST_SELLER_ID);

    db.prepare(`
      INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
      VALUES (?, 222222, 'Buyer', 'free')
    `).run(TEST_BUYER_ID);

    // Seller owns the NFT
    db.prepare(`
      INSERT OR IGNORE INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet)
      VALUES (?, ?, ?, ?, ?)
    `).run('nft-rebind-test-1', TEST_SELLER_ID, COMPANION_ID, MINT_ADDRESS, 'wallet-seller-001');

    // user_companions for seller
    db.prepare(`
      INSERT OR IGNORE INTO user_companions (id, user_id, companion_id, nft_mint_address)
      VALUES (?, ?, ?, ?)
    `).run('uc-rebind-test-1', TEST_SELLER_ID, COMPANION_ID, MINT_ADDRESS);

    // Companion skills: mix of portable and non-portable
    db.prepare(`
      INSERT OR IGNORE INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-portable-1', COMPANION_ID, TEST_SELLER_ID, 'skill-calculator', 3, 250, 400, 1, 50);

    db.prepare(`
      INSERT OR IGNORE INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-portable-2', COMPANION_ID, TEST_SELLER_ID, 'skill-weather', 2, 100, 200, 1, 20);

    db.prepare(`
      INSERT OR IGNORE INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-nonportable-1', COMPANION_ID, TEST_SELLER_ID, 'skill-code-gen', 5, 800, 1000, 0, 200);

    // Memories: mix of transferable and non-transferable
    db.prepare(`
      INSERT OR IGNORE INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-transfer-1', TEST_SELLER_ID, COMPANION_ID, 'preference', 'Prefers dark mode', 0.7, 1);

    db.prepare(`
      INSERT OR IGNORE INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-transfer-2', TEST_SELLER_ID, COMPANION_ID, 'context', 'Works on web projects', 0.5, 1);

    db.prepare(`
      INSERT OR IGNORE INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-private-1', TEST_SELLER_ID, COMPANION_ID, 'personal', 'Has a dog named Max', 0.8, 0);

    db.prepare(`
      INSERT OR IGNORE INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-private-2', TEST_SELLER_ID, COMPANION_ID, 'event', 'Birthday is March 15', 0.6, 0);

    // Companion soul
    db.prepare(`
      INSERT OR IGNORE INTO companion_souls (id, user_id, companion_id, custom_name, traits, soul_values, style)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('soul-test-1', TEST_SELLER_ID, COMPANION_ID, 'CipherBot', '{"warmth":0.8}', '["honesty"]', '{"verbosity":"concise"}');

    // Companion customization
    db.prepare(`
      INSERT OR IGNORE INTO companion_customizations (id, user_id, companion_id, custom_name, tone_override)
      VALUES (?, ?, ?, ?, ?)
    `).run('custom-test-1', TEST_SELLER_ID, COMPANION_ID, 'MyCipher', 'casual');

    // Conversations
    const convId = 'conv-rebind-test-1';
    db.prepare(`
      INSERT OR IGNORE INTO conversations (id, user_id, companion_id, title)
      VALUES (?, ?, ?, ?)
    `).run(convId, TEST_SELLER_ID, COMPANION_ID, 'Test convo');

    db.prepare(`
      INSERT OR IGNORE INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `).run('msg-test-1', convId, 'user', 'Hello cipher');

    db.prepare(`
      INSERT OR IGNORE INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `).run('msg-test-2', convId, 'assistant', 'Hey there!');

    // Sign JWTs
    sellerToken = server.jwt.sign({ userId: TEST_SELLER_ID });
    buyerToken = server.jwt.sign({ userId: TEST_BUYER_ID });
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
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_HATCHLING_PRICE_ID;
  delete process.env.STRIPE_ELDER_PRICE_ID;
  delete process.env.STRIPE_HERO_PRICE_ID;
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

/** Install a fetch spy that routes Stripe API calls to a handler. */
function mockStripeApi(handler: (url: string, init?: RequestInit) => Response | null) {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('https://api.stripe.com/')) {
      const result = handler(url, init);
      if (result) return result;
    }
    return mockFetchResponse({ id: 'obj_fallback' });
  });
}

afterEach(() => {
  if (fetchSpy) {
    fetchSpy.mockRestore();
    fetchSpy = null;
  }
});

// ============================================================================
// Helper: seed a rebinding row + advance through lifecycle steps
// ============================================================================

/** Insert an nft_rebindings row and return its ID. */
function seedRebinding(
  overrides: Partial<{
    id: string;
    mintAddress: string;
    companionId: string;
    fromUserId: string;
    toUserId: string | null;
    status: string;
    stripeSessionId: string | null;
  }> = {},
): string {
  const id = overrides.id ?? `rebind-seed-${crypto.randomUUID().slice(0, 8)}`;
  const db = server!.context.db;
  db.prepare(`
    INSERT OR REPLACE INTO nft_rebindings
      (id, nft_mint_address, companion_id, from_user_id, to_user_id, status, stripe_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.mintAddress ?? MINT_ADDRESS,
    overrides.companionId ?? COMPANION_ID,
    overrides.fromUserId ?? TEST_SELLER_ID,
    overrides.toUserId ?? null,
    overrides.status ?? 'pending_payment',
    overrides.stripeSessionId ?? null,
  );
  return id;
}

/** Clean up rebinding rows for a given mint address. */
function cleanRebindings(mintAddress: string = MINT_ADDRESS) {
  server!.context.db.prepare(`DELETE FROM nft_rebindings WHERE nft_mint_address = ?`).run(mintAddress);
}

// ============================================================================
// A. CHECKOUT — POST /nft/rebind-checkout
// ============================================================================

describe('POST /nft/rebind-checkout', () => {
  afterEach(() => {
    if (!server) return;
    cleanRebindings();
    // Reset buyer stripe_customer_id
    server.context.db.prepare(`UPDATE users SET stripe_customer_id = NULL WHERE id = ?`).run(TEST_BUYER_ID);
  });

  it('returns Stripe checkout URL for valid rebinding request', async () => {
    if (skip()) return;

    mockStripeApi((url) => {
      if (url.includes('/customers')) return mockFetchResponse({ id: 'cus_buyer_001' });
      if (url.includes('/checkout/sessions')) {
        return mockFetchResponse({ id: 'cs_rebind_001', url: 'https://checkout.stripe.com/rebind-session' });
      }
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-checkout',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe('https://checkout.stripe.com/rebind-session');
    expect(body.rebindingId).toBeTruthy();

    // Verify nft_rebindings row was created
    const row = server!.context.db.prepare(
      `SELECT status, from_user_id, to_user_id FROM nft_rebindings WHERE nft_mint_address = ?`
    ).get(MINT_ADDRESS) as any;
    expect(row).toBeTruthy();
    expect(row.status).toBe('pending_payment');
    expect(row.from_user_id).toBe(TEST_SELLER_ID);
    expect(row.to_user_id).toBe(TEST_BUYER_ID);
  });

  it('returns 404 for non-existent mint address', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-checkout',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: 'mint-does-not-exist' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('NFT not found');
  });

  it('returns 409 when caller already owns the NFT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-checkout',
      headers: {
        authorization: `Bearer ${sellerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already own');
  });

  it('returns 409 when active rebinding already exists', async () => {
    if (skip()) return;

    // Seed an in-progress rebinding
    seedRebinding({ status: 'processing', toUserId: TEST_BUYER_ID });

    mockStripeApi((url) => {
      if (url.includes('/customers')) return mockFetchResponse({ id: 'cus_buyer_dup' });
      if (url.includes('/checkout/sessions')) return mockFetchResponse({ id: 'cs_dup', url: 'https://dup.com' });
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-checkout',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already in progress');
  });

  it('returns graceful stub when STRIPE_SECRET_KEY is missing', async () => {
    if (skip()) return;

    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;

    try {
      const res = await server!.inject({
        method: 'POST',
        url: '/nft/rebind-checkout',
        headers: {
          authorization: `Bearer ${buyerToken}`,
          'content-type': 'application/json',
        },
        payload: { mintAddress: MINT_ADDRESS },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.url).toBeNull();
      expect(body.message).toContain('coming soon');
    } finally {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-checkout',
      headers: { 'content-type': 'application/json' },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// B. WEBHOOK — rebind_nft payment confirmed
// ============================================================================

describe('POST /billing/webhook (rebind_nft)', () => {
  afterEach(() => {
    if (!server) return;
    cleanRebindings();
  });

  it('transitions pending_payment → processing on payment confirmed', async () => {
    if (skip()) return;

    const stripeSessionId = 'cs_rebind_webhook_001';
    const rebindingId = seedRebinding({
      status: 'pending_payment',
      stripeSessionId,
      toUserId: TEST_BUYER_ID,
    });

    const payload = buildWebhookEvent('checkout.session.completed', {
      id: stripeSessionId,
      metadata: {
        kin_user_id: TEST_BUYER_ID,
        type: 'rebind_nft',
        mint_address: MINT_ADDRESS,
        companion_id: COMPANION_ID,
      },
      customer: 'cus_webhook_buyer',
    });
    const sig = buildStripeSignature(payload, TEST_WEBHOOK_SECRET);

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': sig,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);

    // Verify status transitioned
    const row = server!.context.db.prepare(
      `SELECT status, to_user_id FROM nft_rebindings WHERE id = ?`
    ).get(rebindingId) as any;
    expect(row.status).toBe('processing');
    expect(row.to_user_id).toBe(TEST_BUYER_ID);
  });

  it('idempotent: duplicate webhook does not create duplicate rebinding', async () => {
    if (skip()) return;

    const stripeSessionId = 'cs_rebind_idempotent';
    seedRebinding({
      status: 'pending_payment',
      stripeSessionId,
      toUserId: TEST_BUYER_ID,
    });

    const payload = buildWebhookEvent('checkout.session.completed', {
      id: stripeSessionId,
      metadata: {
        kin_user_id: TEST_BUYER_ID,
        type: 'rebind_nft',
        mint_address: MINT_ADDRESS,
        companion_id: COMPANION_ID,
      },
      customer: 'cus_idempotent',
    });
    const sig = buildStripeSignature(payload, TEST_WEBHOOK_SECRET);

    // First webhook
    await server!.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload,
    });

    // Second webhook (duplicate) — status is now 'processing', not 'pending_payment'
    const res2 = await server!.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': sig },
      payload,
    });

    expect(res2.statusCode).toBe(200);

    // Only one rebinding row should exist for this mint
    const count = server!.context.db.prepare(
      `SELECT COUNT(*) as c FROM nft_rebindings WHERE nft_mint_address = ?`
    ).get(MINT_ADDRESS) as any;
    expect(count.c).toBe(1);
  });

  it('rejects invalid Stripe signature', async () => {
    if (skip()) return;

    const payload = buildWebhookEvent('checkout.session.completed', {
      metadata: { type: 'rebind_nft', kin_user_id: TEST_BUYER_ID, mint_address: MINT_ADDRESS },
      customer: 'cus_bad',
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=1234567890,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('signature');
  });
});

// ============================================================================
// C. DATA MIGRATION — POST /nft/rebind-execute
// ============================================================================

describe('POST /nft/rebind-execute', () => {
  /**
   * Before each migration test, we need a 'processing' rebinding for the buyer.
   * We also need to restore seed data that may have been wiped by a prior test.
   */
  function setupProcessingRebinding(): string {
    const db = server!.context.db;

    // Ensure seed data is present (re-insert if wiped by prior test)
    db.prepare(`
      INSERT OR IGNORE INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet)
      VALUES (?, ?, ?, ?, ?)
    `).run('nft-rebind-test-1', TEST_SELLER_ID, COMPANION_ID, MINT_ADDRESS, 'wallet-seller-001');

    db.prepare(`
      INSERT OR IGNORE INTO user_companions (id, user_id, companion_id, nft_mint_address)
      VALUES (?, ?, ?, ?)
    `).run('uc-rebind-test-1', TEST_SELLER_ID, COMPANION_ID, MINT_ADDRESS);

    // Re-seed companion skills
    db.prepare(`DELETE FROM companion_skills WHERE companion_id = ? AND user_id = ?`).run(COMPANION_ID, TEST_SELLER_ID);
    db.prepare(`DELETE FROM companion_skills WHERE companion_id = ? AND user_id = ?`).run(COMPANION_ID, TEST_BUYER_ID);
    db.prepare(`
      INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-p1-' + Date.now(), COMPANION_ID, TEST_SELLER_ID, 'skill-calculator', 3, 250, 400, 1, 50);
    db.prepare(`
      INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-p2-' + Date.now(), COMPANION_ID, TEST_SELLER_ID, 'skill-weather', 2, 100, 200, 1, 20);
    db.prepare(`
      INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, is_portable, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cs-np1-' + Date.now(), COMPANION_ID, TEST_SELLER_ID, 'skill-code-gen', 5, 800, 1000, 0, 200);

    // Re-seed memories
    db.prepare(`DELETE FROM memories WHERE user_id = ? AND companion_id = ?`).run(TEST_SELLER_ID, COMPANION_ID);
    db.prepare(`DELETE FROM memories WHERE user_id = ? AND companion_id = ?`).run(TEST_BUYER_ID, COMPANION_ID);
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-t1-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'preference', 'Prefers dark mode', 0.7, 1);
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-t2-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'context', 'Works on web projects', 0.5, 1);
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-p1-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'personal', 'Has a dog named Max', 0.8, 0);
    db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mem-p2-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'event', 'Birthday is March 15', 0.6, 0);

    // Re-seed souls and customizations
    db.prepare(`DELETE FROM companion_souls WHERE user_id = ? AND companion_id = ?`).run(TEST_SELLER_ID, COMPANION_ID);
    db.prepare(`
      INSERT INTO companion_souls (id, user_id, companion_id, custom_name, traits, soul_values, style)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('soul-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'CipherBot', '{"warmth":0.8}', '["honesty"]', '{"verbosity":"concise"}');

    db.prepare(`DELETE FROM companion_customizations WHERE user_id = ? AND companion_id = ?`).run(TEST_SELLER_ID, COMPANION_ID);
    db.prepare(`
      INSERT INTO companion_customizations (id, user_id, companion_id, custom_name, tone_override)
      VALUES (?, ?, ?, ?, ?)
    `).run('custom-' + Date.now(), TEST_SELLER_ID, COMPANION_ID, 'MyCipher', 'casual');

    // Re-seed conversations
    db.prepare(`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND companion_id = ?)`).run(TEST_SELLER_ID, COMPANION_ID);
    db.prepare(`DELETE FROM conversations WHERE user_id = ? AND companion_id = ?`).run(TEST_SELLER_ID, COMPANION_ID);
    const convId = 'conv-' + Date.now();
    db.prepare(`INSERT INTO conversations (id, user_id, companion_id, title) VALUES (?, ?, ?, ?)`).run(convId, TEST_SELLER_ID, COMPANION_ID, 'Test convo');
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)`).run('msg-' + Date.now(), convId, 'user', 'Hello');

    // Clean old rebindings, insert a 'processing' one
    cleanRebindings();
    return seedRebinding({
      status: 'processing',
      toUserId: TEST_BUYER_ID,
    });
  }

  it('executes full migration: portable skills replicated, private data wiped, ownership transferred', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.skillsTransferred).toBe(2); // 2 portable skills
    expect(body.memoriesWiped).toBeGreaterThanOrEqual(2); // at least the non-transferable + originals of transferable
    expect(body.snapshotId).toBeTruthy();

    const db = server!.context.db;

    // Verify ownership transferred
    const nft = db.prepare(`SELECT user_id FROM nft_ownership WHERE mint_address = ?`).get(MINT_ADDRESS) as any;
    expect(nft.user_id).toBe(TEST_BUYER_ID);

    // Verify rebinding status
    const rebind = db.prepare(
      `SELECT status FROM nft_rebindings WHERE nft_mint_address = ? ORDER BY created_at DESC LIMIT 1`
    ).get(MINT_ADDRESS) as any;
    expect(rebind.status).toBe('pending_onboarding');
  });

  it('only portable skills transfer to new owner (non-portable stay with seller)', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': 'application/json' },
      payload: { mintAddress: MINT_ADDRESS },
    });

    const db = server!.context.db;

    // Buyer should have 2 portable skills
    const buyerSkills = db.prepare(
      `SELECT skill_id, is_portable FROM companion_skills WHERE companion_id = ? AND user_id = ?`
    ).all(COMPANION_ID, TEST_BUYER_ID) as any[];
    expect(buyerSkills.length).toBe(2);
    expect(buyerSkills.every((s: any) => s.is_portable === 1)).toBe(true);

    const skillIds = buyerSkills.map((s: any) => s.skill_id).sort();
    expect(skillIds).toEqual(['skill-calculator', 'skill-weather']);

    // Non-portable skill (skill-code-gen) should NOT be in buyer's skills
    const nonPortable = db.prepare(
      `SELECT 1 FROM companion_skills WHERE companion_id = ? AND user_id = ? AND skill_id = 'skill-code-gen'`
    ).get(COMPANION_ID, TEST_BUYER_ID);
    expect(nonPortable).toBeUndefined();
  });

  it('only transferable memories migrate, non-transferable are deleted', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': 'application/json' },
      payload: { mintAddress: MINT_ADDRESS },
    });

    const db = server!.context.db;

    // Buyer should have the 2 transferable memories
    const buyerMemories = db.prepare(
      `SELECT content, is_transferable FROM memories WHERE user_id = ? AND companion_id = ?`
    ).all(TEST_BUYER_ID, COMPANION_ID) as any[];
    expect(buyerMemories.length).toBe(2);
    expect(buyerMemories.every((m: any) => m.is_transferable === 1)).toBe(true);

    const contents = buyerMemories.map((m: any) => m.content).sort();
    expect(contents).toEqual(['Prefers dark mode', 'Works on web projects']);

    // Seller should have NO memories for this companion
    const sellerMemories = db.prepare(
      `SELECT COUNT(*) as c FROM memories WHERE user_id = ? AND companion_id = ?`
    ).get(TEST_SELLER_ID, COMPANION_ID) as any;
    expect(sellerMemories.c).toBe(0);
  });

  it('conversations deleted for seller companion', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': 'application/json' },
      payload: { mintAddress: MINT_ADDRESS },
    });

    const db = server!.context.db;
    const convs = db.prepare(
      `SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND companion_id = ?`
    ).get(TEST_SELLER_ID, COMPANION_ID) as any;
    expect(convs.c).toBe(0);
  });

  it('companion souls and customizations deleted for seller', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: { authorization: `Bearer ${buyerToken}`, 'content-type': 'application/json' },
      payload: { mintAddress: MINT_ADDRESS },
    });

    const db = server!.context.db;

    const souls = db.prepare(
      `SELECT COUNT(*) as c FROM companion_souls WHERE user_id = ? AND companion_id = ?`
    ).get(TEST_SELLER_ID, COMPANION_ID) as any;
    expect(souls.c).toBe(0);

    const customs = db.prepare(
      `SELECT COUNT(*) as c FROM companion_customizations WHERE user_id = ? AND companion_id = ?`
    ).get(TEST_SELLER_ID, COMPANION_ID) as any;
    expect(customs.c).toBe(0);
  });

  it('returns 403 when wrong user tries to execute rebinding', async () => {
    if (skip()) return;

    setupProcessingRebinding();

    // Seller tries to execute — should be rejected (buyer is to_user_id)
    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: {
        authorization: `Bearer ${sellerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('new owner');
  });

  it('returns 404 when no processing rebinding exists', async () => {
    if (skip()) return;

    // No rebinding seeded
    cleanRebindings();

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('No active rebinding');
  });

  it('returns 400 when mintAddress is missing', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-execute',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('mintAddress');
  });
});

// ============================================================================
// D. STATUS + COMPLETION
// ============================================================================

describe('GET /nft/rebind-status/:mintAddress', () => {
  afterEach(() => {
    if (!server) return;
    cleanRebindings();
  });

  it('returns correct lifecycle state', async () => {
    if (skip()) return;

    seedRebinding({ status: 'processing', toUserId: TEST_BUYER_ID });

    const res = await server!.inject({
      method: 'GET',
      url: `/nft/rebind-status/${MINT_ADDRESS}`,
      headers: { authorization: `Bearer ${buyerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('processing');
    expect(body.companionId).toBe(COMPANION_ID);
    expect(body.fromUserId).toBe(TEST_SELLER_ID);
    expect(body.toUserId).toBe(TEST_BUYER_ID);
    expect(body.createdAt).toBeTruthy();
  });

  it('seller can also view rebinding status', async () => {
    if (skip()) return;

    seedRebinding({ status: 'processing', toUserId: TEST_BUYER_ID });

    const res = await server!.inject({
      method: 'GET',
      url: `/nft/rebind-status/${MINT_ADDRESS}`,
      headers: { authorization: `Bearer ${sellerToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('processing');
  });

  it('returns 403 for unrelated user', async () => {
    if (skip()) return;

    seedRebinding({ status: 'processing', toUserId: TEST_BUYER_ID });

    // Create a third unrelated user
    const db = server!.context.db;
    db.prepare(`INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier) VALUES (?, 333333, 'Stranger', 'free')`).run('user-stranger-003');
    const strangerToken = server!.jwt.sign({ userId: 'user-stranger-003' });

    const res = await server!.inject({
      method: 'GET',
      url: `/nft/rebind-status/${MINT_ADDRESS}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('Not authorized');
  });

  it('returns 404 for mint with no rebinding', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/nft/rebind-status/mint-nonexistent',
      headers: { authorization: `Bearer ${buyerToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /nft/rebind-complete', () => {
  afterEach(() => {
    if (!server) return;
    cleanRebindings();
  });

  it('transitions pending_onboarding → complete', async () => {
    if (skip()) return;

    seedRebinding({ status: 'pending_onboarding', toUserId: TEST_BUYER_ID });

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-complete',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const row = server!.context.db.prepare(
      `SELECT status, completed_at FROM nft_rebindings WHERE nft_mint_address = ? ORDER BY created_at DESC LIMIT 1`
    ).get(MINT_ADDRESS) as any;
    expect(row.status).toBe('complete');
    expect(row.completed_at).toBeTruthy();
  });

  it('returns 403 when non-owner tries to complete', async () => {
    if (skip()) return;

    seedRebinding({ status: 'pending_onboarding', toUserId: TEST_BUYER_ID });

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-complete',
      headers: {
        authorization: `Bearer ${sellerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('new owner');
  });

  it('returns 404 when no pending_onboarding rebinding exists', async () => {
    if (skip()) return;

    // Status is 'processing', not 'pending_onboarding'
    seedRebinding({ status: 'processing', toUserId: TEST_BUYER_ID });

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/rebind-complete',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ============================================================================
// E. DEPRECATED TRANSFER ROUTE
// ============================================================================

describe('POST /nft/transfer (deprecated)', () => {
  it('returns 410 Gone', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/nft/transfer',
      headers: {
        authorization: `Bearer ${sellerToken}`,
        'content-type': 'application/json',
      },
      payload: { mintAddress: MINT_ADDRESS, toWallet: 'wallet-new' },
    });

    expect(res.statusCode).toBe(410);
    expect(res.json().deprecated).toBe(true);
    expect(res.json().error).toContain('rebind-checkout');
  });
});
