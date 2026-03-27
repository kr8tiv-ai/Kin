/**
 * Health Handler - Handles /health command
 */

import { Context } from 'grammy';
import { checkPlatformHealth, formatHealthForTelegram } from '../../runtime/health-probe.js';

export async function handleHealth(ctx: Context): Promise<void> {
  const results = await checkPlatformHealth();
  const report = formatHealthForTelegram(results);
  await ctx.reply(report);
}
