/**
 * Referral Routes - User referral system
 *
 * Uses the `referrals` table from the schema.
 * One row per referral code header - a user may only hold one active code.
 * Each redemption is stored as its own row so multiple people can redeem the
 * same code and rewards can be tracked atomically.
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a short, URL-safe referral code: 8 uppercase alphanumeric chars */
function generateCode(): string {
  return crypto
    .randomBytes(6)
    .toString('base64url')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, '0');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedeemBody {
  code: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const referralRoutes: FastifyPluginAsync = async (fastify) => {
  // -------------------------------------------------------------------------
  // GET /referral - get user's referral code and stats
  // -------------------------------------------------------------------------
  fastify.get('/referral', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const ownRecord = fastify.context.db.prepare(`
      SELECT referral_code, created_at
      FROM referrals
      WHERE referrer_user_id = ? AND referred_user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `).get(userId) as any;

    if (!ownRecord) {
      return {
        referralCode: null,
        totalReferrals: 0,
        completedReferrals: 0,
        rewardsGranted: 0,
        createdAt: null,
      };
    }

    const stats = fastify.context.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN reward_granted = 1 THEN 1 ELSE 0 END) AS rewards
      FROM referrals
      WHERE referrer_user_id = ? AND referred_user_id IS NOT NULL
    `).get(userId) as any;

    return {
      referralCode: ownRecord.referral_code as string,
      totalReferrals: stats.total ?? 0,
      completedReferrals: stats.completed ?? 0,
      rewardsGranted: stats.rewards ?? 0,
      createdAt: new Date(ownRecord.created_at).toISOString(),
    };
  });

  // -------------------------------------------------------------------------
  // POST /referral/generate - create code if user doesn't have one
  // -------------------------------------------------------------------------
  fastify.post('/referral/generate', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;

    const existing = fastify.context.db.prepare(`
      SELECT referral_code FROM referrals
      WHERE referrer_user_id = ? AND referred_user_id IS NULL
      LIMIT 1
    `).get(userId) as any;

    if (existing) {
      return {
        referralCode: existing.referral_code,
        isNew: false,
      };
    }

    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 10) {
        reply.status(500);
        return { error: 'Failed to generate unique referral code' };
      }
      const collision = fastify.context.db.prepare(`
        SELECT 1 FROM referrals WHERE referral_code = ?
      `).get(code);
      if (!collision) break;
    } while (true);

    const id = `ref-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO referrals (id, referrer_user_id, referral_code, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, userId, code);

    reply.status(201);
    return { referralCode: code, isNew: true };
  });

  // -------------------------------------------------------------------------
  // POST /referral/redeem - redeem a referral code
  // -------------------------------------------------------------------------
  fastify.post<{ Body: RedeemBody }>('/referral/redeem', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { code } = request.body ?? {};

    if (!code?.trim()) {
      reply.status(400);
      return { error: 'code is required' };
    }

    const normalizedCode = code.trim().toUpperCase();
    const codeRecord = fastify.context.db.prepare(`
      SELECT id, referrer_user_id, status
      FROM referrals
      WHERE referral_code = ? AND referred_user_id IS NULL
      LIMIT 1
    `).get(normalizedCode) as any;

    if (!codeRecord) {
      reply.status(404);
      return { error: 'Referral code not found' };
    }

    if (codeRecord.referrer_user_id === userId) {
      reply.status(400);
      return { error: 'You cannot redeem your own referral code' };
    }

    const alreadyRedeemed = fastify.context.db.prepare(`
      SELECT 1 FROM referrals
      WHERE referred_user_id = ?
      LIMIT 1
    `).get(userId);

    if (alreadyRedeemed) {
      reply.status(409);
      return { error: 'You have already redeemed a referral code' };
    }

    if (codeRecord.status === 'expired') {
      reply.status(410);
      return { error: 'This referral code has expired' };
    }

    const REFERRER_BONUS_DAYS = 7;
    const REFERRED_BONUS_DAYS = 3;

    const grantFreeDays = (targetUserId: string, days: number) => {
      const existing = fastify.context.db.prepare(`
        SELECT free_until FROM users WHERE id = ?
      `).get(targetUserId) as { free_until: string | null } | undefined;

      const baseDate =
        existing?.free_until && new Date(existing.free_until) > new Date()
          ? new Date(existing.free_until)
          : new Date();

      const newFreeUntil = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

      fastify.context.db.prepare(`
        UPDATE users SET free_until = ? WHERE id = ?
      `).run(newFreeUntil.toISOString(), targetUserId);
    };

    const redeemReferral = fastify.context.db.transaction(() => {
      const id = `ref-${crypto.randomUUID()}`;
      const now = Date.now();

      fastify.context.db.prepare(`
        INSERT INTO referrals
          (id, referrer_user_id, referred_user_id, referral_code, status, completed_at, reward_granted)
        VALUES (?, ?, ?, ?, 'completed', ?, 1)
      `).run(id, codeRecord.referrer_user_id, userId, normalizedCode, now);

      grantFreeDays(codeRecord.referrer_user_id, REFERRER_BONUS_DAYS);
      grantFreeDays(userId, REFERRED_BONUS_DAYS);
    });

    try {
      redeemReferral();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('idx_referrals_referred_once') || message.includes('referred_user_id')) {
        reply.status(409);
        return { error: 'You have already redeemed a referral code' };
      }
      throw err;
    }

    return {
      success: true,
      message: 'Referral code redeemed successfully',
      referrerId: codeRecord.referrer_user_id,
      rewards: {
        referrerBonus: `${REFERRER_BONUS_DAYS} free days`,
        referredBonus: `${REFERRED_BONUS_DAYS} free days`,
      },
    };
  });

  // -------------------------------------------------------------------------
  // GET /referral/leaderboard - top 10 referrers (anonymized)
  // -------------------------------------------------------------------------
  fastify.get('/referral/leaderboard', async () => {
    const rows = fastify.context.db.prepare(`
      SELECT
        r.referrer_user_id,
        u.first_name,
        u.last_name,
        COUNT(r.id) AS referral_count
      FROM referrals r
      JOIN users u ON r.referrer_user_id = u.id
      WHERE r.referred_user_id IS NOT NULL
        AND r.status = 'completed'
      GROUP BY r.referrer_user_id
      ORDER BY referral_count DESC
      LIMIT 10
    `).all() as any[];

    const leaderboard = rows.map((row, index) => {
      const firstName: string = row.first_name ?? 'Anonymous';
      const lastInitial: string = row.last_name
        ? `${row.last_name.charAt(0).toUpperCase()}.`
        : '';

      return {
        rank: index + 1,
        displayName: lastInitial ? `${firstName} ${lastInitial}` : firstName,
        referralCount: row.referral_count,
      };
    });

    return { leaderboard };
  });
};

export default referralRoutes;
