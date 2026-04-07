/**
 * PipelineManager — Multi-step workflow pipeline execution engine.
 *
 * Chains KinSkills into stored, schedulable sequences with per-step context
 * threading, execution history, and cron-triggered runs. Each step's output
 * becomes the next step's input message; accumulated results are threaded as
 * conversationHistory for downstream context.
 *
 * Pattern: follows `inference/scheduler-manager.ts` singleton export with
 * `getPipelineManager()` / `resetPipelineManager()`.
 *
 * @module inference/pipeline-manager
 */

import { Cron } from 'croner';
import crypto from 'crypto';
import type { ChannelDelivery } from './channel-delivery.js';
import type { SkillContext, SkillResult } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database handle — matches better-sqlite3's Database interface. */
export interface PipelineDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

/** Shape of a single pipeline step stored in the steps JSON array. */
export interface PipelineStep {
  skillName: string;
  skillArgs?: Record<string, unknown>;
  label?: string;
}

/** Row shape from workflow_pipelines table. */
export interface PipelineRow {
  id: string;
  user_id: string;
  companion_id: string;
  name: string;
  description: string | null;
  steps: string; // JSON
  trigger_type: string;
  cron_expression: string | null;
  timezone: string;
  delivery_channel: string;
  delivery_recipient_id: string;
  status: string;
  last_run_at: number | null;
  run_count: number;
  error_count: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/** Row shape from pipeline_runs table. */
export interface PipelineRunRow {
  id: string;
  pipeline_id: string;
  status: string;
  started_at: number;
  completed_at: number | null;
  steps_completed: number;
  steps_total: number;
  error: string | null;
  final_output: string | null;
  created_at: number;
}

/** Row shape from pipeline_step_results table. */
export interface PipelineStepResultRow {
  id: string;
  run_id: string;
  step_index: number;
  skill_name: string;
  input_message: string;
  output_content: string | null;
  output_type: string | null;
  output_metadata: string | null;
  status: string;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  error: string | null;
}

/** Camel-cased pipeline returned to callers. */
export interface Pipeline {
  id: string;
  userId: string;
  companionId: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  triggerType: string;
  cronExpression: string | null;
  timezone: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  status: string;
  lastRunAt: number | null;
  runCount: number;
  errorCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Camel-cased pipeline run returned to callers. */
export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  stepsCompleted: number;
  stepsTotal: number;
  error: string | null;
  finalOutput: string | null;
  createdAt: number;
}

/** Options for creating a new pipeline. */
export interface CreatePipelineOpts {
  userId: string;
  companionId: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  triggerType?: 'manual' | 'cron';
  cronExpression?: string;
  timezone?: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
}

/** Callback to execute a skill by name with a context. */
export type SkillExecutor = (skillName: string, ctx: SkillContext) => Promise<SkillResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

/** Validate the steps JSON shape — must be a non-empty array of { skillName }. */
function validateSteps(steps: unknown): steps is PipelineStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  return steps.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Record<string, unknown>).skillName === 'string' &&
      (s as Record<string, unknown>).skillName !== '',
  );
}

