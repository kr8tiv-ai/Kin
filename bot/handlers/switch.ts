/**
 * Switch Handler - Handles /switch command for companion switching
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { getCompanionConfig, getCompanionIds, COMPANION_CONFIGS } from '../../companions/config.js';
import type { conversationStore } from '../memory/conversation-store.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

export async function handleSwitch(
  ctx: BotContext,
  store: typeof conversationStore,
) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("I couldn't identify you. Try /start first?");
    return;
  }

  // Parse companion name from command args
  const text = ctx.message?.text ?? '';
  const args = text.split(/\s+/).slice(1);
  const requested = args[0]?.toLowerCase();

  // No argument — show available companions
  if (!requested) {
    const current = ctx.session.companionId ?? 'cipher';
    const lines = getCompanionIds().map((id) => {
      const c = COMPANION_CONFIGS[id]!;
      const active = id === current ? ' *(active)*' : '';
      return `${c.emoji} *${c.name}* — ${c.species}${active}\n   ${c.tagline}`;
    });

    // Build inline switch buttons
    const switchKeyboard = new InlineKeyboard();
    const switchableIds = getCompanionIds().filter((id) => id !== current);
    for (let i = 0; i < switchableIds.length; i++) {
      const c = COMPANION_CONFIGS[switchableIds[i]!]!;
      switchKeyboard.text(`${c.emoji} ${c.name}`, `switch:${switchableIds[i]}`);
      if (i % 2 === 1 && i < switchableIds.length - 1) switchKeyboard.row();
    }

    const msg = `*Switch Companion*\n\n${lines.join('\n\n')}\n\n_Tap a button to switch:_`;
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: switchKeyboard });
    return;
  }

  // Check if valid companion
  const ids = getCompanionIds();
  if (!ids.includes(requested)) {
    await ctx.reply(
      `I don't know a companion called "${requested}".\n\nAvailable: ${ids.join(', ')}`,
    );
    return;
  }

  // Already active?
  if (requested === (ctx.session.companionId ?? 'cipher')) {
    const config = getCompanionConfig(requested);
    await ctx.reply(
      `${config.emoji} You're already talking to *${config.name}*!`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // Switch
  const previous = ctx.session.companionId ?? 'cipher';
  ctx.session.companionId = requested;

  const config = getCompanionConfig(requested);
  const prevConfig = getCompanionConfig(previous);

  // Log the switch in conversation history
  await store.addMessage(
    userId,
    'system',
    `[Switched companion: ${prevConfig.name} → ${config.name}]`,
  );

  await ctx.reply(
    `${config.emoji} *Switched to ${config.name}* — ${config.species}\n\n${config.tagline}\n\n_Say hi! ${config.name} is ready to chat._`,
    { parse_mode: 'Markdown' },
  );
}

export default handleSwitch;
