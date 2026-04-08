/**
 * Retrain Routes — Retrain pipeline API endpoints.
 *
 * POST /retrain/run                    — Trigger retrain run (one or all companions)
 * GET  /retrain/status/:companionId    — Readiness + last run status
 * GET  /retrain/history/:companionId   — Run history for a companion
 *
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys per K005.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  getTrainingScheduler,
  checkRetrainReadiness,
  loadRetrainHistory,
} from '../../training/scheduler.js';

// ============================================================================
// Companion ID validation
// ============================================================================

const VALID_COMPANION_IDS = ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst'];

function isValidCompanionId(id: string): boolean {
  return VALID_COMPANION_IDS.includes(id);
}

// ============================================================================
// Route Plugin
// ============================================================================

interface RetrainRunBody {
  companionId?: string;
  runDistillFirst?: boolean;
  dryRun?: boolean;
}

interface RetrainHistoryQuery {
  limit?: string;
}

const retrainRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /retrain/run — trigger a retrain run ─────────────────────────
  fastify.post<{ Body: RetrainRunBody }>('/retrain/run', async (request, reply) => {
    const body = request.body ?? {};

    // Validate companionId if provided
    if (body.companionId !== undefined) {
      if (typeof body.companionId !== 'string' || !isValidCompanionId(body.companionId)) {
        reply.status(400);
        return { error: `Invalid companionId: ${body.companionId}` };
      }
    }

    const scheduler = getTrainingScheduler();
    const start = Date.now();

    try {
      const jobIds = await scheduler.triggerRetrain(body.companionId);
      const durationMs = Date.now() - start;

      request.log.info({ durationMs, jobCount: jobIds.length }, 'retrain triggered');

      // Collect job details
      const jobs = jobIds.map((id) => {
        const job = scheduler.getJob(id);
        return {
          jobId: id,
          companionId: job?.companionId ?? null,
          status: job?.status ?? 'unknown',
        };
      });

      return {
        jobIds,
        jobs,
        durationMs,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      request.log.error({ err: errorMsg }, 'retrain failed');
      reply.status(500);
      return { error: `Retrain failed: ${errorMsg}` };
    }
  });

  // ── GET /retrain/status/:companionId — readiness + last run ───────────
  fastify.get<{ Params: { companionId: string } }>(
    '/retrain/status/:companionId',
    async (request, reply) => {
      const { companionId } = request.params;

      if (!isValidCompanionId(companionId)) {
        reply.status(400);
        return { error: `Invalid companionId: ${companionId}` };
      }

      try {
        const readiness = await checkRetrainReadiness(companionId);
        const history = await loadRetrainHistory(companionId);
        const lastRun = history.length > 0 ? history[history.length - 1] : null;

        return {
          readiness: {
            ready: readiness.ready,
            datasetSize: readiness.datasetSize,
            dataPath: readiness.dataPath,
            reason: readiness.reason ?? null,
          },
          lastRun,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        request.log.error({ companionId, err: errorMsg }, 'status check failed');
        reply.status(500);
        return { error: `Status check failed: ${errorMsg}` };
      }
    },
  );

  // ── GET /retrain/history/:companionId — run history ───────────────────
  fastify.get<{ Params: { companionId: string }; Querystring: RetrainHistoryQuery }>(
    '/retrain/history/:companionId',
    async (request, reply) => {
      const { companionId } = request.params;
      const limitParam = request.query?.limit;

      if (!isValidCompanionId(companionId)) {
        reply.status(400);
        return { error: `Invalid companionId: ${companionId}` };
      }

      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      if (isNaN(limit) || limit < 1) {
        reply.status(400);
        return { error: 'limit must be a positive integer' };
      }

      try {
        const history = await loadRetrainHistory(companionId);
        // Return most recent first, capped at limit
        const trimmed = history.slice(-limit).reverse();

        return { history: trimmed };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        request.log.error({ companionId, err: errorMsg }, 'history fetch failed');
        reply.status(500);
        return { error: `History fetch failed: ${errorMsg}` };
      }
    },
  );
};

export default retrainRoutes;
