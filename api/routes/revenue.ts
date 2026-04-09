/**
 * Revenue Routes — Admin and holder-facing revenue API.
 *
 * Admin routes (POST /admin/revenue/generate, GET /admin/revenue/reports, GET /admin/revenue/reports/:reportId):
 *   - Guarded by isAdmin (user.tier === 'hero' OR userId in ADMIN_USER_IDS env).
 *
 * Holder routes (GET /revenue/my-distributions):
 *   - Any authenticated user. Returns empty array for non-Genesis holders.
 *
 * All responses use camelCase keys.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  generateRevenueReport,
  getReport,
  listReports,
  getHolderDistributions,
} from '../lib/revenue-engine.js';
import { requireAdmin } from '../lib/admin.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateBody {
  periodStart: number;
  periodEnd: number;
}

interface PaginationQuery {
  limit?: string;
  offset?: string;
}

interface ReportIdParams {
  reportId: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const revenueRoutes: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify.context;

  // =========================================================================
  // POST /admin/revenue/generate
  // =========================================================================

  fastify.post('/admin/revenue/generate', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const body = request.body as GenerateBody | undefined;

    // Validate required fields
    if (!body || body.periodStart == null || body.periodEnd == null) {
      return reply.status(400).send({ error: 'periodStart and periodEnd are required' });
    }

    const { periodStart, periodEnd } = body;

    // Validate types
    if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd)) {
      return reply.status(400).send({ error: 'periodStart and periodEnd must be integers (epoch ms)' });
    }

    // Validate ordering
    if (periodStart >= periodEnd) {
      return reply.status(400).send({ error: 'periodStart must be before periodEnd' });
    }

    try {
      // Check for existing report (idempotency)
      const existingReports = listReports(db, 1000, 0);
      const existing = existingReports.reports.find(
        (r) => r.periodStart === periodStart && r.periodEnd === periodEnd,
      );

      if (existing) {
        const full = getReport(db, existing.id);
        return reply.status(200).send(full);
      }

      const report = generateRevenueReport(db, periodStart, periodEnd);
      return reply.status(201).send(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error(`[revenue] generate failed: ${msg}`);
      return reply.status(500).send({ error: 'Revenue report generation failed' });
    }
  });

  // =========================================================================
  // GET /admin/revenue/reports
  // =========================================================================

  fastify.get('/admin/revenue/reports', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const query = request.query as PaginationQuery;
    const limit = Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0);

    try {
      const result = listReports(db, limit, offset);
      return reply.send({
        reports: result.reports,
        pagination: { total: result.total, limit, offset },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error(`[revenue] listReports failed: ${msg}`);
      return reply.status(500).send({ error: 'Failed to list revenue reports' });
    }
  });

  // =========================================================================
  // GET /admin/revenue/reports/:reportId
  // =========================================================================

  fastify.get<{ Params: ReportIdParams }>('/admin/revenue/reports/:reportId', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { reportId } = request.params;

    try {
      const report = getReport(db, reportId);
      if (!report) {
        return reply.status(404).send({ error: 'Report not found' });
      }
      return reply.send(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error(`[revenue] getReport failed: ${msg}`);
      return reply.status(500).send({ error: 'Failed to fetch revenue report' });
    }
  });

  // =========================================================================
  // GET /revenue/my-distributions
  // =========================================================================

  fastify.get('/revenue/my-distributions', async (request, reply) => {
    const user = request.user as { userId: string };
    const query = request.query as PaginationQuery;
    const limit = Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0);

    try {
      // Check if user has genesis_tier
      const userRow = db.prepare(
        `SELECT genesis_tier FROM users WHERE id = ?`,
      ).get(user.userId) as { genesis_tier: string | null } | undefined;

      if (!userRow || !userRow.genesis_tier) {
        return reply.send({
          distributions: [],
          pagination: { total: 0, limit, offset },
        });
      }

      const result = getHolderDistributions(db, user.userId, limit, offset);
      return reply.send({
        distributions: result.distributions,
        pagination: { total: result.total, limit, offset },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error(`[revenue] my-distributions failed: ${msg}`);
      return reply.status(500).send({ error: 'Failed to fetch distributions' });
    }
  });
};

export default revenueRoutes;
