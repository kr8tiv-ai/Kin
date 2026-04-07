/**
 * Tests for PipelineSkill — conversational interface for workflow pipelines.
 *
 * Covers: trigger matching (positive + negative), intent parsing for each
 * intent type, execute paths (create/list/run/delete/show), gate check when
 * manager not wired, error handling (pipeline not found, invalid steps,
 * execution failure).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  pipelineSkill,
  setPipelineManager,
  resetPipelineSkill,
  parsePipelineIntent,
} from '../bot/skills/builtins/pipeline.js';
import { PipelineManager, resetPipelineManager } from '../inference/pipeline-manager.js';
import type { SkillContext, SkillResult } from '../bot/skills/types.js';
import type { ChannelDelivery } from '../inference/channel-delivery.js';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database): void {
  const schema = fs.readFileSync('db/schema.sql', 'utf-8');
  db.exec(schema);

  // Seed FK referenced rows
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-1', 'Test')").run();
  db.prepare("INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-2', 'Other')").run();
  db.prepare(
    "INSERT OR IGNORE INTO companions (id, name, type, specialization, personality_prompt) VALUES ('cipher', 'Cipher', 'code_kraken', 'code', 'You are Cipher.')",
  ).run();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(message: string, overrides?: Partial<SkillContext>): SkillContext {
  return {
    message,
    userId: 'user-1',
    userName: 'Test User',
    conversationHistory: [],
    env: {},
    ...overrides,
  };
}

const noopDelivery: ChannelDelivery = {
  send: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Trigger matching
// ---------------------------------------------------------------------------

describe('PipelineSkill', () => {
  describe('trigger matching', () => {
    const triggers = pipelineSkill.triggers;

    it.each([
      'create workflow',
      'create pipeline',
      'new workflow',
      'new pipeline',
      'list workflows',
      'list pipelines',
      'my workflows',
      'my pipelines',
      'run pipeline',
      'run workflow',
      'execute pipeline',
      'execute workflow',
      'delete pipeline',
      'delete workflow',
      'remove pipeline',
      'remove workflow',
      'show pipeline',
      'show workflow',
    ])('includes trigger: %s', (trigger) => {
      expect(triggers).toContain(trigger);
    });

    it('does not include unrelated triggers', () => {
      expect(triggers).not.toContain('schedule');
      expect(triggers).not.toContain('email');
      expect(triggers).not.toContain('weather');
    });
  });

  // -------------------------------------------------------------------------
  // Intent parsing
  // -------------------------------------------------------------------------

  describe('parsePipelineIntent', () => {
    describe('create intent', () => {
      it('parses create with name and steps', () => {
        const result = parsePipelineIntent('create pipeline morning-routine steps: check-email, browser, email');
        expect(result).toEqual({
          intent: 'create',
          name: 'morning-routine',
          steps: ['check-email', 'browser', 'email'],
        });
      });

      it('parses create with colon separator', () => {
        const result = parsePipelineIntent('create workflow daily-report: web-search, email');
        expect(result).toEqual({
          intent: 'create',
          name: 'daily-report',
          steps: ['web-search', 'email'],
        });
      });

      it('parses create with quoted name', () => {
        const result = parsePipelineIntent('create pipeline "my workflow" steps: email, browser');
        expect(result).toEqual({
          intent: 'create',
          name: 'my workflow',
          steps: ['email', 'browser'],
        });
      });

      it('parses create with arrow separators', () => {
        const result = parsePipelineIntent('create pipeline test steps: email -> browser -> web-search');
        expect(result).toEqual({
          intent: 'create',
          name: 'test',
          steps: ['email', 'browser', 'web-search'],
        });
      });

      it('parses create with "new" prefix', () => {
        const result = parsePipelineIntent('new pipeline daily steps: email');
        expect(result).toEqual({
          intent: 'create',
          name: 'daily',
          steps: ['email'],
        });
      });

      it('returns create intent with just a name (no steps)', () => {
        const result = parsePipelineIntent('create pipeline morning-check');
        expect(result).toEqual({
          intent: 'create',
          name: 'morning-check',
        });
      });
    });

    describe('list intent', () => {
      it.each([
        'list pipelines',
        'list my pipelines',
        'my pipelines',
        'list workflows',
        'my workflows',
        'view pipelines',
        'all pipelines',
      ])('recognizes list intent: "%s"', (msg) => {
        const result = parsePipelineIntent(msg);
        expect(result).toEqual({ intent: 'list' });
      });
    });

    describe('run intent', () => {
      it('parses run with name', () => {
        const result = parsePipelineIntent('run pipeline morning-routine');
        expect(result).toEqual({ intent: 'run', pipelineRef: 'morning-routine' });
      });

      it('parses execute variant', () => {
        const result = parsePipelineIntent('execute workflow daily-report');
        expect(result).toEqual({ intent: 'run', pipelineRef: 'daily-report' });
      });

      it('parses start variant', () => {
        const result = parsePipelineIntent('start pipeline test');
        expect(result).toEqual({ intent: 'run', pipelineRef: 'test' });
      });
    });

    describe('delete intent', () => {
      it('parses delete with name', () => {
        const result = parsePipelineIntent('delete pipeline morning-routine');
        expect(result).toEqual({ intent: 'delete', pipelineRef: 'morning-routine' });
      });

      it('parses remove variant', () => {
        const result = parsePipelineIntent('remove workflow old-stuff');
        expect(result).toEqual({ intent: 'delete', pipelineRef: 'old-stuff' });
      });
    });

    describe('show intent', () => {
      it('parses show with name', () => {
        const result = parsePipelineIntent('show pipeline morning-routine');
        expect(result).toEqual({ intent: 'show', pipelineRef: 'morning-routine' });
      });

      it('parses detail variant', () => {
        const result = parsePipelineIntent('detail workflow daily');
        expect(result).toEqual({ intent: 'show', pipelineRef: 'daily' });
      });
    });

    describe('non-matching', () => {
      it('returns null for unrelated messages', () => {
        expect(parsePipelineIntent('what is the weather today')).toBeNull();
        expect(parsePipelineIntent('hello there')).toBeNull();
        expect(parsePipelineIntent('schedule check email every morning')).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Execute — gate check
  // -------------------------------------------------------------------------

  describe('execute — gate check', () => {
    beforeEach(() => {
      resetPipelineSkill();
    });

    it('returns unavailable error when manager not wired', async () => {
      const result = await pipelineSkill.execute(makeCtx('list pipelines'));
      expect(result.type).toBe('text');
      expect(result.content).toContain('not available');
      expect(result.metadata?.error).toBe('pipeline_unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // Execute — with wired PipelineManager
  // -------------------------------------------------------------------------

  describe('execute — with PipelineManager', () => {
    let db: Database.Database;
    let mgr: PipelineManager;

    beforeEach(() => {
      resetPipelineManager();
      resetPipelineSkill();
      db = new Database(':memory:');
      initSchema(db);
      mgr = new PipelineManager(db as any, noopDelivery);
      setPipelineManager(mgr);
    });

    afterEach(() => {
      mgr.shutdown();
      resetPipelineSkill();
      resetPipelineManager();
      db.close();
    });

    // -- Unrecognized message → usage help --

    it('returns usage help for unrecognized message', async () => {
      const result = await pipelineSkill.execute(makeCtx('pipeline something random'));
      expect(result.type).toBe('markdown');
      expect(result.content).toContain('workflow pipelines');
    });

    // -- CREATE --

    describe('create', () => {
      it('creates a pipeline with name and steps', async () => {
        const result = await pipelineSkill.execute(
          makeCtx('create pipeline morning-check steps: check-email, browser'),
        );
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('Pipeline created');
        expect(result.content).toContain('morning-check');
        expect(result.metadata?.action).toBe('create');
        expect(result.metadata?.name).toBe('morning-check');

        // Verify it actually exists
        const pipelines = mgr.listPipelines('user-1');
        expect(pipelines).toHaveLength(1);
        expect(pipelines[0]!.name).toBe('morning-check');
        expect(pipelines[0]!.steps).toEqual([
          { skillName: 'check-email' },
          { skillName: 'browser' },
        ]);
      });

      it('returns error when steps are missing', async () => {
        const result = await pipelineSkill.execute(
          makeCtx('create pipeline no-steps'),
        );
        expect(result.type).toBe('text');
        expect(result.content).toContain('provide steps');
        expect(result.metadata?.error).toBe('missing_steps');
      });

      it('returns error when name is missing', async () => {
        // "create pipeline" with no name — parseCreateIntent gets empty payload
        const result = await pipelineSkill.execute(
          makeCtx('create pipeline'),
        );
        // No name AND no steps — steps error takes priority
        expect(result.type).toBe('text');
        expect(result.metadata?.error).toMatch(/missing_/);
      });
    });

    // -- LIST --

    describe('list', () => {
      it('returns empty message when no pipelines', async () => {
        const result = await pipelineSkill.execute(makeCtx('list pipelines'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('no pipelines');
        expect(result.metadata?.count).toBe(0);
      });

      it('lists existing pipelines', async () => {
        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'pipe-a',
          steps: [{ skillName: 'email' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });
        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'pipe-b',
          steps: [{ skillName: 'browser' }, { skillName: 'email' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        const result = await pipelineSkill.execute(makeCtx('list pipelines'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('pipe-a');
        expect(result.content).toContain('pipe-b');
        expect(result.metadata?.count).toBe(2);
      });
    });

    // -- RUN --

    describe('run', () => {
      it('executes a pipeline by name', async () => {
        mgr.setSkillExecutor(async (_name, ctx) => ({
          content: `processed: ${ctx.message}`,
          type: 'text' as const,
        }));

        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'test-pipe',
          steps: [{ skillName: 'email' }, { skillName: 'browser' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        const result = await pipelineSkill.execute(makeCtx('run pipeline test-pipe'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('test-pipe');
        expect(result.content).toContain('completed');
        expect(result.metadata?.action).toBe('run');
        expect(result.metadata?.status).toBe('completed');
        expect(result.metadata?.stepsCompleted).toBe(2);
      });

      it('returns error when no reference provided', async () => {
        const result = await pipelineSkill.execute(makeCtx('run pipeline'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('specify which pipeline');
        expect(result.metadata?.error).toBe('missing_ref');
      });

      it('returns error when pipeline not found', async () => {
        const result = await pipelineSkill.execute(makeCtx('run pipeline nonexistent'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('not found');
        expect(result.metadata?.error).toBe('not_found');
      });

      it('handles execution failure gracefully', async () => {
        mgr.setSkillExecutor(async () => {
          throw new Error('skill crashed');
        });

        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'crash-pipe',
          steps: [{ skillName: 'broken' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        const result = await pipelineSkill.execute(makeCtx('run pipeline crash-pipe'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('crash-pipe');
        expect(result.metadata?.status).toBe('failed');
      });
    });

    // -- DELETE --

    describe('delete', () => {
      it('deletes a pipeline by name', async () => {
        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'deletable',
          steps: [{ skillName: 'email' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        const result = await pipelineSkill.execute(makeCtx('delete pipeline deletable'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('deleted');
        expect(result.metadata?.deleted).toBe(true);

        // Verify it's gone
        expect(mgr.listPipelines('user-1')).toHaveLength(0);
      });

      it('returns error when no reference provided', async () => {
        const result = await pipelineSkill.execute(makeCtx('delete pipeline'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('specify which pipeline');
        expect(result.metadata?.error).toBe('missing_ref');
      });

      it('returns error when pipeline not found', async () => {
        const result = await pipelineSkill.execute(makeCtx('delete pipeline ghost'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('not found');
      });
    });

    // -- SHOW --

    describe('show', () => {
      it('shows pipeline details with run history', async () => {
        mgr.setSkillExecutor(async (_name, ctx) => ({
          content: `done: ${ctx.message}`,
          type: 'text' as const,
        }));

        const p = mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'showable',
          steps: [{ skillName: 'email' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        // Run it once so there's history
        await mgr.executePipeline(p.id);

        const result = await pipelineSkill.execute(makeCtx('show pipeline showable'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('showable');
        expect(result.content).toContain('email');
        expect(result.content).toContain('Recent runs');
        expect(result.metadata?.action).toBe('show');
      });

      it('returns error when no reference provided', async () => {
        const result = await pipelineSkill.execute(makeCtx('show pipeline'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('specify which pipeline');
        expect(result.metadata?.error).toBe('missing_ref');
      });

      it('returns error when pipeline not found', async () => {
        const result = await pipelineSkill.execute(makeCtx('show pipeline missing'));
        expect(result.type).toBe('text');
        expect(result.content).toContain('not found');
      });
    });

    // -- Partial name matching --

    describe('findPipeline — partial matching', () => {
      it('finds pipeline by partial name', async () => {
        mgr.setSkillExecutor(async (_name, ctx) => ({
          content: `done`,
          type: 'text' as const,
        }));

        mgr.createPipeline({
          userId: 'user-1',
          companionId: 'cipher',
          name: 'morning-email-routine',
          steps: [{ skillName: 'email' }],
          deliveryChannel: 'telegram',
          deliveryRecipientId: 'user-1',
        });

        const result = await pipelineSkill.execute(makeCtx('show pipeline morning'));
        expect(result.type).toBe('markdown');
        expect(result.content).toContain('morning-email-routine');
      });
    });
  });
});
