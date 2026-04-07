/**
 * Distillation Pipeline — Barrel export of all public types and functions.
 *
 * Selects high-quality frontier eval results and converts them to SFT
 * training data for local model fine-tuning.
 *
 * @module inference/distill
 */

// Types
export type { DistillCandidate, DistillConfig, DistillRunSummary } from './types.js';
export { DEFAULT_DISTILL_CONFIG } from './types.js';

// Selector
export { selectDistillCandidates } from './selector.js';

// Converter
export type { DistillSFTLine, DistillSFTMessage } from './converter.js';
export { convertToSFT } from './converter.js';

// Store
export { saveDistillDataset, loadDistillDataset, loadExistingHashes } from './store.js';

// Runner (main entry point)
export { runDistillation } from './runner.js';
