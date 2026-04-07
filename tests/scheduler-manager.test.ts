/**
 * Tests for inference/scheduler-manager.ts
 *
 * Uses in-memory SQLite for isolation. Covers CRUD, hydration,
 * cron validation, max_runs completion, error counting, pause/resume,
 * and negative paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  SchedulerManager,
  resetSchedulerManager,
  type ScheduledJob,
} from '../inference/scheduler-manager.js';
import { ChannelDelivery } from '../inference/channel-delivery.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Load full schema to satisfy FK references (users, companions tables)
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf-8');

  // Execute the whole schema at once — db.exec handles multiple statements
  db.exec(schema);

  // Seed minimal referenced rows — schema already inserts companions via INSERT OR IGNORE,
  // so 'cipher' should exist. We just need users.
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-1', 'Test')").run();
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-2', 'Other')").run();

  return db;
}

function createManager(db: InstanceType<typeof Database>): {
  manager: SchedulerManager;
  delivery: ChannelDelivery;
} {
  const delivery = new ChannelDelivery();
  const manager = new SchedulerManager(db, delivery);
  return { manager, delivery };
}

const VALID_CRON = '0 8 * * *'; // every day at 8am

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchedulerManager', () => {
  let db: InstanceType<typeof Database>;
  let manager: SchedulerManager;
  let delivery: ChannelDelivery;

  beforeEach(() => {
    resetSchedulerManager();
    db = createTestDb();
    ({ manager, delivery } = createManager(db));
  });

  afterEach(() => {
    manager?.shutdown();
    db?.close();
  });

  // -----------------------------------------------------------------------
  // createJob
  // -----------------------------------------------------------------------

  describe('createJob', () => {
    it('creates a job with all fields populated', () => {
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        skillArgs: { message: 'check inbox' },
        cronExpression: VALID_CRON,
        timezone: 'America/Chicago',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-123',
      });

      expect(job.id).toBeTruthy();
      expect(job.userId).toBe('user-1');
      expect(job.companionId).toBe('cipher');
      expect(job.skillName).toBe('email');
      expect(job.skillArgs).toBe('{"message":"check inbox"}');
      expect(job.cronExpression).toBe(VALID_CRON);
      expect(job.timezone).toBe('America/Chicago');
      expect(job.deliveryChannel).toBe('telegram');
      expect(job.deliveryRecipientId).toBe('chat-123');
      expect(job.status).toBe('active');
      expect(job.runCount).toBe(0);
      expect(job.errorCount).toBe(0);
      expect(job.nextRunAt).toBeTypeOf('number');
      expect(job.createdAt).toBeTypeOf('number');
    });

    it('defaults timezone to UTC when not provided', () => {
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'weather',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });
      expect(job.timezone).toBe('UTC');
    });

    it('starts a Croner instance for the new job', () => {
      manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });
      expect(manager.activeCount).toBe(1);
    });

    it('rejects an invalid cron expression with descriptive error', () => {
      expect(() =>
        manager.createJob({
          userId: 'user-1',
          companionId: 'cipher',
          skillName: 'email',
          cronExpression: 'not a cron',
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'chat-1',
        }),
      ).toThrow(/Invalid cron expression "not a cron"/);
    });
  });

  // -----------------------------------------------------------------------
  // listJobs / getJob
  // -----------------------------------------------------------------------

  describe('listJobs', () => {
    it('returns all jobs for a user ordered by created_at desc', () => {
      manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });
      manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'weather',
        cronExpression: '0 9 * * *',
        deliveryChannel: 'whatsapp',
        deliveryRecipientId: 'jid-1',
      });
      manager.createJob({
        userId: 'user-2',
        companionId: 'cipher',
        skillName: 'news',
        cronExpression: '0 7 * * *',
        deliveryChannel: 'discord',
        deliveryRecipientId: 'ch-1',
      });

      const user1Jobs = manager.listJobs('user-1');
      expect(user1Jobs).toHaveLength(2);
      expect(user1Jobs.every((j) => j.userId === 'user-1')).toBe(true);

      const user2Jobs = manager.listJobs('user-2');
      expect(user2Jobs).toHaveLength(1);
      expect(user2Jobs[0].skillName).toBe('news');
    });

    it('returns empty array for a user with no jobs', () => {
      expect(manager.listJobs('nobody')).toEqual([]);
    });
  });

  describe('getJob', () => {
    it('returns a job by ID', () => {
      const created = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      const fetched = manager.getJob(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.skillName).toBe('email');
    });

    it('returns null for non-existent ID', () => {
      expect(manager.getJob('nonexistent')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // pauseJob / resumeJob
  // -----------------------------------------------------------------------

  describe('pauseJob', () => {
    it('pauses an active job and stops the Croner instance', () => {
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      expect(manager.activeCount).toBe(1);
      const paused = manager.pauseJob(job.id);
      expect(paused).not.toBeNull();
      expect(paused!.status).toBe('paused');
      expect(manager.activeCount).toBe(0);
    });

    it('returns null for a non-existent job', () => {
      expect(manager.pauseJob('nonexistent')).toBeNull();
    });
  });

  describe('resumeJob', () => {
    it('resumes a paused job and restarts the Croner instance', () => {
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      manager.pauseJob(job.id);
      expect(manager.activeCount).toBe(0);

      const resumed = manager.resumeJob(job.id);
      expect(resumed).not.toBeNull();
      expect(resumed!.status).toBe('active');
      expect(manager.activeCount).toBe(1);
    });

    it('returns null for a non-existent job', () => {
      expect(manager.resumeJob('nonexistent')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // deleteJob
  // -----------------------------------------------------------------------

  describe('deleteJob', () => {
    it('deletes a job and stops its Croner instance', () => {
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      expect(manager.activeCount).toBe(1);
      const deleted = manager.deleteJob(job.id);
      expect(deleted).toBe(true);
      expect(manager.activeCount).toBe(0);
      expect(manager.getJob(job.id)).toBeNull();
    });

    it('returns false for a non-existent job', () => {
      expect(manager.deleteJob('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // hydrateFromDb
  // -----------------------------------------------------------------------

  describe('hydrateFromDb', () => {
    it('loads and schedules all active jobs from DB', () => {
      // Insert jobs directly into DB to simulate a restart
      const now = Date.now();
      db.prepare(`
        INSERT INTO scheduled_jobs
          (id, user_id, companion_id, skill_name, cron_expression, timezone,
           delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run('job-hydrate-1', 'user-1', 'cipher', 'email', '0 8 * * *', 'UTC', 'telegram', 'chat-1', now, now);

      db.prepare(`
        INSERT INTO scheduled_jobs
          (id, user_id, companion_id, skill_name, cron_expression, timezone,
           delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paused', ?, ?)
      `).run('job-hydrate-2', 'user-1', 'cipher', 'weather', '0 9 * * *', 'UTC', 'telegram', 'chat-1', now, now);

      // Fresh manager — no cron instances yet
      const { manager: fresh } = createManager(db);
      expect(fresh.activeCount).toBe(0);

      const count = fresh.hydrateFromDb();
      expect(count).toBe(1); // only active jobs
      expect(fresh.activeCount).toBe(1);

      fresh.shutdown();
    });

    it('marks jobs with invalid cron as failed during hydration', () => {
      const now = Date.now();
      // Insert a job with a bad cron expression directly
      db.prepare(`
        INSERT INTO scheduled_jobs
          (id, user_id, companion_id, skill_name, cron_expression, timezone,
           delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run('job-bad-cron', 'user-1', 'cipher', 'email', 'INVALID', 'UTC', 'telegram', 'chat-1', now, now);

      const { manager: fresh } = createManager(db);
      const count = fresh.hydrateFromDb();
      expect(count).toBe(0);

      // Check that the job was marked as failed
      const row = db.prepare('SELECT status, last_error FROM scheduled_jobs WHERE id = ?').get('job-bad-cron') as { status: string; last_error: string };
      expect(row.status).toBe('failed');
      expect(row.last_error).toContain('Hydration error');

      fresh.shutdown();
    });
  });

  // -----------------------------------------------------------------------
  // executeJob (via skill resolver and manual trigger)
  // -----------------------------------------------------------------------

  describe('job execution', () => {
    it('executes a skill and delivers result via channel delivery', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendFn);

      const mockSkill = {
        name: 'test-skill',
        description: 'Test',
        triggers: [],
        execute: vi.fn().mockResolvedValue({
          content: 'Skill result text',
          type: 'text' as const,
        }),
      };

      manager.setSkillResolver((name) => (name === 'test-skill' ? mockSkill : undefined));

      // Create a job with a very fast cron (every second) to trigger execution
      // We'll use the internal map to trigger executeJob indirectly
      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'test-skill',
        skillArgs: { message: 'hello' },
        cronExpression: '* * * * * *', // every second (6-field)
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-99',
      });

      // Wait for at least one execution cycle
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(mockSkill.execute).toHaveBeenCalled();
      expect(sendFn).toHaveBeenCalledWith('chat-99', 'Skill result text');

      // Check DB was updated
      const updated = manager.getJob(job.id);
      expect(updated!.runCount).toBeGreaterThanOrEqual(1);
      expect(updated!.lastRunAt).toBeTypeOf('number');
    });

    it('increments error_count when skill execution fails', async () => {
      delivery.register('telegram', vi.fn());

      const failingSkill = {
        name: 'fail-skill',
        description: 'Always fails',
        triggers: [],
        execute: vi.fn().mockRejectedValue(new Error('Skill broke')),
      };

      manager.setSkillResolver((name) => (name === 'fail-skill' ? failingSkill : undefined));

      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'fail-skill',
        cronExpression: '* * * * * *',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const updated = manager.getJob(job.id);
      expect(updated!.errorCount).toBeGreaterThanOrEqual(1);
      expect(updated!.lastError).toContain('Skill execution error');
    });

    it('records error when skill is not found in registry', async () => {
      delivery.register('telegram', vi.fn());
      manager.setSkillResolver(() => undefined); // no skills

      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'nonexistent',
        cronExpression: '* * * * * *',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const updated = manager.getJob(job.id);
      expect(updated!.errorCount).toBeGreaterThanOrEqual(1);
      expect(updated!.lastError).toContain('not found in registry');
    });

    it('records error when delivery fails', async () => {
      delivery.register('telegram', vi.fn().mockRejectedValue(new Error('Network down')));

      const mockSkill = {
        name: 'ok-skill',
        description: 'Works',
        triggers: [],
        execute: vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }),
      };
      manager.setSkillResolver((name) => (name === 'ok-skill' ? mockSkill : undefined));

      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'ok-skill',
        cronExpression: '* * * * * *',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const updated = manager.getJob(job.id);
      expect(updated!.errorCount).toBeGreaterThanOrEqual(1);
      expect(updated!.lastError).toContain('Delivery error');
    });

    it('completes job when max_runs is reached', async () => {
      const sendFn = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendFn);

      const mockSkill = {
        name: 'count-skill',
        description: 'Count',
        triggers: [],
        execute: vi.fn().mockResolvedValue({ content: 'done', type: 'text' as const }),
      };
      manager.setSkillResolver((name) => (name === 'count-skill' ? mockSkill : undefined));

      const job = manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'count-skill',
        cronExpression: '* * * * * *',
        maxRuns: 2,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      // Poll until status changes or timeout — with protect:true,
      // each execution blocks subsequent triggers until it resolves,
      // so we need to wait long enough for 2 sequential executions.
      let updated: ScheduledJob | null = null;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        updated = manager.getJob(job.id);
        if (updated?.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(updated!.status).toBe('completed');
      expect(updated!.runCount).toBe(2);
      // Croner should be stopped
      expect(manager.activeCount).toBe(0);
    }, 12000);
  });

  // -----------------------------------------------------------------------
  // shutdown
  // -----------------------------------------------------------------------

  describe('shutdown', () => {
    it('stops all Croner instances', () => {
      manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'email',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });
      manager.createJob({
        userId: 'user-1',
        companionId: 'cipher',
        skillName: 'weather',
        cronExpression: '0 9 * * *',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      expect(manager.activeCount).toBe(2);
      manager.shutdown();
      expect(manager.activeCount).toBe(0);
    });
  });
});
