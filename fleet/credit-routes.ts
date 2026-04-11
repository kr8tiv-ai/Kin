/**
 * Fleet Control Plane — Credit Management API Routes
 *
 * Fastify plugin providing operator-facing credit management endpoints.
 * All responses use camelCase keys (K005).
 *
 * Endpoints:
 *   GET    /fleet/credits/:userId         — Get credit balance for a user
 *   POST   /fleet/credits/:userId/add     — Add credits to a user's balance
 *   POST   /fleet/credits/:userId/set-tier — Change a user's credit tier
 *   GET    /fleet/credits/:userId/usage   — Get usage history for a user
 *   GET    /fleet/credits/summary         — Fleet-wide usage summary
 *
 * @module fleet/credit-routes
 */

import type { FastifyPluginAsync } from 'fastify';
import type { CreditDb } from './credit-db.js';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface CreditRouteOptions {
  creditDb: CreditDb;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TIERS = ['free', 'hatchling', 'elder', 'hero'] as const;

function isValidTier(value: unknown): value is string {
  return typeof value === 'string' && (VALID_TIERS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const creditRoutesPlugin: FastifyPluginAsync<CreditRouteOptions> = async (
  fastify,
  opts,
) => {
  const { creditDb } = opts;

  // =========================================================================
  // GET /fleet/credits/summary — fleet-wide usage summary
  // Must be registered BEFORE the :userId param routes to avoid
  // Fastify treating "summary" as a userId value.
  // =========================================================================

  fastify.get('/fleet/credits/summary', async (_request, reply) => {
    const balances = creditDb.listAllBalances();

    const byTier: Record<string, { count: number; totalBalanceUsd: number }> = {};
    let totalBalanceUsd = 0;

    for (const b of balances) {
      totalBalanceUsd += b.balanceUsd;
      const bucket = byTier[b.tier];
      if (bucket) {
        bucket.count += 1;
        bucket.totalBalanceUsd += b.balanceUsd;
      } else {
        byTier[b.tier] = { count: 1, totalBalanceUsd: b.balanceUsd };
      }
    }

    reply.status(200);
    return {
      totalUsers: balances.length,
      totalBalanceUsd,
      byTier,
    };
  });

  // =========================================================================
  // GET /fleet/credits/:userId — Get credit balance
  // =========================================================================

  fastify.get<{ Params: { userId: string } }>(
    '/fleet/credits/:userId',
    async (request, reply) => {
      const { userId } = request.params;
      const balance = creditDb.getBalance(userId);

      if (!balance) {
        reply.status(404);
        return { error: 'No credit balance found for user' };
      }

      return balance;
    },
  );

  // =========================================================================
  // POST /fleet/credits/:userId/add — Add credits
  // =========================================================================

  fastify.post<{
    Params: { userId: string };
    Body: { amount?: unknown };
  }>(
    '/fleet/credits/:userId/add',
    async (request, reply) => {
      const { userId } = request.params;
      const { amount } = request.body ?? {};

      // Validate amount is a positive number
      if (amount === undefined || amount === null) {
        reply.status(400);
        return { error: 'amount is required' };
      }

      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount)) {
        reply.status(400);
        return { error: 'amount must be a valid number' };
      }

      if (numAmount <= 0) {
        reply.status(400);
        return { error: 'amount must be greater than 0' };
      }

      const updated = creditDb.addCredits(userId, numAmount);
      return updated;
    },
  );

  // =========================================================================
  // POST /fleet/credits/:userId/set-tier — Change tier
  // =========================================================================

  fastify.post<{
    Params: { userId: string };
    Body: { tier?: unknown };
  }>(
    '/fleet/credits/:userId/set-tier',
    async (request, reply) => {
      const { userId } = request.params;
      const { tier } = request.body ?? {};

      if (!isValidTier(tier)) {
        reply.status(400);
        return {
          error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`,
        };
      }

      const updated = creditDb.setTier(userId, tier);
      return updated;
    },
  );

  // =========================================================================
  // GET /fleet/credits/:userId/usage — Usage history
  // =========================================================================

  fastify.get<{
    Params: { userId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    '/fleet/credits/:userId/usage',
    async (request, reply) => {
      const { userId } = request.params;
      const limit = Math.max(1, Math.min(1000, parseInt(request.query.limit ?? '50', 10) || 50));
      const offset = Math.max(0, parseInt(request.query.offset ?? '0', 10) || 0);

      const history = creditDb.getUsageHistory(userId, limit, offset);
      return history;
    },
  );
};

export default creditRoutesPlugin;
