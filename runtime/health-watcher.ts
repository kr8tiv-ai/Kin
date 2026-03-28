/**
 * Health Watcher Daemon
 *
 * Periodically runs checkPlatformHealth() and tracks state transitions.
 * When a service flips from ok/warn to error (or back), it sends alerts via:
 *   - Slack incoming webhook  (if SLACK_WEBHOOK_URL is set)
 *   - Telegram message        (if ALERT_CHAT_ID + bot token are set)
 *   - Console log             (always)
 *
 * Usage:
 *   import { startHealthWatcher, stopHealthWatcher } from './health-watcher.js';
 *   startHealthWatcher({ intervalMs: 60_000 });
 *
 * @module runtime/health-watcher
 */

import { checkPlatformHealth, formatHealthForConsole, type HealthStatus } from './health-probe.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthWatcherOpts {
  /** Polling interval in milliseconds (default: 60 000 = 1 minute). */
  intervalMs?: number;
  /** Slack incoming-webhook URL for alert delivery. */
  slackWebhookUrl?: string;
  /** Telegram bot token for alert delivery (uses sendMessage API directly). */
  telegramBotToken?: string;
  /** Telegram chat ID that receives alert messages. */
  telegramChatId?: string;
}

type ServiceState = 'ok' | 'warn' | 'error';

interface StateChange {
  name: string;
  from: ServiceState;
  to: ServiceState;
  detail: string;
}

// ============================================================================
// Module state
// ============================================================================

let timer: ReturnType<typeof setInterval> | null = null;
let previousStates: Map<string, ServiceState> = new Map();
let opts: Required<HealthWatcherOpts> = {
  intervalMs: 60_000,
  slackWebhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
};

// ============================================================================
// Alert delivery
// ============================================================================

/**
 * POST a message to Slack via an incoming-webhook URL.
 */
async function alertSlack(text: string): Promise<void> {
  if (!opts.slackWebhookUrl) return;
  try {
    await fetch(opts.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[health-watcher] Slack alert failed:', err);
  }
}

/**
 * Send a Telegram message via the Bot API.
 * Does not depend on the grammy Bot instance so it can run standalone.
 */
async function alertTelegram(text: string): Promise<void> {
  if (!opts.telegramBotToken || !opts.telegramChatId) return;
  const url = `https://api.telegram.org/bot${opts.telegramBotToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: opts.telegramChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[health-watcher] Telegram alert failed:', err);
  }
}

/**
 * Format and deliver alerts for a list of state changes.
 */
async function deliverAlerts(changes: StateChange[]): Promise<void> {
  if (changes.length === 0) return;

  const lines = changes.map((c) => {
    const arrow = c.to === 'error' ? '!! DOWN' : '>> RECOVERED';
    return `[${arrow}] ${c.name}: ${c.from} -> ${c.to} (${c.detail})`;
  });

  const consoleMsg = `[health-watcher] State changes detected:\n${lines.join('\n')}`;
  console.log(consoleMsg);

  // Slack — plain text
  const slackMsg = `:rotating_light: *KIN Health Alert*\n${lines.join('\n')}`;
  await alertSlack(slackMsg);

  // Telegram — Markdown
  const telegramLines = changes.map((c) => {
    const icon = c.to === 'error' ? '\u274C' : '\u2705';
    return `${icon} *${c.name}*: ${c.from} \u2192 ${c.to}\n   _${c.detail}_`;
  });
  const telegramMsg = `\uD83D\uDEA8 *KIN Health Alert*\n\n${telegramLines.join('\n\n')}`;
  await alertTelegram(telegramMsg);
}

// ============================================================================
// Core tick
// ============================================================================

/**
 * Run a single health check cycle, detect state transitions, and alert.
 */
async function tick(): Promise<void> {
  try {
    const results = await checkPlatformHealth();
    const changes: StateChange[] = [];

    for (const r of results) {
      const prev = previousStates.get(r.name);
      const curr = r.status;

      if (prev !== undefined && prev !== curr) {
        // State changed — determine if it is a meaningful alert
        const wentDown = curr === 'error' && prev !== 'error';
        const recovered = prev === 'error' && curr !== 'error';

        if (wentDown || recovered) {
          changes.push({
            name: r.name,
            from: prev,
            to: curr,
            detail: r.detail,
          });
        }
      }

      previousStates.set(r.name, curr);
    }

    await deliverAlerts(changes);
  } catch (err) {
    console.error('[health-watcher] Tick failed:', err);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start the health watcher daemon.
 * Runs an initial probe immediately, then repeats on the configured interval.
 *
 * Calling this while already running will stop the existing watcher and restart.
 */
export function startHealthWatcher(userOpts: HealthWatcherOpts = {}): void {
  // Stop any existing watcher
  stopHealthWatcher();

  opts = {
    intervalMs: userOpts.intervalMs ?? 60_000,
    slackWebhookUrl: userOpts.slackWebhookUrl ?? '',
    telegramBotToken: userOpts.telegramBotToken ?? '',
    telegramChatId: userOpts.telegramChatId ?? '',
  };

  console.log(
    `[health-watcher] Starting (interval: ${opts.intervalMs}ms, ` +
    `slack: ${opts.slackWebhookUrl ? 'yes' : 'no'}, ` +
    `telegram: ${opts.telegramChatId ? 'yes' : 'no'})`,
  );

  // Initial tick — run immediately but don't block startup
  tick().then(() => {
    console.log('[health-watcher] Initial probe complete');
  });

  timer = setInterval(tick, opts.intervalMs);

  // Allow the process to exit even if the timer is still running
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
}

/**
 * Stop the health watcher daemon and reset tracked state.
 */
export function stopHealthWatcher(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
    console.log('[health-watcher] Stopped');
  }
  previousStates.clear();
}

/**
 * Returns the most recent known state for each service.
 * Useful for diagnostics / debug endpoints.
 */
export function getWatcherState(): Record<string, ServiceState> {
  const out: Record<string, ServiceState> = {};
  for (const [k, v] of previousStates) {
    out[k] = v;
  }
  return out;
}
