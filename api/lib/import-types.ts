/**
 * Import Archive Type Definitions
 *
 * Defines result shapes for the per-category import pipeline.
 * Each importer returns an ImportCategoryResult; the orchestrator
 * aggregates them into an ImportResult.
 *
 * @module api/lib/import-types
 */

// ============================================================================
// Per-Category Import Result
// ============================================================================

export interface ImportCategoryResult {
  /** Category name (e.g. 'userProfile', 'companions') */
  category: string;
  /** Number of records successfully imported */
  imported: number;
  /** Number of records skipped (FK validation, malformed, etc.) */
  skipped: number;
  /** Specific error messages for skipped/failed records */
  errors: string[];
}

// ============================================================================
// Full Import Result
// ============================================================================

export interface ImportResult {
  /** Per-category results in execution order */
  categories: ImportCategoryResult[];
  /** Total records imported across all categories */
  totalImported: number;
  /** Total records skipped across all categories */
  totalSkipped: number;
  /** Total error count across all categories */
  totalErrors: number;
  /** Import duration in milliseconds */
  durationMs: number;
}
