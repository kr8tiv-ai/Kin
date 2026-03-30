/**
 * Billing Routes - Stripe subscription management
 *
 * Handles subscription status, Stripe checkout, billing portal, and webhooks.
 * Stripe SDK is not a declared dependency, so all Stripe API calls are made
 * via the native fetch API with the STRIPE_SECRET_KEY env var.
 * If STRIPE_SECRET_KEY is absent, checkout/portal return graceful stubs.
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { mintCompanionNFT } from '../lib/solana-mint.js';

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

async function stripeGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
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
// Stripe webhook signature verification (manual — no SDK)
// Spec: https://stripe.com/docs/webhooks/signatures
// ---------------------------------------------------------------------------
function verifyStripeSignature(
  payload: Buffer,
  header: string,
  secret: string,
): boolean {
  try {
    const parts: Record<string, string> = {};
    for (const part of header.split(',')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1);
      parts[k] = v;
    }

    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1) return false;

    // Reject if older than 5 minutes
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parseInt(timestamp, 10)) > 300) return false;

    const signedPayload = `${timestamp}.${payload.toString('utf-8')}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // v1 and expected are the same length (64 hex chars), safe to compare
    return crypto.timingSafeEqual(
      Buffer.from(v1, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route body / query types
// ---------------------------------------------------------------------------

interface CheckoutBody {
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface WebhookHeaders {
  'stripe-signature'?: string;
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
      priceId,
      successUrl = 'https://www.meetyourkin.com/billing/success',
      cancelUrl = 'https://www.meetyourkin.com/billing',
    } = request.body ?? {};

    if (!priceId) {
      reply.status(400);
      return { error: 'priceId is required' };
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
        // metadata sub-keys flattened as Stripe form-encoded key names
        'metadata[kin_user_id]': userId,
      }, key);

      customerId = customer.id as string;

      fastify.context.db.prepare(`
        UPDATE users SET stripe_customer_id = ? WHERE id = ?
      `).run(customerId, userId);
    }

    const session = await stripePost('/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[kin_user_id]': userId,
    }, key);

    return { url: session.url as string };
  });

  // -------------------------------------------------------------------------
  // POST /billing/webhook
  //
  // Stripe sends the raw request body for signature verification.
  // We register a content-type parser scoped to this plugin that captures the
  // raw Buffer, then parse JSON manually inside the handler.
  // -------------------------------------------------------------------------
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post<{ Headers: WebhookHeaders }>(
    '/billing/webhook',
    async (request, reply) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const sig = request.headers['stripe-signature'];

      // Ensure we have a Buffer (our content-type parser always produces one)
      const rawBody: Buffer = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(
            typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body),
          );

      // Signature verification
      if (webhookSecret && sig) {
        const isValid = verifyStripeSignature(rawBody, sig, webhookSecret);
        if (!isValid) {
          return reply.status(400).send({ error: 'Invalid Stripe signature' });
        }
      }

      let event: any;
      try {
        event = JSON.parse(rawBody.toString('utf-8'));
      } catch {
        return reply.status(400).send({ error: 'Invalid JSON body' });
      }

      const db = fastify.context.db;

      switch (event.type as string) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const kinUserId: string = session.metadata?.kin_user_id ?? '';
          const customerId: string = session.customer ?? '';
          const subscriptionId: string = session.subscription ?? '';

          // ── Handle companion mint payments ──
          if (session.metadata?.type === 'companion_mint') {
            const mintCompanionId: string = session.metadata.companion_id ?? '';
            const mintWallet: string = session.metadata.wallet_address ?? '';

            if (kinUserId && mintCompanionId && mintWallet) {
              try {
                // Attempt real Candy Machine mint (falls back to mock if CM not deployed)
                const mintResult = await mintCompanionNFT(mintCompanionId, mintWallet);
                const mintId = `nft-${crypto.randomUUID()}`;

                db.prepare(`
                  INSERT INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet, metadata_uri)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(mintId, kinUserId, mintCompanionId, mintResult.mintAddress, mintWallet, null);

                // Auto-claim companion if not already claimed
                const alreadyClaimed = db.prepare(`
                  SELECT 1 FROM user_companions WHERE user_id = ? AND companion_id = ?
                `).get(kinUserId, mintCompanionId);

                if (!alreadyClaimed) {
                  const ucId = `uc-${crypto.randomUUID()}`;
                  db.prepare(`
                    INSERT INTO user_companions (id, user_id, companion_id, nft_mint_address)
                    VALUES (?, ?, ?, ?)
                  `).run(ucId, kinUserId, mintCompanionId, mintResult.mintAddress);
                }

                console.log(`[Mint] Companion ${mintCompanionId} minted (${mintResult.source}) for user ${kinUserId} → ${mintResult.mintAddress.slice(0, 12)}...`);
              } catch (mintErr) {
                console.error('[Mint] Failed to mint companion:', mintErr);
              }
            }
            break;
          }

          if (!kinUserId || !subscriptionId) break;

          // Fetch the subscription to get period dates and plan
          const apiKey = stripeKey();
          let plan = 'pro';
          let periodStart: number | null = null;
          let periodEnd: number | null = null;

          if (apiKey) {
            try {
              const stripeSub = await stripeGet(`/subscriptions/${subscriptionId}`, apiKey);
              periodStart = ((stripeSub.current_period_start as number) ?? 0) * 1000;
              periodEnd = ((stripeSub.current_period_end as number) ?? 0) * 1000;
              const priceMeta = stripeSub.items?.data?.[0]?.price?.metadata?.plan as string | undefined;
              if (priceMeta) plan = priceMeta;
            } catch {
              // Non-fatal; continue with defaults
            }
          }

          const subId = `sub-${crypto.randomUUID()}`;
          db.prepare(`
            INSERT INTO subscriptions
              (id, user_id, stripe_subscription_id, stripe_customer_id, plan, status,
               current_period_start, current_period_end, cancel_at_period_end)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET
              stripe_subscription_id = excluded.stripe_subscription_id,
              stripe_customer_id     = excluded.stripe_customer_id,
              plan                   = excluded.plan,
              status                 = 'active',
              current_period_start   = excluded.current_period_start,
              current_period_end     = excluded.current_period_end,
              cancel_at_period_end   = 0,
              updated_at             = strftime('%s', 'now') * 1000
          `).run(subId, kinUserId, subscriptionId, customerId, plan, periodStart, periodEnd);

          if (plan === 'pro' || plan === 'enterprise') {
            db.prepare(`UPDATE users SET tier = ? WHERE id = ?`).run(plan, kinUserId);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const stripeSub = event.data.object;
          const subscriptionId: string = stripeSub.id;
          const subStatus: string = stripeSub.status;
          const cancelAtPeriodEnd: boolean = stripeSub.cancel_at_period_end;
          const periodStart: number = ((stripeSub.current_period_start as number) ?? 0) * 1000;
          const periodEnd: number = ((stripeSub.current_period_end as number) ?? 0) * 1000;

          db.prepare(`
            UPDATE subscriptions
            SET status               = ?,
                cancel_at_period_end = ?,
                current_period_start = ?,
                current_period_end   = ?,
                updated_at           = strftime('%s', 'now') * 1000
            WHERE stripe_subscription_id = ?
          `).run(
            subStatus,
            cancelAtPeriodEnd ? 1 : 0,
            periodStart,
            periodEnd,
            subscriptionId,
          );
          break;
        }

        case 'customer.subscription.deleted': {
          const stripeSub = event.data.object;
          const subscriptionId: string = stripeSub.id;

          // Find affected user before updating
          const affectedSub = db.prepare(`
            SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?
          `).get(subscriptionId) as any;

          db.prepare(`
            UPDATE subscriptions
            SET status     = 'canceled',
                plan       = 'free',
                updated_at = strftime('%s', 'now') * 1000
            WHERE stripe_subscription_id = ?
          `).run(subscriptionId);

          if (affectedSub?.user_id) {
            db.prepare(`UPDATE users SET tier = 'free' WHERE id = ?`).run(affectedSub.user_id);
          }
          break;
        }

        default:
          // Unknown event — acknowledge without processing
          break;
      }

      return { received: true };
    },
  );

  // -------------------------------------------------------------------------
  // POST /billing/mint-checkout — One-time payment to mint companion NFT
  //
  // Creates a Stripe checkout session for a one-time companion mint.
  // On payment success, webhook mints NFT to the user's auto-generated wallet.
  // Users don't need crypto knowledge — they just pay and get their companion.
  // -------------------------------------------------------------------------
  fastify.post<{ Body: MintCheckoutBody }>('/billing/mint-checkout', async (request, reply) => {
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
