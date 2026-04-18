/**
 * Training Scheduler — Real scheduler backed by retrain-loop.ts.
 *
 * Replaces the former placeholder scheduler with:
 * - Per-companion serialization via Promise locks (no concurrent retrains)
 * - Job tracking with statuses derived from RetrainResult
 * - Interval-based recurring schedules with proper cleanup
 * - destroy() to clear all intervals (test/server shutdown safety)
 *
 * @module training/scheduler
 */

import { runRetrainLoop, checkRetrainReadiness, loadRetrainHistory } from './retrain-loop.js';
import type { RetrainConfig, RetrainResult } from './retrain-loop.js';

// ============================================================================
// Interfaces (preserved — consumed by other modules)
// ============================================================================

export interface TrainingConfig {
  baseModel: string;
  outputModel: string;
  epochs: number;
  learningRate: number;
  maxSeqLength: number;
  minAssistantChars: number;
  maxDuplicateRatio: number;
  batchSize: number;
  qloraRank: number;
  targetModules: string[];
}

export interface TrainingJob {
  id: string;
  config: TrainingConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metrics?: {
    loss: number;
    evalLoss: number;
    epoch: number;
  };
  /** Companion this job was triggered for (may be undefined for legacy jobs) */
  companionId?: string;
  /** Raw retrain result when completed */
  retrainResult?: RetrainResult;
}

export interface ModelVersion {
  id: string;
  name: string;
  baseModel: string;
  trainedAt: number;
  trainingDataPairs: number;
  evalScore: number;
  status: 'active' | 'archived';
}

// ============================================================================
// Constants
// ============================================================================

const VALID_COMPANION_IDS = ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst'];

const DEFAULT_CONFIG: TrainingConfig = {
  baseModel: 'qwen3:32b',
  outputModel: 'kin-qwen3:32b-v1',
  epochs: 3,
  learningRate: 2e-4,
  maxSeqLength: 1024,
  minAssistantChars: 0,
  maxDuplicateRatio: 1.0,
  batchSize: 4,
  qloraRank: 16,
  targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
};

// ============================================================================
// Scheduler
// ============================================================================

class TrainingScheduler {
  private jobs: Map<string, TrainingJob> = new Map();
  private models: Map<string, ModelVersion> = new Map();
  private schedules: Map<string, { cron: string; action: () => void }> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Per-companion lock — prevents concurrent retrains for the same companion.
   * Each entry is a Promise that resolves when the current retrain finishes.
   */
  private companionLocks: Map<string, Promise<void>> = new Map();

  /**
   * Schedule a training job for a specific companion.
   * Delegates to runRetrainLoop() from retrain-loop.ts.
   */
  async scheduleJob(companionId: string, config?: Partial<TrainingConfig>): Promise<string> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const jobId = `job-${Date.now()}-${companionId}`;

    const job: TrainingJob = {
      id: jobId,
      config: fullConfig,
      status: 'pending',
      companionId,
    };

    this.jobs.set(jobId, job);

    // Run with per-companion serialization — fire and return jobId
    this.runWithLock(companionId, jobId).catch(() => {
      // Error already captured in job status
    });

    return jobId;
  }

  /**
   * Serialize retrain runs per companion — no concurrent retrains for the same ID.
   */
  private async runWithLock(companionId: string, jobId: string): Promise<void> {
    const existingLock = this.companionLocks.get(companionId) ?? Promise.resolve();

    const lock = existingLock.then(async () => {
      await this.executeJob(companionId, jobId);
    });

    // Store the new lock (chains after previous)
    this.companionLocks.set(companionId, lock.catch(() => {}));

    // Await this specific run (propagate errors to job status)
    await lock;
  }

  /**
   * Execute a single retrain job via retrain-loop.ts.
   */
  private async executeJob(companionId: string, jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.startedAt = Date.now();

    const retrainConfig: RetrainConfig = {
      baseModel: job.config.baseModel,
      epochs: job.config.epochs,
      learningRate: job.config.learningRate,
      maxSeqLength: job.config.maxSeqLength,
      minAssistantChars: job.config.minAssistantChars,
      maxDuplicateRatio: job.config.maxDuplicateRatio,
    };

    try {
      const result = await runRetrainLoop(companionId, retrainConfig);
      job.retrainResult = result;

      if (result.success) {
        job.status = 'completed';
        job.completedAt = Date.now();

        // Register model version
        if (result.modelName) {
          const version: ModelVersion = {
            id: `model-${Date.now()}-${companionId}`,
            name: result.modelName,
            baseModel: job.config.baseModel,
            trainedAt: Date.now(),
            trainingDataPairs: result.datasetSize,
            evalScore: 0, // Real eval scores come from future eval pipeline
            status: 'active',
          };
          this.models.set(version.id, version);
        }
      } else {
        job.status = 'failed';
        job.error = result.trainingError ?? 'Unknown retrain failure';
      }
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Trigger retraining — one companion or all 6 sequentially.
   * Returns array of job IDs.
   */
  async triggerRetrain(companionId?: string): Promise<string[]> {
    const ids = companionId ? [companionId] : VALID_COMPANION_IDS;
    const jobIds: string[] = [];

    for (const cid of ids) {
      const jobId = await this.scheduleJob(cid);
      jobIds.push(jobId);
    }

    return jobIds;
  }

  getJob(jobId: string): TrainingJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): TrainingJob[] {
    return Array.from(this.jobs.values());
  }

  getActiveModel(): ModelVersion | undefined {
    for (const model of this.models.values()) {
      if (model.status === 'active') {
        return model;
      }
    }
    return undefined;
  }

  listModels(): ModelVersion[] {
    return Array.from(this.models.values());
  }

  /**
   * Schedule a recurring action at a fixed interval.
   */
  scheduleInterval(name: string, intervalMs: number, action: () => void): void {
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
    }

    const handle = setInterval(action, intervalMs);
    this.intervals.set(name, handle);
    this.schedules.set(name, { cron: `every ${intervalMs}ms`, action });
  }

  cancelSchedule(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
      this.schedules.delete(name);
    }
  }

  getSchedules(): Array<{ name: string; cron: string }> {
    return Array.from(this.schedules.entries()).map(([name, { cron }]) => ({ name, cron }));
  }

  /**
   * Clear all intervals and locks — prevents leaks in tests and server shutdown.
   */
  destroy(): void {
    for (const [name, interval] of this.intervals.entries()) {
      clearInterval(interval);
      this.intervals.delete(name);
      this.schedules.delete(name);
    }
    this.companionLocks.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let scheduler: TrainingScheduler | null = null;

export function getTrainingScheduler(): TrainingScheduler {
  if (!scheduler) {
    scheduler = new TrainingScheduler();
  }
  return scheduler;
}

/**
 * Reset the singleton — for tests only.
 */
export function resetTrainingScheduler(): void {
  if (scheduler) {
    scheduler.destroy();
    scheduler = null;
  }
}

export { checkRetrainReadiness, loadRetrainHistory };
export type { RetrainResult, RetrainConfig };
