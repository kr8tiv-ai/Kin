/**
 * Companions Handler - Shows the Genesis Six roster
 *
 * Each companion is a unique NFT with special abilities.
 * Users collect companions by minting — no free switching.
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
    if (id === current) {
      return `${c.emoji} *${c.name}* — ${c.species} ✅ _yours_\n   ${c.tagline}`;
    }
    return `✨ *${c.name}* — ${c.species}\n   ${c.tagline}`;
  });

  const mintKeyboard = new InlineKeyboard()
    .url('🎨 Mint a Companion', 'https://meetyourkin.com/companions')
    .row()
    .url('🌐 View Collection', 'https://meetyourkin.com/dashboard');

  const msg = [
    '🐙 *The Genesis Six*',
    '',
    ...lines,
    '',
    `_Your companion:_ *${COMPANION_CONFIGS[current]?.name ?? 'Cipher'}*`,
    '',
    '_Each Genesis KIN is a unique NFT with special abilities._',
    '_Mint a new companion to unlock their powers!_',
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mintKeyboard });
}

export default handleCompanions;
