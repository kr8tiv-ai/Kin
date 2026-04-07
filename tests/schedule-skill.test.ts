/**
 * Tests for ScheduleSkill — natural language parsing and execute paths.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  parseCronIntent,
  scheduleSkill,
  setSchedulerManager,
  resetScheduleSkill,
} from '../bot/skills/builtins/schedule.js';
import type { SkillContext } from '../bot/skills/types.js';
import type { SchedulerManager, ScheduledJob } from '../inference/scheduler-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(message: string, overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    message,
    userId: 'user-123',
    userName: 'TestUser',
    conversationHistory: [],
    env: {},
    ...overrides,
  };
}

function makeMockJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job-abc12345-1234-5678-9abc-def012345678',
    userId: 'user-123',
    companionId: 'cipher',
    skillName: 'email',
    skillArgs: 'check my email',
    cronExpression: '0 8 * * *',
    timezone: 'UTC',
    deliveryChannel: 'telegram',
    deliveryRecipientId: 'user-123',
    status: 'active',
    lastRunAt: null,
    nextRunAt: Date.now() + 3600000,
    runCount: 0,
    maxRuns: null,
    errorCount: 0,
    lastError: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeMockSchedulerManager(): SchedulerManager {
  return {
    createJob: vi.fn().mockReturnValue(makeMockJob()),
    listJobs: vi.fn().mockReturnValue([]),
    getJob: vi.fn().mockReturnValue(null),
    pauseJob: vi.fn().mockReturnValue(null),
    resumeJob: vi.fn().mockReturnValue(null),
    deleteJob: vi.fn().mockReturnValue(true),
    hydrateFromDb: vi.fn().mockReturnValue(0),
    shutdown: vi.fn(),
    setSkillResolver: vi.fn(),
    activeCount: 0,
  } as unknown as SchedulerManager;
}

// ---------------------------------------------------------------------------
// parseCronIntent
// ---------------------------------------------------------------------------

describe('parseCronIntent', () => {
  it('parses "every morning at 8am"', () => {
    const result = parseCronIntent('schedule check my email every morning at 8am');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 8 * * *');
    expect(result!.humanDescription).toContain('morning');
  });

  it('parses "every morning" without explicit time (default 8am)', () => {
    const result = parseCronIntent('every morning check weather');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 8 * * *');
  });

  it('parses "every morning at 6am"', () => {
    const result = parseCronIntent('every morning at 6am do yoga');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 6 * * *');
  });

  it('parses "every evening at 7pm"', () => {
    const result = parseCronIntent('every evening at 7pm check news');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 19 * * *');
  });

  it('parses "every evening" without explicit time (default 6pm)', () => {
    const result = parseCronIntent('every evening review tasks');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 18 * * *');
  });

  it('parses "every hour"', () => {
    const result = parseCronIntent('check website status every hour');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 * * * *');
    expect(result!.humanDescription).toBe('Every hour');
  });

  it('parses "every 2 hours"', () => {
    const result = parseCronIntent('every 2 hours check server');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 */2 * * *');
  });

  it('parses "every 6 hours"', () => {
    const result = parseCronIntent('every 6 hours run backup');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 */6 * * *');
  });

  it('parses "every day at 14:30"', () => {
    const result = parseCronIntent('every day at 14:30 send report');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('30 14 * * *');
  });

  it('parses "every day at 9am"', () => {
    const result = parseCronIntent('every day at 9am check inbox');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 9 * * *');
  });

  it('parses "every day at 3pm"', () => {
    const result = parseCronIntent('every day at 3pm standup');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 15 * * *');
  });

  it('parses "every weekday at 9am"', () => {
    const result = parseCronIntent('every weekday at 9am check email');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 9 * * 1-5');
  });

  it('parses "every weekday" without time (default 9am)', () => {
    const result = parseCronIntent('every weekday standup');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 9 * * 1-5');
  });

  it('parses "every weekday at 5pm"', () => {
    const result = parseCronIntent('every weekday at 5pm daily summary');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 17 * * 1-5');
  });

  it('parses "every monday at 10am"', () => {
    const result = parseCronIntent('every monday at 10am team meeting');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 10 * * 1');
  });

  it('parses "every friday at 5pm"', () => {
    const result = parseCronIntent('every friday at 5pm weekly review');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 17 * * 5');
  });

  it('parses "every wednesday at 2pm"', () => {
    const result = parseCronIntent('every wednesday at 2pm check reports');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 14 * * 3');
  });

  it('parses "every sunday at 8am"', () => {
    const result = parseCronIntent('every sunday at 8am meal prep');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 8 * * 0');
  });

  it('parses "every 30 minutes"', () => {
    const result = parseCronIntent('every 30 minutes check alerts');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('*/30 * * * *');
  });

  it('parses "every 15 minutes"', () => {
    const result = parseCronIntent('every 15 minutes monitor');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('*/15 * * * *');
  });

  it('parses "every 5 minutes"', () => {
    const result = parseCronIntent('every 5 minutes ping server');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('*/5 * * * *');
  });

  it('parses raw "cron" expression', () => {
    const result = parseCronIntent('cron 0 9 * * 1-5 check dashboard');
    expect(result).not.toBeNull();
    expect(result!.cronExpression).toBe('0 9 * * 1-5');
    expect(result!.skillArgs).toBe('check dashboard');
  });

  it('infers "weather" skill from task description', () => {
    const result = parseCronIntent('every morning at 8am check weather');
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe('weather');
  });

  it('infers "email" skill from task description', () => {
    const result = parseCronIntent('every morning at 8am check my email');
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe('email');
  });

  it('infers "web-search" skill from task description', () => {
    const result = parseCronIntent('every day at 9am search for news');
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe('web-search');
  });

  it('returns "general" for unrecognized task types', () => {
    const result = parseCronIntent('every morning at 8am do stuff');
    expect(result).not.toBeNull();
    expect(result!.skillName).toBe('general');
  });

  it('returns null for unparseable input', () => {
    expect(parseCronIntent('hello world')).toBeNull();
    expect(parseCronIntent('what time is it')).toBeNull();
    expect(parseCronIntent('remind me in 5 minutes')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCronIntent('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scheduleSkill.execute — list intent
// ---------------------------------------------------------------------------

describe('scheduleSkill execute — list', () => {
  let mgr: ReturnType<typeof makeMockSchedulerManager>;

  beforeEach(() => {
    mgr = makeMockSchedulerManager();
    setSchedulerManager(mgr);
  });

  afterEach(() => {
    resetScheduleSkill();
  });

  it('lists jobs when user says "list schedules"', async () => {
    const jobs = [makeMockJob(), makeMockJob({ id: 'job-2', skillArgs: 'check weather' })];
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue(jobs);

    const result = await scheduleSkill.execute(makeCtx('list schedules'));
    expect(result.type).toBe('markdown');
    expect(result.content).toContain('scheduled tasks');
    expect(result.metadata?.action).toBe('list');
    expect(result.metadata?.count).toBe(2);
    expect(mgr.listJobs).toHaveBeenCalledWith('user-123');
  });

  it('lists jobs when user says "my schedules"', async () => {
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([makeMockJob()]);
    const result = await scheduleSkill.execute(makeCtx('my schedules'));
    expect(result.metadata?.action).toBe('list');
  });

  it('returns friendly message when no schedules exist', async () => {
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await scheduleSkill.execute(makeCtx('list schedules'));
    expect(result.content).toContain('no scheduled tasks');
    expect(result.metadata?.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scheduleSkill.execute — stop/cancel intent
// ---------------------------------------------------------------------------

describe('scheduleSkill execute — stop/cancel', () => {
  let mgr: ReturnType<typeof makeMockSchedulerManager>;

  beforeEach(() => {
    mgr = makeMockSchedulerManager();
    setSchedulerManager(mgr);
  });

  afterEach(() => {
    resetScheduleSkill();
  });

  it('deletes a job by partial ID', async () => {
    const job = makeMockJob();
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([job]);
    (mgr.deleteJob as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await scheduleSkill.execute(makeCtx(`stop schedule ${job.id.slice(0, 8)}`));
    expect(result.metadata?.action).toBe('stop');
    expect(result.metadata?.deleted).toBe(true);
    expect(mgr.deleteJob).toHaveBeenCalledWith(job.id);
  });

  it('returns not-found when ID does not match', async () => {
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await scheduleSkill.execute(makeCtx('stop schedule deadbeef'));
    expect(result.content).toContain('No schedule found');
  });

  it('stops the only schedule when no ID given (single job)', async () => {
    const job = makeMockJob();
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([job]);
    (mgr.deleteJob as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await scheduleSkill.execute(makeCtx('stop schedule'));
    expect(result.metadata?.action).toBe('stop');
    expect(result.metadata?.deleted).toBe(true);
  });

  it('prompts for ID when multiple schedules exist and no ID given', async () => {
    const jobs = [makeMockJob(), makeMockJob({ id: 'job-2' })];
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue(jobs);

    const result = await scheduleSkill.execute(makeCtx('stop schedule'));
    expect(result.content).toContain('Which schedule');
    expect(result.metadata?.action).toBe('stop_prompt');
  });

  it('friendly message when no active schedules to stop', async () => {
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await scheduleSkill.execute(makeCtx('stop schedule'));
    expect(result.content).toContain('no active schedules');
  });

  it('works with "cancel schedule" phrasing', async () => {
    const job = makeMockJob();
    (mgr.listJobs as ReturnType<typeof vi.fn>).mockReturnValue([job]);
    (mgr.deleteJob as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await scheduleSkill.execute(makeCtx('cancel schedule'));
    expect(result.metadata?.action).toBe('stop');
  });
});

// ---------------------------------------------------------------------------
// scheduleSkill.execute — create intent
// ---------------------------------------------------------------------------

describe('scheduleSkill execute — create', () => {
  let mgr: ReturnType<typeof makeMockSchedulerManager>;

  beforeEach(() => {
    mgr = makeMockSchedulerManager();
    setSchedulerManager(mgr);
  });

  afterEach(() => {
    resetScheduleSkill();
  });

  it('creates a job from a natural language schedule', async () => {
    const result = await scheduleSkill.execute(makeCtx('schedule check my email every morning at 8am'));
    expect(result.type).toBe('markdown');
    expect(result.content).toContain('Scheduled');
    expect(result.metadata?.action).toBe('create');
    expect(mgr.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        cronExpression: '0 8 * * *',
        skillName: 'email',
      }),
    );
  });

  it('returns error when createJob throws', async () => {
    (mgr.createJob as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Invalid cron');
    });

    const result = await scheduleSkill.execute(makeCtx('schedule check email every morning at 8am'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('Invalid cron');
  });

  it('delegates companionId as cipher by default', async () => {
    await scheduleSkill.execute(makeCtx('every hour check status'));
    expect(mgr.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ companionId: 'cipher' }),
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleSkill.execute — edge cases / negative
// ---------------------------------------------------------------------------

describe('scheduleSkill execute — negative', () => {
  let mgr: ReturnType<typeof makeMockSchedulerManager>;

  beforeEach(() => {
    mgr = makeMockSchedulerManager();
    setSchedulerManager(mgr);
  });

  afterEach(() => {
    resetScheduleSkill();
  });

  it('returns usage help for unparseable schedule request', async () => {
    const result = await scheduleSkill.execute(makeCtx('schedule something unclear'));
    expect(result.type).toBe('text');
    expect(result.content).toContain('schedule recurring tasks');
  });

  it('returns usage help for empty message', async () => {
    const result = await scheduleSkill.execute(makeCtx(''));
    expect(result.type).toBe('text');
    expect(result.content).toContain('schedule recurring tasks');
  });

  it('returns usage help for bare "schedule" keyword', async () => {
    const result = await scheduleSkill.execute(makeCtx('schedule'));
    expect(result.type).toBe('text');
    expect(result.content).toContain('schedule recurring tasks');
  });

  it('returns scheduler unavailable when SchedulerManager not set', async () => {
    resetScheduleSkill(); // ensure null
    const result = await scheduleSkill.execute(makeCtx('list schedules'));
    expect(result.content).toContain('not available');
    expect(result.metadata?.error).toBe('scheduler_unavailable');
  });
});
