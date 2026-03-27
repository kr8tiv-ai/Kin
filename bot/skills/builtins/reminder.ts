/**
 * Reminder Skill - In-memory reminder management
 *
 * Parses natural-language reminder requests and stores them
 * in a Map keyed by user ID. No database required.
 *
 * Supported patterns:
 *   "remind me in 5 minutes to check the oven"
 *   "remind me to call Mom in 30 minutes"
 *   "set reminder in 1 hour to take medicine"
 *   "remind me in 2 hours to review PR"
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';

// ============================================================================
// Reminder Storage
// ============================================================================

export interface Reminder {
  id: string;
  userId: string;
  task: string;
  createdAt: Date;
  triggerAt: Date;
  fired: boolean;
}

/** In-memory store: userId -> Reminder[] */
const reminders = new Map<string, Reminder[]>();

/** Callbacks registered for fired-reminder notifications */
const listeners: Array<(reminder: Reminder) => void> = [];

// ============================================================================
// Timer Management
// ============================================================================

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleTimer(reminder: Reminder): void {
  const delay = reminder.triggerAt.getTime() - Date.now();
  if (delay <= 0) {
    fireReminder(reminder);
    return;
  }

  const timer = setTimeout(() => {
    fireReminder(reminder);
    activeTimers.delete(reminder.id);
  }, delay);

  activeTimers.set(reminder.id, timer);
}

function fireReminder(reminder: Reminder): void {
  reminder.fired = true;
  for (const listener of listeners) {
    try {
      listener(reminder);
    } catch {
      // Listener errors should not crash the system
    }
  }
}

// ============================================================================
// Public Reminder API
// ============================================================================

export function addReminder(userId: string, task: string, delayMs: number): Reminder {
  const id = `rem-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date();

  const reminder: Reminder = {
    id,
    userId,
    task,
    createdAt: now,
    triggerAt: new Date(now.getTime() + delayMs),
    fired: false,
  };

  const userReminders = reminders.get(userId) ?? [];
  userReminders.push(reminder);
  reminders.set(userId, userReminders);

  scheduleTimer(reminder);

  return reminder;
}

export function getReminders(userId: string): Reminder[] {
  return (reminders.get(userId) ?? []).filter((r) => !r.fired);
}

export function clearReminders(userId: string): number {
  const userReminders = reminders.get(userId) ?? [];
  let cleared = 0;

  for (const reminder of userReminders) {
    const timer = activeTimers.get(reminder.id);
    if (timer) {
      clearTimeout(timer);
      activeTimers.delete(reminder.id);
    }
    cleared++;
  }

  reminders.delete(userId);
  return cleared;
}

export function onReminderFired(callback: (reminder: Reminder) => void): void {
  listeners.push(callback);
}

// ============================================================================
// Natural Language Parsing
// ============================================================================

interface ParsedReminder {
  task: string;
  delayMs: number;
  humanDuration: string;
}

const TIME_UNITS: Record<string, number> = {
  second: 1_000,
  seconds: 1_000,
  sec: 1_000,
  secs: 1_000,
  s: 1_000,
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  m: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  h: 3_600_000,
};

function parseReminder(message: string): ParsedReminder | null {
  // Pattern A: "remind me in 5 minutes to check the oven"
  const patternA = /(?:remind\s+me|set\s+(?:a\s+)?reminder)\s+in\s+(\d+)\s*(\w+)\s+(?:to\s+)?(.+)/i;
  const matchA = message.match(patternA);

  if (matchA) {
    const amount = parseInt(matchA[1]!, 10);
    const unitRaw = matchA[2]!.toLowerCase();
    const task = matchA[3]!.trim();
    const multiplier = TIME_UNITS[unitRaw];

    if (multiplier && amount > 0 && task) {
      return {
        task,
        delayMs: amount * multiplier,
        humanDuration: `${amount} ${unitRaw}`,
      };
    }
  }

  // Pattern B: "remind me to call Mom in 30 minutes"
  const patternB = /(?:remind\s+me|set\s+(?:a\s+)?reminder)\s+(?:to\s+)?(.+?)\s+in\s+(\d+)\s*(\w+)/i;
  const matchB = message.match(patternB);

  if (matchB) {
    const task = matchB[1]!.trim();
    const amount = parseInt(matchB[2]!, 10);
    const unitRaw = matchB[3]!.toLowerCase();
    const multiplier = TIME_UNITS[unitRaw];

    if (multiplier && amount > 0 && task) {
      return {
        task,
        delayMs: amount * multiplier,
        humanDuration: `${amount} ${unitRaw}`,
      };
    }
  }

  return null;
}

// ============================================================================
// Formatting
// ============================================================================

function formatReminderList(userId: string): string {
  const active = getReminders(userId);

  if (active.length === 0) {
    return 'You have no active reminders.';
  }

  const lines = active.map((r, i) => {
    const remaining = r.triggerAt.getTime() - Date.now();
    const mins = Math.max(1, Math.round(remaining / 60_000));
    return `${i + 1}. *${r.task}* -- in ~${mins} min`;
  });

  return `*Your active reminders:*\n\n${lines.join('\n')}`;
}

// ============================================================================
// Skill Definition
// ============================================================================

export const reminderSkill: KinSkill = {
  name: 'reminder',
  description: 'Sets time-based reminders stored in memory',
  triggers: ['remind me', 'set reminder', 'reminder', 'reminders'],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const lower = ctx.message.toLowerCase().trim();

    // List reminders
    if (/(?:my|list|show|view)\s*reminders?/i.test(lower) || lower === 'reminders') {
      return {
        content: formatReminderList(ctx.userId),
        type: 'markdown',
        metadata: { action: 'list', count: getReminders(ctx.userId).length },
      };
    }

    // Clear reminders
    if (/clear\s*(?:all\s*)?reminders?/i.test(lower)) {
      const cleared = clearReminders(ctx.userId);
      return {
        content: cleared > 0
          ? `Cleared ${cleared} reminder${cleared === 1 ? '' : 's'}.`
          : 'You have no reminders to clear.',
        type: 'text',
        metadata: { action: 'clear', cleared },
      };
    }

    // Parse new reminder
    const parsed = parseReminder(ctx.message);

    if (!parsed) {
      return {
        content: [
          'I can set a reminder for you! Try:',
          '',
          '  "remind me in 5 minutes to check the oven"',
          '  "remind me to call Mom in 30 minutes"',
          '  "set reminder in 1 hour to review PR"',
          '',
          'You can also say "my reminders" to list active ones.',
        ].join('\n'),
        type: 'text',
      };
    }

    // Safety: cap at 24 hours
    const MAX_DELAY = 24 * 60 * 60 * 1000;
    if (parsed.delayMs > MAX_DELAY) {
      return {
        content: 'Reminders are limited to 24 hours maximum (they are stored in memory and will not survive a restart).',
        type: 'text',
      };
    }

    const reminder = addReminder(ctx.userId, parsed.task, parsed.delayMs);
    const activeCount = getReminders(ctx.userId).length;

    return {
      content: `Reminder set! I'll remind you to *${parsed.task}* in ${parsed.humanDuration}.\n\nYou have ${activeCount} active reminder${activeCount === 1 ? '' : 's'}.`,
      type: 'markdown',
      metadata: {
        action: 'set',
        reminderId: reminder.id,
        task: parsed.task,
        triggerAt: reminder.triggerAt.toISOString(),
        activeCount,
      },
    };
  },
};

export default reminderSkill;
