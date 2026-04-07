/**
 * Integration tests for the approval gate wired into skill execution paths.
 *
 * Tests the full flow: skill invocation → approval gate intercept →
 * approve/reject → onApproved callback → skill execution + delivery.
 * Uses in-memory SQLite, real ApprovalManager, and mock skills/channels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ApprovalManager, type Approval } from '../inference/approval-manager.js';
import { requiresApproval, extractSkillIntent } from '../inference/approval-policy.js';
import { ChannelDelivery } from '../inference/channel-delivery.js';
import type { SkillContext, SkillResult } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(
    path.join(process.cwd(), 'db', 'schema.sql'),
    'utf-8',
  );
  db.exec(schema);

  db.prepare(
    "INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-1', 'Test')",
  ).run();

  return db;
}

/** Build a minimal SkillContext. */
function makeCtx(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    message: 'test message',
    userId: 'user-1',
    userName: 'Tester',
    conversationHistory: [],
    env: {},
    ...overrides,
  };
}

/**
 * Build an approval-gated skill executor — mirrors the pattern in server.ts.
 * Returns both the executor and references needed for assertions.
 */
function buildGatedExecutor(approvalManager: ApprovalManager) {
  /** Map of skill name → mock execute function. */
  const skillMocks = new Map<string, vi.Mock>();

  const resolveSkill = (name: string) => {
    const mock = skillMocks.get(name);
    if (!mock) return undefined;
    return {
      name,
      description: '',
      triggers: [] as string[],
      execute: mock as (ctx: SkillContext) => Promise<SkillResult>,
    };
  };

  /** The approval-gated executor — same logic as server.ts pipeline executor. */
  const gatedExecutor = async (skillName: string, ctx: SkillContext): Promise<SkillResult> => {
    const skill = resolveSkill(skillName);
    if (!skill) {
      return { content: `Skill "${skillName}" not found`, type: 'error' as const };
    }

    const intent = extractSkillIntent(ctx.message, skillName);
    if (requiresApproval(skillName, intent)) {
      const approval = approvalManager.createApproval({
        userId: ctx.userId,
        skillName,
        intent,
        payload: JSON.stringify({
          skillName,
          ctx: { message: ctx.message, userId: ctx.userId, userName: ctx.userName, conversationHistory: ctx.conversationHistory },
        }),
        deliveryChannel: 'api',
        deliveryRecipientId: ctx.userId,
      });
      return {
        content: `⏳ This action requires your approval before executing. Approval ID: ${approval.id}. Check your messages or visit /approvals to approve.`,
        type: 'error' as const,
        metadata: { approvalRequired: true, approvalId: approval.id },
      };
    }

    return skill.execute(ctx);
  };

  return { gatedExecutor, skillMocks, resolveSkill };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Approval Integration — gate → approve → execute flow', () => {
  let db: InstanceType<typeof Database>;
  let channelDelivery: ChannelDelivery;
  let approvalManager: ApprovalManager;
  let sendSpy: vi.Mock;

  beforeEach(() => {
    db = createTestDb();
    channelDelivery = new ChannelDelivery();
    sendSpy = vi.fn().mockResolvedValue(undefined);
    channelDelivery.register('api', sendSpy);
    channelDelivery.register('telegram', sendSpy);
    approvalManager = new ApprovalManager({ db, channelDelivery });
  });

  // -----------------------------------------------------------------------
  // Non-mutating skill passes through directly
  // -----------------------------------------------------------------------

  it('non-mutating skill (browser) executes without approval gate', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    const browserExec = vi.fn().mockResolvedValue({
      content: 'Page loaded',
      type: 'text' as const,
    });
    skillMocks.set('browser', browserExec);

    const result = await gatedExecutor('browser', makeCtx({ message: 'open google.com' }));

    expect(result.type).toBe('text');
    expect(result.content).toBe('Page loaded');
    expect(browserExec).toHaveBeenCalledOnce();
    // No approval rows created
    const rows = db.prepare('SELECT * FROM exec_approvals').all();
    expect(rows).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Mutating skill (email send) creates approval instead of executing
  // -----------------------------------------------------------------------

  it('mutating skill (email send) creates approval and returns error-type result', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    const emailExec = vi.fn().mockResolvedValue({
      content: 'Email sent',
      type: 'text' as const,
    });
    skillMocks.set('email', emailExec);

    const result = await gatedExecutor('email', makeCtx({ message: 'send email to bob@example.com' }));

    expect(result.type).toBe('error');
    expect(result.content).toContain('⏳');
    expect(result.content).toContain('Approval ID:');
    expect(result.metadata?.approvalRequired).toBe(true);
    expect(emailExec).not.toHaveBeenCalled();

    // Approval row created
    const rows = db.prepare('SELECT * FROM exec_approvals').all();
    expect(rows).toHaveLength(1);
  });

  it('email draft also triggers approval gate', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    skillMocks.set('email', vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }));

    const result = await gatedExecutor('email', makeCtx({ message: 'draft a welcome email' }));

    expect(result.type).toBe('error');
    expect(result.metadata?.approvalRequired).toBe(true);
  });

  it('email without send/draft keyword passes through (no intent extracted)', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    const emailExec = vi.fn().mockResolvedValue({
      content: 'Inbox checked',
      type: 'text' as const,
    });
    skillMocks.set('email', emailExec);

    const result = await gatedExecutor('email', makeCtx({ message: 'check my inbox' }));

    expect(result.type).toBe('text');
    expect(result.content).toBe('Inbox checked');
    expect(emailExec).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Approve → onApproved → skill execution + delivery
  // -----------------------------------------------------------------------

  it('approving a pending approval triggers onApproved and executes the held skill', async () => {
    const { gatedExecutor, skillMocks, resolveSkill } = buildGatedExecutor(approvalManager);
    const emailExec = vi.fn().mockResolvedValue({
      content: 'Email sent successfully to bob@example.com',
      type: 'text' as const,
    });
    skillMocks.set('email', emailExec);

    // Wire onApproved — mirrors server.ts logic
    approvalManager.onApproved = async (approval: Approval) => {
      const payload = JSON.parse(approval.payload);
      const skill = resolveSkill(payload.skillName);
      if (!skill) return;
      const result = await skill.execute(payload.ctx);
      await channelDelivery.send(
        approval.deliveryChannel,
        approval.deliveryRecipientId,
        result.content,
      );
    };

    // Step 1: Invoke gated executor — creates approval
    const gatedResult = await gatedExecutor('email', makeCtx({ message: 'send email to bob@example.com' }));
    const approvalId = gatedResult.metadata?.approvalId as string;
    expect(approvalId).toBeTruthy();
    expect(emailExec).not.toHaveBeenCalled();

    // Step 2: Approve it
    const resolved = await approvalManager.resolveApproval(approvalId, 'approved', 'user-1');
    expect(resolved).toBe(true);

    // Allow fire-and-forget onApproved to settle
    await new Promise((r) => setTimeout(r, 50));

    // Step 3: Verify skill was executed
    expect(emailExec).toHaveBeenCalledOnce();
    const executedCtx = emailExec.mock.calls[0]![0] as SkillContext;
    expect(executedCtx.message).toBe('send email to bob@example.com');

    // Step 4: Verify delivery via channel
    // sendSpy is called for:
    // 1. approval creation notification
    // 2. result delivery after approval
    const deliveryCalls = sendSpy.mock.calls;
    const deliveryMessages = deliveryCalls.map((c: unknown[]) => c[1] as string);
    expect(deliveryMessages.some((m: string) => m.includes('Email sent successfully'))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Reject → skill NOT executed
  // -----------------------------------------------------------------------

  it('rejecting an approval does not execute the skill', async () => {
    const { gatedExecutor, skillMocks, resolveSkill } = buildGatedExecutor(approvalManager);
    const emailExec = vi.fn().mockResolvedValue({
      content: 'Email sent',
      type: 'text' as const,
    });
    skillMocks.set('email', emailExec);

    approvalManager.onApproved = async (approval: Approval) => {
      const payload = JSON.parse(approval.payload);
      const skill = resolveSkill(payload.skillName);
      if (!skill) return;
      await skill.execute(payload.ctx);
    };

    // Create approval
    const gatedResult = await gatedExecutor('email', makeCtx({ message: 'send email to bob@example.com' }));
    const approvalId = gatedResult.metadata?.approvalId as string;

    // Reject
    const resolved = await approvalManager.resolveApproval(approvalId, 'rejected', 'user-1');
    expect(resolved).toBe(true);

    await new Promise((r) => setTimeout(r, 50));

    // Skill never executed
    expect(emailExec).not.toHaveBeenCalled();

    // Verify status in DB
    const row = db.prepare('SELECT status FROM exec_approvals WHERE id = ?').get(approvalId) as { status: string };
    expect(row.status).toBe('rejected');
  });

  // -----------------------------------------------------------------------
  // Expired approval cannot be approved
  // -----------------------------------------------------------------------

  it('expired approval cannot be approved', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    skillMocks.set('email', vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }));

    // Create approval with very short TTL
    const result = await gatedExecutor('email', makeCtx({ message: 'send email' }));
    const approvalId = result.metadata?.approvalId as string;

    // Force expire by updating expires_at in the past
    db.prepare('UPDATE exec_approvals SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, approvalId);

    // Attempt to approve — should fail
    const resolved = await approvalManager.resolveApproval(approvalId, 'approved', 'user-1');
    expect(resolved).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Channel notification sent on approval creation
  // -----------------------------------------------------------------------

  it('channel notification sent when approval is created', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    skillMocks.set('email', vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }));

    sendSpy.mockClear();

    await gatedExecutor('email', makeCtx({ message: 'send email to alice@example.com' }));

    // At least one send call for the approval notification
    expect(sendSpy).toHaveBeenCalled();
    const notificationMessage = sendSpy.mock.calls[0]![1] as string;
    expect(notificationMessage).toContain('Approval required');
    expect(notificationMessage).toContain('email');
  });

  // -----------------------------------------------------------------------
  // Unknown skill returns error without creating approval
  // -----------------------------------------------------------------------

  it('unknown skill returns error without creating approval', async () => {
    const { gatedExecutor } = buildGatedExecutor(approvalManager);

    const result = await gatedExecutor('nonexistent', makeCtx());

    expect(result.type).toBe('error');
    expect(result.content).toContain('not found');

    const rows = db.prepare('SELECT * FROM exec_approvals').all();
    expect(rows).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // extractSkillIntent tests
  // -----------------------------------------------------------------------

  describe('extractSkillIntent', () => {
    it('extracts "send" from email messages', () => {
      expect(extractSkillIntent('send an email to bob', 'email')).toBe('send');
      expect(extractSkillIntent('please Send the report', 'email')).toBe('send');
    });

    it('extracts "draft" from email messages', () => {
      expect(extractSkillIntent('draft a welcome email', 'email')).toBe('draft');
      expect(extractSkillIntent('Draft the newsletter', 'email')).toBe('draft');
    });

    it('returns undefined for email messages without send/draft', () => {
      expect(extractSkillIntent('check inbox', 'email')).toBeUndefined();
      expect(extractSkillIntent('list my emails', 'email')).toBeUndefined();
    });

    it('returns undefined for non-email skills', () => {
      expect(extractSkillIntent('send data', 'browser')).toBeUndefined();
      expect(extractSkillIntent('draft plan', 'weather')).toBeUndefined();
    });

    it('prefers "send" when both keywords are present', () => {
      // "send" is checked first
      expect(extractSkillIntent('send draft email', 'email')).toBe('send');
    });
  });

  // -----------------------------------------------------------------------
  // Double-approve returns false
  // -----------------------------------------------------------------------

  it('double-approving the same approval returns false', async () => {
    const { gatedExecutor, skillMocks } = buildGatedExecutor(approvalManager);
    skillMocks.set('email', vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }));

    const result = await gatedExecutor('email', makeCtx({ message: 'send email' }));
    const approvalId = result.metadata?.approvalId as string;

    const first = await approvalManager.resolveApproval(approvalId, 'approved');
    expect(first).toBe(true);

    const second = await approvalManager.resolveApproval(approvalId, 'approved');
    expect(second).toBe(false);
  });

  // -----------------------------------------------------------------------
  // onApproved with missing skill handles gracefully
  // -----------------------------------------------------------------------

  it('onApproved with missing skill does not throw', async () => {
    const { gatedExecutor, skillMocks, resolveSkill } = buildGatedExecutor(approvalManager);
    skillMocks.set('email', vi.fn().mockResolvedValue({ content: 'ok', type: 'text' as const }));

    approvalManager.onApproved = async (approval: Approval) => {
      const payload = JSON.parse(approval.payload);
      // Remove the skill before execution
      skillMocks.delete(payload.skillName);
      const skill = resolveSkill(payload.skillName);
      if (!skill) return;
      await skill.execute(payload.ctx);
    };

    const result = await gatedExecutor('email', makeCtx({ message: 'send email' }));
    const approvalId = result.metadata?.approvalId as string;

    // Should not throw
    await approvalManager.resolveApproval(approvalId, 'approved');
    await new Promise((r) => setTimeout(r, 50));
    // If we get here, no crash — that's the test
  });
});
