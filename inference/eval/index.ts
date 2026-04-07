/**
 * Evaluation Pipeline — Barrel export for the eval module.
 *
 * Re-exports all public types, functions, and constants used by
 * the benchmark evaluation pipeline.
 *
 * @module inference/eval
 */

// Types
export type {
  TaskCategory,
  BenchmarkPrompt,
  RubricCriteria,
  RubricCriterion,
  EvalResult,
  ComparisonReport,
  AggregatedScores,
  EvalRunConfig,
  EvalRunSummary,
} from './types.js';

export { TASK_CATEGORIES, DEFAULT_EVAL_CONFIG } from './types.js';

// Benchmarks
export { getBenchmarkSuite } from './benchmarks.js';

// Scorer
export { scoreHeuristic, scoreWithJudge, computeQualityScore } from './scorer.js';
export type { HeuristicScore, JudgeScore } from './scorer.js';

// Runner
export { runEvaluation, runSingleEval } from './runner.js';
export type { PromptEvalOutcome } from './runner.js';

// Comparison
export { generateComparisonReport, formatReportSummary } from './comparison.js';

// Store
export {
  saveEvalResults,
  loadEvalResults,
  loadAllCompanionResults,
  getEvalHistory,
} from './store.js';
