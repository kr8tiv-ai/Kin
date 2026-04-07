/**
 * SchedulerManager — Persistent cron-based job scheduling with Croner.
 *
 * Owns Croner lifecycle for all scheduled jobs. Provides CRUD (create, list,
 * get, pause, resume, delete), boot-time hydration from SQLite, and execution
 * dispatch that constructs a synthetic SkillContext and calls the target skill.
 *
 * Pattern: follows `inference/browser-manager.ts` / `inference/gmail-manager.ts`
 * singleton export with `getSchedulerManager()`.
 *
 * @module inference/scheduler-manager
 */

import { Cron } from 'croner';
import crypto from 'crypto';
import type { ChannelDelivery } from './channel-delivery.js';
import type { KinSkill, SkillContext, SkillResult } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database handle — matches better-sqlite3's Database interface. */
export interface SchedulerDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

/** Row shape from scheduled_jobs table. */
export interface ScheduledJobRow {
  id: string;
  user_id: string;
  companion_id: string;
  skill_name: string;
  skill_args: string;
  cron_expression: string;
  timezone: string;
  delivery_channel: string;
  delivery_recipient_id: string;
  status: string;
  last_run_at: number | null;
  next_run_at: number | null;
  run_count: number;
  max_runs: number | null;
  error_count: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/** Options for creating a new scheduled job. */
export interface CreateJobOpts {
  userId: string;
  companionId: string;
  skillName: string;
  skillArgs?: Record<string, unknown>;
  cronExpression: string;
  timezone?: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  maxRuns?: number | null;
}

/** Camel-cased job returned to callers. */
export interface ScheduledJob {
  id: string;
  userId: string;
  companionId: string;
  skillName: string;
  skillArgs: string;
  cronExpression: string;
  timezone: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  status: string;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  maxRuns: number | null;
  errorCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Callback to resolve a skill by name. */
export type SkillResolver = (name: string) => KinSkill | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToJob(row: ScheduledJobRow): ScheduledJob {
  return {
    id: row.id,
    userId: row.user_id,
    companionId: row.companion_id,
    skillName: row.skill_name,
    skillArgs: row.skill_args,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    deliveryChannel: row.delivery_channel,
    deliveryRecipientId: row.delivery_recipient_id,
    status: row.status,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    runCount: row.run_count,
    maxRuns: row.max_runs,
    errorCount: row.error_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// SchedulerManager
// ---------------------------------------------------------------------------

export class SchedulerManager {
  private db: SchedulerDb;
  private channelDelivery: ChannelDelivery;
  private cronJobs = new Map<string, Cron>();
  private skillResolver: SkillResolver | null = null;

  constructor(db: SchedulerDb, channelDelivery: ChannelDelivery) {
    this.db = db;
    this.channelDelivery = channelDelivery;
  }

  /** Register a callback used to resolve skill names to KinSkill instances. */
  setSkillResolver(resolver: SkillResolver): void {
    this.skillResolver = resolver;
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new scheduled job. Validates the cron expression by attempting
   * to construct a Croner instance — throws on invalid patterns.
   */
  createJob(opts: CreateJobOpts): ScheduledJob {
    const id = generateId();
    const timezone = opts.timezone ?? 'UTC';
    const skillArgs = JSON.stringify(opts.skillArgs ?? {});
    const now = Date.now();

    // Validate cron expression — Croner throws on invalid patterns.
    // We create a paused instance just for validation then stop it.
    let nextRunAt: number | null = null;
    try {
      const probe = new Cron(opts.cronExpression, { paused: true, timezone });
      const next = probe.nextRun();
      nextRunAt = next ? next.getTime() : null;
      probe.stop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid cron expression "${opts.cronExpression}": ${msg}`);
    }

    this.db.prepare(`
      INSERT INTO scheduled_jobs
        (id, user_id, companion_id, skill_name, skill_args,
         cron_expression, timezone, delivery_channel, delivery_recipient_id,
         status, max_runs, next_run_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      id, opts.userId, opts.companionId, opts.skillName, skillArgs,
      opts.cronExpression, timezone, opts.deliveryChannel, opts.deliveryRecipientId,
      opts.maxRuns ?? null, nextRunAt, now, now,
    );

    // Start the Croner instance
    this.startCron(id, opts.cronExpression, timezone);

    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as ScheduledJobRow;
    return rowToJob(row);
  }

  /** List all jobs for a user. */
  listJobs(userId: string): ScheduledJob[] {
    const rows = this.db.prepare(
      'SELECT * FROM scheduled_jobs WHERE user_id = ? ORDER BY created_at DESC',
    ).all(userId) as ScheduledJobRow[];
    return rows.map(rowToJob);
  }

  /** Get a single job by ID. Returns null if not found. */
  getJob(jobId: string): ScheduledJob | null {
    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as ScheduledJobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  /** Pause a job. Returns the updated job or null if not found. */
  pauseJob(jobId: string): ScheduledJob | null {
    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as ScheduledJobRow | undefined;
    if (!row) return null;

    // Stop the Croner instance
    const cron = this.cronJobs.get(jobId);
    if (cron) {
      cron.stop();
      this.cronJobs.delete(jobId);
    }

    this.db.prepare(
      'UPDATE scheduled_jobs SET status = ?, updated_at = ? WHERE id = ?',
    ).run('paused', Date.now(), jobId);

    return this.getJob(jobId);
  }

  /** Resume a paused job. Returns the updated job or null if not found. */
  resumeJob(jobId: string): ScheduledJob | null {
    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as ScheduledJobRow | undefined;
    if (!row) return null;

    // Restart the Croner instance
    this.startCron(jobId, row.cron_expression, row.timezone);

    // Update next_run_at based on new cron instance
    const cron = this.cronJobs.get(jobId);
    const next = cron?.nextRun();
    const nextRunAt = next ? next.getTime() : null;

    this.db.prepare(
      'UPDATE scheduled_jobs SET status = ?, next_run_at = ?, updated_at = ? WHERE id = ?',
    ).run('active', nextRunAt, Date.now(), jobId);

    return this.getJob(jobId);
  }

  /** Delete a job. Returns true if deleted, false if not found. */
  deleteJob(jobId: string): boolean {
    // Stop the Croner instance if running
    const cron = this.cronJobs.get(jobId);
    if (cron) {
      cron.stop();
      this.cronJobs.delete(jobId);
    }

    const result = this.db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(jobId);
    return result.changes > 0;
  }

  // -----------------------------------------------------------------------
  // Hydration
  // -----------------------------------------------------------------------

  /** Load all active jobs from DB and schedule them with Croner. */
  hydrateFromDb(): number {
    const rows = this.db.prepare(
      "SELECT * FROM scheduled_jobs WHERE status = 'active'",
    ).all() as ScheduledJobRow[];

    let scheduled = 0;
    for (const row of rows) {
      try {
        this.startCron(row.id, row.cron_expression, row.timezone);
        scheduled++;
      } catch (err) {
        // Log but don't block boot — mark job as failed
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Failed to hydrate job ${row.id}: ${msg}`);
        this.db.prepare(
          "UPDATE scheduled_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?",
        ).run(`Hydration error: ${msg}`, Date.now(), row.id);
      }
    }

    if (scheduled > 0) {
      console.log(`[scheduler] Hydrated ${scheduled} active job(s)`);
    }
    return scheduled;
  }

  // -----------------------------------------------------------------------
  // Execution
  // -----------------------------------------------------------------------

  /** Execute a scheduled job: resolve skill, run it, deliver result. */
  private async executeJob(jobId: string): Promise<void> {
    const row = this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as ScheduledJobRow | undefined;
    if (!row || row.status !== 'active') return;

    const now = Date.now();

    // Resolve skill
    const skill = this.skillResolver?.(row.skill_name);
    if (!skill) {
      this.recordError(jobId, `Skill "${row.skill_name}" not found in registry`);
      return;
    }

    // Build synthetic SkillContext from stored job data
    let skillArgs: Record<string, unknown> = {};
    try {
      skillArgs = JSON.parse(row.skill_args);
    } catch {
      // use empty args
    }

    const ctx: SkillContext = {
      message: typeof skillArgs.message === 'string' ? skillArgs.message : row.skill_name,
      userId: row.user_id,
      userName: 'scheduler',
      conversationHistory: [],
      env: process.env as Record<string, string | undefined>,
    };

    let result: SkillResult;
    try {
      result = await skill.execute(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordError(jobId, `Skill execution error: ${msg}`);
      return;
    }

    // Deliver the result
    try {
      await this.channelDelivery.send(
        row.delivery_channel,
        row.delivery_recipient_id,
        result.content,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordError(jobId, `Delivery error (${row.delivery_channel}): ${msg}`);
      return;
    }

    // Update job stats
    const newRunCount = row.run_count + 1;
    const cron = this.cronJobs.get(jobId);
    const next = cron?.nextRun();
    const nextRunAt = next ? next.getTime() : null;

    // Check max_runs
    if (row.max_runs !== null && newRunCount >= row.max_runs) {
      // Job is completed
      if (cron) {
        cron.stop();
        this.cronJobs.delete(jobId);
      }
      this.db.prepare(`
        UPDATE scheduled_jobs
        SET run_count = ?, last_run_at = ?, next_run_at = NULL,
            status = 'completed', updated_at = ?
        WHERE id = ?
      `).run(newRunCount, now, now, jobId);
      return;
    }

    this.db.prepare(`
      UPDATE scheduled_jobs
      SET run_count = ?, last_run_at = ?, next_run_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newRunCount, now, nextRunAt, now, jobId);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Record an error on a job row. */
  private recordError(jobId: string, error: string): void {
    console.error(`[scheduler] Job ${jobId}: ${error}`);
    this.db.prepare(`
      UPDATE scheduled_jobs
      SET error_count = error_count + 1, last_error = ?, updated_at = ?
      WHERE id = ?
    `).run(error, Date.now(), jobId);
  }

  /** Start a Croner instance for a job. Stops any existing instance first. */
  private startCron(jobId: string, cronExpression: string, timezone: string): void {
    // Stop any existing instance for this job
    const existing = this.cronJobs.get(jobId);
    if (existing) {
      existing.stop();
    }

    const cron = new Cron(cronExpression, {
      timezone,
      protect: true,  // prevent overlapping executions
    }, () => {
      // Fire-and-forget — errors handled inside executeJob
      this.executeJob(jobId).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] Unhandled error in job ${jobId}: ${msg}`);
      });
    });

    this.cronJobs.set(jobId, cron);
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  /** Stop all Croner instances for graceful shutdown. */
  shutdown(): void {
    for (const [id, cron] of this.cronJobs) {
      try {
        cron.stop();
      } catch {
        // swallow — shutting down
      }
    }
    this.cronJobs.clear();
    console.log('[scheduler] All jobs stopped');
  }

  /** Number of live Croner instances (for health/tests). */
  get activeCount(): number {
    return this.cronJobs.size;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: SchedulerManager | null = null;

/** Get or create the singleton SchedulerManager. */
export function getSchedulerManager(db: SchedulerDb, channelDelivery: ChannelDelivery): SchedulerManager {
  if (!instance) {
    instance = new SchedulerManager(db, channelDelivery);
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetSchedulerManager(): void {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}
