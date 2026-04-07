/**
 * Billing Route Tests
 *
 * Covers: GET /billing/status, POST /billing/checkout, POST /billing/portal,
 *         POST /billing/webhook (billing-webhook.ts)
 *
 * Uses Fastify inject() with in-memory SQLite. Stripe API calls are mocked
 * via vi.spyOn(globalThis, 'fetch'). The webhook plugin is registered outside
 * the JWT scope (matching production server.ts), so webhook requests must NOT
 * require a JWT header — this validates the T01 fix.
 *
 * NOTE: Requires better-sqlite3 native bindings. Skips gracefully when unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'billing-test-secret';
const TEST_USER_ID = 'user-billing-test';
const TEST_STRIPE_KEY = 'sk_test_fake123';
const TEST_WEBHOOK_SECRET = 'whsec_test_fake456';
const TEST_HATCHLING_PRICE = 'price_hatchling_test';
const TEST_ELDER_PRICE = 'price_elder_test';
const TEST_HERO_PRICE = 'price_hero_test';

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

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let server: FastifyInstance | null = null;
let authToken = '';
let skipReason = '';
let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(async () => {
  // Set env vars before importing server modules
  process.env.STRIPE_SECRET_KEY = TEST_STRIPE_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.STRIPE_HATCHLING_PRICE_ID = TEST_HATCHLING_PRICE;
  process.env.STRIPE_ELDER_PRICE_ID = TEST_ELDER_PRICE;
  process.env.STRIPE_HERO_PRICE_ID = TEST_HERO_PRICE;

  try {
    // Mock external dependencies before importing server
    vi.mock('../api/lib/solana-mint.js', () => ({
      mintCompanionNFT: vi.fn().mockResolvedValue({
        mintAddress: 'mock-mint-address-123',
        source: 'mock',
      }),
    }));

    // Mock dockerode (fleet container management) — not needed for billing tests
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

    server = await createServer({
      environment: 'development',
      jwtSecret: TEST_JWT_SECRET,
      databasePath: ':memory:',
      rateLimitMax: 100000,
    });
    await server.ready();

    // Insert test user
    server.context.db.prepare(`
      INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
      VALUES (?, 123456, 'TestBiller', 'free')
    `).run(TEST_USER_ID);

    // Sign a JWT for the test user
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
}, 60_000); // createServer initializes fleet, scheduler, pipeline — needs extra time

afterAll(async () => {
  if (server) await server.close();
  vi.restoreAllMocks();
  // Clean up env vars
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

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

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

/** Install a fetch spy that routes Stripe API calls to a handler. */
function mockStripeApi(handler: (url: string, init?: RequestInit) => Response | null) {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.startsWith('https://api.stripe.com/')) {
      const result = handler(url, init);
      if (result) return result;
    }
    // Fallback: return a generic success for unknown Stripe calls
    return mockFetchResponse({ id: 'obj_fallback' });
  });
}

// Restore fetch after each test
afterEach(() => {
  if (fetchSpy) {
    fetchSpy.mockRestore();
    fetchSpy = null;
  }
});

// ============================================================================
// GET /billing/status
// ============================================================================

