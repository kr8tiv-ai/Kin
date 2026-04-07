/**
 * Retrain Loop — Orchestrates the distill-to-fine-tune pipeline.
 *
 * Bridges S02 distillation output into the existing training pipeline:
 *   distill JSONL → fine-tune.py → Modelfile → Ollama registration
 *
 * Provides readiness gating (≥5 entries), on-demand execution,
 * and durable run history via append-only JSONL.
 *
 * Usage:
 *   npx tsx training/retrain-loop.ts --companion-id cipher
 *   npx tsx training/retrain-loop.ts --companion-id cipher --run-distill-first
 *   npx tsx training/retrain-loop.ts --companion-id cipher --dry-run
 *
 * @module training/retrain-loop
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

import { runPipeline, validateCompanionId } from './train-companion.js';
import type { TrainCompanionArgs } from './train-companion.js';
import { runDistillation } from '../inference/distill/runner.js';
import { loadDistillDataset } from '../inference/distill/store.js';
import type { DistillRunSummary } from '../inference/distill/types.js';
import { getModelName } from './modelfile-generator.js';

// ============================================================================
// Constants
// ============================================================================

/** Minimum entries required by fine-tune.py to accept a dataset. */
export const MIN_VALID_ENTRIES = 5;

const DEFAULT_DISTILL_BASE = path.join('data', 'distill');
const DEFAULT_HISTORY_BASE = path.join('data', 'retrain');
const DEFAULT_BASE_MODEL = 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit';

// ============================================================================
// Types
// ============================================================================

/**
 * Optional overrides for a retrain run.
 */
export interface RetrainConfig {
  /** Run distillation before training (default: false) */
  runDistillFirst?: boolean;
  /** Skip the Python training step — useful for testing pipeline wiring */
  skipTraining?: boolean;
  /** Dry run — validate everything but don't mutate (passed to runPipeline) */
  dryRun?: boolean;
  /** Base model for fine-tuning (default: unsloth/Llama-3.2-1B-Instruct-bnb-4bit) */
  baseModel?: string;
  /** Quality threshold for distillation candidate selection (default: 0.7) */
  qualityThreshold?: number;
}

/**
 * Readiness check result — tells the caller whether there's enough data to retrain.
 */
export interface RetrainReadiness {
  ready: boolean;
  datasetSize: number;
  dataPath: string;
  reason?: string;
}

/**
 * Result of a single retrain loop execution.
 */
export interface RetrainResult {
  success: boolean;
  companionId: string;
  datasetSize: number;
  distillSummary?: DistillRunSummary;
  trainingError?: string;
  startedAt: string;
  completedAt: string;
  modelName?: string;
}

/**
 * A persisted history entry — extends RetrainResult with a content-hash ID (K011).
 */
export interface RetrainHistoryEntry extends RetrainResult {
  /** Deterministic SHA-256 content hash of the serialized result */
  id: string;
}

// ============================================================================
// Logging
// ============================================================================

function log(msg: string): void {
  console.log(`[retrain-loop] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[retrain-loop] WARNING: ${msg}`);
}

// ============================================================================
// Readiness Gating
// ============================================================================

/**
 * Check whether a companion has enough distillation data to retrain.
 *
 * Loads the distill dataset via store.ts and checks length ≥ MIN_VALID_ENTRIES.
 *
 * @param companionId - Companion to check
 * @param basePath - Override base path for distill data (default: data/distill)
 * @returns Readiness status with dataset size and data path
 */
export async function checkRetrainReadiness(
  companionId: string,
  basePath?: string,
): Promise<RetrainReadiness> {
  const base = basePath ?? DEFAULT_DISTILL_BASE;
  const dataPath = path.join(base, companionId, 'distill.jsonl');

  const lines = await loadDistillDataset(companionId, basePath);
  const datasetSize = lines.length;

  if (datasetSize < MIN_VALID_ENTRIES) {
    return {
      ready: false,
      datasetSize,
      dataPath,
      reason: `Dataset has ${datasetSize} entries — need at least ${MIN_VALID_ENTRIES} for fine-tuning`,
    };
  }

  return { ready: true, datasetSize, dataPath };
}

// ============================================================================
// Core Retrain Loop
// ============================================================================

/**
 * Run the full retrain loop for a single companion.
 *
 * Orchestration sequence:
 * 1. Validate companion ID
 * 2. Optionally run distillation first
 * 3. Check readiness — abort if insufficient data
 * 4. Build TrainCompanionArgs with distill JSONL path
 * 5. Call runPipeline (delegates to Python fine-tune + Ollama registration)
 * 6. Persist history entry (on both success and failure)
 * 7. Return result
 *
 * @param companionId - Companion to retrain
 * @param config - Optional overrides
 * @returns Result of the retrain run
 */
