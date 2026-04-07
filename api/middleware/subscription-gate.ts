/**
 * Subscription-Gating Middleware — Tier enforcement for KIN platform
 *
 * Enforces subscription-level access to premium routes and message limits
 * for free-tier users. Checks the `subscriptions` table first, then falls
 * back to `nft_ownership` for NFT holders.
 *
 * Usage:
 *   fastify.get('/frontier', { preHandler: [requireFrontierAccess()] }, handler)
 *   fastify.post('/chat',    { preHandler: [enforceMessageLimit()] }, handler)
 *   fastify.get('/premium',  { preHandler: [requireSubscription('elder')] }, handler)
 *
 * Tier ranking: free(0) < hatchling(1) < elder(2) < hero(3) = nft(3)
 *
 * @module api/middleware/subscription-gate
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// Types
// ============================================================================

export type UserTier = 'free' | 'hatchling' | 'elder' | 'hero' | 'nft';

// ============================================================================
// Plan Ranking
// ============================================================================

/** Numeric rank for tier comparison. Higher = more access. */
export const PLAN_RANK: Record<string, number> = {
  free: 0,
  hatchling: 1,
  elder: 2,
  hero: 3,
  nft: 3,
};

// ============================================================================
// Pure helper: loadUserTier
// ============================================================================

/**
 * Resolve a user's effective tier from subscriptions and NFT ownership.
 *
 * 1. Check `subscriptions` for active/trialing/past_due subscription → plan name
 * 2. If no qualifying subscription, check `nft_ownership` for any NFT → 'nft'
 * 3. Otherwise → 'free'
 *
 * Canceled subscriptions are treated as no subscription.
 */
export function loadUserTier(db: any, userId: string): UserTier {
  // 1. Check for active subscription (active, trialing, past_due — NOT canceled)
  const sub = db.prepare(
    `SELECT plan FROM subscriptions
     WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due')
     LIMIT 1`
  ).get(userId) as { plan: string } | undefined;

  if (sub) {
    return sub.plan as UserTier;
  }

  // 2. Check for NFT ownership (any NFT = hero-equivalent access)
  const nft = db.prepare(
    `SELECT 1 FROM nft_ownership WHERE user_id = ? LIMIT 1`
  ).get(userId);

  if (nft) {
    return 'nft';
  }

  // 3. No subscription, no NFT → free
  return 'free';
}

// ============================================================================
// preHandler factory: requireSubscription
// ============================================================================

/**
 * Require a minimum subscription tier.
 *
 * @param minPlan - Minimum plan required (e.g., 'hatchling', 'elder', 'hero')
 * @returns Fastify preHandler
 */
export function requireSubscription(minPlan: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { userId: string })?.userId;
    if (!userId) {
      reply.status(401);
      return reply.send({ error: 'Authentication required' });
    }

    const db = (request.server as any).context?.db;
    if (!db) {
      // Dev fallback: no DB means allow through
      return;
    }

    const tier = loadUserTier(db, userId);
    const userRank = PLAN_RANK[tier] ?? 0;
    const requiredRank = PLAN_RANK[minPlan] ?? 0;

    if (userRank < requiredRank) {
      reply.status(403);
      return reply.send({
        error: `This feature requires a ${minPlan} plan or higher`,
        code: 'UPGRADE_REQUIRED',
        currentPlan: tier,
        requiredPlan: minPlan,
      });
    }

    // Tier check passed — continue to handler
  };
}

// ============================================================================
// preHandler factory: requireFrontierAccess
// ============================================================================

/**
 * Shorthand: require at least hatchling tier (any paid plan or NFT holder).
 * @returns Fastify preHandler
 */
export function requireFrontierAccess() {
  return requireSubscription('hatchling');
}

// ============================================================================
// preHandler factory: enforceMessageLimit
// ============================================================================

/** Free-tier daily message limit */
const FREE_MESSAGE_LIMIT = 50;

/**
 * Enforce daily message limit for free-tier users.
 *
 * Counts today's user messages (UTC midnight boundary) across all conversations.
 * Paid and NFT users bypass the check entirely.
 *
 * @returns Fastify preHandler
 */
export function enforceMessageLimit() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { userId: string })?.userId;
    if (!userId) {
      reply.status(401);
      return reply.send({ error: 'Authentication required' });
    }

    const db = (request.server as any).context?.db;
    if (!db) {
      return;
    }

    const tier = loadUserTier(db, userId);

    // Paid users and NFT holders skip message limit entirely
    if (tier !== 'free') {
      return;
    }

    // Calculate UTC midnight boundary
    const now = new Date();
    const utcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );

    // Count today's user messages across all conversations owned by this user
    const result = db.prepare(
      `SELECT COUNT(*) as count FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_id = ? AND m.role = 'user' AND m.timestamp >= ?`
    ).get(userId, utcMidnight) as { count: number };

    const used = result?.count ?? 0;

    if (used >= FREE_MESSAGE_LIMIT) {
      // Calculate next UTC midnight for reset time
      const tomorrow = new Date(utcMidnight + 24 * 60 * 60 * 1000);
      const resetsAt = tomorrow.toISOString();

      reply.status(429);
      return reply.send({
        error: 'Daily message limit reached. Upgrade your plan for unlimited messages.',
        code: 'MESSAGE_LIMIT_REACHED',
        limit: FREE_MESSAGE_LIMIT,
        used,
        resetsAt,
      });
    }

    // Under limit — continue to handler
  };
}
