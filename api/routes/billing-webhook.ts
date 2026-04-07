/**
 * Billing Webhook Routes — Stripe webhook ingestion
 *
 * Registered OUTSIDE the JWT-protected scope because Stripe authenticates
 * webhooks via its own `stripe-signature` header, not JWT.
 *
 * Handles: checkout.session.completed, customer.subscription.updated,
 *          customer.subscription.deleted
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { mintCompanionNFT } from '../lib/solana-mint.js';

// ---------------------------------------------------------------------------
// Lightweight Stripe HTTP helpers (mirrors billing.ts — no SDK dependency)
// ---------------------------------------------------------------------------

const STRIPE_API = 'https://api.stripe.com/v1';

function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY ?? null;
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
export function verifyStripeSignature(
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
// Resolve plan name from checkout session metadata, with Stripe API fallback
// ---------------------------------------------------------------------------
async function resolvePlan(
  session: any,
  subscriptionId: string,
): Promise<string> {
  // Primary: plan passed through checkout session metadata (set by T01 fix)
  const metaPlan = session.metadata?.plan;
  if (metaPlan && ['hatchling', 'elder', 'hero'].includes(metaPlan)) {
    return metaPlan;
  }

  // Fallback: fetch subscription from Stripe and read price metadata
  const apiKey = stripeKey();
  if (apiKey && subscriptionId) {
    try {
      const stripeSub = await stripeGet(`/subscriptions/${subscriptionId}`, apiKey);
      const priceMeta = stripeSub.items?.data?.[0]?.price?.metadata?.plan as string | undefined;
      if (priceMeta && ['hatchling', 'elder', 'hero'].includes(priceMeta)) {
        return priceMeta;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[billing-webhook] Failed to fetch subscription ${subscriptionId}: ${msg}`);
    }
  }

  // Last resort
  return 'hatchling';
}

// ---------------------------------------------------------------------------
// Resolve subscription period dates from Stripe API
// ---------------------------------------------------------------------------
async function resolveSubscriptionPeriod(
  subscriptionId: string,
): Promise<{ periodStart: number | null; periodEnd: number | null }> {
  const apiKey = stripeKey();
  if (!apiKey || !subscriptionId) {
    return { periodStart: null, periodEnd: null };
  }

  try {
    const stripeSub = await stripeGet(`/subscriptions/${subscriptionId}`, apiKey);
    return {
      periodStart: ((stripeSub.current_period_start as number) ?? 0) * 1000,
      periodEnd: ((stripeSub.current_period_end as number) ?? 0) * 1000,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[billing-webhook] Failed to fetch subscription period for ${subscriptionId}: ${msg}`);
    return { periodStart: null, periodEnd: null };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookHeaders {
  'stripe-signature'?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const billingWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Register a raw-buffer content-type parser scoped to this plugin so we
  // can verify the Stripe signature against the raw body bytes.
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

                // Save wallet address to user account for future NFT lookups
                try {
                  db.prepare(`
                    UPDATE users SET wallet_address = COALESCE(wallet_address, ?) WHERE id = ? AND wallet_address IS NULL
                  `).run(mintWallet, kinUserId);
                } catch { /* wallet_address column may not exist yet */ }

                console.log(`[Mint] Companion ${mintCompanionId} minted (${mintResult.source}) for user ${kinUserId} → ${mintResult.mintAddress.slice(0, 12)}...`);
              } catch (mintErr) {
                console.error('[Mint] Failed to mint companion:', mintErr);
              }
            }
            break;
          }

          // ── Handle skill request payments ──
          if (session.metadata?.type === 'skill_request') {
            const skillRequestId: string = session.metadata.skill_request_id ?? '';
            if (kinUserId && skillRequestId) {
              db.prepare(`
                UPDATE skill_requests
                SET status = 'paid', updated_at = strftime('%s', 'now') * 1000
                WHERE id = ? AND user_id = ? AND status = 'payment_required'
              `).run(skillRequestId, kinUserId);
              console.log(`[Skills] Request ${skillRequestId} paid by user ${kinUserId}`);
            }
            break;
          }

          // ── Handle NFT rebinding payments ──
          if (session.metadata?.type === 'rebind_nft') {
            const mintAddress: string = session.metadata.mint_address ?? '';
            const companionId: string = session.metadata.companion_id ?? '';

            if (kinUserId && mintAddress) {
              // Idempotent: only transition from pending_payment → processing
              const updated = db.prepare(`
                UPDATE nft_rebindings
                SET status = 'processing',
                    to_user_id = ?
                WHERE nft_mint_address = ?
                  AND stripe_session_id = ?
                  AND status = 'pending_payment'
              `).run(kinUserId, mintAddress, session.id);

              if (updated.changes > 0) {
                console.log(`[Rebind] Payment confirmed for mint ${mintAddress}, companion ${companionId}, new owner ${kinUserId}`);
              } else {
                // Already processed or no matching row — idempotent, log and continue
                console.log(`[Rebind] Duplicate/stale webhook for mint ${mintAddress} session ${session.id} — no-op`);
              }
            }
            break;
          }

          if (!kinUserId || !subscriptionId) break;

          // Resolve plan from session metadata → Stripe API → default
          const plan = await resolvePlan(session, subscriptionId);
          const { periodStart, periodEnd } = await resolveSubscriptionPeriod(subscriptionId);

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

          if (plan === 'hatchling' || plan === 'elder' || plan === 'hero') {
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

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const failedSubId: string = invoice.subscription ?? '';

          if (failedSubId) {
            db.prepare(`
              UPDATE subscriptions
              SET status     = 'past_due',
                  updated_at = strftime('%s', 'now') * 1000
              WHERE stripe_subscription_id = ?
            `).run(failedSubId);

            console.warn(`[billing-webhook] Payment failed for subscription ${failedSubId}, marked past_due`);
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
};

export default billingWebhookRoutes;
