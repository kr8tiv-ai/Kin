/**
 * Refer Handler - Referral system
 *
 * Generates a unique, deterministic referral code for each user and
 * presents sharing instructions with Cipher's personality. Referral
 * tracking is currently in-memory (keyed by userId); wire up to a
 * database for persistence in production.
 *
 * Referral code format: KIN-{first 6 hex chars of sha256(userId + timestamp)}
 * The code is generated once per user and then cached in the in-memory
 * store so it stays stable across /refer invocations.
 */

import crypto from 'crypto';
import { Context, SessionFlavor, InlineKeyboard } from 'grammy';

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

interface ReferralRecord {
  /** The stable referral code assigned to this user */
  code: string;
  /** Timestamp when the code was first generated (ISO string) */
  generatedAt: string;
  /** Number of users who signed up using this code */
  referredCount: number;
  /** Placeholder reward balance (points / credits) */
  rewardsEarned: number;
}

// ============================================================================
// In-memory referral store
// Replace with a database-backed store (e.g. Vercel KV / Postgres) for
// production durability.
// ============================================================================

const referralStore = new Map<string, ReferralRecord>();

/** Sweep interval: every 1 hour, evict referral records older than 24 hours. */
const REFERRAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFERRAL_SWEEP_MS = 60 * 60 * 1000; // 1 hour

const referralSweep = setInterval(() => {
  const cutoff = Date.now() - REFERRAL_TTL_MS;
  for (const [id, record] of referralStore) {
    if (new Date(record.generatedAt).getTime() < cutoff) {
      referralStore.delete(id);
    }
  }
}, REFERRAL_SWEEP_MS);
referralSweep.unref();

// ============================================================================
// Helpers
// ============================================================================

/**
 * Returns a stable referral code for the given userId.
 * If one already exists in the store it is returned unchanged so the
 * user always sees the same code.
 */
function getOrCreateReferralCode(userId: string): ReferralRecord {
  const existing = referralStore.get(userId);
  if (existing) return existing;

  // Generate a deterministic-looking code seeded with the userId +
  // current timestamp to ensure uniqueness even for concurrent calls.
  const hash = crypto
    .createHash('sha256')
    .update(userId + Date.now().toString())
    .digest('hex');

  const record: ReferralRecord = {
    code: `KIN-${hash.slice(0, 6).toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    referredCount: 0,
    rewardsEarned: 0,
  };

  referralStore.set(userId, record);
  return record;
}

/**
 * Builds the public-facing referral link for a given code.
 * Swap the base URL for the real landing page when it exists.
 */
function buildReferralLink(code: string): string {
  const base = process.env.KIN_REFERRAL_BASE_URL ?? 'https://meetyourkin.com/join';
  return `${base}?ref=${code}`;
}

/**
 * Formats a referral stats summary as a Markdown string.
 */
function formatStats(record: ReferralRecord): string {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? '' : 's'}`;

  return [
    `*Friends referred:* ${plural(record.referredCount, 'friend')}`,
    `*Rewards earned:* ${record.rewardsEarned} KIN credits`,
  ].join('\n');
}

// ============================================================================
// Exported Handler
// ============================================================================

/**
 * /refer — Generates and displays the user's referral code and link,
 * shows referral stats, and provides a copy button.
 */
export async function handleRefer(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply(
      "I couldn't identify you to create a referral code. Try /start first?",
    );
    return;
  }

  // Ensure session userId is always populated
  if (ctx.session && !ctx.session.userId) {
    ctx.session.userId = userId;
  }

  const record = getOrCreateReferralCode(userId);
  const link = buildReferralLink(record.code);

  // Inline keyboard — tapping "Copy Link" surfaces the link as a
  // callback alert so the user can long-press to copy on mobile.
  const keyboard = new InlineKeyboard()
    .text('📋 Copy Link', `refer:copylink:${record.code}`)
    .text('📊 Refresh Stats', 'refer:stats');

  const message = [
    '🐙 *Share the love!* Every friend you bring earns you both rewards.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '🔗 *Your referral link:*',
    `\`${link}\``,
    '',
    `🏷️ *Your referral code:* \`${record.code}\``,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '📈 *Your stats:*',
    formatStats(record),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*How it works:*',
    '1. Share your link with a friend',
    '2. They sign up for KIN',
    '3. You both get bonus KIN credits',
    '4. More friends = more rewards!',
    '',
    '_Tap 📋 Copy Link to grab your link, or just paste it yourself!_',
  ].join('\n');

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
}

/**
 * Handles all `refer:*` callback_query data values.
 *
 * @param ctx  The bot context.
 * @param data The full callback data string (e.g. 'refer:copylink:KIN-A1B2C3').
 */
export async function handleReferCallback(
  ctx: BotContext,
  data: string,
): Promise<void> {
  // ------------------------------------------------------------------
  // refer:copylink:<code> — surface the full link in a toast notification
  // ------------------------------------------------------------------
  if (data.startsWith('refer:copylink:')) {
    const code = data.slice('refer:copylink:'.length);
    const link = buildReferralLink(code);

    // Telegram callback alerts are limited to ~200 chars.
    await ctx.answerCallbackQuery({
      text: link,
      show_alert: true,
    });
    return;
  }

  // ------------------------------------------------------------------
  // refer:stats — refresh and display latest referral stats
  // ------------------------------------------------------------------
  if (data === 'refer:stats') {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.answerCallbackQuery({ text: "Couldn't load stats. Try /refer again." });
      return;
    }

    const record = referralStore.get(userId);
    if (!record) {
      await ctx.answerCallbackQuery({
        text: "No referral record found. Use /refer to create one.",
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery({
      text: [
        `Friends referred: ${record.referredCount}`,
        `Rewards earned: ${record.rewardsEarned} KIN credits`,
      ].join('\n'),
      show_alert: true,
    });
    return;
  }

  // Unknown refer:* callback — acknowledge silently
  await ctx.answerCallbackQuery();
}

export default handleRefer;
