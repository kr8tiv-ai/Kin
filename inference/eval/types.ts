/**
 * Evaluation Pipeline Types — Type system for benchmarking local vs frontier models.
 *
 * Defines the core data shapes used across the eval pipeline:
 * prompt definitions, evaluation results, comparison reports,
 * run configuration, and run summaries.
 *
 * @module inference/eval/types
 */

import type { FrontierProviderId } from '../providers/types.js';

// ============================================================================
// Task Categories — subset of supervisor taskType for text-based eval
// ============================================================================

/**
 * Task categories used in benchmark evaluation.
 * Excludes 'voice' from the supervisor's full taskType set since
 * the eval pipeline is text-based.
 */
export type TaskCategory = 'code' | 'creative' | 'analysis' | 'chat';

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  'code',
  'creative',
  'analysis',
  'chat',
] as const;

// ============================================================================
// Benchmark Prompt
// ============================================================================

/**
 * A single benchmark prompt with metadata and scoring rubric.
 *
 * Each prompt targets a specific task category and optionally a companion,
 * carrying the companion's system prompt for realistic evaluation.
 */
export interface BenchmarkPrompt {
  /** Unique identifier for this prompt (e.g., 'code-01', 'creative-03') */
  id: string;
  /** Which task category this prompt exercises */
  taskCategory: TaskCategory;
  /** Target companion ID, or null for companion-agnostic prompts */
  companionId: string | null;
  /** System prompt to use (typically the companion's full system prompt) */
  systemPrompt: string;
  /** The user message to send */
  userMessage: string;
  /** Quality rubric — criteria the scorer uses to evaluate the response */
  rubric: RubricCriteria;
}

/**
 * Scoring rubric for a benchmark prompt.
 * Each criterion is scored 0-1 by the heuristic scorer or LLM judge.
 */
export interface RubricCriteria {
  /** Short description of what a high-quality response looks like */
  idealResponse: string;
  /** Named criteria, each with a weight (weights should sum to 1.0) */
  criteria: RubricCriterion[];
}

export interface RubricCriterion {
  /** Criterion name (e.g., 'correctness', 'clarity', 'completeness') */
  name: string;
  /** What to look for when scoring this criterion */
  description: string;
  /** Weight for this criterion (0-1, all weights should sum to 1.0) */
  weight: number;
}

// ============================================================================
// Eval Result
// ============================================================================

/**
 * Result of evaluating a single prompt against a single model.
 */
export interface EvalResult {
  /** The prompt ID that was evaluated */
  promptId: string;
  /** Model identifier (e.g., 'llama3.2', 'gpt-5.4', 'kin-cipher') */
  model: string;
  /** Provider: 'local' for Ollama, or a FrontierProviderId */
  provider: 'local' | FrontierProviderId;
  /** The raw response text from the model */
  response: string;
  /** End-to-end latency in milliseconds */
  latencyMs: number;
  /** Total tokens used (input + output) */
  tokenCount: number;
  /** Heuristic score (0-1) — fast, pattern-based quality estimate */
  heuristicScore: number;
  /** LLM judge score (0-1) — slower, deeper quality evaluation. Null if not yet judged. */
  judgeScore: number | null;
  /** Combined quality score (0-1) — weighted blend of heuristic and judge */
  qualityScore: number;
  /** ISO-8601 timestamp when this evaluation was run */
  evaluatedAt: string;
}

// ============================================================================
// Comparison Report
// ============================================================================

/**
 * Comparison of local vs frontier model performance for a task category.
 */
export interface ComparisonReport {
  /** Task category being compared */
  category: TaskCategory;
  /** Number of prompts evaluated in this category */
  promptCount: number;
  /** Aggregated local model scores */
  localScores: AggregatedScores;
  /** Aggregated frontier model scores */
  frontierScores: AggregatedScores;
  /** Latency difference: local avg ms - frontier avg ms (positive = local slower) */
  latencyDiffMs: number;
  /** Quality difference: local avg quality - frontier avg quality (negative = local worse) */
  qualityDiff: number;
  /** Human-readable recommendation based on the comparison */
  recommendation: string;
}

/**
 * Aggregated score metrics for a set of eval results.
 */
export interface AggregatedScores {
  /** Average quality score (0-1) */
  avgQuality: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Average heuristic score (0-1) */
  avgHeuristicScore: number;
  /** Average judge score (0-1), null if no results were judged */
  avgJudgeScore: number | null;
  /** Number of results aggregated */
  count: number;
}

// ============================================================================
// Eval Run Configuration
// ============================================================================

/**
 * Configuration for an evaluation run.
 */
export interface EvalRunConfig {
  /** Companion IDs to evaluate (empty = all companions) */
  companionIds: string[];
  /** Task categories to evaluate (empty = all categories) */
  categories: TaskCategory[];
  /** Max concurrent evaluations (default: 2 to avoid overwhelming Ollama) */
  maxConcurrency: number;
  /** Whether to run the LLM judge in addition to heuristic scoring */
  runJudge: boolean;
  /** Timeout per evaluation in ms (default: 60000) */
  timeoutMs: number;
}

/**
 * Default eval run configuration.
 */
export const DEFAULT_EVAL_CONFIG: EvalRunConfig = {
  companionIds: [],
  categories: [],
  maxConcurrency: 2,
  runJudge: false,
  timeoutMs: 60_000,
};

// ============================================================================
// Eval Run Summary
// ============================================================================

/**
 * Summary of a completed evaluation run.
 */
export interface EvalRunSummary {
  /** Unique run identifier (ISO timestamp + random suffix) */
  runId: string;
  /** ISO-8601 timestamp when the run started */
  timestamp: string;
  /** Total number of evaluations completed */
  resultsCount: number;
  /** Total number of evaluations that failed or timed out */
  failedCount: number;
  /** Total run duration in ms */
  durationMs: number;
  /** Per-category comparison reports */
  comparisons: ComparisonReport[];
  /** The config used for this run */
  config: EvalRunConfig;
}
