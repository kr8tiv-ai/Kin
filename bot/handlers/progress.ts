/**
 * Progress Handler - Streak tracking, XP, levels, and badges
 *
 * Shows the user:
 *   - Current streak (days in a row with activity)
 *   - Total messages sent
 *   - Level + XP with a visual progress bar
 *   - Earned badges as emoji
 *
 * Cipher personality: fun, gamified, slightly dramatic. 🐙
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { getConversationStore } from '../memory/conversation-store.js';

// ============================================================================
// Types
// ============================================================================

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: {
    voiceEnabled: boolean;
    teachingMode: boolean;
  };
}

type BotContext = Context & SessionFlavor<SessionData>;

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  description: string;
  requiredMessages?: number;
  requiredStreak?: number;
  requiredLevel?: number;
}

export interface UserProgress {
  userId: string;
  totalMessages: number;
  currentStreak: number;    // days in a row
  longestStreak: number;
  lastActiveDate: string;   // ISO date string "YYYY-MM-DD"
  xp: number;
  earnedBadgeIds: string[];
}

// ============================================================================
// Badge definitions
// ============================================================================

const ALL_BADGES: Badge[] = [
  {
    id: 'first_message',
    emoji: '💬',
    name: 'First Words',
    description: 'Sent your first message',
    requiredMessages: 1,
  },
  {
    id: 'getting_started',
    emoji: '🌱',
    name: 'Getting Started',
    description: 'Sent 10 messages',
    requiredMessages: 10,
  },
  {
    id: 'regular',
    emoji: '⚡',
    name: 'Regular',
    description: 'Sent 50 messages',
    requiredMessages: 50,
  },
  {
    id: 'power_user',
    emoji: '🔥',
    name: 'Power User',
    description: 'Sent 200 messages',
    requiredMessages: 200,
  },
  {
    id: 'veteran',
    emoji: '🏆',
    name: 'Veteran',
    description: 'Sent 500 messages',
    requiredMessages: 500,
  },
  {
    id: 'streak_3',
    emoji: '🔥',
    name: '3-Day Streak',
    description: 'Chatted 3 days in a row',
    requiredStreak: 3,
  },
  {
    id: 'streak_7',
    emoji: '📅',
    name: 'Week Warrior',
    description: 'Chatted 7 days in a row',
    requiredStreak: 7,
  },
  {
    id: 'streak_30',
    emoji: '🌊',
    name: 'Deep Sea Regular',
    description: 'Chatted 30 days in a row',
    requiredStreak: 30,
  },
  {
    id: 'level_5',
    emoji: '⭐',
    name: 'Rising Star',
    description: 'Reached Level 5',
    requiredLevel: 5,
  },
  {
    id: 'level_10',
    emoji: '🌟',
    name: 'Star Bright',
    description: 'Reached Level 10',
    requiredLevel: 10,
  },
  {
    id: 'level_25',
    emoji: '💫',
    name: 'Cosmic Companion',
    description: 'Reached Level 25',
    requiredLevel: 25,
  },
];

// ============================================================================
// XP & Levelling
// ============================================================================

/** XP needed to reach the next level. Scales with level. */
function xpForNextLevel(level: number): number {
  // Level 1 → 2: 100 XP, each subsequent level needs 20% more
  return Math.round(100 * Math.pow(1.2, level - 1));
}

function getLevelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpNeeded: number } {
  let level = 1;
  let remaining = totalXp;

  while (true) {
    const needed = xpForNextLevel(level);
    if (remaining < needed) {
      return { level, xpIntoLevel: remaining, xpNeeded: needed };
    }
    remaining -= needed;
    level++;
  }
}