describe('GET /billing/status', () => {
  it('returns free plan for user with no subscription', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/billing/status',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan).toBe('free');
    expect(body.status).toBe('active');
    expect(body.stripeSubscriptionId).toBeNull();
    expect(body.usage).toBeDefined();
  });

  it('returns subscription data for subscribed user', async () => {
    if (skip()) return;

    // Insert a subscription for the test user
    const now = Date.now();
    server!.context.db.prepare(`
      INSERT OR REPLACE INTO subscriptions
        (id, user_id, stripe_subscription_id, stripe_customer_id, plan, status,
         current_period_start, current_period_end, cancel_at_period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sub-test-1', TEST_USER_ID, 'sub_stripe_123', 'cus_test_123', 'elder', 'active', now, now + 30 * 86400000, 0);

    const res = await server!.inject({
      method: 'GET',
      url: '/billing/status',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan).toBe('elder');
    expect(body.status).toBe('active');
    expect(body.stripeSubscriptionId).toBe('sub_stripe_123');
    expect(body.cancelAtPeriodEnd).toBe(false);
    expect(body.currentPeriodEnd).toBeTruthy();

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/billing/status',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// POST /billing/checkout
// ============================================================================

describe('POST /billing/checkout', () => {
  it('creates checkout session with valid tier', async () => {
    if (skip()) return;

    mockStripeApi((url) => {
      if (url.includes('/customers')) {
        return mockFetchResponse({ id: 'cus_new_123' });
      }
      if (url.includes('/checkout/sessions')) {
        return mockFetchResponse({ url: 'https://checkout.stripe.com/test-session' });
      }
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { tier: 'hatchling' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe('https://checkout.stripe.com/test-session');
  });

  it('returns 400 for invalid tier', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { tier: 'nonexistent-tier' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('Invalid tier');
  });

  it('returns 400 when no tier and no priceId provided', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('required');
  });

  it('applies Genesis discount coupon for eligible user', async () => {
    if (skip()) return;

    // Set genesis_discount on test user
    server!.context.db.prepare(`UPDATE users SET genesis_discount = 25 WHERE id = ?`).run(TEST_USER_ID);

    let couponCreated = false;
    let sessionHasDiscount = false;

    mockStripeApi((url, init) => {
      if (url.includes('/customers')) {
        return mockFetchResponse({ id: 'cus_genesis_123' });
      }
      if (url.includes('/coupons')) {
        couponCreated = true;
        return mockFetchResponse({ id: 'cpn_genesis_25' });
      }
      if (url.includes('/checkout/sessions')) {
        // Check that discount coupon is included in session params
        const bodyStr = (init?.body as string) ?? '';
        if (bodyStr.includes('cpn_genesis_25')) {
          sessionHasDiscount = true;
        }
        return mockFetchResponse({ url: 'https://checkout.stripe.com/genesis-session' });
      }
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { tier: 'elder' },
    });

    expect(res.statusCode).toBe(200);
    expect(couponCreated).toBe(true);
    expect(sessionHasDiscount).toBe(true);

    // Clean up
    server!.context.db.prepare(`UPDATE users SET genesis_discount = 0, stripe_customer_id = NULL WHERE id = ?`).run(TEST_USER_ID);
  });

  it('accepts raw priceId for backward compatibility', async () => {
    if (skip()) return;

    mockStripeApi((url) => {
      if (url.includes('/customers')) return mockFetchResponse({ id: 'cus_compat_123' });
      if (url.includes('/checkout/sessions')) {
        return mockFetchResponse({ url: 'https://checkout.stripe.com/compat-session' });
      }
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { priceId: 'price_raw_custom_123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://checkout.stripe.com/compat-session');

    // Clean up customer ID set by this test
    server!.context.db.prepare(`UPDATE users SET stripe_customer_id = NULL WHERE id = ?`).run(TEST_USER_ID);
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: { 'content-type': 'application/json' },
      payload: { tier: 'hatchling' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ============================================================================
// POST /billing/webhook (billing-webhook.ts — no JWT required)
// ============================================================================

describe('POST /billing/webhook', () => {
  it('does NOT require JWT (T01 fix validation)', async () => {
    if (skip()) return;

    // Send a webhook with valid signature but no JWT header — must not get 401
    const payload = buildWebhookEvent('checkout.session.completed', {
      metadata: { kin_user_id: TEST_USER_ID, plan: 'hatchling' },
      customer: 'cus_wh_123',
      subscription: 'sub_wh_123',
    });

    mockStripeApi((url) => {
      if (url.includes('/subscriptions/')) {
        return mockFetchResponse({
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        });
      }
      return null;
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

    // Must NOT be 401 — webhook sits outside auth scope
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
  });

  it('creates subscription on checkout.session.completed', async () => {
    if (skip()) return;

    const payload = buildWebhookEvent('checkout.session.completed', {
      metadata: { kin_user_id: TEST_USER_ID, plan: 'elder' },
      customer: 'cus_checkout_abc',
      subscription: 'sub_checkout_abc',
    });

    mockStripeApi((url) => {
      if (url.includes('/subscriptions/')) {
        return mockFetchResponse({
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        });
      }
      return null;
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

    // Verify subscription was created in DB
    const sub = server!.context.db.prepare(
      `SELECT plan, status, stripe_subscription_id FROM subscriptions WHERE user_id = ?`
    ).get(TEST_USER_ID) as any;

    expect(sub).toBeTruthy();
    expect(sub.plan).toBe('elder');
    expect(sub.status).toBe('active');
    expect(sub.stripe_subscription_id).toBe('sub_checkout_abc');

    // Verify user tier was updated
    const user = server!.context.db.prepare(`SELECT tier FROM users WHERE id = ?`).get(TEST_USER_ID) as any;
    expect(user.tier).toBe('elder');

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
    server!.context.db.prepare(`UPDATE users SET tier = 'free' WHERE id = ?`).run(TEST_USER_ID);
  });

  it('returns 400 for invalid Stripe signature', async () => {
    if (skip()) return;

    const payload = buildWebhookEvent('checkout.session.completed', {
      metadata: { kin_user_id: TEST_USER_ID },
      customer: 'cus_bad',
      subscription: 'sub_bad',
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

  it('handles customer.subscription.updated', async () => {
    if (skip()) return;

    // Insert a subscription first
    server!.context.db.prepare(`
      INSERT OR REPLACE INTO subscriptions
        (id, user_id, stripe_subscription_id, stripe_customer_id, plan, status,
         current_period_start, current_period_end, cancel_at_period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sub-upd-1', TEST_USER_ID, 'sub_update_test', 'cus_upd', 'hatchling', 'active', Date.now(), Date.now() + 86400000, 0);

    const payload = buildWebhookEvent('customer.subscription.updated', {
      id: 'sub_update_test',
      status: 'active',
      cancel_at_period_end: true,
      current_period_start: 1700000000,
      current_period_end: 1702592000,
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

    // Verify cancel_at_period_end was set
    const sub = server!.context.db.prepare(
      `SELECT cancel_at_period_end FROM subscriptions WHERE stripe_subscription_id = ?`
    ).get('sub_update_test') as any;

    expect(sub.cancel_at_period_end).toBe(1);

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
  });

  it('handles customer.subscription.deleted — sets status canceled, tier free', async () => {
    if (skip()) return;

    // Insert subscription + set user tier
    server!.context.db.prepare(`
      INSERT OR REPLACE INTO subscriptions
        (id, user_id, stripe_subscription_id, stripe_customer_id, plan, status,
         current_period_start, current_period_end, cancel_at_period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sub-del-1', TEST_USER_ID, 'sub_delete_test', 'cus_del', 'hero', 'active', Date.now(), Date.now() + 86400000, 0);
    server!.context.db.prepare(`UPDATE users SET tier = 'hero' WHERE id = ?`).run(TEST_USER_ID);

    const payload = buildWebhookEvent('customer.subscription.deleted', {
      id: 'sub_delete_test',
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

    // Verify subscription status
    const sub = server!.context.db.prepare(
      `SELECT status, plan FROM subscriptions WHERE stripe_subscription_id = ?`
    ).get('sub_delete_test') as any;

    expect(sub.status).toBe('canceled');
    expect(sub.plan).toBe('free');

    // Verify user tier reverted to free
    const user = server!.context.db.prepare(`SELECT tier FROM users WHERE id = ?`).get(TEST_USER_ID) as any;
    expect(user.tier).toBe('free');

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
  });

  it('handles invoice.payment_failed — sets status past_due', async () => {
    if (skip()) return;

    // Insert active subscription
    server!.context.db.prepare(`
      INSERT OR REPLACE INTO subscriptions
        (id, user_id, stripe_subscription_id, stripe_customer_id, plan, status,
         current_period_start, current_period_end, cancel_at_period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('sub-fail-1', TEST_USER_ID, 'sub_fail_test', 'cus_fail', 'elder', 'active', Date.now(), Date.now() + 86400000, 0);

    const payload = buildWebhookEvent('invoice.payment_failed', {
      subscription: 'sub_fail_test',
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

    // Verify subscription marked as past_due
    const sub = server!.context.db.prepare(
      `SELECT status FROM subscriptions WHERE stripe_subscription_id = ?`
    ).get('sub_fail_test') as any;

    expect(sub.status).toBe('past_due');

    // Clean up
    server!.context.db.prepare(`DELETE FROM subscriptions WHERE user_id = ?`).run(TEST_USER_ID);
  });

  it('returns 400 for malformed JSON body', async () => {
    if (skip()) return;

    const badPayload = '{ this is not valid json !!!';
    const sig = buildStripeSignature(badPayload, TEST_WEBHOOK_SECRET);

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': sig,
      },
      payload: badPayload,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid JSON');
  });

  it('gracefully handles invoice.payment_failed for non-existent subscription', async () => {
    if (skip()) return;

    const payload = buildWebhookEvent('invoice.payment_failed', {
      subscription: 'sub_nonexistent_xyz',
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

    // Should still return 200 (graceful no-op)
    expect(res.statusCode).toBe(200);
    expect(res.json().received).toBe(true);
  });

  it('acknowledges unknown event types without error', async () => {
    if (skip()) return;

    const payload = buildWebhookEvent('some.unknown.event', {
      id: 'obj_unknown',
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
  });
});

// ============================================================================
// POST /billing/portal
// ============================================================================

describe('POST /billing/portal', () => {
  it('returns 400 when user has no stripe_customer_id', async () => {
    if (skip()) return;

    // Ensure test user has no stripe customer
    server!.context.db.prepare(`UPDATE users SET stripe_customer_id = NULL WHERE id = ?`).run(TEST_USER_ID);

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/portal',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('No billing account');
  });

  it('creates portal session for user with stripe_customer_id', async () => {
    if (skip()) return;

    // Set stripe_customer_id on user
    server!.context.db.prepare(`UPDATE users SET stripe_customer_id = 'cus_portal_test' WHERE id = ?`).run(TEST_USER_ID);

    mockStripeApi((url) => {
      if (url.includes('/billing_portal/sessions')) {
        return mockFetchResponse({ url: 'https://billing.stripe.com/portal-session' });
      }
      return null;
    });

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/portal',
      headers: {
        authorization: `Bearer ${authToken}`,
        'content-type': 'application/json',
      },
      payload: { returnUrl: 'https://example.com/billing' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://billing.stripe.com/portal-session');

    // Clean up
    server!.context.db.prepare(`UPDATE users SET stripe_customer_id = NULL WHERE id = ?`).run(TEST_USER_ID);
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/billing/portal',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });
});
