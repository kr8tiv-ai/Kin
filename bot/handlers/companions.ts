/**
 * Companions Handler - Lists all available KIN companions
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { getCompanionIds, COMPANION_CONFIGS } from '../../companions/config.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

export async function handleCompanions(ctx: BotContext) {
  const current = ctx.session?.companionId ?? 'cipher';

  const lines = getCompanionIds().map((id) => {
    const c = COMPANION_CONFIGS[id]!;
    const active = id === current ? ' \u2705' : '';
    return `${c.emoji} *${c.name}* \u2014 ${c.species}${active}\n   ${c.tagline}`;
  });

  // Build inline switch buttons for companions the user isn't already talking to
  const switchKeyboard = new InlineKeyboard();
  const ids = getCompanionIds().filter((id) => id !== current);
  for (let i = 0; i < ids.length; i++) {
    const c = COMPANION_CONFIGS[ids[i]!]!;
    switchKeyboard.text(`${c.emoji} ${c.name}`, `switch:${ids[i]}`);
    if (i % 2 === 1 && i < ids.length - 1) switchKeyboard.row();
  }

  const msg = [
    '\uD83D\uDC19 *The Genesis Six*',
    '',
    ...lines,
    '',
    `_Currently talking to:_ *${COMPANION_CONFIGS[current]?.name ?? 'Cipher'}*`,
    '_Tap a button to switch:_',
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: switchKeyboard });
}

export default handleCompanions;