function rowToPipeline(row: PipelineRow): Pipeline {
  let steps: PipelineStep[] = [];
  try {
    const parsed = JSON.parse(row.steps);
    if (validateSteps(parsed)) steps = parsed;
  } catch {
    // leave as empty — corrupted data
  }

  return {
    id: row.id,
    userId: row.user_id,
    companionId: row.companion_id,
    name: row.name,
    description: row.description,
    steps,
    triggerType: row.trigger_type,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    deliveryChannel: row.delivery_channel,
    deliveryRecipientId: row.delivery_recipient_id,
    status: row.status,
    lastRunAt: row.last_run_at,
    runCount: row.run_count,
    errorCount: row.error_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: PipelineRunRow): PipelineRun {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    stepsCompleted: row.steps_completed,
    stepsTotal: row.steps_total,
    error: row.error,
    finalOutput: row.final_output,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// PipelineManager
// ---------------------------------------------------------------------------

export class PipelineManager {
  private db: PipelineDb;
  private channelDelivery: ChannelDelivery;
  private cronJobs = new Map<string, Cron>();
  private skillExecutor: SkillExecutor | null = null;

  constructor(db: PipelineDb, channelDelivery: ChannelDelivery) {
    this.db = db;
    this.channelDelivery = channelDelivery;
  }

  /** Register the callback used to execute skills by name. */
  setSkillExecutor(executor: SkillExecutor): void {
    this.skillExecutor = executor;
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new workflow pipeline. Validates step shapes and cron expression.
   * Starts a Croner instance if trigger_type is 'cron'.
   */
  createPipeline(opts: CreatePipelineOpts): Pipeline {
    if (!validateSteps(opts.steps)) {
      throw new Error(
        'Invalid steps: must be a non-empty array of objects with a "skillName" string property',
      );
    }

    const triggerType = opts.triggerType ?? 'manual';
    const timezone = opts.timezone ?? 'UTC';
    const id = generateId();
    const now = Date.now();

    // Validate cron expression if trigger_type is cron
    if (triggerType === 'cron') {
      if (!opts.cronExpression) {
        throw new Error('cron_expression is required when trigger_type is "cron"');
      }
      try {
        const probe = new Cron(opts.cronExpression, { paused: true, timezone });
        probe.stop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid cron expression "${opts.cronExpression}": ${msg}`);
      }
    }

    const stepsJson = JSON.stringify(opts.steps);

    this.db.prepare(`
      INSERT INTO workflow_pipelines
        (id, user_id, companion_id, name, description, steps,
         trigger_type, cron_expression, timezone,
         delivery_channel, delivery_recipient_id,
         status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id, opts.userId, opts.companionId, opts.name, opts.description ?? null,
      stepsJson, triggerType, opts.cronExpression ?? null, timezone,
      opts.deliveryChannel, opts.deliveryRecipientId,
      now, now,
    );

    // Start cron if applicable
    if (triggerType === 'cron' && opts.cronExpression) {
      this.startCron(id, opts.cronExpression, timezone);
    }

    const row = this.db.prepare('SELECT * FROM workflow_pipelines WHERE id = ?').get(id) as PipelineRow;
    return rowToPipeline(row);
  }

  /** List all pipelines for a user. */
  listPipelines(userId: string): Pipeline[] {
    const rows = this.db.prepare(
      'SELECT * FROM workflow_pipelines WHERE user_id = ? ORDER BY created_at DESC',
    ).all(userId) as PipelineRow[];
    return rows.map(rowToPipeline);
  }

  /** Get a single pipeline by ID. Returns null if not found. */
  getPipeline(pipelineId: string): Pipeline | null {
    const row = this.db.prepare(
      'SELECT * FROM workflow_pipelines WHERE id = ?',
    ).get(pipelineId) as PipelineRow | undefined;
    return row ? rowToPipeline(row) : null;
  }

  /**
   * Delete a pipeline. Checks ownership (userId must match).
   * Cleans up any running Croner instance.
   * Returns true if deleted, false if not found or ownership mismatch.
   */
  deletePipeline(pipelineId: string, userId: string): boolean {
    const row = this.db.prepare(
      'SELECT * FROM workflow_pipelines WHERE id = ?',
    ).get(pipelineId) as PipelineRow | undefined;

    if (!row) return false;
    if (row.user_id !== userId) return false;

    // Stop cron if running
    const cron = this.cronJobs.get(pipelineId);
    if (cron) {
      cron.stop();
      this.cronJobs.delete(pipelineId);
    }

    const result = this.db.prepare('DELETE FROM workflow_pipelines WHERE id = ?').run(pipelineId);
    return result.changes > 0;
  }

  // -----------------------------------------------------------------------
  // Run history
  // -----------------------------------------------------------------------

  /** List runs for a pipeline, most recent first. */
  listRuns(pipelineId: string): PipelineRun[] {
    const rows = this.db.prepare(
      'SELECT * FROM pipeline_runs WHERE pipeline_id = ? ORDER BY started_at DESC',
    ).all(pipelineId) as PipelineRunRow[];
    return rows.map(rowToRun);
  }

  /** Get step results for a specific run. */
  getStepResults(runId: string): PipelineStepResultRow[] {
    return this.db.prepare(
      'SELECT * FROM pipeline_step_results WHERE run_id = ? ORDER BY step_index ASC',
    ).all(runId) as PipelineStepResultRow[];
  }

  // -----------------------------------------------------------------------
  // Execution engine
  // -----------------------------------------------------------------------

  /**
   * Execute a pipeline: run each step sequentially, threading context.
   *
   * Step N's output.content becomes Step N+1's SkillContext.message.
   * Accumulated previous results are passed as conversationHistory.
   *
   * On error-type results, the pipeline halts and records the failure.
   * On success, the final output is delivered via ChannelDelivery.
   */
  async executePipeline(pipelineId: string, triggerMessage?: string): Promise<PipelineRun> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline "${pipelineId}" not found`);
    }

    if (!this.skillExecutor) {
      throw new Error('No skill executor registered — call setSkillExecutor() first');
    }

    const steps = pipeline.steps;
    const runId = generateId();
    const startedAt = Date.now();

    // Create pipeline_run row
    this.db.prepare(`
      INSERT INTO pipeline_runs
        (id, pipeline_id, status, started_at, steps_completed, steps_total, created_at)
      VALUES (?, ?, 'running', ?, 0, ?, ?)
    `).run(runId, pipelineId, startedAt, steps.length, startedAt);

    let currentMessage = triggerMessage ?? pipeline.name;
    const conversationHistory: Array<{ role: string; content: string }> = [];
    let stepsCompleted = 0;
    let finalOutput: string | null = null;
    let runError: string | null = null;
    let runStatus: 'completed' | 'failed' | 'partial' = 'completed';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const stepId = generateId();
      const stepStartedAt = Date.now();

      // Record step start
      this.db.prepare(`
        INSERT INTO pipeline_step_results
          (id, run_id, step_index, skill_name, input_message, status, started_at)
        VALUES (?, ?, ?, ?, ?, 'running', ?)
      `).run(stepId, runId, i, step.skillName, currentMessage, stepStartedAt);

      // Build SkillContext for this step
      const ctx: SkillContext = {
        message: currentMessage,
        userId: pipeline.userId,
        userName: 'pipeline',
        conversationHistory: [...conversationHistory],
        env: process.env as Record<string, string | undefined>,
      };

      let result: SkillResult;
      try {
        result = await this.skillExecutor(step.skillName, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stepCompletedAt = Date.now();

        // Record step failure
        this.db.prepare(`
          UPDATE pipeline_step_results
          SET status = 'failed', error = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(msg, stepCompletedAt, stepCompletedAt - stepStartedAt, stepId);

        runError = `Step ${i} (${step.skillName}) threw: ${msg}`;
        runStatus = stepsCompleted > 0 ? 'partial' : 'failed';
        break;
      }

      const stepCompletedAt = Date.now();

      // Check for error-type result
      if (result.type === 'error') {
        this.db.prepare(`
          UPDATE pipeline_step_results
          SET status = 'failed', output_content = ?, output_type = ?,
              output_metadata = ?, error = ?, completed_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(
          result.content, result.type,
          result.metadata ? JSON.stringify(result.metadata) : null,
          result.content, stepCompletedAt, stepCompletedAt - stepStartedAt,
          stepId,
        );

        runError = `Step ${i} (${step.skillName}) returned error: ${result.content}`;
        runStatus = stepsCompleted > 0 ? 'partial' : 'failed';
        break;
      }

      // Record step success
      this.db.prepare(`
        UPDATE pipeline_step_results
        SET status = 'completed', output_content = ?, output_type = ?,
            output_metadata = ?, completed_at = ?, duration_ms = ?
        WHERE id = ?
      `).run(
        result.content, result.type,
        result.metadata ? JSON.stringify(result.metadata) : null,
        stepCompletedAt, stepCompletedAt - stepStartedAt,
        stepId,
      );

      // Thread context: this step's output → next step's input
      conversationHistory.push(
        { role: 'user', content: currentMessage },
        { role: 'assistant', content: result.content },
      );
      currentMessage = result.content;
      stepsCompleted++;
      finalOutput = result.content;

      // Update run progress
      this.db.prepare(`
        UPDATE pipeline_runs SET steps_completed = ? WHERE id = ?
      `).run(stepsCompleted, runId);
    }

    const completedAt = Date.now();

    // Finalize the run
    this.db.prepare(`
      UPDATE pipeline_runs
      SET status = ?, completed_at = ?, steps_completed = ?,
          error = ?, final_output = ?
      WHERE id = ?
    `).run(runStatus, completedAt, stepsCompleted, runError, finalOutput, runId);

    // Update pipeline stats
    const now = Date.now();
    if (runStatus === 'completed') {
      this.db.prepare(`
        UPDATE workflow_pipelines
        SET run_count = run_count + 1, last_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, pipelineId);

      // Deliver final output
      if (finalOutput) {
        try {
          await this.channelDelivery.send(
            pipeline.deliveryChannel,
            pipeline.deliveryRecipientId,
            finalOutput,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[pipeline] Delivery error for pipeline ${pipelineId}: ${msg}`);
          // Update error on pipeline but keep run as completed — the execution succeeded
          this.db.prepare(`
            UPDATE workflow_pipelines
            SET error_count = error_count + 1, last_error = ?, updated_at = ?
            WHERE id = ?
          `).run(`Delivery error: ${msg}`, now, pipelineId);
        }
      }
    } else {
      // Error or partial — update error stats
      this.db.prepare(`
        UPDATE workflow_pipelines
        SET run_count = run_count + 1, error_count = error_count + 1,
            last_error = ?, last_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(runError, now, now, pipelineId);
    }

    const runRow = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as PipelineRunRow;
    return rowToRun(runRow);
  }

  // -----------------------------------------------------------------------
  // Cron lifecycle
  // -----------------------------------------------------------------------

  /** Start a Croner instance for a pipeline. Stops any existing instance first. */
  private startCron(pipelineId: string, cronExpression: string, timezone: string): void {
    const existing = this.cronJobs.get(pipelineId);
    if (existing) {
      existing.stop();
    }

    const cron = new Cron(cronExpression, {
      timezone,
      protect: true, // prevent overlapping executions
    }, () => {
      this.executePipeline(pipelineId).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pipeline] Unhandled error in pipeline ${pipelineId}: ${msg}`);
      });
    });

    this.cronJobs.set(pipelineId, cron);
  }

  /** Stop a Croner instance for a pipeline. */
  private stopCron(pipelineId: string): void {
    const cron = this.cronJobs.get(pipelineId);
    if (cron) {
      cron.stop();
      this.cronJobs.delete(pipelineId);
    }
  }

  /** Load all cron-triggered active pipelines from DB and schedule them. */
  hydrateFromDb(): number {
    const rows = this.db.prepare(
      "SELECT * FROM workflow_pipelines WHERE trigger_type = 'cron' AND status = 'active'",
    ).all() as PipelineRow[];

    let scheduled = 0;
    for (const row of rows) {
      if (!row.cron_expression) continue;
      try {
        this.startCron(row.id, row.cron_expression, row.timezone);
        scheduled++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pipeline] Failed to hydrate pipeline ${row.id}: ${msg}`);
      }
    }

    if (scheduled > 0) {
      console.log(`[pipeline] Hydrated ${scheduled} cron-triggered pipeline(s)`);
    }
    return scheduled;
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  /** Stop all Croner instances for graceful shutdown. */
  shutdown(): void {
    for (const [, cron] of this.cronJobs) {
      try {
        cron.stop();
      } catch {
        // swallow — shutting down
      }
    }
    this.cronJobs.clear();
    console.log('[pipeline] All pipeline crons stopped');
  }

  /** Number of live Croner instances (for health/tests). */
  get activeCount(): number {
    return this.cronJobs.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: PipelineManager | null = null;

/** Get or create the singleton PipelineManager. */
export function getPipelineManager(db: PipelineDb, channelDelivery: ChannelDelivery): PipelineManager {
  if (!instance) {
    instance = new PipelineManager(db, channelDelivery);
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetPipelineManager(): void {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}
