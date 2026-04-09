/**
 * Training Data Collector — Structured JSONL output for SFT fine-tuning
 *
 * Collects frontier conversation pairs as per-companion JSONL files.
 * Only writes when privacy mode is 'shared' and route is not 'local'.
 * Raw conversations never leave the device for training when private.
 *
 * Privacy contract:
 * - privacyMode !== 'shared' → no data written, ever
 * - route === 'local' → no data written (local responses aren't useful for distillation)
 * - All writes are fire-and-forget (errors logged, never thrown)
 *
 * @module inference/training-data
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface TrainingCollectParams {
  userId: string;
  companionId: string;
  privacyMode: string;
  systemPrompt: string;
  userMessage: string;
  assistantResponse: string;
  route: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface TrainingCollectResult {
  written: boolean;
  filePath?: string;
}

interface SFTMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SFTLine {
  messages: SFTMessage[];
  metadata: {
    companionId: string;
    timestamp: string;
    provider: string;
    model: string;
    latencyMs: number;
  };
}

// ============================================================================
// Collector
// ============================================================================

export class TrainingDataCollector {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join('data', 'training');
  }

  /**
   * Collect a conversation pair for training. Fire-and-forget — never throws.
   */
  async collect(params: TrainingCollectParams): Promise<TrainingCollectResult> {
    try {
      // Privacy gate: only write when explicitly shared
      if (params.privacyMode !== 'shared') {
        return { written: false };
      }

      // Route gate: local responses aren't useful for distillation
      if (params.route === 'local') {
        return { written: false };
      }

      // Build SFT chat format line
      const line: SFTLine = {
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userMessage },
          { role: 'assistant', content: params.assistantResponse },
        ],
        metadata: {
          companionId: params.companionId,
          timestamp: new Date().toISOString(),
          provider: params.provider,
          model: params.model,
          latencyMs: params.latencyMs,
        },
      };

      const jsonLine = JSON.stringify(line);
      const dir = path.join(this.basePath, params.companionId);
      const filePath = path.join(dir, 'training.jsonl');

      // Ensure directory exists
      await fs.promises.mkdir(dir, { recursive: true });

      // Append JSONL line
      await fs.promises.appendFile(filePath, jsonLine + '\n', 'utf-8');

      console.debug(`[training-data] Wrote to ${filePath} (${jsonLine.length} bytes)`);
      return { written: true, filePath };
    } catch (err) {
      console.error('[training-data] Failed to write training data:', err instanceof Error ? err.message : String(err));
      return { written: false };
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let collector: TrainingDataCollector | null = null;

export function getTrainingDataCollector(): TrainingDataCollector {
  if (!collector) {
    collector = new TrainingDataCollector();
    console.debug('[training-data] Collector initialized');
  }
  return collector;
}
