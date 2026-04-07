/**
 * Billing Routes - Stripe subscription management
 *
 * Handles subscription status, Stripe checkout, billing portal, NFT mint checkout,
 * and NFT rebinding checkout.
 * Webhook handling is in billing-webhook.ts (registered outside JWT scope).
 * Stripe SDK is not a declared dependency, so all Stripe API calls are made
 * via the native fetch API with the STRIPE_SECRET_KEY env var.
 * If STRIPE_SECRET_KEY is absent, checkout/portal return graceful stubs.
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
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

interface RebindCheckoutBody {
  mintAddress: string;
  successUrl?: string;
  cancelUrl?: string;
}

// Companion mint price in cents (USD)
const COMPANION_MINT_PRICE_CENTS = 999; // $9.99

// Rebinding price in cents (USD)
const REBIND_PRICE_CENTS = 14900; // $149.00

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
      WHERE c.user_id = ? AND m.role = 'user' AND m.timestamp >= ? * 1000
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

  // -------------------------------------------------------------------------
  // POST /nft/rebind-checkout — One-time payment to rebind a companion NFT
  //
  // After secondary-market transfer, the new owner pays $149 to rebind the
  // companion. Old owner's private data is wiped, portable skills transfer,
  // and the new owner gets a re-onboarding prompt.
  // -------------------------------------------------------------------------
  fastify.post<{ Body: RebindCheckoutBody }>('/nft/rebind-checkout', async (request, reply) => {
    const key = stripeKey();
    if (!key) {
      return { url: null, message: 'Payments coming soon' };
    }

    const userId = (request.user as { userId: string }).userId;
    const {
      mintAddress,
      successUrl = 'https://www.meetyourkin.com/dashboard?rebound=true',
      cancelUrl = 'https://www.meetyourkin.com/companions',
    } = request.body ?? {};

    if (!mintAddress) {
      reply.status(400);
      return { error: 'mintAddress is required' };
    }

    // Verify the NFT exists
    const nft = fastify.context.db.prepare(`
      SELECT user_id, companion_id FROM nft_ownership WHERE mint_address = ?
    `).get(mintAddress) as { user_id: string; companion_id: string } | undefined;

    if (!nft) {
      reply.status(404);
      return { error: 'NFT not found for the given mint address' };
    }

    // Caller must NOT be the current owner (new owner initiates rebinding)
    if (nft.user_id === userId) {
      reply.status(409);
      return { error: 'You already own this companion — rebinding is for new owners after transfer' };
    }

    // Check no active rebinding already in progress for this mint address
    const activeRebinding = fastify.context.db.prepare(`
      SELECT id FROM nft_rebindings
      WHERE nft_mint_address = ? AND status NOT IN ('complete', 'failed')
    `).get(mintAddress) as { id: string } | undefined;

    if (activeRebinding) {
      reply.status(409);
      return { error: 'A rebinding is already in progress for this companion' };
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

    // Create one-time payment checkout session for rebinding
    let session: any;
    try {
      session = await stripePost('/checkout/sessions', {
        mode: 'payment',
        customer: customerId,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `KIN Rebinding — ${nft.companion_id.charAt(0).toUpperCase() + nft.companion_id.slice(1)}`,
        'line_items[0][price_data][product_data][description]': 'Rebind your new companion. Skills transfer, fresh start.',
        'line_items[0][price_data][unit_amount]': REBIND_PRICE_CENTS,
        'line_items[0][quantity]': 1,
        success_url: successUrl,
        cancel_url: cancelUrl,
        'metadata[kin_user_id]': userId,
        'metadata[companion_id]': nft.companion_id,
        'metadata[mint_address]': mintAddress,
        'metadata[from_user_id]': nft.user_id,
        'metadata[type]': 'rebind_nft',
      }, key);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = err?.statusCode ?? 502;
      console.error(`[Rebind] Stripe checkout failed for mint ${mintAddress}: ${msg}`);
      reply.status(status >= 500 ? 502 : status);
      return { error: `Payment service error: ${msg}` };
    }

    if (!session?.url) {
      reply.status(502);
      return { error: 'Payment service returned an invalid response' };
    }

    // Insert nft_rebindings row
    const rebindingId = `rebind-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO nft_rebindings (id, nft_mint_address, companion_id, from_user_id, to_user_id, status, stripe_session_id)
      VALUES (?, ?, ?, ?, ?, 'pending_payment', ?)
    `).run(rebindingId, mintAddress, nft.companion_id, nft.user_id, userId, session.id);

    console.log(`[Rebind] Checkout initiated for mint ${mintAddress} by user ${userId} (rebindingId: ${rebindingId})`);

    return { url: session.url as string, rebindingId };
  });
};

export default billingRoutes;
