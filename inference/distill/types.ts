/**
 * Distillation Pipeline Types — Data shapes for selecting and converting
 * high-quality frontier eval results into SFT training data.
 *
 * @module inference/distill/types
 */

// ============================================================================
// Distill Candidate
// ============================================================================

/**
 * A single candidate for distillation — a frontier eval result that passed
 * quality filtering, enriched with the prompt context needed for SFT output.
 */
export interface DistillCandidate {
  /** The benchmark prompt ID this result came from */
  promptId: string;
  /** Companion this candidate targets */
  companionId: string;
  /** System prompt used during evaluation */
  systemPrompt: string;
  /** User message from the benchmark prompt */
  userMessage: string;
  /** The frontier model's response text */
  frontierResponse: string;
  /** Combined quality score (0-1) from the eval pipeline */
  qualityScore: number;
  /** Model identifier (e.g., 'gpt-5.4') */
  model: string;
  /** Provider identifier (e.g., 'openai') */
  provider: string;
  /** ISO-8601 timestamp when the eval was run */
  evaluatedAt: string;
}

// ============================================================================
// Distill Config
// ============================================================================

/**
 * Configuration for a distillation run.
 */
export interface DistillConfig {
  /** Minimum quality score to include (0-1). Default: 0.7 per D035 calibration. */
  qualityThreshold: number;
  /** Optional filter — only process these companion IDs */
  companionIds?: string[];
  /** Optional filter — only include results from these task categories */
  categories?: string[];
}

/** Default distillation configuration. */
export const DEFAULT_DISTILL_CONFIG: DistillConfig = {
  qualityThreshold: 0.7,
};

// ============================================================================
// Distill Run Summary
// ============================================================================

/**
 * Summary of a completed distillation run for a single companion.
 */
export interface DistillRunSummary {
  /** Companion ID this run processed */
  companionId: string;
  /** Number of candidates that passed quality/filter thresholds */
  selectedCount: number;
  /** Number of candidates skipped (prompt not found, below threshold, etc.) */
  skippedCount: number;
  /** Number of candidates skipped due to deduplication */
  duplicateCount: number;
  /** Total lines in the companion's distill dataset after this run */
  datasetSize: number;
  /** Human-readable warnings (e.g., dataset too small for fine-tuning) */
  warnings: string[];
  /** ISO-8601 timestamp of this run */
  timestamp: string;
}