export async function runRetrainLoop(
  companionId: string,
  config?: RetrainConfig,
): Promise<RetrainResult> {
  const startedAt = new Date().toISOString();
  let distillSummary: DistillRunSummary | undefined;

  log(`Starting retrain loop for '${companionId}'`);

  // Step 1: Validate companion
  try {
    validateCompanionId(companionId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`Companion validation failed: ${errorMsg}`);
    const result: RetrainResult = {
      success: false,
      companionId,
      datasetSize: 0,
      trainingError: errorMsg,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    await saveRetrainHistory(result, companionId);
    return result;
  }

  // Step 2: Optionally run distillation first
  if (config?.runDistillFirst) {
    log(`Running distillation first for '${companionId}'`);
    try {
      distillSummary = await runDistillation(companionId, {
        qualityThreshold: config.qualityThreshold ?? 0.7,
      });
      log(`Distillation complete: ${distillSummary.selectedCount} new entries, ${distillSummary.datasetSize} total`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warn(`Distillation failed: ${errorMsg}`);
      const result: RetrainResult = {
        success: false,
        companionId,
        datasetSize: 0,
        distillSummary,
        trainingError: `Distillation failed: ${errorMsg}`,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      await saveRetrainHistory(result, companionId);
      return result;
    }
  }

  // Step 3: Check readiness
  const readiness = await checkRetrainReadiness(companionId);
  if (!readiness.ready) {
    log(`Not ready to retrain '${companionId}': ${readiness.reason}`);
    const result: RetrainResult = {
      success: false,
      companionId,
      datasetSize: readiness.datasetSize,
      distillSummary,
      trainingError: readiness.reason,
      startedAt,
      completedAt: new Date().toISOString(),
    };
    await saveRetrainHistory(result, companionId);
    return result;
  }

  log(`Readiness check passed: ${readiness.datasetSize} entries available`);

  // Step 4: Build training args — use distill JSONL path, NOT training.jsonl
  const dataPath = path.join('data', 'distill', companionId, 'distill.jsonl');
  const outputDir = path.join('training', 'output', companionId);
  const modelName = getModelName(companionId);

  const trainArgs: TrainCompanionArgs = {
    companionId,
    dataPath,
    baseModel: config?.baseModel ?? DEFAULT_BASE_MODEL,
    outputDir,
    dryRun: config?.dryRun ?? false,
    skipTraining: config?.skipTraining ?? false,
  };

  log(`Training args: dataPath=${trainArgs.dataPath}, baseModel=${trainArgs.baseModel}, dryRun=${trainArgs.dryRun}`);

  // Step 5: Run training pipeline
  try {
    await runPipeline(trainArgs);
    log(`Training pipeline completed for '${companionId}'`);

    const result: RetrainResult = {
      success: true,
      companionId,
      datasetSize: readiness.datasetSize,
      distillSummary,
      startedAt,
      completedAt: new Date().toISOString(),
      modelName,
    };

    // Step 6: Persist history (success)
    await saveRetrainHistory(result, companionId);
    log(`History entry saved for '${companionId}' (success)`);

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    warn(`Training pipeline failed for '${companionId}': ${errorMsg}`);

    const result: RetrainResult = {
      success: false,
      companionId,
      datasetSize: readiness.datasetSize,
      distillSummary,
      trainingError: errorMsg,
      startedAt,
      completedAt: new Date().toISOString(),
      modelName,
    };

    // Step 6: Persist history (failure)
    await saveRetrainHistory(result, companionId);
    log(`History entry saved for '${companionId}' (failure)`);

    return result;
  }
}

// ============================================================================
// History Persistence
// ============================================================================

/**
 * Compute a content-hash ID for a retrain result (K011 pattern).
 */
function computeHistoryId(result: RetrainResult): string {
  const content = JSON.stringify(result);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Load retrain history for a companion from JSONL.
 *
 * @param companionId - Companion identifier
 * @param basePath - Override base path (default: data/retrain)
 * @returns Array of history entries, oldest first
 */
export async function loadRetrainHistory(
  companionId: string,
  basePath?: string,
): Promise<RetrainHistoryEntry[]> {
  const base = basePath ?? DEFAULT_HISTORY_BASE;
  const filePath = path.join(base, companionId, 'history.jsonl');

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: RetrainHistoryEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as RetrainHistoryEntry);
      } catch {
        warn(`Skipping malformed history line in ${filePath}`);
      }
    }

    return entries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // No history yet — not an error
    }
    warn(`Failed to read history from ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Save a retrain result as a history entry, appending to JSONL.
 * Creates the directory structure if it doesn't exist.
 *
 * @param result - The retrain result to persist
 * @param companionId - Companion identifier
 * @param basePath - Override base path (default: data/retrain)
 */
export async function saveRetrainHistory(
  result: RetrainResult,
  companionId: string,
  basePath?: string,
): Promise<void> {
  const base = basePath ?? DEFAULT_HISTORY_BASE;
  const dir = path.join(base, companionId);
  const filePath = path.join(dir, 'history.jsonl');

  await fs.promises.mkdir(dir, { recursive: true });

  const entry: RetrainHistoryEntry = {
    ...result,
    id: computeHistoryId(result),
  };

  const line = JSON.stringify(entry) + '\n';
  await fs.promises.appendFile(filePath, line, 'utf-8');
  log(`History appended to ${filePath}`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function parseCliArgs(argv: string[]): { companionId: string; config: RetrainConfig } {
  let companionId = '';
  const config: RetrainConfig = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--companion-id':
        companionId = argv[++i] ?? '';
        break;
      case '--run-distill-first':
        config.runDistillFirst = true;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--skip-training':
        config.skipTraining = true;
        break;
      case '--base-model':
        config.baseModel = argv[++i];
        break;
      case '--quality-threshold':
        config.qualityThreshold = parseFloat(argv[++i] ?? '0.7');
        break;
    }
  }

  if (!companionId) {
    console.error('[retrain-loop] ERROR: --companion-id is required');
    process.exit(1);
  }

  return { companionId, config };
}

async function main(): Promise<void> {
  const { companionId, config } = parseCliArgs(process.argv.slice(2));

  log(`CLI invocation: companion=${companionId} config=${JSON.stringify(config)}`);

  const result = await runRetrainLoop(companionId, config);

  if (result.success) {
    log(`✓ Retrain complete for '${companionId}' — model: ${result.modelName}`);
  } else {
    log(`✗ Retrain failed for '${companionId}': ${result.trainingError}`);
    process.exit(1);
  }
}

// CLI guard per K010 — only run when executed directly
const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('retrain-loop.ts') === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error(`[retrain-loop] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
