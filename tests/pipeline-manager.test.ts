/**
 * Tests for inference/pipeline-manager.ts
 *
 * Uses in-memory SQLite for isolation. Covers CRUD, step execution with
 * context threading, error handling, run history recording, cron lifecycle,
 * pipeline stats updates, and delete ownership checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  PipelineManager,
  resetPipelineManager,
  type Pipeline,
  type PipelineStep,
  type SkillExecutor,
} from '../inference/pipeline-manager.js';
import { ChannelDelivery } from '../inference/channel-delivery.js';
import type { SkillContext, SkillResult } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Seed minimal referenced rows
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-1', 'Test')").run();
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-2', 'Other')").run();

  return db;
}

function createManager(db: InstanceType<typeof Database>): {
  manager: PipelineManager;
  delivery: ChannelDelivery;
} {
  const delivery = new ChannelDelivery();
  const manager = new PipelineManager(db, delivery);
  return { manager, delivery };
}

/** Create a mock skill executor that records calls and returns step-specific text. */
function createMockExecutor(
  responses?: Record<string, SkillResult>,
): { executor: SkillExecutor; calls: Array<{ skillName: string; ctx: SkillContext }> } {
  const calls: Array<{ skillName: string; ctx: SkillContext }> = [];
  const executor: SkillExecutor = async (skillName, ctx) => {
    calls.push({ skillName, ctx });
    if (responses && responses[skillName]) {
      return responses[skillName];
    }
    return {
      content: `Result from ${skillName}: processed "${ctx.message}"`,
      type: 'text' as const,
      metadata: { skill: skillName },
    };
  };
  return { executor, calls };
}

const VALID_CRON = '0 8 * * *';

const DEFAULT_STEPS: PipelineStep[] = [
  { skillName: 'check-email', label: 'Check Email' },
  { skillName: 'summarize', label: 'Summarize' },
  { skillName: 'draft-replies', label: 'Draft Replies' },
];

