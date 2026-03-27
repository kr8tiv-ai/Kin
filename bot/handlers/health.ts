/**
 * Health Handler - Handles /health command (user-friendly version)
 */

import { Context } from 'grammy';
import { checkPlatformHealth, type HealthStatus } from '../../runtime/health-probe.js';

/** Friendly labels for each service — no jargon */
const FRIENDLY: Record<string, string> = {
  llm: '🧠 Brain',
  supervisor: '🎓 Deep Thinking',
  stt: '🎙️ Ears (voice input)',
  tts: '🗣️ Voice (voice replies)',
  search: '🔍 Web Search',
  database: '💾 Memory',
  tailscale: '🌐 Remote Access',
  bot: '🤖 Chat',
};

const STATUS_ICON: Record<HealthStatus['status'], string> = {
  ok: '✅',
  warn: '⚠️',
  error: '❌',
};

export async function handleHealth(ctx: Context): Promise<void> {
  const results = await checkPlatformHealth();

  const okCount = results.filter((r) => r.status === 'ok').length;
  const total = results.length;

  // Overall mood based on health
  let mood: string;
  if (okCount === total) {
    mood = "🐙 *Cipher is feeling great!*\nAll systems are running smoothly.";
  } else if (okCount >= total - 2) {
    mood = "🐙 *Cipher is doing pretty well!*\nMost things are working — a couple of things are limited.";
  } else {
    mood = "🐙 *Cipher is a bit under the weather.*\nSome features might be limited right now.";
  }

  const lines = results.map((r) => {
    const label = FRIENDLY[r.name] ?? r.name;
    return `${STATUS_ICON[r.status]} ${label}`;
  });

  const message = [
    mood,
    '',
    ...lines,
    '',
    `_${okCount}/${total} systems online_`,
  ].join('\n');

  await ctx.reply(message, { parse_mode: 'Markdown' });
}
