/**
 * Status Handler - Handles /status command
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

export async function handleStatus(
  ctx: BotContext,
  store: typeof conversationStore
) {
  const userId = ctx.from?.id.toString();
  const userName = ctx.from?.first_name ?? 'Friend';

  if (!userId) {
    await ctx.reply("I couldn't fetch your status. Try /start first?");
    return;
  }

  const messageCount = await store.getMessageCount(userId, ctx.session?.companionId ?? 'cipher');
  const lastActivity = ctx.session?.lastActivity;

  const statusMessage = `
🐙 *Your Status*

*Companion:* Cipher (Code Kraken)
*Messages:* ${messageCount} in this conversation
*Last active:* ${lastActivity ? formatDate(lastActivity) : 'Just now'}

*Settings:*
• Teaching mode: ${ctx.session?.preferences?.teachingMode ? '✅ On' : '❌ Off'}
• Voice responses: ${ctx.session?.preferences?.voiceEnabled ? '✅ On' : '❌ Off'}

*Quick actions:*
/reset — Start fresh
/voice on — Enable voice replies
/teaching off — Disable explanations

_What would you like to work on?_ 🌊
`;

  await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
}

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default handleStatus;