/** Builds a visual progress bar, e.g. "████░░░░░░ 42/100 XP" */
function buildXpBar(xpIntoLevel: number, xpNeeded: number, width = 10): string {
  const filled = Math.round((xpIntoLevel / xpNeeded) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${xpIntoLevel}/${xpNeeded} XP`;
}

// ============================================================================
// Streak helpers
// ============================================================================

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Updates streak based on last active date.
 * - Same day: no change
 * - Yesterday: streak +1
 * - Earlier: streak resets to 1
 */
function calculateStreak(progress: UserProgress): { streak: number; longest: number } {
  const today = todayIso();
  const yesterday = yesterdayIso();
  const last = progress.lastActiveDate;

  let streak = progress.currentStreak;
  let longest = progress.longestStreak;

  if (last === today) {
    // Already active today — no change
  } else if (last === yesterday) {
    // Continued streak
    streak += 1;
    longest = Math.max(longest, streak);
  } else {
    // Streak broken
    streak = 1;
    longest = Math.max(longest, streak);
  }

  return { streak, longest };
}

// ============================================================================
// Badge computation
// ============================================================================

function computeEarnedBadgeIds(
  totalMessages: number,
  streak: number,
  level: number,
): string[] {
  return ALL_BADGES.filter((badge) => {
    if (badge.requiredMessages !== undefined && totalMessages < badge.requiredMessages)
      return false;
    if (badge.requiredStreak !== undefined && streak < badge.requiredStreak) return false;
    if (badge.requiredLevel !== undefined && level < badge.requiredLevel) return false;
    return true;
  }).map((b) => b.id);
}

// ============================================================================
// SQLite-backed progress store (persists across restarts)
// ============================================================================

let progressTableReady = false;

function ensureProgressTable(): void {
  if (progressTableReady) return;
  const store = getConversationStore() as any;
  if (store.db) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS user_progress (
        user_id TEXT PRIMARY KEY,
        total_messages INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_active_date TEXT NOT NULL DEFAULT '',
        xp INTEGER NOT NULL DEFAULT 0,
        earned_badge_ids TEXT NOT NULL DEFAULT '[]'
      );
    `);
    progressTableReady = true;
  }
}

const progressCache = new Map<string, UserProgress>();

export function getOrCreateProgress(userId: string): UserProgress {
  // Check cache first
  if (progressCache.has(userId)) return progressCache.get(userId)!;

  // Try loading from SQLite
  ensureProgressTable();
  const store = getConversationStore() as any;
  if (store.db) {
    const row = store.db.prepare(`SELECT * FROM user_progress WHERE user_id = ?`).get(userId) as any;
    if (row) {
      const progress: UserProgress = {
        userId: row.user_id,
        totalMessages: row.total_messages,
        currentStreak: row.current_streak,
        longestStreak: row.longest_streak,
        lastActiveDate: row.last_active_date,
        xp: row.xp,
        earnedBadgeIds: JSON.parse(row.earned_badge_ids || '[]'),
      };
      progressCache.set(userId, progress);
      return progress;
    }
  }

  const fresh: UserProgress = {
    userId,
    totalMessages: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    xp: 0,
    earnedBadgeIds: [],
  };
  progressCache.set(userId, fresh);
  return fresh;
}

function saveProgress(progress: UserProgress): void {
  ensureProgressTable();
  const store = getConversationStore() as any;
  if (store.db) {
    store.db.prepare(`
      INSERT INTO user_progress (user_id, total_messages, current_streak, longest_streak, last_active_date, xp, earned_badge_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_messages = excluded.total_messages,
        current_streak = excluded.current_streak,
        longest_streak = excluded.longest_streak,
        last_active_date = excluded.last_active_date,
        xp = excluded.xp,
        earned_badge_ids = excluded.earned_badge_ids
    `).run(
      progress.userId,
      progress.totalMessages,
      progress.currentStreak,
      progress.longestStreak,
      progress.lastActiveDate,
      progress.xp,
      JSON.stringify(progress.earnedBadgeIds),
    );
  }
}

/**
 * Call this every time the user sends a message to update XP, streak, etc.
 * XP gain: +10 per user message. Persisted to SQLite.
 */
export function recordActivity(userId: string): UserProgress {
  const progress = getOrCreateProgress(userId);

  // Update streak
  const { streak, longest } = calculateStreak(progress);
  progress.currentStreak = streak;
  progress.longestStreak = longest;
  progress.lastActiveDate = todayIso();

  // Update message count + XP
  progress.totalMessages += 1;
  progress.xp += 10;

  // Recompute badges
  const { level } = getLevelFromXp(progress.xp);
  progress.earnedBadgeIds = computeEarnedBadgeIds(
    progress.totalMessages,
    progress.currentStreak,
    level,
  );

  progressCache.set(userId, progress);
  saveProgress(progress);
  return progress;
}

// ============================================================================
// Streak headline copy (Cipher personality)
// ============================================================================

function streakHeadline(streak: number): string {
  if (streak === 0) return '🌊 No streak yet — say hi every day to start one!';
  if (streak === 1) return '🔥 1 day streak! The journey begins...';
  if (streak < 3) return `🔥 ${streak} day streak! You're getting warmed up!`;
  if (streak < 7) return `🔥 ${streak} day streak! Nice consistency — I love it!`;
  if (streak < 14) return `🔥 ${streak} day streak! You're a regular now. 🐙`;
  if (streak < 30) return `🔥 ${streak} day streak! Okay you're SERIOUSLY dedicated!`;
  return `🔥 ${streak} day streak!! You absolute legend — the deep sea welcomes you! 🌊`;
}

