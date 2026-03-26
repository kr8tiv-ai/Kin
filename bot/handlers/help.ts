/**
 * Help Handler - Handles /help command
 */

import { Context, SessionFlavor } from 'grammy';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

const HELP_MESSAGE = `
🐙 *Cipher's Command Reference*

*Core Commands:*
/start — Begin your journey with Cipher
/help — Show this help message
/status — See your current status and settings
/reset — Start a fresh conversation

*How to work with me:*

🎨 *Building Websites*
Just describe what you want:
• "Build me a portfolio site"
• "Create a landing page for my coffee shop"
• "I need a blog with a dark theme"

💡 *Learning Design*
Ask me anything:
• "Why is whitespace important?"
• "What makes a good color palette?"
• "Explain responsive design"

🔧 *Code Help*
• "Debug this React component"
• "How do I center a div?" (the eternal question 😄)
• "Review my CSS for best practices"

🗣️ *Voice Notes*
Just send me a voice message! I'll transcribe it and reply with voice.

*Settings:*
• Teaching mode: I explain my design decisions
• Voice responses: Toggle with /voice on/off

*Need human help?*
Contact support through Mission Control or use /support

_— Cipher 🐙_
`;

const QUICK_HELP = `
*Quick help:*
/start — Begin your journey
/help — Full command list
/status — Your status
/reset — Fresh conversation

Just send me a message to start chatting! 🐙
`;

export async function handleHelp(ctx: BotContext) {
  const message = ctx.session?.conversationStarted ? HELP_MESSAGE : QUICK_HELP;
  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export default handleHelp;
