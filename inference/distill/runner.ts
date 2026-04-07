/**
 * Distillation Runner — Orchestrates the full distillation pipeline.
 *
 * Pipeline: load existing hashes → select candidates → convert to SFT →
 * deduplicate via content hash → save new lines → build summary.
 *
 * @module inference/distill/runner
 */

import { computeEntryHash } from '../training-curation.js';
import { selectDistillCandidates } from './selector.js';
import { convertToSFT } from './converter.js';
import { saveDistillDataset, loadDistillDataset, loadExistingHashes } from './store.js';
import type { DistillConfig, DistillRunSummary } from './types.js';
import { DEFAULT_DISTILL_CONFIG } from './types.js';

/** Minimum entries for fine-tune.py to accept the dataset (MIN_VALID_ENTRIES) */
const MIN_FINE_TUNE_ENTRIES = 5;

/**
 * Run the distillation pipeline for a single companion.
 *
 * Orchestrates:
 * 1. Load existing content hashes (for dedup)
 * 2. Select candidates from eval results (frontier + quality threshold)
 * 3. Convert each candidate to SFT JSONL
 * 4. Deduplicate against existing dataset via SHA-256 hash
 * 5. Save new lines to per-companion distill dataset
 * 6. Build summary with counts and warnings
 *
 * @param companionId - Companion to run distillation for
 * @param config - Partial config overrides (merged with defaults)
 * @param basePath - Override base path for both eval reads and distill writes (for testing)
 * @returns Summary of the distillation run
 */
export async function runDistillation(
  companionId: string,
  config?: Partial<DistillConfig>,
  basePath?: string,
): Promise<DistillRunSummary> {
  const cfg: DistillConfig = { ...DEFAULT_DISTILL_CONFIG, ...config };
  const timestamp = new Date().toISOString();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;

  console.log(
    `[distill-runner] Starting distillation for '${companionId}' (threshold: ${cfg.qualityThreshold})`,
  );

  // Step 1: Load existing hashes for dedup
  const existingHashes = await loadExistingHashes(companionId, basePath);

  // Step 2: Select candidates from eval results
  // Pass basePath as the eval base path — eval data lives under data/eval/{companionId}
  const candidates = await selectDistillCandidates(companionId, cfg, basePath);

  if (candidates.length === 0) {
    console.log(`[distill-runner] No candidates for '${companionId}' — nothing to distill`);
    const existingLines = await loadDistillDataset(companionId, basePath);
    return {
      companionId,
      selectedCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      datasetSize: existingLines.length,
      warnings: ['No candidates passed quality threshold — no new data written'],
      timestamp,
    };
  }

  // Step 3 & 4: Convert to SFT, deduplicate
  const newLines: string[] = [];

  for (const candidate of candidates) {
    const sftLine = convertToSFT(candidate);
    const jsonLine = JSON.stringify(sftLine);
    const hash = computeEntryHash(jsonLine);

    if (existingHashes.has(hash)) {
      duplicateCount++;
      continue;
    }

    // Mark as seen for intra-run dedup
    existingHashes.add(hash);
    newLines.push(jsonLine);
  }

  skippedCount = candidates.length - newLines.length - duplicateCount;

  // Step 5: Save new lines
  if (newLines.length > 0) {
    await saveDistillDataset(newLines, companionId, basePath);
    console.log(`[distill-runner] Wrote ${newLines.length} new lines for '${companionId}'`);
  }

  // Step 6: Build summary
  const allLines = await loadDistillDataset(companionId, basePath);
  const datasetSize = allLines.length;

  if (datasetSize < MIN_FINE_TUNE_ENTRIES) {
    warnings.push(
      `Dataset has ${datasetSize} entries — below minimum ${MIN_FINE_TUNE_ENTRIES} required by fine-tune.py`,
    );
  }

  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} duplicate(s) skipped via content hash`);
  }

  const summary: DistillRunSummary = {
    companionId,
    selectedCount: newLines.length,
    skippedCount,
    duplicateCount,
    datasetSize,
    warnings,
    timestamp,
  };

  console.log(
    `[distill-runner] ${companionId}: selected=${newLines.length} skipped=${skippedCount} dupes=${duplicateCount} total=${datasetSize}`,
  );

  return summary;
}
