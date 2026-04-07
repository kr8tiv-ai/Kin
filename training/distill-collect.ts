/**
 * @deprecated Use inference/distill instead.
 *
 * This module is a compatibility shim. The real distillation pipeline
 * lives in inference/distill/ with proper eval integration, SFT conversion,
 * content-hash deduplication, and per-companion dataset management.
 */

// Re-export the primary public API from the new location
export { runDistillation } from '../inference/distill/index.js';
export type { DistillRunSummary } from '../inference/distill/index.js';
