/**
 * Advantage Routes — Quality delta tracking and regression detection API.
 *
 * GET  /advantage/report  — Per-companion or global advantage analysis
 * GET  /advantage/trends  — Trend data with regression signals
 * POST /advantage/gate    — Regression gate check returning pass/fail with reasons
 *
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys per K005.
 *
 * @module api/routes/advantage
 */

import { FastifyPluginAsync } from 'fastify';
import { getAdvantageDetector } from '../../inference/advantage-detector.js';

// ============================================================================
// Companion ID validation (mirrors eval.ts)
// ============================================================================

const VALID_COMPANION_IDS = ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst'];

function isValidCompanionId(id: string): boolean {
  return VALID_COMPANION_IDS.includes(id);
}

// ============================================================================
// Route Plugin
// ============================================================================

const advantageRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /advantage/report — advantage analysis per category ─────────────
  fastify.get<{ Querystring: { companionId?: string } }>(
    '/advantage/report',
    async (request) => {
      const companionId = (request.query as { companionId?: string }).companionId;

      if (companionId !== undefined) {
        if (typeof companionId !== 'string' || !isValidCompanionId(companionId)) {
          return { error: 'Invalid companionId', reports: [] };
        }
      }

      const detector = getAdvantageDetector();

      // Load persisted data from disk before generating reports
      await detector.loadFromDisk(companionId ?? undefined);

      const reports = detector.getReports();
      const stats = detector.getOverallStats();

      return {
        reports,
        stats,
        companionId: companionId ?? null,
      };
    },
  );

  // ── GET /advantage/trends — trend data with regression signals ──────────
  fastify.get<{ Querystring: { companionId?: string } }>(
    '/advantage/trends',
    async (request) => {
      const companionId = (request.query as { companionId?: string }).companionId;

      if (companionId !== undefined) {
        if (typeof companionId !== 'string' || !isValidCompanionId(companionId)) {
          return { error: 'Invalid companionId', trends: [], regressions: [] };
        }
      }

      const detector = getAdvantageDetector();

      // Load persisted data from disk
      await detector.loadFromDisk(companionId ?? undefined);

      const trends = detector.getTrends();
      const regressions = detector.detectRegression();

      return {
        trends,
        regressions,
        companionId: companionId ?? null,
      };
    },
  );

  // ── POST /advantage/gate — regression gate check ────────────────────────
  fastify.post<{
    Body: {
      companionId?: string;
      qualityDropThreshold?: number;
      minSamples?: number;
    };
  }>('/advantage/gate', async (request, reply) => {
    const body = request.body ?? {};

    // Validate companionId if provided
    if (body.companionId !== undefined) {
      if (typeof body.companionId !== 'string' || !isValidCompanionId(body.companionId)) {
        reply.status(400);
        return { error: 'Invalid companionId' };
      }
    }

    // Validate numeric options
    if (body.qualityDropThreshold !== undefined) {
      if (typeof body.qualityDropThreshold !== 'number' || body.qualityDropThreshold < 0 || body.qualityDropThreshold > 1) {
        reply.status(400);
        return { error: 'qualityDropThreshold must be a number between 0 and 1' };
      }
    }

    if (body.minSamples !== undefined) {
      if (typeof body.minSamples !== 'number' || !Number.isInteger(body.minSamples) || body.minSamples < 1) {
        reply.status(400);
        return { error: 'minSamples must be a positive integer' };
      }
    }

    const detector = getAdvantageDetector();

    // Load persisted data from disk
    await detector.loadFromDisk(body.companionId ?? undefined);

    const gateResult = detector.getRegressionGate({
      qualityDropThreshold: body.qualityDropThreshold,
      minSamples: body.minSamples,
    });

    return {
      ...gateResult,
      companionId: body.companionId ?? null,
    };
  });
};

export default advantageRoutes;
