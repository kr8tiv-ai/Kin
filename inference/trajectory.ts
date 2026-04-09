/**
 * Trajectory Persistence — Structured interaction logging for KIN companions
 *
 * Logs every LLM interaction with metadata for:
 * - Training data collection (frontier → local model distillation)
 * - User profiling and observation extraction
 * - Cost tracking and analytics
 * - Quality auditing
 *
 * All writes are fire-and-forget (non-blocking) to avoid adding latency.
 *
 * Interaction logging concept inspired by milady-ai
 * (https://github.com/milady-ai/milady). All code is original.
 *
 * @module inference/trajectory
 */

import type { FrontierProviderId } from './providers/types.js';

// ============================================================================
// Types
// ============================================================================

export interface TrajectoryObservation {
  type: 'preference' | 'fact' | 'goal' | 'skill_level' | 'topic_interest';
  content: string;
  confidence: number; // 0-1
}

export interface TrajectoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  companionId: string;
  provider: FrontierProviderId | 'local';
  model: string;
  route: string;
  userMessageLength: number;
  responseLength: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  observations: TrajectoryObservation[];
}

export type TrajectoryInput = Omit<TrajectoryEntry, 'id' | 'timestamp'>;

// ============================================================================
// Logger
// ============================================================================

export class TrajectoryLogger {
  private entries: TrajectoryEntry[] = [];
  private maxEntries = 5000;
  private flushCallback?: (entries: TrajectoryEntry[]) => Promise<void>;

  constructor(opts?: {
    maxEntries?: number;
    onFlush?: (entries: TrajectoryEntry[]) => Promise<void>;
  }) {
    this.maxEntries = opts?.maxEntries ?? 5000;
    this.flushCallback = opts?.onFlush;
  }

  /**
   * Log a trajectory entry. Non-blocking — safe to fire-and-forget.
   */
  async log(input: TrajectoryInput): Promise<void> {
    const entry: TrajectoryEntry = {
      ...input,
      id: `traj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.splice(0, this.entries.length - this.maxEntries);
      // Fire flush callback with overflow entries (for SQLite persistence)
      if (this.flushCallback) {
        this.flushCallback(overflow).catch(() => {});
      }
    }

    console.debug(
      `[trajectory] ${entry.provider}/${entry.model} | ` +
      `route=${entry.route} | companion=${entry.companionId} | ` +
      `in=${entry.inputTokens} out=${entry.outputTokens} | ` +
      `${entry.latencyMs.toFixed(0)}ms | $${entry.costUsd.toFixed(4)}`,
    );
  }

  /**
   * Get recent trajectory entries for a user.
   */
  getRecent(userId?: string, limit: number = 50): TrajectoryEntry[] {
    const filtered = userId
      ? this.entries.filter(e => e.userId === userId)
      : this.entries;
    return filtered.slice(-limit);
  }

  /**
   * Get aggregate stats for a user.
   */
  getStats(userId: string): {
    totalInteractions: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    providerBreakdown: Record<string, number>;
    avgLatencyMs: number;
  } {
    const userEntries = this.entries.filter(e => e.userId === userId);

    const providerBreakdown: Record<string, number> = {};
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalLatency = 0;

    for (const entry of userEntries) {
      providerBreakdown[entry.provider] = (providerBreakdown[entry.provider] ?? 0) + 1;
      totalCost += entry.costUsd;
      totalInput += entry.inputTokens;
      totalOutput += entry.outputTokens;
      totalLatency += entry.latencyMs;
    }

    return {
      totalInteractions: userEntries.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      providerBreakdown,
      avgLatencyMs: userEntries.length > 0 ? totalLatency / userEntries.length : 0,
    };
  }

  /**
   * Export all entries (for external persistence or analysis).
   */
  export(): TrajectoryEntry[] {
    return [...this.entries];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let logger: TrajectoryLogger | null = null;

export function getTrajectoryLogger(): TrajectoryLogger {
  if (!logger) {
    logger = new TrajectoryLogger();
    console.debug('[trajectory] Logger initialized');
  }
  return logger;
}
