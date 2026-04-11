/**
 * Upgrade Handler - Subscription / upgrade flow
 *
 * Shows the user their current plan, a formatted feature comparison
 * table, and InlineKeyboard buttons to start the upgrade process.
 *
 * Payment integration (Stripe) is not yet wired; all upgrade callbacks
 * currently reply with a "coming soon" message and log interest so the
 * team can prioritise outreach.
 */

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

type PlanId = 'free' | 'hatchling' | 'elder' | 'hero';

interface Plan {
  id: PlanId;
  label: string;
  emoji: string;
  price: string;
  features: string[];
}

// ============================================================================
// Plan definitions (aligned with meetyourkin.com)
// ============================================================================

const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    label: 'Free Trial',
    emoji: '🆓',
    price: 'Free forever',
    features: [
      '50 messages / day',
      '1 companion (Qwen 3 32B)',
      'Try before you mint',
      'Community support',
    ],
  },
  hatchling: {
    id: 'hatchling',
    label: 'Hatchling',
    emoji: '🐣',
    price: '$114 / month',
    features: [
      'Frontier AI model (unique to your KIN)',
      'Unlimited messages',
      'Supermemory Pro',
      'Telegram + WhatsApp + Voice',
      'Computer control & automation',
      'Standard support',
    ],
  },
  elder: {
    id: 'elder',
    label: 'Elder',
    emoji: '🐉',
    price: '$194 / month',
    features: [
      'Everything in Hatchling',
      'Up to 3 companions',
      'Priority support',
      'Advanced workflow automation',
      'Hands-on configuration help',
    ],
  },
  hero: {
    id: 'hero',
    label: 'Hero',
    emoji: '🦸',
    price: '$324 / month',
    features: [
      'Everything in Elder',
      'All 6 companions',
      'Dedicated account manager',
      'Deep customization',
      'Multi-agent integrations',
      'API access',
    ],
  },
};

// ============================================================================
// In-memory upgrade-interest log
// Replace with database writes in production.
// ============================================================================

interface UpgradeInterest {
  userId: string;
  plan: PlanId;
  timestamp: string;
}

const upgradeInterestLog: UpgradeInterest[] = [];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolves the current plan for a user.
 * For now all users are on Free. Wire to your billing system to return
 * 'hatchling', 'elder', or 'hero' when appropriate.
 */
function getCurrentPlan(_userId: string): PlanId {
  // TODO: look up subscription status from billing backend
  return 'free';
}

/**
 * Formats a single plan block as Markdown text for the comparison table.
 */
function formatPlanBlock(plan: Plan, isCurrent: boolean): string {
  const currentBadge = isCurrent ? ' _(your plan)_' : '';
  const featureLines = plan.features.map((f) => `  • ${f}`).join('\n');

  return [
    `${plan.emoji} *${plan.label}* — ${plan.price}${currentBadge}`,
    featureLines,
  ].join('\n');
}

/**
 * Builds the InlineKeyboard shown on the upgrade menu.
 * Hides the upgrade button for the plan the user already has.
 */
function buildUpgradeKeyboard(currentPlan: PlanId): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (currentPlan !== 'hatchling' && currentPlan !== 'elder' && currentPlan !== 'hero') {
    kb.text('🐣 Upgrade to Hatchling', 'upgrade:hatchling');
  }
  if (currentPlan !== 'elder' && currentPlan !== 'hero') {
    kb.text('🐉 Go Elder', 'upgrade:elder');
  }
  if (currentPlan !== 'hero') {
    kb.text('🦸 Go Hero', 'upgrade:hero');
  }

  return kb;
}

// ============================================================================
// Exported Handlers
// ============================================================================

/**
 * /upgrade — Displays the current plan, a feature comparison table,
 * and upgrade CTA buttons.
 */
export async function handleUpgrade(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("I couldn't identify you. Try /start first?");
    return;
  }

  const currentPlanId = getCurrentPlan(userId);
  const currentPlan = PLANS[currentPlanId];

  const planBlocks = (Object.values(PLANS) as Plan[]).map((plan) =>
    formatPlanBlock(plan, plan.id === currentPlanId),
  );

  const message = [
    '💳 *KIN Plans*',
    '',
    `Your current plan: ${currentPlan.emoji} *${currentPlan.label}*`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    ...planBlocks.join('\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n').split('\n'),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '_Tap a button below to unlock the next level:_',
  ].join('\n');

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: buildUpgradeKeyboard(currentPlanId),
  });
}

/**
 * Handles all `upgrade:*` callback_query data values.
 *
 * @param ctx  The bot context.
 * @param data The full callback data string (e.g. 'upgrade:elder').
 */
export async function handleUpgradeCallback(
  ctx: BotContext,
  data: string,
): Promise<void> {
  await ctx.answerCallbackQuery();

  const userId = ctx.from?.id.toString() ?? 'unknown';

  // ------------------------------------------------------------------
  // upgrade:hatchling | upgrade:elder | upgrade:hero
  // ------------------------------------------------------------------
  // Handle all tier upgrades
  const tierMatch = data.match(/^upgrade:(hatchling|elder|hero)$/);
  if (tierMatch) {
    const planId = tierMatch[1] as PlanId;
    upgradeInterestLog.push({
      userId,
      plan: planId,
      timestamp: new Date().toISOString(),
    });
    console.info(`[upgrade] ${planId} interest logged`, { userId, timestamp: new Date().toISOString() });

    const plan = PLANS[planId];
    const isHero = planId === 'hero';
    await ctx.reply(
      [
        `${plan.emoji} *${plan.label} — ${plan.price}*`,
        '',
        'Coming soon! We\'re setting up payments. We\'ll notify you when it\'s ready.',
        '',
        isHero
          ? "We've noted your Hero interest — our team will be in touch soon for a personalised onboarding."
          : `We've noted your interest and will reach out as soon as ${plan.label} is live.`,
        '',
        isHero
          ? '_Have a specific use case in mind? Let us know with /support and we\'ll prioritise you!_'
          : '_In the meantime, keep chatting — your KIN is always here for you!_',
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Unknown upgrade:* callback — acknowledge silently
}

/**
 * Exposes the upgrade interest log so an admin endpoint or cron job can
 * read it (useful before a proper database layer is wired).
 */
export function getUpgradeInterestLog(): Readonly<UpgradeInterest[]> {
  return upgradeInterestLog;
}

export default handleUpgrade;
