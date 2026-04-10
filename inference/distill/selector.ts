/**
 * Distill Candidate Selector — Filters eval results to high-quality frontier responses.
 *
 * Reads stored eval results for a companion, filters to frontier-only responses
 * above the quality threshold, then resolves each result's benchmark prompt
 * to build full DistillCandidate objects with system/user message context.
 *
 * @module inference/distill/selector
 */

import { loadEvalResults } from '../eval/store.js';
import { getBenchmarkSuite } from '../eval/benchmarks.js';
import type { DistillCandidate, DistillConfig } from './types.js';
import { DEFAULT_DISTILL_CONFIG } from './types.js';

/**
 * Select distillation candidates from stored eval results.
 *
 * Logic:
 * 1. Load all eval results for the companion
 * 2. Filter to frontier-only (provider !== 'local')
 * 3. Filter to quality >= threshold
 * 4. Resolve each result's benchmark prompt for system/user context
 * 5. Skip results whose prompt can't be found (with warning)
 *
 * @param companionId - Companion to select candidates for
 * @param config - Distillation config (quality threshold, filters)
 * @param basePath - Override eval data path (for testing)
 * @returns Array of DistillCandidate objects ready for conversion
 */
export async function selectDistillCandidates(
  companionId: string,
  config?: Partial<DistillConfig>,
  basePath?: string,
): Promise<DistillCandidate[]> {
  const cfg: DistillConfig = { ...DEFAULT_DISTILL_CONFIG, ...config };
  const candidates: DistillCandidate[] = [];
  let skipped = 0;

  // Load all eval results for this companion
  const evalResults = await loadEvalResults(companionId, undefined, basePath);

  if (evalResults.length === 0) {
    console.log(`[distill-selector] No eval results for companion '${companionId}'`);
    return [];
  }

  // Pre-build Map for O(1) prompt lookup instead of repeated .find()
  const allPrompts = getBenchmarkSuite();
  const promptById = new Map(allPrompts.map((p) => [p.id, p]));

  for (const result of evalResults) {
    // Gate 1: Only frontier responses are useful for distillation
    if (result.provider === 'local') continue;

    // Gate 2: Quality threshold
    if (result.qualityScore < cfg.qualityThreshold) continue;

    // Gate 3: Category filter (if specified)
    if (cfg.categories && cfg.categories.length > 0) {
      const prompt = promptById.get(result.promptId);
      if (prompt && !cfg.categories.includes(prompt.taskCategory)) continue;
    }

    // Resolve the benchmark prompt to get system/user context
    const prompt = promptById.get(result.promptId);
    if (!prompt) {
      console.warn(
        `[distill-selector] Prompt '${result.promptId}' not found in benchmark suite — skipping`,
      );
      skipped++;
      continue;
    }

    candidates.push({
      promptId: result.promptId,
      companionId,
      systemPrompt: prompt.systemPrompt,
      userMessage: prompt.userMessage,
      frontierResponse: result.response,
      qualityScore: result.qualityScore,
      model: result.model,
      provider: result.provider,
      evaluatedAt: result.evaluatedAt,
    });
  }

  console.log(
    `[distill-selector] ${companionId}: ${candidates.length} candidates selected, ${skipped} skipped (prompt not found)`,
  );

  return candidates;
}
