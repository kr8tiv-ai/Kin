/**
 * Switch Handler - Handles /switch command
 *
 * Each companion is a unique NFT. Users don't "switch" — they collect.
 * This handler shows the user's current companion and invites them to
 * mint additional Genesis Six companions for their special abilities.
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { getCompanionIds, COMPANION_CONFIGS } from '../../companions/config.js';
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
  _store: typeof conversationStore,
) {
  const current = ctx.session?.companionId ?? 'cipher';
  const currentConfig = COMPANION_CONFIGS[current];

  const lines = getCompanionIds().map((id) => {
    const c = COMPANION_CONFIGS[id]!;
    if (id === current) {
      return `${c.emoji} *${c.name}* — ${c.species} ✅ _yours_`;
    }
    return `✨ *${c.name}* — ${c.species}\n   _${c.tagline}_`;
  });

  const mintKeyboard = new InlineKeyboard()
    .url('🎨 Mint a Companion NFT', 'https://meetyourkin.com/companions');

  const msg = [
    `${currentConfig?.emoji ?? '🐙'} *${currentConfig?.name ?? 'Cipher'}* is your companion`,
    '',
    '🐙 *The Genesis Six*',
    '',
    ...lines,
    '',
    '_Each companion is a unique NFT with special abilities._',
    '_Mint a new Genesis KIN to unlock their powers!_',
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mintKeyboard });
}

export default handleSwitch;
