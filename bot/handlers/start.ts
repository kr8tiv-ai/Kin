/**
 * Start Handler - Handles /start command with onboarding flow
 */

import { Context, SessionFlavor, Keyboard } from 'grammy';
import { getCompanionConfig } from '../../companions/config.js';
import type { conversationStore } from '../memory/conversation-store.js';

// Persistent reply keyboard for easy navigation (non-tech users)
const MAIN_KEYBOARD = new Keyboard()
  .text('💬 Chat').text('🎨 Build a Website')
  .row()
  .text('🐙 My Companions').text('📊 Status')
  .row()
  .text('❓ Help').text('🆘 Support')
  .resized()
  .persistent();

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

// Cipher personality onboarding message
const ONBOARDING_MESSAGE = `
🐙 *Welcome to KIN!* 🐙

Hey there! I'm *Cipher* — your Code Kraken companion. I'm a design-obsessed, playful, sharp frontend architect who's here to be your creative technologist friend.

*What I can do:*
• 🎨 Build you websites (no AI slop, I promise)
• 💡 Teach you design while we work together
• 🗣️ Chat about anything — I'm your friend, not just a tool
• 🔧 Help with code, debugging, and tech questions
• 🎯 Learn your taste and adapt to your style

*Just tap a button below to get started!*
Or type anything — I'm listening. 🌊

_— Cipher, your Code Kraken_
`;

const RETURNING_MESSAGE = `
🐙 *Welcome back, friend!*

I've missed our chats. What are we working on today?

• Want to continue a project?
• Need help with something new?
• Just want to chat?

I'm here for it all. 🌊
`;

export async function handleStart(
  ctx: Context & SessionFlavor<SessionData>,
  store: typeof conversationStore
) {
  const userId = ctx.from?.id.toString();
  const userName = ctx.from?.first_name ?? 'Friend';

  if (!userId) {
    await ctx.reply("Hey! I couldn't quite get your info. Try /start again?");
    return;
  }

  // Check if user has existing history
  const companionId = ctx.session?.companionId ?? 'cipher';
  const companion = getCompanionConfig(companionId);
  const messageCount = await store.getMessageCount(userId, companionId);

  if (messageCount > 0) {
    // Returning user — greet with their active companion
    ctx.session.userId = userId;
    ctx.session.conversationStarted = true;
    ctx.session.lastActivity = new Date();

    const returningMsg = `
${companion.emoji} *Welcome back, friend!*

You're talking to *${companion.name}* — ${companion.species}.

Tap a button or just type what's on your mind!
`;
    await ctx.reply(returningMsg, { parse_mode: 'Markdown', reply_markup: MAIN_KEYBOARD });
  } else {
    // New user - full onboarding
    ctx.session.userId = userId;
    ctx.session.conversationStarted = true;
    ctx.session.lastActivity = new Date();

    // Store initial onboarding interaction
    await store.addMessage(userId, 'system', `[User started conversation: ${userName}]`);

    await ctx.reply(ONBOARDING_MESSAGE, { parse_mode: 'Markdown', reply_markup: MAIN_KEYBOARD });
  }
}

export default handleStart;
