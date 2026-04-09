/**
 * Training Data Curation — JSONL reading, hashing, and filtering for SFT review
 *
 * Reads per-companion JSONL files produced by TrainingDataCollector,
 * computes deterministic SHA-256 hashes per line for curation state,
 * and filters entries by builder verdicts for export.
 *
 * @module inference/training-curation
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface SFTMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SFTLine {
  messages: SFTMessage[];
  metadata: {
    companionId: string;
    timestamp: string;
    provider: string;
    model: string;
    latencyMs: number;
  };
}

export interface TrainingEntry {
  hash: string;
  line: SFTLine;
  rawLine: string;
}

// ============================================================================
// Hash
// ============================================================================

/**
 * Compute a deterministic SHA-256 hex hash of a raw JSONL line.
 */
export function computeEntryHash(jsonLine: string): string {
  return createHash('sha256').update(jsonLine).digest('hex');
}

// ============================================================================
// Read
// ============================================================================

/**
 * Read and parse a companion's training JSONL file.
 *
 * Returns an array of TrainingEntry objects with hash, parsed line, and raw text.
 * Skips malformed lines; logs a single batched warning with all bad line numbers.
 * Returns empty array for missing files/directories — never throws.
 */
export async function readTrainingEntries(
  companionId: string,
  basePath?: string,
): Promise<TrainingEntry[]> {
  const base = basePath ?? path.join('data', 'training');
  const filePath = path.join(base, companionId, 'training.jsonl');

  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      console.debug(`[training-curation] No training file for companion '${companionId}' at ${filePath}`);
    } else {
      console.warn(`[training-curation] Failed to read ${filePath}:`, err instanceof Error ? err.message : String(err));
    }
    return [];
  }

  const lines = content.split('\n');
  const entries: TrainingEntry[] = [];
  const malformedLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!.trim();
    if (rawLine.length === 0) continue;

    try {
      const parsed = JSON.parse(rawLine) as SFTLine;
      // Basic shape validation
      if (!parsed.messages || !Array.isArray(parsed.messages)) {
        malformedLines.push(i + 1);
        continue;
      }
      entries.push({
        hash: computeEntryHash(rawLine),
        line: parsed,
        rawLine,
      });
    } catch {
      malformedLines.push(i + 1);
    }
  }

  if (malformedLines.length > 0) {
    console.warn(`[training-curation] ${malformedLines.length} malformed line(s) in ${filePath} at lines: ${malformedLines.join(', ')}`);
  }

  return entries;
}

// ============================================================================
// Filter
// ============================================================================

/**
 * Filter training entries to only those with an 'approved' verdict.
 * Returns raw JSONL lines ready for export.
 */
export function filterApprovedEntries(
  entries: TrainingEntry[],
  verdicts: Map<string, string>,
): string[] {
  return entries
    .filter((entry) => verdicts.get(entry.hash) === 'approved')
    .map((entry) => entry.rawLine);
}
