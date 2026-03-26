/**
 * Reset Handler - Handles /reset command
 */

import { Context, SessionFlavor } from 'grammy';
import type { conversationStore } from '../memory/conversation-store.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

const RESET_CONFIRMATION = `
🐙 *Conversation Reset*

I've cleared our conversation history. We're starting fresh!

What would you like to work on?

_— Cipher 🌊_
`;

export async function handleReset(
  ctx: BotContext,
  store: typeof conversationStore
) {
  const userId = ctx.from?.id.toString();

  if (!userId) {
    await ctx.reply("I couldn't reset. Try /start first?");
    return;
  }

  // Clear conversation history
  await store.clearHistory(userId, ctx.session?.companionId ?? 'cipher');

  // Reset session
  ctx.session.conversationStarted = true;
  ctx.session.lastActivity = new Date();

  await ctx.reply(RESET_CONFIRMATION, { parse_mode: 'Markdown' });
}

export default handleReset;
