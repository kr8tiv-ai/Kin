/**
 * Distill Routes — Distillation pipeline API endpoints.
 *
 * POST /distill/run                          — Trigger distillation run
 * GET  /distill/datasets                     — List per-companion datasets
 * GET  /distill/datasets/:companionId/export — Export JSONL for a companion
 *
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys per K005.
 */

import { FastifyPluginAsync } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { runDistillation, loadDistillDataset } from '../../inference/distill/index.js';
import type { DistillRunSummary } from '../../inference/distill/index.js';

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

interface DistillRunBody {
  companionId?: string;
  qualityThreshold?: number;
}

const distillRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /distill/run — trigger a distillation run ────────────────────
  fastify.post<{ Body: DistillRunBody }>('/distill/run', async (request, reply) => {
    const body = request.body ?? {};

    // Validate companionId if provided
    if (body.companionId !== undefined) {
      if (typeof body.companionId !== 'string' || !isValidCompanionId(body.companionId)) {
        reply.status(400);
        return { error: `Invalid companionId: ${body.companionId}` };
      }
    }

    // Validate qualityThreshold if provided
    if (body.qualityThreshold !== undefined) {
      if (typeof body.qualityThreshold !== 'number' || body.qualityThreshold < 0 || body.qualityThreshold > 1) {
        reply.status(400);
        return { error: 'qualityThreshold must be a number between 0 and 1' };
      }
    }

    const configOverrides = body.qualityThreshold !== undefined
      ? { qualityThreshold: body.qualityThreshold }
      : {};

    const companionIds = body.companionId
      ? [body.companionId]
      : VALID_COMPANION_IDS;

    const start = Date.now();
    const results = await Promise.all(
      companionIds.map((cid) => runDistillation(cid, configOverrides)),
    );
    const durationMs = Date.now() - start;
    console.log(`[distill-routes] Distillation run complete in ${durationMs}ms — ${results.length} companion(s)`);

    return results;
  });

  // ── GET /distill/datasets — list per-companion datasets ───────────────
  fastify.get('/distill/datasets', async () => {
    const basePath = path.join('data', 'distill');
    const datasets: Array<{ companionId: string; entryCount: number; filePath: string }> = [];

    try {
      const entries = await fs.promises.readdir(basePath, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const companionId of dirs) {
        const filePath = path.join(basePath, companionId, 'distill.jsonl');
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(Boolean);
          datasets.push({
            companionId,
            entryCount: lines.length,
            filePath,
          });
        } catch {
          // No distill.jsonl in this directory — skip
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[distill-routes] Failed to scan distill directory:', err);
      }
      // No data/distill directory yet — return empty
    }

    return { datasets };
  });

  // ── GET /distill/datasets/:companionId/export — export JSONL ──────────
  fastify.get<{ Params: { companionId: string } }>(
    '/distill/datasets/:companionId/export',
    async (request, reply) => {
      const { companionId } = request.params;

      if (!isValidCompanionId(companionId)) {
        reply.status(400);
        return { error: `Invalid companionId: ${companionId}` };
      }

      const lines = await loadDistillDataset(companionId);

      reply.type('text/jsonl');
      return lines.length > 0
        ? lines.join('\n') + '\n'
        : '';
    },
  );
};

export default distillRoutes;
