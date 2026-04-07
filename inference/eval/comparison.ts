/**
 * Comparison Framework — Aggregates EvalResult arrays into per-category comparison reports.
 *
 * Groups results by task category, computes aggregated scores for local vs frontier,
 * and produces recommendations based on quality parity + latency advantage.
 *
 * @module inference/eval/comparison
 */

import type {
  EvalResult,
  ComparisonReport,
  AggregatedScores,
  TaskCategory,
} from './types.js';
import { TASK_CATEGORIES } from './types.js';

// ============================================================================
// Category Resolution
// ============================================================================

/**
 * Extract the task category from a prompt ID.
 * Prompt IDs follow the pattern `{category}-{number}` (e.g., 'code-01', 'creative-03').
 * Falls back to 'chat' if the prefix doesn't match a known category.
 */
function resolveCategory(promptId: string): TaskCategory {
  const prefix = promptId.split('-')[0] ?? '';
  if ((TASK_CATEGORIES as readonly string[]).includes(prefix)) {
    return prefix as TaskCategory;
  }
  return 'chat';
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Compute aggregated scores from a set of eval results.
 */
function aggregate(results: EvalResult[]): AggregatedScores {
  if (results.length === 0) {
    return {
      avgQuality: 0,
      avgLatencyMs: 0,
      avgHeuristicScore: 0,
      avgJudgeScore: null,
      count: 0,
    };
  }

  const count = results.length;
  const avgQuality = results.reduce((s, r) => s + r.qualityScore, 0) / count;
  const avgLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0) / count;
  const avgHeuristicScore = results.reduce((s, r) => s + r.heuristicScore, 0) / count;

  // Judge scores: only average results that actually have a judge score
  const judged = results.filter((r) => r.judgeScore !== null);
  const avgJudgeScore =
    judged.length > 0
      ? judged.reduce((s, r) => s + (r.judgeScore as number), 0) / judged.length
      : null;

  return { avgQuality, avgLatencyMs, avgHeuristicScore, avgJudgeScore, count };
}

// ============================================================================
// Recommendation Logic
// ============================================================================

/** Quality delta threshold below which local is considered "at parity". */
const QUALITY_PARITY_THRESHOLD = 0.1;

/**
 * Derive a recommendation string from local vs frontier aggregated scores.
 *
 * - 'local' — local quality is at parity (delta < threshold) and local is faster
 * - 'frontier' — frontier quality is significantly better
 * - 'hybrid' — mixed results, use local for latency-sensitive tasks, frontier for quality-critical
 */
function deriveRecommendation(
  localScores: AggregatedScores,
  frontierScores: AggregatedScores,
): string {
  const qualityDelta = localScores.avgQuality - frontierScores.avgQuality;
  const localFaster = localScores.avgLatencyMs < frontierScores.avgLatencyMs;

  if (qualityDelta >= -QUALITY_PARITY_THRESHOLD && localFaster) {
    return 'local';
  }
  if (qualityDelta < -QUALITY_PARITY_THRESHOLD) {
    return 'frontier';
  }
  return 'hybrid';
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate comparison reports from a flat array of EvalResult.
 *
 * Groups results by task category, splits into local vs frontier,
 * computes per-group aggregates, and produces a recommendation for each category.
 *
 * Categories with zero results on either side are still reported (with zeroed scores)
 * so the caller can see which categories lack data.
 */
export function generateComparisonReport(results: EvalResult[]): ComparisonReport[] {
  // Group by category
  const byCategory = new Map<TaskCategory, { local: EvalResult[]; frontier: EvalResult[] }>();

  for (const result of results) {
    const category = resolveCategory(result.promptId);
    if (!byCategory.has(category)) {
      byCategory.set(category, { local: [], frontier: [] });
    }
    const bucket = byCategory.get(category)!;
    if (result.provider === 'local') {
      bucket.local.push(result);
    } else {
      bucket.frontier.push(result);
    }
  }

  const reports: ComparisonReport[] = [];

  for (const [category, bucket] of byCategory) {
    const localScores = aggregate(bucket.local);
    const frontierScores = aggregate(bucket.frontier);

    const latencyDiffMs = localScores.avgLatencyMs - frontierScores.avgLatencyMs;
    const qualityDiff = localScores.avgQuality - frontierScores.avgQuality;

    reports.push({
      category,
      promptCount: bucket.local.length + bucket.frontier.length,
      localScores,
      frontierScores,
      latencyDiffMs,
      qualityDiff,
      recommendation: deriveRecommendation(localScores, frontierScores),
    });
  }

  // Sort by category for deterministic output
  reports.sort((a, b) => {
    const order = TASK_CATEGORIES as readonly string[];
    return order.indexOf(a.category) - order.indexOf(b.category);
  });

  return reports;
}

/**
 * Format comparison reports as a human-readable text summary.
 * Suitable for logging, CLI output, or dashboard display.
 */
export function formatReportSummary(reports: ComparisonReport[]): string {
  if (reports.length === 0) {
    return 'No comparison data available.';
  }

  const lines: string[] = ['=== Evaluation Comparison Report ===', ''];

  for (const report of reports) {
    const { category, promptCount, localScores, frontierScores, qualityDiff, latencyDiffMs } =
      report;

    lines.push(`── ${category.toUpperCase()} (${promptCount} prompts) ──`);
    lines.push(
      `  Local:    quality=${localScores.avgQuality.toFixed(3)}  latency=${Math.round(localScores.avgLatencyMs)}ms  (n=${localScores.count})`,
    );
    lines.push(
      `  Frontier: quality=${frontierScores.avgQuality.toFixed(3)}  latency=${Math.round(frontierScores.avgLatencyMs)}ms  (n=${frontierScores.count})`,
    );
    lines.push(
      `  Delta:    quality=${qualityDiff >= 0 ? '+' : ''}${qualityDiff.toFixed(3)}  latency=${latencyDiffMs >= 0 ? '+' : ''}${Math.round(latencyDiffMs)}ms`,
    );
    lines.push(`  Recommendation: ${report.recommendation}`);
    lines.push('');
  }

  return lines.join('\n');
}
