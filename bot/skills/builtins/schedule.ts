/**
 * Schedule Skill — Natural language scheduling via SchedulerManager.
 *
 * Parses common scheduling phrases ("every morning at 8am", "every weekday
 * at 9am", "every 30 minutes") into cron expressions, then delegates to
 * SchedulerManager for persistent, cron-backed job scheduling.
 *
 * Also handles listing and stopping/cancelling schedules.
 *
 * @module bot/skills/builtins/schedule
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import type { SchedulerManager, ScheduledJob } from '../../../inference/scheduler-manager.js';

// ---------------------------------------------------------------------------
// Module-level SchedulerManager reference (set at server boot)
// ---------------------------------------------------------------------------

let schedulerManager: SchedulerManager | null = null;

/** Wire up the SchedulerManager instance. Called once at server boot. */
export function setSchedulerManager(mgr: SchedulerManager): void {
  schedulerManager = mgr;
}

/** Get the current SchedulerManager (for tests/inspection). */
export function getSchedulerManagerRef(): SchedulerManager | null {
  return schedulerManager;
}

/** Reset (for tests). */
export function resetScheduleSkill(): void {
  schedulerManager = null;
}

// ---------------------------------------------------------------------------
// Natural-Language Cron Parsing
// ---------------------------------------------------------------------------

export interface ParsedCronIntent {
  cronExpression: string;
  skillName: string;
  skillArgs: string;
  humanDescription: string;
}

/** Day-of-week name → cron number (0=Sunday). */
const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Parse a natural-language scheduling intent into a cron expression.
 *
 * Returns the parsed intent or null if the message doesn't match any
 * supported scheduling pattern.
 */
