/**
 * Eval Result Store — JSONL persistence for evaluation results.
 *
 * Writes EvalResult entries as append-only JSONL files per companion,
 * following the same directory pattern as training-data.ts:
 *   data/eval/{companionId}/results.jsonl
 *
 * All writes are fire-and-forget safe — errors are caught and logged,
 * never thrown to callers. Reads return empty arrays on missing files.
 *
 * @module inference/eval/store
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EvalResult, EvalRunSummary } from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_BASE_PATH = path.join('data', 'eval');

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Save evaluation results as JSONL, appending to the companion's result file.
 * Creates the directory structure if it doesn't exist.
 *
 * @param results - EvalResult array to persist
 * @param companionId - Companion identifier (determines the output directory)
 * @param basePath - Override base path (default: data/eval)
 * @returns The file path written to
 */
export async function saveEvalResults(
  results: EvalResult[],
  companionId: string,
  basePath?: string,
): Promise<string> {
  const base = basePath ?? DEFAULT_BASE_PATH;
  const dir = path.join(base, companionId);
  const filePath = path.join(dir, 'results.jsonl');

  try {
    await fs.promises.mkdir(dir, { recursive: true });

    const lines = results.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await fs.promises.appendFile(filePath, lines, 'utf-8');

    console.log(`[eval-store] Wrote ${results.length} results to ${filePath}`);
  } catch (err) {
    console.error('[eval-store] Failed to write eval results:', err);
  }

  return filePath;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Load evaluation results for a companion from JSONL.
 * Returns the most recent N results if limit is specified.
 *
 * @param companionId - Companion identifier
 * @param limit - Max results to return (most recent first). Omit for all.
 * @param basePath - Override base path (default: data/eval)
 */
export async function loadEvalResults(
  companionId: string,
  limit?: number,
  basePath?: string,
): Promise<EvalResult[]> {
  const base = basePath ?? DEFAULT_BASE_PATH;
  const filePath = path.join(base, companionId, 'results.jsonl');

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const results: EvalResult[] = [];

    for (const line of lines) {
      try {
        results.push(JSON.parse(line) as EvalResult);
      } catch {
        console.warn(`[eval-store] Skipped malformed JSONL line in ${filePath}`);
      }
    }

    if (limit !== undefined && limit > 0) {
      return results.slice(-limit);
    }
    return results;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // No results yet — not an error
    }
    console.error(`[eval-store] Failed to read ${filePath}:`, err);
    return [];
  }
}

/**
 * Load eval results for all companions.
 * Scans the base directory for companion subdirectories.
 *
 * @param basePath - Override base path (default: data/eval)
 */
export async function loadAllCompanionResults(
  basePath?: string,
): Promise<Record<string, EvalResult[]>> {
  const base = basePath ?? DEFAULT_BASE_PATH;
  const results: Record<string, EvalResult[]> = {};

  try {
    const entries = await fs.promises.readdir(base, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const loaded = await Promise.all(
      dirs.map(async (companionId) => ({
        companionId,
        data: await loadEvalResults(companionId, undefined, basePath),
      })),
    );
    for (const { companionId, data } of loaded) {
      if (data.length > 0) {
        results[companionId] = data;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // No eval data directory yet
    }
    console.error('[eval-store] Failed to scan eval directory:', err);
  }

  return results;
}

/**
 * Get run-level summaries from stored eval results.
 * Groups results by evaluatedAt timestamp (within 1-second window)
 * to reconstruct individual runs.
 *
 * @param companionId - Filter to a single companion. Omit for all companions.
 * @param basePath - Override base path (default: data/eval)
 */
export async function getEvalHistory(
  companionId?: string,
  basePath?: string,
): Promise<EvalRunSummary[]> {
  let allResults: EvalResult[];

  if (companionId) {
    allResults = await loadEvalResults(companionId, undefined, basePath);
  } else {
    const byCompanion = await loadAllCompanionResults(basePath);
    allResults = Object.values(byCompanion).flat();
  }

  if (allResults.length === 0) return [];

  // Group results by evaluatedAt timestamp (round to nearest second)
  const runs = new Map<string, EvalResult[]>();

  for (const result of allResults) {
    // Round to nearest second to group results from the same run
    const ts = result.evaluatedAt.slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss'
    if (!runs.has(ts)) {
      runs.set(ts, []);
    }
    runs.get(ts)!.push(result);
  }

  // Convert groups to summaries
  const summaries: EvalRunSummary[] = [];

  for (const [timestamp, results] of runs) {
    const avgQuality =
      results.reduce((s, r) => s + r.qualityScore, 0) / results.length;
    const avgLatency =
      results.reduce((s, r) => s + r.latencyMs, 0) / results.length;

    const firstResult = results[0];
    if (!firstResult) continue;

    summaries.push({
      runId: timestamp,
      timestamp: firstResult.evaluatedAt,
      resultsCount: results.length,
      failedCount: 0, // Can't determine from stored results alone
      durationMs: Math.max(...results.map((r) => r.latencyMs)),
      comparisons: [], // Full comparisons require re-aggregation by caller
      config: {
        companionIds: [],
        categories: [],
        maxConcurrency: 2,
        runJudge: false,
        timeoutMs: 60_000,
      },
    });
  }

  // Sort by timestamp descending (most recent first)
  summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return summaries;
}
