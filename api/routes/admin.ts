/**
 * Admin Routes - Platform administration dashboard API
 *
 * All routes are protected by an admin check:
 *   - user.tier === 'hero', OR
 *   - user.userId is listed in the ADMIN_USER_IDS env var (comma-separated)
 *
 * Returns 403 for non-admin callers.
 */

import { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../lib/admin.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserIdParams {
  userId: string;
}

interface ListQuery {
  limit?: number;
  offset?: number;
}

interface TierBody {
  tier: 'free' | 'hatchling' | 'elder' | 'hero';
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const adminRoutes: FastifyPluginAsync = async (fastify) => {

  // -------------------------------------------------------------------------
  // GET /admin/stats — platform overview
  // -------------------------------------------------------------------------
  fastify.get('/admin/stats', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const db = fastify.context.db;

    // Single compound query replaces 5 separate COUNT queries
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(DISTINCT m.conversation_id)
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.timestamp >= ?) AS active_today,
        (SELECT COUNT(*) FROM messages) AS total_messages,
        (SELECT COUNT(*) FROM projects) AS total_projects,
        (SELECT COUNT(*) FROM subscriptions
         WHERE plan != 'free' AND status IN ('active', 'trialing')) AS paid_subs
    `).get(oneDayAgo) as any;

    return {
      totalUsers: stats.total_users,
      activeToday: stats.active_today,
      totalMessages: stats.total_messages,
      totalProjects: stats.total_projects,
      paidSubscriptions: stats.paid_subs,
    };
  });

  // -------------------------------------------------------------------------
  // GET /admin/users — paginated user list
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: ListQuery }>('/admin/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const db = fastify.context.db;
    const rawLimit = Number(request.query.limit ?? 50);
    const rawOffset = Number(request.query.offset ?? 0);
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const offset = Math.max(rawOffset, 0);

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as any).c;

    const rows = db.prepare(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.username,
        u.tier,
        u.created_at,
        u.updated_at,
        (
          SELECT MAX(m.timestamp)
          FROM messages m
          JOIN conversations cv ON m.conversation_id = cv.id
          WHERE cv.user_id = u.id
        ) AS last_active,
        (
          SELECT COUNT(*)
          FROM messages m
          JOIN conversations cv ON m.conversation_id = cv.id
          WHERE cv.user_id = u.id
        ) AS message_count
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const users = rows.map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' '),
      username: u.username ?? null,
      tier: u.tier,
      messageCount: u.message_count ?? 0,
      lastActive: u.last_active ? new Date(u.last_active).toISOString() : null,
      createdAt: new Date(u.created_at).toISOString(),
    }));

    return { users, pagination: { total, limit, offset } };
  });

  // -------------------------------------------------------------------------
  // GET /admin/users/:userId — full user detail
  // -------------------------------------------------------------------------
  fastify.get<{ Params: UserIdParams }>('/admin/users/:userId', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const db = fastify.context.db;
    const { userId } = request.params;

    const user = db.prepare(`
      SELECT
        u.*,
        (
          SELECT COUNT(*)
          FROM messages m
          JOIN conversations cv ON m.conversation_id = cv.id
          WHERE cv.user_id = u.id
        ) AS message_count
      FROM users u
      WHERE u.id = ?
    `).get(userId) as any;

    if (!user) {
      reply.status(404);
      return { error: 'User not found' };
    }

    const conversations = db.prepare(`
      SELECT id, companion_id, title, created_at, updated_at
      FROM conversations WHERE user_id = ?
      ORDER BY updated_at DESC LIMIT 20
    `).all(userId) as any[];

    const projects = db.prepare(`
      SELECT id, name, project_type, status, deploy_url, created_at
      FROM projects WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).all(userId) as any[];

    const subscription = db.prepare(`
      SELECT plan, status, current_period_end, cancel_at_period_end
      FROM subscriptions WHERE user_id = ?
    `).get(userId) as any;

    const tickets = db.prepare(`
      SELECT id, subject, status, priority, created_at
      FROM support_tickets WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(userId) as any[];

    const referral = db.prepare(`
      SELECT referral_code,
        (SELECT COUNT(*) FROM referrals r2
         WHERE r2.referrer_user_id = ? AND r2.referred_user_id IS NOT NULL) AS total_referrals
      FROM referrals
      WHERE referrer_user_id = ? AND referred_user_id IS NULL
      LIMIT 1
    `).get(userId, userId) as any;

    return {
      user: {
        id: user.id,
        name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        username: user.username ?? null,
        tier: user.tier,
        messageCount: user.message_count ?? 0,
        stripeCustomerId: user.stripe_customer_id ?? null,
        createdAt: new Date(user.created_at).toISOString(),
        updatedAt: new Date(user.updated_at).toISOString(),
      },
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end
              ? new Date(subscription.current_period_end).toISOString()
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
          }
        : null,
      conversations: conversations.map((c) => ({
        id: c.id,
        companionId: c.companion_id,
        title: c.title ?? null,
        updatedAt: new Date(c.updated_at).toISOString(),
      })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.project_type,
        status: p.status,
        deployUrl: p.deploy_url ?? null,
        createdAt: new Date(p.created_at).toISOString(),
      })),
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: new Date(t.created_at).toISOString(),
      })),
      referral: referral
        ? {
            code: referral.referral_code,
            totalReferrals: referral.total_referrals ?? 0,
          }
        : null,
    };
  });

  // -------------------------------------------------------------------------
  // POST /admin/users/:userId/tier — update user tier
  // -------------------------------------------------------------------------
  fastify.post<{ Params: UserIdParams; Body: TierBody }>(
    '/admin/users/:userId/tier',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;

      const db = fastify.context.db;
      const { userId } = request.params;
      const { tier } = request.body ?? {};

      const validTiers = ['free', 'hatchling', 'elder', 'hero'];
      if (!tier || !validTiers.includes(tier)) {
        reply.status(400);
        return { error: `tier must be one of: ${validTiers.join(', ')}` };
      }

      const result = db.prepare(`
        UPDATE users SET tier = ?, updated_at = strftime('%s', 'now') * 1000 WHERE id = ?
      `).run(tier, userId);

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'User not found' };
      }

      // Sync subscription plan if record exists
      db.prepare(`
        UPDATE subscriptions
        SET plan       = ?,
            updated_at = strftime('%s', 'now') * 1000
        WHERE user_id = ?
      `).run(tier, userId);

      return { success: true, userId, tier };
    },
  );

  // -------------------------------------------------------------------------
  // GET /admin/companions — companion usage stats
  // -------------------------------------------------------------------------
  fastify.get('/admin/companions', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const db = fastify.context.db;

    const rows = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.type,
        c.specialization,
        COUNT(DISTINCT cv.user_id) AS unique_users,
        COUNT(DISTINCT cv.id) AS conversation_count,
        COUNT(m.id) AS message_count
      FROM companions c
      LEFT JOIN conversations cv ON c.id = cv.companion_id
      LEFT JOIN messages m ON cv.id = m.conversation_id
      GROUP BY c.id
      ORDER BY message_count DESC
    `).all() as any[];

    return {
      companions: rows.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        specialization: c.specialization,
        uniqueUsers: c.unique_users ?? 0,
        conversationCount: c.conversation_count ?? 0,
        messageCount: c.message_count ?? 0,
      })),
    };
  });

  // -------------------------------------------------------------------------
  // GET /admin/errors — recent errors from kin_status_records
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: ListQuery }>('/admin/errors', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const db = fastify.context.db;
    const rawLimit = Number(request.query.limit ?? 50);
    const rawOffset = Number(request.query.offset ?? 0);
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const offset = Math.max(rawOffset, 0);

    const total = (db.prepare(`
      SELECT COUNT(*) AS c FROM kin_status_records WHERE error_count > 0
    `).get() as any).c;

    const rows = db.prepare(`
      SELECT
        ksr.id,
        ksr.kin_id,
        ksr.companion_id,
        c.name AS companion_name,
        ksr.status,
        ksr.error_count,
        ksr.last_error,
        ksr.health_score,
        ksr.drift_score,
        ksr.recorded_at
      FROM kin_status_records ksr
      LEFT JOIN companions c ON ksr.companion_id = c.id
      WHERE ksr.error_count > 0
      ORDER BY ksr.recorded_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return {
      errors: rows.map((r) => ({
        id: r.id,
        kinId: r.kin_id,
        companionId: r.companion_id,
        companionName: r.companion_name ?? r.companion_id,
        status: r.status,
        errorCount: r.error_count,
        lastError: r.last_error ?? null,
        healthScore: r.health_score,
        driftScore: r.drift_score,
        recordedAt: new Date(r.recorded_at).toISOString(),
      })),
      pagination: { total, limit, offset },
    };
  });
};

export default adminRoutes;