export function parseCronIntent(message: string): ParsedCronIntent | null {
  const msg = message.trim();
  const lower = msg.toLowerCase();

  // --- "every morning at Xam" / "every morning at X" ---
  {
    const m = lower.match(/every\s+morning(?:\s+at\s+(\d{1,2})\s*(?:am)?)?/);
    if (m) {
      const hour = m[1] ? parseInt(m[1], 10) : 8; // default 8am
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `0 ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every morning at ${hour}:00 AM`,
      };
    }
  }

  // --- "every evening at Xpm" / "every evening at X" ---
  {
    const m = lower.match(/every\s+evening(?:\s+at\s+(\d{1,2})\s*(?:pm)?)?/);
    if (m) {
      const rawHour = m[1] ? parseInt(m[1], 10) : 6; // default 6pm
      const hour = rawHour <= 12 ? rawHour + 12 : rawHour;
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `0 ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every evening at ${hour > 12 ? hour - 12 : hour}:00 PM`,
      };
    }
  }

  // --- "every weekday at Xam/Xpm/X" ---
  {
    const m = lower.match(/every\s+weekday(?:\s+at\s+(\d{1,2})\s*(am|pm)?)?/);
    if (m) {
      let hour = m[1] ? parseInt(m[1], 10) : 9;
      if (m[2] === 'pm' && hour < 12) hour += 12;
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `0 ${hour} * * 1-5`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every weekday at ${formatHour(hour)}`,
      };
    }
  }

  // --- "every monday/tuesday/... at X" ---
  {
    const dayPattern = Object.keys(DAY_MAP).join('|');
    const re = new RegExp(`every\\s+(${dayPattern})(?:\\s+at\\s+(\\d{1,2})\\s*(am|pm)?)?`, 'i');
    const m = lower.match(re);
    if (m) {
      const dayNum = DAY_MAP[m[1]!.toLowerCase()]!;
      let hour = m[2] ? parseInt(m[2], 10) : 9;
      if (m[3] === 'pm' && hour < 12) hour += 12;
      const task = extractTask(msg, m[0]);
      const dayName = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
      return {
        cronExpression: `0 ${hour} * * ${dayNum}`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every ${dayName} at ${formatHour(hour)}`,
      };
    }
  }

  // --- "every day at HH:MM" or "every day at Ham/Hpm" ---
  {
    const m = lower.match(/every\s+day\s+at\s+(\d{1,2}):(\d{2})/);
    if (m) {
      const hour = parseInt(m[1]!, 10);
      const minute = parseInt(m[2]!, 10);
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `${minute} ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every day at ${hour}:${m[2]}`,
      };
    }

    const m2 = lower.match(/every\s+day\s+at\s+(\d{1,2})\s*(am|pm)?/);
    if (m2) {
      let hour = parseInt(m2[1]!, 10);
      if (m2[2] === 'pm' && hour < 12) hour += 12;
      const task = extractTask(msg, m2[0]);
      return {
        cronExpression: `0 ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every day at ${formatHour(hour)}`,
      };
    }
  }

  // --- "every N hours" ---
  {
    const m = lower.match(/every\s+(\d+)\s+hours?/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `0 */${n} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every ${n} hour${n === 1 ? '' : 's'}`,
      };
    }
  }

  // --- "every hour" (exact, after "every N hours") ---
  {
    const m = lower.match(/every\s+hour/);
    if (m) {
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: '0 * * * *',
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: 'Every hour',
      };
    }
  }

  // --- "every N minutes" ---
  {
    const m = lower.match(/every\s+(\d+)\s+minutes?/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `*/${n} * * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Every ${n} minute${n === 1 ? '' : 's'}`,
      };
    }
  }

  // --- "at Ham/Hpm daily" or "at HH:MM daily" ---
  {
    const m = lower.match(/at\s+(\d{1,2}):(\d{2})\s+(?:every\s+day|daily)/);
    if (m) {
      const hour = parseInt(m[1]!, 10);
      const minute = parseInt(m[2]!, 10);
      const task = extractTask(msg, m[0]);
      return {
        cronExpression: `${minute} ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Daily at ${hour}:${m[2]}`,
      };
    }

    const m2 = lower.match(/at\s+(\d{1,2})\s*(am|pm)\s+(?:every\s+day|daily)/);
    if (m2) {
      let hour = parseInt(m2[1]!, 10);
      if (m2[2] === 'pm' && hour < 12) hour += 12;
      const task = extractTask(msg, m2[0]);
      return {
        cronExpression: `0 ${hour} * * *`,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Daily at ${formatHour(hour)}`,
      };
    }
  }

  // --- Raw "cron <expr> <task>" for power users ---
  {
    const m = msg.match(/cron\s+((?:\S+\s+){4}\S+)\s+(.+)/i);
    if (m) {
      const expr = m[1]!.trim();
      const task = m[2]!.trim();
      return {
        cronExpression: expr,
        skillName: inferSkillName(task),
        skillArgs: task,
        humanDescription: `Cron: ${expr}`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the task description from the message by removing the scheduling phrase. */
function extractTask(original: string, schedulePart: string): string {
  // Remove common prefixes
  let cleaned = original.replace(/^(?:schedule\s+)?/i, '');
  // Remove the scheduling phrase itself (case-insensitive)
  const re = new RegExp(escapeRegExp(schedulePart), 'i');
  cleaned = cleaned.replace(re, '').trim();
  // Remove leading "to " or trailing "to "
  cleaned = cleaned.replace(/^to\s+/i, '').replace(/\s+to$/i, '').trim();
  return cleaned || 'general';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Infer a skill name from a task description. */
function inferSkillName(task: string): string {
  const lower = task.toLowerCase();
  if (/weather|forecast|temperature/i.test(lower)) return 'weather';
  if (/email|inbox|mail/i.test(lower)) return 'email';
  if (/search|look\s*up|find/i.test(lower)) return 'web-search';
  if (/browse|website|url|page/i.test(lower)) return 'browser';
  if (/calc|math|\d\s*[+\-*/]\s*\d/i.test(lower)) return 'calculator';
  return 'general';
}

/** Format a 24h hour as a human-friendly string. */
function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

/** Format a ScheduledJob for display. */
function formatJob(job: ScheduledJob, index: number): string {
  const status = job.status === 'active' ? '🟢' : job.status === 'paused' ? '⏸️' : '⚪';
  return `${index + 1}. ${status} *${job.skillArgs || job.skillName}*\n   Cron: \`${job.cronExpression}\` | Runs: ${job.runCount}${job.maxRuns ? `/${job.maxRuns}` : ''} | ID: \`${job.id.slice(0, 8)}\``;
}

// ---------------------------------------------------------------------------
// Usage help text
// ---------------------------------------------------------------------------

const USAGE_HELP = [
  'I can schedule recurring tasks for you! Try:',
  '',
  '  "schedule check my email every morning at 8am"',
  '  "every weekday at 9am check weather"',
  '  "every 30 minutes check website status"',
  '  "every friday at 5pm send weekly summary"',
  '',
  'Manage schedules:',
  '  "list schedules" — see your active schedules',
  '  "stop schedule <id>" — pause or cancel a schedule',
].join('\n');

// ---------------------------------------------------------------------------
// Skill Definition
// ---------------------------------------------------------------------------

export const scheduleSkill: KinSkill = {
  name: 'schedule',
  description: 'Schedules recurring tasks with natural language cron expressions',
  triggers: [
    'schedule',
    'every morning',
    'every day',
    'every hour',
    'every weekday',
    'cron',
    'recurring',
    'list schedules',
    'stop schedule',
    'my schedules',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // Guard: SchedulerManager not wired up yet
    if (!schedulerManager) {
      return {
        content: 'The scheduling system is not available yet. Please try again after the server has fully started.',
        type: 'text',
        metadata: { error: 'scheduler_unavailable' },
      };
    }

    const lower = ctx.message.toLowerCase().trim();

    // Empty message → usage
    if (!lower || lower === 'schedule') {
      return { content: USAGE_HELP, type: 'text' };
    }

    // ----- LIST INTENT -----
    if (/(?:list|my|show|view)\s*schedules?/i.test(lower)) {
      return handleList(ctx);
    }

    // ----- STOP / CANCEL INTENT -----
    if (/(?:stop|cancel|remove|delete)\s+schedule/i.test(lower)) {
      return handleStop(ctx);
    }

    // ----- CREATE INTENT -----
    const parsed = parseCronIntent(ctx.message);
    if (!parsed) {
      return { content: USAGE_HELP, type: 'text' };
    }

    return handleCreate(ctx, parsed);
  },
};

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

function handleList(ctx: SkillContext): SkillResult {
  const jobs = schedulerManager!.listJobs(ctx.userId);
  if (jobs.length === 0) {
    return {
      content: 'You have no scheduled tasks. Try "schedule check email every morning at 8am" to create one!',
      type: 'text',
      metadata: { action: 'list', count: 0 },
    };
  }

  const lines = jobs.map((j, i) => formatJob(j, i));
  return {
    content: `*Your scheduled tasks:*\n\n${lines.join('\n\n')}`,
    type: 'markdown',
    metadata: { action: 'list', count: jobs.length },
  };
}

function handleStop(ctx: SkillContext): SkillResult {
  const lower = ctx.message.toLowerCase();

  // Try to extract a job ID (partial match — first 8 chars is enough)
  const idMatch = lower.match(/(?:stop|cancel|remove|delete)\s+schedule\s+([a-f0-9-]+)/i);

  if (idMatch) {
    const partialId = idMatch[1]!;
    // Find matching job
    const jobs = schedulerManager!.listJobs(ctx.userId);
    const match = jobs.find(j => j.id.startsWith(partialId));
    if (!match) {
      return {
        content: `No schedule found matching ID "${partialId}". Use "list schedules" to see your active schedules.`,
        type: 'text',
        metadata: { action: 'stop', found: false },
      };
    }

    const deleted = schedulerManager!.deleteJob(match.id);
    return {
      content: deleted
        ? `Schedule "${match.skillArgs || match.skillName}" has been removed.`
        : `Could not remove schedule "${match.id}".`,
      type: 'text',
      metadata: { action: 'stop', jobId: match.id, deleted },
    };
  }

  // No ID provided — check if user has any schedules
  const jobs = schedulerManager!.listJobs(ctx.userId);
  if (jobs.length === 0) {
    return {
      content: 'You have no active schedules to stop.',
      type: 'text',
      metadata: { action: 'stop', found: false },
    };
  }

  // If only one schedule, offer to stop it
  if (jobs.length === 1) {
    const job = jobs[0]!;
    const deleted = schedulerManager!.deleteJob(job.id);
    return {
      content: deleted
        ? `Removed your only schedule: "${job.skillArgs || job.skillName}".`
        : `Could not remove schedule.`,
      type: 'text',
      metadata: { action: 'stop', jobId: job.id, deleted },
    };
  }

  // Multiple — ask which one
  const lines = jobs.map((j, i) => formatJob(j, i));
  return {
    content: `Which schedule do you want to stop? Reply with "stop schedule <id>".\n\n${lines.join('\n\n')}`,
    type: 'markdown',
    metadata: { action: 'stop_prompt', count: jobs.length },
  };
}

function handleCreate(ctx: SkillContext, parsed: ParsedCronIntent): SkillResult {
  const ctxAny = ctx as unknown as Record<string, unknown>;
  const companionId = (typeof ctxAny.companionId === 'string' ? ctxAny.companionId : 'cipher');
  const deliveryChannel = (typeof ctxAny.channel === 'string' ? ctxAny.channel : 'telegram');
  const deliveryRecipientId = ctx.userId;

  try {
    const job = schedulerManager!.createJob({
      userId: ctx.userId,
      companionId,
      skillName: parsed.skillName,
      skillArgs: { message: parsed.skillArgs },
      cronExpression: parsed.cronExpression,
      deliveryChannel,
      deliveryRecipientId,
    });

    return {
      content: `✅ Scheduled! ${parsed.humanDescription}\n\nTask: *${parsed.skillArgs}*\nSkill: ${parsed.skillName}\nID: \`${job.id.slice(0, 8)}\`\n\nSay "list schedules" to see all your schedules.`,
      type: 'markdown',
      metadata: {
        action: 'create',
        jobId: job.id,
        cronExpression: parsed.cronExpression,
        skillName: parsed.skillName,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `Could not create schedule: ${msg}`,
      type: 'error',
      metadata: { action: 'create', error: msg },
    };
  }
}

export default scheduleSkill;
