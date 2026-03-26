/**
 * Start Handler - Handles /start command with onboarding flow
 */

import { Context, SessionFlavor } from 'grammy';
import type { conversationStore } from '../memory/conversation-store.js';

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

Hey there! I'm **Cipher** — your Code Kraken companion. I'm a design-obsessed, playful, sharp frontend architect who's here to be your creative technologist friend.

*What I can do:*
• 🎨 Build you *exceptional* websites (no AI slop, I promise)
• 💡 Teach you design while we work together
• 🗣️ Chat about anything — I'm your friend, not just a tool
• 🔧 Help with code, debugging, and tech questions
• 🎯 Learn your taste and adapt to your style

*How to get started:*
Just start talking to me! Send a message like:
• "I want to build a portfolio site"
• "Can you help me understand React hooks?"
• "What's good design these days?"

*Pro tips:*
• 📱 Send voice notes and I'll reply with voice
• 🎓 Teaching mode is ON by default — ask me anything
• 🔄 Use /reset to start a fresh conversation
• ❓ Use /help for more commands

*Ready to dive in?* Let's make something beautiful together! 🌊

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
  const messageCount = await store.getMessageCount(userId, 'cipher');

  if (messageCount > 0) {
    // Returning user
    ctx.session.userId = userId;
    ctx.session.conversationStarted = true;
    ctx.session.lastActivity = new Date();

    await ctx.reply(RETURNING_MESSAGE, { parse_mode: 'Markdown' });
  } else {
    // New user - full onboarding
    ctx.session.userId = userId;
    ctx.session.conversationStarted = true;
    ctx.session.lastActivity = new Date();

    // Store initial onboarding interaction
    await store.addMessage(userId, 'system', `[User started conversation: ${userName}]`);

    await ctx.reply(ONBOARDING_MESSAGE, { parse_mode: 'Markdown' });
  }
}

export default handleStart;
