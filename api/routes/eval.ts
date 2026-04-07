/**
 * Eval Routes — Evaluation pipeline API endpoints.
 *
 * POST /eval/run     — Trigger a benchmark evaluation run
 * GET  /eval/results — Retrieve latest comparison reports
 * GET  /eval/history — Retrieve evaluation run summaries
 *
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys per K005.
 */

import { FastifyPluginAsync } from 'fastify';
import { runEvaluation } from '../../inference/eval/runner.js';
import { generateComparisonReport } from '../../inference/eval/comparison.js';
import { getAdvantageDetector } from '../../inference/advantage-detector.js';
import {
  saveEvalResults,
  loadEvalResults,
  getEvalHistory,
  loadAllCompanionResults,
} from '../../inference/eval/store.js';
import type {
  TaskCategory,
  EvalRunConfig,
  EvalRunSummary,
  ComparisonReport,
} from '../../inference/eval/types.js';
import { TASK_CATEGORIES } from '../../inference/eval/types.js';

// ============================================================================
// Companion ID validation
// ============================================================================

const VALID_COMPANION_IDS = ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst'];

function isValidCompanionId(id: string): boolean {
  return VALID_COMPANION_IDS.includes(id);
}

function isValidCategory(cat: string): cat is TaskCategory {
  return (TASK_CATEGORIES as readonly string[]).includes(cat);
}

// ============================================================================
// Route Plugin
// ============================================================================

interface EvalRunBody {
  companionIds?: string[];
  categories?: string[];
}

const evalRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /eval/run — trigger an evaluation run ──────────────────────────
  fastify.post<{ Body: EvalRunBody }>('/eval/run', async (request, reply) => {
    const body = request.body ?? {};

    // Validate companionIds if provided
    if (body.companionIds !== undefined) {
      if (!Array.isArray(body.companionIds)) {
        reply.status(400);
        return { error: 'companionIds must be an array' };
      }
      for (const id of body.companionIds) {
        if (typeof id !== 'string' || !isValidCompanionId(id)) {
          reply.status(400);
          return { error: `Invalid companionId: ${id}` };
        }
      }
    }

    // Validate categories if provided
    if (body.categories !== undefined) {
      if (!Array.isArray(body.categories)) {
        reply.status(400);
        return { error: 'categories must be an array' };
      }
      for (const cat of body.categories) {
        if (typeof cat !== 'string' || !isValidCategory(cat)) {
          reply.status(400);
          return { error: `Invalid category: ${cat}` };
        }
      }
    }

    const config: Partial<EvalRunConfig> = {
      companionIds: body.companionIds ?? [],
      categories: (body.categories ?? []) as TaskCategory[],
    };

    const start = Date.now();

    // Run evaluation — gracefully degrades when Ollama/frontier unavailable
    const results = await runEvaluation(config);
    const durationMs = Date.now() - start;

    // Generate comparison reports
    const comparisons = generateComparisonReport(results);

    // Persist results per companion
    const companionGroups = new Map<string, typeof results>();
    for (const result of results) {
      // Derive companionId from promptId prefix pattern or default to 'general'
      const companionId = deriveCompanionFromResult(result);
      if (!companionGroups.has(companionId)) {
        companionGroups.set(companionId, []);
      }
      companionGroups.get(companionId)!.push(result);
    }

    for (const [companionId, companionResults] of companionGroups) {
      await saveEvalResults(companionResults, companionId);

      // Feed comparison data to the AdvantageDetector for quality delta tracking (R026)
      const companionComparisons = generateComparisonReport(companionResults);
      if (companionComparisons.length > 0) {
        getAdvantageDetector().recordEvalComparison(companionComparisons, companionId);
      }
    }

    // Build run summary
    const summary: EvalRunSummary = {
      runId: `${new Date().toISOString().slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      resultsCount: results.length,
      failedCount: 0,
      durationMs,
      comparisons,
      config: {
        companionIds: config.companionIds ?? [],
        categories: config.categories ?? [],
        maxConcurrency: 2,
        runJudge: false,
        timeoutMs: 60_000,
      },
    };

    return summary;
  });

  // ── GET /eval/results — latest comparison reports ───────────────────────
  fastify.get<{ Querystring: { companionId?: string } }>('/eval/results', async (request) => {
    const companionId = (request.query as { companionId?: string }).companionId;

    let allResults: import('../../inference/eval/types.js').EvalResult[];

    if (companionId) {
      if (!isValidCompanionId(companionId)) {
        return { comparisons: [] };
      }
      allResults = await loadEvalResults(companionId);
    } else {
      const byCompanion = await loadAllCompanionResults();
      allResults = Object.values(byCompanion).flat();
    }

    const comparisons = generateComparisonReport(allResults);

    return { comparisons };
  });

  // ── GET /eval/history — run summaries ───────────────────────────────────
  fastify.get<{ Querystring: { companionId?: string; limit?: string } }>(
    '/eval/history',
    async (request) => {
      const query = request.query as { companionId?: string; limit?: string };
      const companionId = query.companionId;
      const limit = query.limit ? parseInt(query.limit, 10) : undefined;

      const history = await getEvalHistory(companionId ?? undefined);

      if (limit && limit > 0) {
        return { history: history.slice(0, limit) };
      }

      return { history };
    },
  );
};

// ============================================================================
// Internal — Companion derivation from result metadata
// ============================================================================

/**
 * Derive companion ID from an eval result.
 * Benchmarks are wired to specific companions — we use a simple mapping
 * from prompt ID patterns. Falls back to 'general' for unknown patterns.
 */
function deriveCompanionFromResult(result: import('../../inference/eval/types.js').EvalResult): string {
  // The model field for local results uses 'kin-{companionId}' or base model names.
  // The prompt IDs follow '{category}-{number}' format.
  // For simplicity, we bucket results by the model name when it matches a companion pattern.
  const kinMatch = result.model.match(/^kin-(\w+)$/);
  const kinId = kinMatch?.[1];
  if (kinId && isValidCompanionId(kinId)) {
    return kinId;
  }
  // Default to 'general' for frontier models and unrecognized patterns
  return 'general';
}

export default evalRoutes;
