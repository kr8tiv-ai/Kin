/**
 * Skills Marketplace Routes
 *
 * Browse, toggle, and install skills per companion.
 * Users can also submit GitHub repos as custom skill requests
 * with a $4.99 review fee handled via Stripe.
 *
 * GET    /skills                    Public catalog (approved skills)
 * GET    /skills/mine               User's installed skills
 * POST   /skills/:id/toggle         Toggle skill on/off for a companion
 * POST   /skills/request            Submit a GitHub repo for skill review
 * POST   /skills/request/:id/checkout  Pay the review fee via Stripe
 * GET    /skills/request/mine       User's submitted requests
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { fetchWithTimeout } from '../../inference/retry.js';

// ---------------------------------------------------------------------------
// Lightweight Stripe helpers (same pattern as billing.ts — no SDK)
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

  const res = await fetchWithTimeout(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  }, 15_000);

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
// Types
// ---------------------------------------------------------------------------

interface ToggleBody {
  active: boolean;
  companionId?: string;
}

interface SkillRequestBody {
  githubRepoUrl: string;
}

// JSON Schemas for validation
const toggleSchema = {
  type: 'object' as const,
  required: ['active'],
  properties: {
    active: { type: 'boolean' as const },
    companionId: { type: 'string' as const, maxLength: 64 },
  },
  additionalProperties: false,
};

const skillRequestSchema = {
  type: 'object' as const,
  required: ['githubRepoUrl'],
  properties: {
    githubRepoUrl: { type: 'string' as const, minLength: 10, maxLength: 500, pattern: '^https://github\\.com/' },
  },
  additionalProperties: false,
};

// Skill request review fee in cents (USD)
const SKILL_REQUEST_FEE_CENTS = 499; // $4.99

// ---------------------------------------------------------------------------
// GitHub URL parser
// ---------------------------------------------------------------------------

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const parts = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const skillsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /skills ─────────────────────────────────────────────────────────
  // Public catalog of approved skills. Optional query filters.
  fastify.get<{
    Querystring: { category?: string; search?: string };
  }>('/skills', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { category, search } = request.query;

    let sql = `
      SELECT
        s.id, s.name, s.display_name, s.description, s.category,
        s.source_type, s.author, s.install_count, s.version, s.triggers,
        CASE WHEN us.id IS NOT NULL THEN 1 ELSE 0 END AS is_installed,
        COALESCE(us.is_active, 0) AS is_active
      FROM skills s
      LEFT JOIN user_skills us
        ON us.skill_id = s.id AND us.user_id = ?
      WHERE s.is_approved = 1
    `;
    const params: any[] = [userId];

    if (category) {
      sql += ` AND s.category = ?`;
      params.push(category);
    }

    if (search) {
      sql += ` AND (s.display_name LIKE ? OR s.description LIKE ?)`;
      const like = `%${search}%`;
      params.push(like, like);
    }

    sql += ` ORDER BY s.install_count DESC, s.display_name ASC`;

    const rows = fastify.context.db.prepare(sql).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      category: r.category,
      sourceType: r.source_type,
      author: r.author,
      installCount: r.install_count,
      version: r.version,
      triggers: JSON.parse(r.triggers || '[]'),
      isInstalled: r.is_installed === 1,
      isActive: r.is_active === 1,
    }));
  });

  // ── GET /skills/mine ────────────────────────────────────────────────────
  // User's installed skills with companion assignment.
  fastify.get('/skills/mine', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const rows = fastify.context.db.prepare(`
      SELECT
        us.id AS user_skill_id,
        us.companion_id,
        us.is_active,
        us.installed_at,
        s.id, s.name, s.display_name, s.description, s.category,
        s.source_type, s.author, s.install_count, s.version, s.triggers
      FROM user_skills us
      JOIN skills s ON s.id = us.skill_id
      WHERE us.user_id = ?
      ORDER BY us.installed_at DESC
    `).all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description,
      category: r.category,
      sourceType: r.source_type,
      author: r.author,
      installCount: r.install_count,
      version: r.version,
      triggers: JSON.parse(r.triggers || '[]'),
      isInstalled: true,
      isActive: r.is_active === 1,
      companionId: r.companion_id,
      installedAt: new Date(r.installed_at).toISOString(),
    }));
  });

  // ── POST /skills/:id/toggle ─────────────────────────────────────────────
  // Install/toggle a skill. If not installed → install + increment count.
  fastify.post<{
    Params: { id: string };
    Body: ToggleBody;
  }>('/skills/:id/toggle', { schema: { body: toggleSchema } } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id: skillId } = request.params;
    const { active, companionId = null } = request.body;

    // Verify skill exists and is approved
    const skill = fastify.context.db.prepare(
      `SELECT id FROM skills WHERE id = ? AND is_approved = 1`,
    ).get(skillId);

    if (!skill) {
      return reply.notFound('Skill not found');
    }

    // Check if already installed
    const existing = fastify.context.db.prepare(`
      SELECT id, is_active FROM user_skills
      WHERE user_id = ? AND skill_id = ? AND companion_id IS ?
    `).get(userId, skillId, companionId) as any;

    if (existing) {
      // Toggle active state
      fastify.context.db.prepare(`
        UPDATE user_skills SET is_active = ? WHERE id = ?
      `).run(active ? 1 : 0, existing.id);
    } else {
      // First install
      const usId = `us-${crypto.randomUUID()}`;
      fastify.context.db.prepare(`
        INSERT INTO user_skills (id, user_id, skill_id, companion_id, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(usId, userId, skillId, companionId, active ? 1 : 0);

      // Bump install count
      fastify.context.db.prepare(`
        UPDATE skills SET install_count = install_count + 1 WHERE id = ?
      `).run(skillId);
    }

    return { success: true, active };
  });

  // ── POST /skills/request ────────────────────────────────────────────────
  // Submit a GitHub repo URL for custom skill review.
  fastify.post<{ Body: SkillRequestBody }>('/skills/request', {
    schema: { body: skillRequestSchema },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { githubRepoUrl } = request.body;

    if (!githubRepoUrl || typeof githubRepoUrl !== 'string') {
      return reply.badRequest('githubRepoUrl is required');
    }

    const parsed = parseGithubUrl(githubRepoUrl);
    if (!parsed) {
      return reply.badRequest('Invalid GitHub URL. Expected: https://github.com/owner/repo');
    }

    // Check for duplicate pending requests from this user
    const duplicate = fastify.context.db.prepare(`
      SELECT id FROM skill_requests
      WHERE user_id = ? AND github_repo_url = ? AND status NOT IN ('rejected', 'installed')
    `).get(userId, githubRepoUrl);

    if (duplicate) {
      return reply.conflict('You already have a pending request for this repository');
    }

    const requestId = `sr-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO skill_requests (id, user_id, github_repo_url, repo_owner, repo_name, status, amount_cents)
      VALUES (?, ?, ?, ?, ?, 'payment_required', ?)
    `).run(requestId, userId, githubRepoUrl, parsed.owner, parsed.repo, SKILL_REQUEST_FEE_CENTS);

    return {
      id: requestId,
      status: 'payment_required',
      amountCents: SKILL_REQUEST_FEE_CENTS,
    };
  });

  // ── POST /skills/request/:id/checkout ──────────────────────────────────
  // Create Stripe checkout session for the $4.99 skill request fee.
  fastify.post<{
    Params: { id: string };
    Body: { successUrl?: string; cancelUrl?: string };
  }>('/skills/request/:id/checkout', async (request, reply: FastifyReply) => {
    const key = stripeKey();
    if (!key) {
      return { url: null, message: 'Payments coming soon' };
    }

    const userId = (request.user as { userId: string }).userId;
    const { id: requestId } = request.params;
    const {
      successUrl = 'https://www.meetyourkin.com/dashboard/skills?request=submitted',
      cancelUrl = 'https://www.meetyourkin.com/dashboard/skills',
    } = request.body ?? {};

    // Verify request ownership and status
    const skillReq = fastify.context.db.prepare(`
      SELECT id, status, amount_cents, github_repo_url
      FROM skill_requests
      WHERE id = ? AND user_id = ?
    `).get(requestId, userId) as any;

    if (!skillReq) {
      return reply.notFound('Skill request not found');
    }

    if (skillReq.status !== 'payment_required') {
      return reply.badRequest(`Request is already in "${skillReq.status}" state`);
    }

    // Get or create Stripe customer (same pattern as billing.ts)
    const user = fastify.context.db.prepare(`
      SELECT id, first_name, last_name, stripe_customer_id FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      return reply.notFound('User not found');
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

    const session = await stripePost('/checkout/sessions', {
      mode: 'payment',
      customer: customerId,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'KIN Custom Skill Review',
      'line_items[0][price_data][product_data][description]': `Custom skill from: ${skillReq.github_repo_url}`,
      'line_items[0][price_data][unit_amount]': skillReq.amount_cents,
      'line_items[0][quantity]': 1,
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[kin_user_id]': userId,
      'metadata[type]': 'skill_request',
      'metadata[skill_request_id]': requestId,
    }, key);

    return { url: session.url as string };
  });

  // ── GET /skills/request/mine ──────────────────────────────────────────
  // User's submitted skill requests with statuses.
  fastify.get('/skills/request/mine', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const rows = fastify.context.db.prepare(`
      SELECT
        id, github_repo_url, repo_owner, repo_name, skill_name,
        skill_description, status, rejection_reason, amount_cents,
        created_at, updated_at
      FROM skill_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      githubRepoUrl: r.github_repo_url,
      repoOwner: r.repo_owner,
      repoName: r.repo_name,
      skillName: r.skill_name,
      skillDescription: r.skill_description,
      status: r.status,
      rejectionReason: r.rejection_reason,
      amountCents: r.amount_cents,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  });
};

export default skillsRoutes;
