/**
 * Support Handler - Handles /support command
 *
 * Provides a friendly way for users to get help or report issues
 * directly from the Telegram bot.
 */

import { Context, InlineKeyboard } from 'grammy';

const SUPPORT_KEYBOARD = new InlineKeyboard()
  .text('🐛 Report a Bug', 'support:bug')
  .text('💡 Suggest a Feature', 'support:feature')
  .row()
  .text('❓ General Help', 'support:help')
  .text('💬 Talk to a Human', 'support:human');

const SUPPORT_MESSAGE = `
🆘 *Need Help?*

I'm here for you! Tap a button below or just tell me what's going on — I'll do my best to help.

If it's something I can't fix, I'll make sure a real human sees it.
`;

export async function handleSupport(ctx: Context): Promise<void> {
  await ctx.reply(SUPPORT_MESSAGE, {
    parse_mode: 'Markdown',
    reply_markup: SUPPORT_KEYBOARD,
  });
}

/** Handle support category button presses */
export async function handleSupportCallback(ctx: Context, action: string): Promise<void> {
  const responses: Record<string, string> = {
    'support:bug': "🐛 *Bug Report*\n\nDescribe what happened and I'll log it for the team. What went wrong?",
    'support:feature': "💡 *Feature Request*\n\nWhat would you love to see in KIN? Describe your idea and I'll pass it along!",
    'support:help': "❓ *Help*\n\nJust ask me anything! I can help with:\n• Using commands\n• Building websites\n• Understanding features\n\nWhat do you need help with?",
    'support:human': "💬 *Human Support*\n\nI've flagged this for the team. You can also reach us at:\n\n📧 support@meetyourkin.com\n🌐 www.meetyourkin.com\n\nA human will get back to you soon!",
  };

  const response = responses[action] ?? "I'm not sure what happened there. Try /support again?";
  await ctx.answerCallbackQuery();
  await ctx.reply(response, { parse_mode: 'Markdown' });
}

export default handleSupport;
