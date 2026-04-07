/**
 * Distill Dataset Store — JSONL persistence for distillation output.
 *
 * Writes per-companion distillation datasets as append-only JSONL:
 *   data/distill/{companionId}/distill.jsonl
 *
 * Follows the same directory pattern as eval/store.ts. All writes are
 * awaited (batch operation, not a hot path).
 *
 * @module inference/distill/store
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeEntryHash } from '../training-curation.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_BASE_PATH = path.join('data', 'distill');

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Save distillation JSONL lines, appending to the companion's dataset file.
 * Creates the directory structure if it doesn't exist.
 *
 * @param lines - Array of JSONL strings to append
 * @param companionId - Companion identifier (determines the output directory)
 * @param basePath - Override base path (default: data/distill)
 * @returns The file path written to
 */
export async function saveDistillDataset(
  lines: string[],
  companionId: string,
  basePath?: string,
): Promise<string> {
  const base = basePath ?? DEFAULT_BASE_PATH;
  const dir = path.join(base, companionId);
  const filePath = path.join(dir, 'distill.jsonl');

  await fs.promises.mkdir(dir, { recursive: true });

  if (lines.length > 0) {
    const content = lines.join('\n') + '\n';
    await fs.promises.appendFile(filePath, content, 'utf-8');
    console.log(`[distill-store] Appended ${lines.length} lines to ${filePath}`);
  }

  return filePath;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Load all lines from a companion's distillation dataset.
 * Returns empty array if the file doesn't exist yet.
 *
 * @param companionId - Companion identifier
 * @param basePath - Override base path (default: data/distill)
 */
export async function loadDistillDataset(
  companionId: string,
  basePath?: string,
): Promise<string[]> {
  const base = basePath ?? DEFAULT_BASE_PATH;
  const filePath = path.join(base, companionId, 'distill.jsonl');

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(Boolean);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // No dataset yet — not an error
    }
    console.error(`[distill-store] Failed to read ${filePath}:`, err);
    return [];
  }
}

/**
 * Load existing content hashes from a companion's distillation dataset.
 * Used for deduplication — if a line's hash is already in the set, skip it.
 *
 * Uses SHA-256 content hashing per K011.
 *
 * @param companionId - Companion identifier
 * @param basePath - Override base path (default: data/distill)
 */
export async function loadExistingHashes(
  companionId: string,
  basePath?: string,
): Promise<Set<string>> {
  const lines = await loadDistillDataset(companionId, basePath);
  const hashes = new Set<string>();

  for (const line of lines) {
    hashes.add(computeEntryHash(line));
  }

  return hashes;
}