function createDefaultPipeline(manager: PipelineManager, overrides?: Partial<Parameters<PipelineManager['createPipeline']>[0]>): Pipeline {
  return manager.createPipeline({
    userId: 'user-1',
    companionId: 'cipher',
    name: 'Morning Briefing',
    description: 'Check email, summarize, draft replies',
    steps: DEFAULT_STEPS,
    deliveryChannel: 'telegram',
    deliveryRecipientId: 'chat-123',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineManager', () => {
  let db: InstanceType<typeof Database>;
  let manager: PipelineManager;
  let delivery: ChannelDelivery;

  beforeEach(() => {
    resetPipelineManager();
    db = createTestDb();
    ({ manager, delivery } = createManager(db));
  });

  afterEach(() => {
    manager?.shutdown();
    db?.close();
  });

  // -----------------------------------------------------------------------
  // createPipeline
  // -----------------------------------------------------------------------

  describe('createPipeline', () => {
    it('creates a manual pipeline with all fields populated', () => {
      const pipeline = createDefaultPipeline(manager);

      expect(pipeline.id).toBeTruthy();
      expect(pipeline.userId).toBe('user-1');
      expect(pipeline.companionId).toBe('cipher');
      expect(pipeline.name).toBe('Morning Briefing');
      expect(pipeline.description).toBe('Check email, summarize, draft replies');
      expect(pipeline.steps).toHaveLength(3);
      expect(pipeline.steps[0].skillName).toBe('check-email');
      expect(pipeline.steps[1].skillName).toBe('summarize');
      expect(pipeline.steps[2].skillName).toBe('draft-replies');
      expect(pipeline.triggerType).toBe('manual');
      expect(pipeline.cronExpression).toBeNull();
      expect(pipeline.timezone).toBe('UTC');
      expect(pipeline.deliveryChannel).toBe('telegram');
      expect(pipeline.deliveryRecipientId).toBe('chat-123');
      expect(pipeline.status).toBe('active');
      expect(pipeline.runCount).toBe(0);
      expect(pipeline.errorCount).toBe(0);
      expect(pipeline.createdAt).toBeTypeOf('number');
    });

    it('creates a cron-triggered pipeline and starts a Croner instance', () => {
      const pipeline = manager.createPipeline({
        userId: 'user-1',
        companionId: 'cipher',
        name: 'Daily Pipeline',
        steps: [{ skillName: 'weather' }],
        triggerType: 'cron',
        cronExpression: VALID_CRON,
        timezone: 'America/Chicago',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      expect(pipeline.triggerType).toBe('cron');
      expect(pipeline.cronExpression).toBe(VALID_CRON);
      expect(pipeline.timezone).toBe('America/Chicago');
      expect(manager.activeCount).toBe(1);
    });

    it('does not start cron for manual pipelines', () => {
      createDefaultPipeline(manager);
      expect(manager.activeCount).toBe(0);
    });

    it('rejects empty steps array', () => {
      expect(() =>
        manager.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'Empty',
          steps: [],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'chat-1',
        }),
      ).toThrow(/Invalid steps/);
    });

    it('rejects steps with missing skillName', () => {
      expect(() =>
        manager.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'Bad Step',
          steps: [{ skillName: '' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'chat-1',
        }),
      ).toThrow(/Invalid steps/);
    });

    it('rejects invalid cron expression for cron triggers', () => {
      expect(() =>
        manager.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'Bad Cron',
          steps: [{ skillName: 'weather' }],
          triggerType: 'cron',
          cronExpression: 'not a cron',
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'chat-1',
        }),
      ).toThrow(/Invalid cron expression/);
    });

    it('rejects cron trigger without cron expression', () => {
      expect(() =>
        manager.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'Missing Cron',
          steps: [{ skillName: 'weather' }],
          triggerType: 'cron',
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'chat-1',
        }),
      ).toThrow(/cron_expression is required/);
    });
  });

  // -----------------------------------------------------------------------
  // listPipelines / getPipeline
  // -----------------------------------------------------------------------

  describe('listPipelines', () => {
    it('returns all pipelines for a user ordered by created_at desc', () => {
      createDefaultPipeline(manager, { name: 'Pipeline A' });
      createDefaultPipeline(manager, { name: 'Pipeline B' });
      createDefaultPipeline(manager, {
        userId: 'user-2',
        name: 'Other User Pipeline',
      });

      const user1Pipelines = manager.listPipelines('user-1');
      expect(user1Pipelines).toHaveLength(2);
      expect(user1Pipelines.every((p) => p.userId === 'user-1')).toBe(true);

      const user2Pipelines = manager.listPipelines('user-2');
      expect(user2Pipelines).toHaveLength(1);
      expect(user2Pipelines[0].name).toBe('Other User Pipeline');
    });

    it('returns empty array for a user with no pipelines', () => {
      expect(manager.listPipelines('nobody')).toEqual([]);
    });
  });

  describe('getPipeline', () => {
    it('returns a pipeline by ID with parsed steps', () => {
      const created = createDefaultPipeline(manager);

      const fetched = manager.getPipeline(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.steps).toHaveLength(3);
      expect(fetched!.steps[0]).toEqual({
        skillName: 'check-email',
        label: 'Check Email',
      });
    });

    it('returns null for non-existent ID', () => {
      expect(manager.getPipeline('nonexistent')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // deletePipeline
  // -----------------------------------------------------------------------

  describe('deletePipeline', () => {
    it('deletes a pipeline owned by the user', () => {
      const pipeline = createDefaultPipeline(manager);

      const deleted = manager.deletePipeline(pipeline.id, 'user-1');
      expect(deleted).toBe(true);
      expect(manager.getPipeline(pipeline.id)).toBeNull();
    });

    it('stops cron on delete of cron-triggered pipeline', () => {
      const pipeline = manager.createPipeline({
        userId: 'user-1',
        companionId: 'cipher',
        name: 'Cron Pipeline',
        steps: [{ skillName: 'weather' }],
        triggerType: 'cron',
        cronExpression: VALID_CRON,
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      expect(manager.activeCount).toBe(1);
      manager.deletePipeline(pipeline.id, 'user-1');
      expect(manager.activeCount).toBe(0);
    });

    it('rejects delete by non-owner', () => {
      const pipeline = createDefaultPipeline(manager);

      const deleted = manager.deletePipeline(pipeline.id, 'user-2');
      expect(deleted).toBe(false);
      expect(manager.getPipeline(pipeline.id)).not.toBeNull();
    });

    it('returns false for non-existent pipeline', () => {
      expect(manager.deletePipeline('nonexistent', 'user-1')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // executePipeline — context threading
  // -----------------------------------------------------------------------

  describe('executePipeline — context threading', () => {
    it('threads step outputs as next step inputs', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor, calls } = createMockExecutor();
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      await manager.executePipeline(pipeline.id, 'Check my morning email');

      expect(calls).toHaveLength(3);

      // Step 0 gets the trigger message
      expect(calls[0].skillName).toBe('check-email');
      expect(calls[0].ctx.message).toBe('Check my morning email');
      expect(calls[0].ctx.conversationHistory).toHaveLength(0);

      // Step 1 gets step 0's output as message
      expect(calls[1].skillName).toBe('summarize');
      expect(calls[1].ctx.message).toContain('Result from check-email');
      expect(calls[1].ctx.conversationHistory).toHaveLength(2); // user + assistant from step 0

      // Step 2 gets step 1's output as message
      expect(calls[2].skillName).toBe('draft-replies');
      expect(calls[2].ctx.message).toContain('Result from summarize');
      expect(calls[2].ctx.conversationHistory).toHaveLength(4); // user + assistant from steps 0 and 1
    });

    it('uses pipeline name as trigger message when none provided', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor, calls } = createMockExecutor();
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      await manager.executePipeline(pipeline.id);

      expect(calls[0].ctx.message).toBe('Morning Briefing');
    });

    it('sets userId from pipeline on each SkillContext', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor, calls } = createMockExecutor();
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      await manager.executePipeline(pipeline.id);

      for (const call of calls) {
        expect(call.ctx.userId).toBe('user-1');
        expect(call.ctx.userName).toBe('pipeline');
      }
    });
  });

  // -----------------------------------------------------------------------
  // executePipeline — error handling
  // -----------------------------------------------------------------------

  describe('executePipeline — error handling', () => {
    it('halts on error-type skill result and records partial run', async () => {
      const pipeline = createDefaultPipeline(manager);

      const executor: SkillExecutor = async (skillName, ctx) => {
        if (skillName === 'summarize') {
          return { content: 'Too many emails to summarize', type: 'error' as const };
        }
        return { content: `Done: ${ctx.message}`, type: 'text' as const };
      };
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      const run = await manager.executePipeline(pipeline.id, 'go');

      expect(run.status).toBe('partial'); // step 0 succeeded, step 1 errored
      expect(run.stepsCompleted).toBe(1);
      expect(run.error).toContain('Step 1 (summarize) returned error');
    });

    it('records "failed" when first step errors', async () => {
      const pipeline = createDefaultPipeline(manager);

      const executor: SkillExecutor = async () => {
        return { content: 'Broken', type: 'error' as const };
      };
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      const run = await manager.executePipeline(pipeline.id, 'go');

      expect(run.status).toBe('failed');
      expect(run.stepsCompleted).toBe(0);
    });

    it('halts on skill execution throw and records failure', async () => {
      const pipeline = createDefaultPipeline(manager);

      const executor: SkillExecutor = async (skillName) => {
        if (skillName === 'check-email') {
          throw new Error('Network timeout');
        }
        return { content: 'ok', type: 'text' as const };
      };
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      const run = await manager.executePipeline(pipeline.id, 'go');

      expect(run.status).toBe('failed');
      expect(run.stepsCompleted).toBe(0);
      expect(run.error).toContain('Step 0 (check-email) threw: Network timeout');
    });

    it('throws when pipeline not found', async () => {
      manager.setSkillExecutor(async () => ({ content: 'ok', type: 'text' as const }));
      await expect(manager.executePipeline('nonexistent')).rejects.toThrow(/not found/);
    });

    it('throws when no skill executor is registered', async () => {
      const pipeline = createDefaultPipeline(manager);
      await expect(manager.executePipeline(pipeline.id)).rejects.toThrow(/No skill executor/);
    });
  });

  // -----------------------------------------------------------------------
  // executePipeline — run history recording
  // -----------------------------------------------------------------------

  describe('executePipeline — run history', () => {
    it('creates pipeline_runs and pipeline_step_results rows', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor } = createMockExecutor();
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      const run = await manager.executePipeline(pipeline.id, 'go');

      // Check run row
      const runs = manager.listRuns(pipeline.id);
      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe(run.id);
      expect(runs[0].status).toBe('completed');
      expect(runs[0].stepsCompleted).toBe(3);
      expect(runs[0].stepsTotal).toBe(3);
      expect(runs[0].finalOutput).toContain('Result from draft-replies');

      // Check step result rows
      const stepResults = manager.getStepResults(run.id);
      expect(stepResults).toHaveLength(3);

      expect(stepResults[0].step_index).toBe(0);
      expect(stepResults[0].skill_name).toBe('check-email');
      expect(stepResults[0].status).toBe('completed');
      expect(stepResults[0].input_message).toBe('go');
      expect(stepResults[0].output_content).toContain('Result from check-email');
      expect(stepResults[0].duration_ms).toBeTypeOf('number');

      expect(stepResults[1].step_index).toBe(1);
      expect(stepResults[1].skill_name).toBe('summarize');
      expect(stepResults[1].input_message).toContain('Result from check-email');

      expect(stepResults[2].step_index).toBe(2);
      expect(stepResults[2].skill_name).toBe('draft-replies');
    });

    it('preserves partial step results on mid-pipeline error', async () => {
      const pipeline = createDefaultPipeline(manager);

      let callCount = 0;
      const executor: SkillExecutor = async (skillName, ctx) => {
        callCount++;
        if (callCount === 2) {
          return { content: 'Failed at summarize', type: 'error' as const };
        }
        return { content: `Done: ${ctx.message}`, type: 'text' as const };
      };
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      const run = await manager.executePipeline(pipeline.id, 'go');

      const stepResults = manager.getStepResults(run.id);
      expect(stepResults).toHaveLength(2); // step 0 completed, step 1 failed, step 2 never started

      expect(stepResults[0].status).toBe('completed');
      expect(stepResults[1].status).toBe('failed');
      expect(stepResults[1].error).toBe('Failed at summarize');
    });
  });

  // -----------------------------------------------------------------------
  // executePipeline — pipeline stats updates
  // -----------------------------------------------------------------------

  describe('executePipeline — pipeline stats', () => {
    it('updates run_count and last_run_at on successful execution', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor } = createMockExecutor();
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      await manager.executePipeline(pipeline.id, 'go');

      const updated = manager.getPipeline(pipeline.id);
      expect(updated!.runCount).toBe(1);
      expect(updated!.lastRunAt).toBeTypeOf('number');
      expect(updated!.errorCount).toBe(0);
    });

    it('increments error_count on failed execution', async () => {
      const pipeline = createDefaultPipeline(manager);

      const executor: SkillExecutor = async () => {
        throw new Error('Boom');
      };
      manager.setSkillExecutor(executor);
      delivery.register('telegram', vi.fn().mockResolvedValue(undefined));

      await manager.executePipeline(pipeline.id, 'go');

      const updated = manager.getPipeline(pipeline.id);
      expect(updated!.runCount).toBe(1);
      expect(updated!.errorCount).toBe(1);
      expect(updated!.lastError).toContain('Step 0');
    });

    it('delivers final output via channel delivery on success', async () => {
      const pipeline = createDefaultPipeline(manager);
      const { executor } = createMockExecutor();
      manager.setSkillExecutor(executor);

      const sendFn = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendFn);

      await manager.executePipeline(pipeline.id, 'go');

      expect(sendFn).toHaveBeenCalledOnce();
      expect(sendFn).toHaveBeenCalledWith(
        'chat-123',
        expect.stringContaining('Result from draft-replies'),
      );
    });

    it('does not deliver on failed execution', async () => {
      const pipeline = createDefaultPipeline(manager);

      const executor: SkillExecutor = async () => {
        return { content: 'Error', type: 'error' as const };
      };
      manager.setSkillExecutor(executor);

      const sendFn = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendFn);

      await manager.executePipeline(pipeline.id, 'go');

      expect(sendFn).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cron lifecycle
  // -----------------------------------------------------------------------

  describe('cron lifecycle', () => {
    it('hydrateFromDb loads cron-triggered active pipelines', () => {
      // Insert directly into DB to simulate restart
      const now = Date.now();
      const stepsJson = JSON.stringify([{ skillName: 'weather' }]);

      db.prepare(`
        INSERT INTO workflow_pipelines
          (id, user_id, companion_id, name, steps, trigger_type, cron_expression,
           timezone, delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'cron', ?, ?, ?, ?, 'active', ?, ?)
      `).run('pipe-cron-1', 'user-1', 'cipher', 'Cron 1', stepsJson,
        '0 8 * * *', 'UTC', 'telegram', 'chat-1', now, now);

      // Manual pipeline — should NOT be hydrated
      db.prepare(`
        INSERT INTO workflow_pipelines
          (id, user_id, companion_id, name, steps, trigger_type,
           timezone, delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, 'active', ?, ?)
      `).run('pipe-manual-1', 'user-1', 'cipher', 'Manual 1', stepsJson,
        'UTC', 'telegram', 'chat-1', now, now);

      // Paused cron pipeline — should NOT be hydrated
      db.prepare(`
        INSERT INTO workflow_pipelines
          (id, user_id, companion_id, name, steps, trigger_type, cron_expression,
           timezone, delivery_channel, delivery_recipient_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'cron', ?, ?, ?, ?, 'paused', ?, ?)
      `).run('pipe-paused-1', 'user-1', 'cipher', 'Paused 1', stepsJson,
        '0 9 * * *', 'UTC', 'telegram', 'chat-1', now, now);

      const { manager: fresh } = createManager(db);
      expect(fresh.activeCount).toBe(0);

      const count = fresh.hydrateFromDb();
      expect(count).toBe(1);
      expect(fresh.activeCount).toBe(1);

      fresh.shutdown();
    });

    it('cron-triggered pipeline executes on schedule', async () => {
      const { executor } = createMockExecutor();
      manager.setSkillExecutor(executor);
      const sendFn = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendFn);

      manager.createPipeline({
        userId: 'user-1',
        companionId: 'cipher',
        name: 'Per-Second Pipeline',
        steps: [{ skillName: 'weather' }],
        triggerType: 'cron',
        cronExpression: '* * * * * *', // every second
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });

      // Wait for at least one execution cycle
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(sendFn).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // shutdown
  // -----------------------------------------------------------------------

  describe('shutdown', () => {
    it('stops all Croner instances', () => {
      manager.createPipeline({
        userId: 'user-1',
        companionId: 'cipher',
        name: 'Cron 1',
        steps: [{ skillName: 'weather' }],
        triggerType: 'cron',
        cronExpression: '0 8 * * *',
        deliveryChannel: 'telegram',
        deliveryRecipientId: 'chat-1',
      });
      manager.createPipeline({
        userId: 'user-1',
        companionId: 'cipher',
        name: 'Cron 2',
        steps: [{ skillName: 'weather' }],
        triggerType: 'cron',
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
