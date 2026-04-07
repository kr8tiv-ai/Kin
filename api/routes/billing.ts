/**
 * Billing Routes - Stripe subscription management
 *
 * Handles subscription status, Stripe checkout, billing portal, and NFT mint checkout.
 * Webhook handling is in billing-webhook.ts (registered outside JWT scope).
 * Stripe SDK is not a declared dependency, so all Stripe API calls are made
 * via the native fetch API with the STRIPE_SECRET_KEY env var.
 * If STRIPE_SECRET_KEY is absent, checkout/portal return graceful stubs.
 */

import { FastifyPluginAsync } from 'fastify';
import { mintRateLimit } from '../middleware/rate-limit.js';

// ---------------------------------------------------------------------------
// Lightweight Stripe HTTP helpers (no SDK dependency)
// ---------------------------------------------------------------------------

const STRIPE_API = 'https://api.stripe.com/v1';

function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY ?? null;
}

async function stripePost(
  path: string,
  body: Record<string, string | number | boolean | undefined>,
  key: string,
): Promise<any> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) params.append(k, String(v));
  }

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const json = await res.json() as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe error ${res.status}`;
    const err = new Error(msg) as any;
    err.statusCode = res.status;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Tier → Price ID resolution (server-side, avoids leaking Stripe IDs)
// ---------------------------------------------------------------------------

const VALID_TIERS = ['hatchling', 'elder', 'hero'] as const;
type TierName = typeof VALID_TIERS[number];

const TIER_ENV_MAP: Record<TierName, string> = {
  hatchling: 'STRIPE_HATCHLING_PRICE_ID',
  elder: 'STRIPE_ELDER_PRICE_ID',
  hero: 'STRIPE_HERO_PRICE_ID',
};

/**
 * Resolve a tier name (e.g. 'hatchling', 'elder-monthly') to a Stripe priceId
 * from env vars. Strips common suffixes like '-monthly' for flexibility.
 * Returns null if the tier is unknown or the env var is not set.
 */
function resolvePriceId(tier: string): string | null {
  // Normalize: strip common suffixes like '-monthly'
  const bare = tier.replace(/-monthly$/, '') as TierName;
  if (!VALID_TIERS.includes(bare)) return null;
  return process.env[TIER_ENV_MAP[bare]] ?? null;
}

/**
 * Reverse-map a Stripe priceId to the plan name (hatchling/elder/hero).
 * Uses STRIPE_*_PRICE_ID env vars. Returns null if no match found.
 */
function resolvePlanFromPriceId(priceId: string): string | null {
  const mapping: Record<string, string> = {};
  if (process.env.STRIPE_HATCHLING_PRICE_ID) mapping[process.env.STRIPE_HATCHLING_PRICE_ID] = 'hatchling';
  if (process.env.STRIPE_ELDER_PRICE_ID) mapping[process.env.STRIPE_ELDER_PRICE_ID] = 'elder';
  if (process.env.STRIPE_HERO_PRICE_ID) mapping[process.env.STRIPE_HERO_PRICE_ID] = 'hero';
  return mapping[priceId] ?? null;
}

// ---------------------------------------------------------------------------
// Route body / query types
// ---------------------------------------------------------------------------

interface CheckoutBody {
  tier?: string;
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface PortalBody {
  returnUrl?: string;
}

interface MintCheckoutBody {
  companionId: string;
  walletAddress: string;
  successUrl?: string;
  cancelUrl?: string;
}

// Companion mint price in cents (USD)
const COMPANION_MINT_PRICE_CENTS = 999; // $9.99

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const billingRoutes: FastifyPluginAsync = async (fastify) => {

  // -------------------------------------------------------------------------
  // GET /billing/status
  // -------------------------------------------------------------------------
  fastify.get('/billing/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const sub = fastify.context.db.prepare(`
      SELECT
        plan,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        stripe_subscription_id
      FROM subscriptions
      WHERE user_id = ?
    `).get(userId) as any;

    // Compute live usage stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const messagesToday = (fastify.context.db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ? AND m.role = 'user' AND m.created_at >= datetime(?, 'unixepoch')
    `).get(userId, Math.floor(todayStart.getTime() / 1000)) as any)?.count ?? 0;

    const activeCompanions = (fastify.context.db.prepare(`
      SELECT COUNT(DISTINCT companion_id) as count FROM user_companions WHERE user_id = ?
    `).get(userId) as any)?.count ?? 1;

    const apiCalls = (fastify.context.db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ? AND m.role = 'assistant'
    `).get(userId) as any)?.count ?? 0;

    const usage = { messagesToday, activeCompanions, apiCalls };

    if (!sub) {
      return {
        plan: 'free',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: null,
        usage,
      };
    }

    return {
      plan: sub.plan,
      status: sub.status,
      currentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start).toISOString()
        : null,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end).toISOString()
        : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end === 1,
      stripeSubscriptionId: sub.stripe_subscription_id ?? null,
      usage,
    };
  });

  // -------------------------------------------------------------------------
  // POST /billing/checkout
  // -------------------------------------------------------------------------
  fastify.post<{ Body: CheckoutBody }>('/billing/checkout', async (request, reply) => {
    const key = stripeKey();
    if (!key) {
      return { url: null, message: 'Payments coming soon' };
    }

    const userId = (request.user as { userId: string }).userId;
    const {
      tier,
      priceId: rawPriceId,
      successUrl = 'https://www.meetyourkin.com/billing/success',
      cancelUrl = 'https://www.meetyourkin.com/billing',
    } = request.body ?? {};

    // Resolve priceId: prefer tier (server-side), fall back to raw priceId
    let resolvedPriceId: string | null = null;
    let plan: string | null = null;

    if (tier) {
      resolvedPriceId = resolvePriceId(tier);
      if (!resolvedPriceId) {
        reply.status(400);
        return { error: `Invalid tier: '${tier}'. Valid tiers: hatchling, elder, hero` };
      }
      plan = tier.replace(/-monthly$/, '');
    } else if (rawPriceId) {
      // Backward compatibility: accept raw priceId from older clients
      resolvedPriceId = rawPriceId;
      plan = resolvePlanFromPriceId(rawPriceId);
    }

    if (!resolvedPriceId) {
      reply.status(400);
      return { error: 'tier or priceId is required' };
    }

    // Get or create Stripe customer (also fetch genesis_discount)
    const user = fastify.context.db.prepare(`
      SELECT id, first_name, last_name, stripe_customer_id, genesis_discount
      FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      reply.status(404);
      return { error: 'User not found' };
    }

    let customerId: string = user.stripe_customer_id ?? '';

    if (!customerId) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      const customer = await stripePost('/customers', {
        name: fullName,
        'metadata[kin_user_id]': userId,
      }, key);

      customerId = customer.id as string;

      fastify.context.db.prepare(`
        UPDATE users SET stripe_customer_id = ? WHERE id = ?
      `).run(customerId, userId);
    }

    // Genesis discount: create a one-time Stripe coupon if user has genesis_discount > 0
    let couponId: string | null = null;
    const genesisDiscount: number = user.genesis_discount ?? 0;

    if (genesisDiscount > 0) {
      try {
        const coupon = await stripePost('/coupons', {
          percent_off: genesisDiscount,
          duration: 'forever',
          'metadata[kin_user_id]': userId,
          'metadata[type]': 'genesis_discount',
        }, key);
        couponId = coupon.id as string;
      } catch (couponErr) {
        // Non-blocking: proceed without discount if coupon creation fails
        const msg = couponErr instanceof Error ? couponErr.message : String(couponErr);
        console.warn(`[billing] Failed to create Genesis coupon for user ${userId}: ${msg}`);
      }
    }

    const sessionParams: Record<string, string | number | boolean | undefined> = {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': resolvedPriceId,
      'line_items[0][quantity]': 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[kin_user_id]': userId,
      ...(plan ? { 'metadata[plan]': plan } : {}),
    };

    if (couponId) {
      sessionParams['discounts[0][coupon]'] = couponId;
    }

    const session = await stripePost('/checkout/sessions', sessionParams, key);

    return { url: session.url as string };
  });

  // -------------------------------------------------------------------------
  // POST /billing/mint-checkout — One-time payment to mint companion NFT
  //
  // Creates a Stripe checkout session for a one-time companion mint.
  // On payment success, webhook mints NFT to the user's auto-generated wallet.
  // Users don't need crypto knowledge — they just pay and get their companion.
  // -------------------------------------------------------------------------
  fastify.post<{ Body: MintCheckoutBody }>('/billing/mint-checkout', { preHandler: [mintRateLimit()] }, async (request, reply) => {
    const key = stripeKey();
    if (!key) {
      return { url: null, message: 'Payments coming soon' };
    }

    const userId = (request.user as { userId: string }).userId;
    const {
      companionId,
      walletAddress,
      successUrl = 'https://www.meetyourkin.com/dashboard?minted=true',
      cancelUrl = 'https://www.meetyourkin.com/companions',
    } = request.body ?? {};

    if (!companionId || !walletAddress) {
      reply.status(400);
      return { error: 'companionId and walletAddress are required' };
    }

    // Check if companion already minted by this user
    const existing = fastify.context.db.prepare(`
      SELECT 1 FROM nft_ownership WHERE user_id = ? AND companion_id = ?
    `).get(userId, companionId);

    if (existing) {
      reply.status(409);
      return { error: 'You already own this companion' };
    }

    // Get or create Stripe customer
    const user = fastify.context.db.prepare(`
      SELECT id, first_name, last_name, stripe_customer_id FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      reply.status(404);
      return { error: 'User not found' };
    }

    let customerId: string = user.stripe_customer_id ?? '';

    if (!customerId) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      const customer = await stripePost('/customers', {
        name: fullName,
        'metadata[kin_user_id]': userId,
      }, key);
      customerId = customer.id as string;
      fastify.context.db.prepare(`
        UPDATE users SET stripe_customer_id = ? WHERE id = ?
      `).run(customerId, userId);
    }

    // Create one-time payment checkout session
    const session = await stripePost('/checkout/sessions', {
      mode: 'payment',
      customer: customerId,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `KIN Companion — ${companionId.charAt(0).toUpperCase() + companionId.slice(1)}`,
      'line_items[0][price_data][product_data][description]': 'Your AI companion NFT. Yours forever.',
      'line_items[0][price_data][unit_amount]': COMPANION_MINT_PRICE_CENTS,
      'line_items[0][quantity]': 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[kin_user_id]': userId,
      'metadata[companion_id]': companionId,
      'metadata[wallet_address]': walletAddress,
      'metadata[type]': 'companion_mint',
    }, key);

    return { url: session.url as string };
  });

  // -------------------------------------------------------------------------
  // POST /billing/portal
  // -------------------------------------------------------------------------
  fastify.post<{ Body: PortalBody }>('/billing/portal', async (request, reply) => {
    const key = stripeKey();
    if (!key) {
      return { url: null, message: 'Payments coming soon' };
    }

    const userId = (request.user as { userId: string }).userId;
    const { returnUrl = 'https://www.meetyourkin.com/billing' } = request.body ?? {};

    const user = fastify.context.db.prepare(`
      SELECT stripe_customer_id FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user?.stripe_customer_id) {
      reply.status(400);
      return { error: 'No billing account found. Please subscribe first.' };
    }

    const portalSession = await stripePost('/billing_portal/sessions', {
      customer: user.stripe_customer_id as string,
      return_url: returnUrl,
    }, key);

    return { url: portalSession.url as string };
  });
};

export default billingRoutes;