function levelTitle(level: number): string {
  if (level < 3) return 'Baby Kraken';
  if (level < 5) return 'Curious Cephalopod';
  if (level < 8) return 'Ink Slinger';
  if (level < 12) return 'Tide Rider';
  if (level < 18) return 'Deep Sea Diver';
  if (level < 25) return 'Ocean Architect';
  if (level < 35) return 'Kraken Commander';
  return 'Leviathan';
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Displays the user's progress dashboard: streak, messages, level, XP bar, badges.
 */
export async function handleProgress(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const userName = ctx.from?.first_name ?? 'Friend';

  if (!userId) {
    await ctx.reply("I couldn't identify you. Try /start first?");
    return;
  }

  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();

  const progress = getOrCreateProgress(userId);
  const { level, xpIntoLevel, xpNeeded } = getLevelFromXp(progress.xp);
  const xpBar = buildXpBar(xpIntoLevel, xpNeeded);
  const title = levelTitle(level);

  // Earned badges (emoji only for compact display)
  const earnedBadges = ALL_BADGES.filter((b) => progress.earnedBadgeIds.includes(b.id));
  const badgeEmojis =
    earnedBadges.length > 0
      ? earnedBadges.map((b) => b.emoji).join(' ')
      : '_None yet — keep chatting!_';

  // Build the "All Badges" keyboard button
  const keyboard = new InlineKeyboard()
    .text('🏅 View All Badges', 'progress:badges')
    .text('📊 Leaderboard', 'progress:leaderboard');

  const streakLine = streakHeadline(progress.currentStreak);
  const longestLine =
    progress.longestStreak > progress.currentStreak
      ? `\nLongest ever: *${progress.longestStreak} days* 🏆`
      : '';

  const messageCountLine =
    progress.totalMessages === 0
      ? 'No messages yet — say something!'
      : progress.totalMessages === 1
      ? '1 message sent'
      : `${progress.totalMessages.toLocaleString()} messages sent`;

  const message = [
    `📊 *${userName}'s Progress*`,
    '',
    streakLine,
    longestLine,
    '',
    `💬 *Messages:* ${messageCountLine}`,
    '',
    `⭐ *Level ${level}* — ${title}`,
    `${xpBar}`,
    '',
    `🏅 *Badges Earned:* ${earnedBadges.length}/${ALL_BADGES.length}`,
    badgeEmojis,
    '',
    `_Keep the streak alive, ${userName}! I believe in you. 🐙_`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
}

/**
 * Handles progress-related inline button presses:
 *   progress:badges   — full badge list
 *   progress:leaderboard — placeholder (coming soon)
 */
export async function handleProgressCallback(ctx: BotContext, data: string): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.answerCallbackQuery({ text: 'Session error — try /start again.' });
    return;
  }

  if (data === 'progress:badges') {
    const progress = getOrCreateProgress(userId);
    const { level } = getLevelFromXp(progress.xp);

    const lines = ALL_BADGES.map((badge) => {
      const earned = progress.earnedBadgeIds.includes(badge.id);
      const status = earned ? badge.emoji : '🔒';
      const nameStr = earned ? `*${badge.name}*` : `~${badge.name}~`;

      // Build unlock hint
      let hint = '';
      if (!earned) {
        if (badge.requiredMessages !== undefined) {
          hint = ` — ${badge.requiredMessages} messages`;
        } else if (badge.requiredStreak !== undefined) {
          hint = ` — ${badge.requiredStreak}-day streak`;
        } else if (badge.requiredLevel !== undefined) {
          hint = ` — Level ${badge.requiredLevel}`;
        }
      } else {
        hint = ` — ${badge.description}`;
      }

      return `${status} ${nameStr}${hint}`;
    });

    const earnedCount = progress.earnedBadgeIds.length;

    const backKeyboard = new InlineKeyboard().text('← Back', 'progress:back');

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🏅 *All Badges* (${earnedCount}/${ALL_BADGES.length} earned)\n\n${lines.join('\n')}\n\n_${
        earnedCount < ALL_BADGES.length
          ? `${ALL_BADGES.length - earnedCount} more to unlock — you got this! 🐙`
          : 'Incredible — you unlocked them ALL! You legend. 🌊'
      }_`,
      { parse_mode: 'Markdown', reply_markup: backKeyboard },
    );
    return;
  }

  if (data === 'progress:leaderboard') {
    await ctx.answerCallbackQuery({ text: 'Coming soon!' });
    await ctx.reply(
      `📊 *Leaderboard*\n\nThe leaderboard is coming very soon! Keep stacking XP — you'll want to be at the top when it drops. 🔥`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  if (data === 'progress:back') {
    await ctx.answerCallbackQuery();
    await handleProgress(ctx);
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Unknown action.' });
}

export default handleProgress;
