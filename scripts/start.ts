#!/usr/bin/env node
/**
 * KIN Platform Startup Script
 * Validates environment, starts the platform, and optionally wires
 * the Telegram bot into the Fastify server via webhook mode.
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 KIN Platform Startup\n');

// Check Node version
const nodeVersion = process.versions.node.split('.').map(Number);
if (nodeVersion[0]! < 20) {
  console.error('❌ Node.js 20+ is required');
  console.error(`   Current version: ${process.version}`);
  process.exit(1);
}
console.log(`✓ Node.js ${process.version}`);

// Check environment variables
const required = ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET'];
const recommended = ['OPENAI_API_KEY'];
const optional = ['ELEVENLABS_API_KEY', 'TAILSCALE_API_KEY', 'ANTHROPIC_API_KEY'];

console.log('\n📋 Environment Check:');

let hasErrors = false;
for (const key of required) {
  if (process.env[key]) {
    console.log(`  ✓ ${key} is set`);
  } else {
    console.log(`  ✗ ${key} is NOT SET (required)`);
    hasErrors = true;
  }
}

for (const key of recommended) {
  if (process.env[key]) {
    console.log(`  ✓ ${key} is set`);
  } else {
    console.log(`  ⚠ ${key} is not set (recommended)`);
  }
}

for (const key of optional) {
  if (process.env[key]) {
    console.log(`  ✓ ${key} is set`);
  }
}

if (hasErrors) {
  console.error('\n❌ Missing required environment variables');
  console.error('   Create a .env file with the required variables');
  process.exit(1);
}

// Ensure data directory exists
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  console.log('\n📁 Creating data directory...');
  mkdirSync(dataDir, { recursive: true });
}

// Check if database exists — auto-create if missing
const dbPath = process.env.DATABASE_PATH || join(dataDir, 'kin.db');
if (!existsSync(dbPath)) {
  console.log('\n📦 Database not found. Auto-creating...');
  const Database = (await import('better-sqlite3')).default;
  const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf-8');
  const db = new Database(dbPath);
  db.exec(schema);
  db.close();
  console.log('✅ Database created and schema applied');
}

console.log('\n✅ Startup checks passed\n');

// ============================================================================
// Service startup
// ============================================================================

const mode = process.argv[2] || 'all';

if (mode === 'api') {
  // API-only: no bot, no health watcher
  console.log('Starting API server...');
  const { startServer } = await import('../api/server.js');
  await startServer();

} else if (mode === 'bot') {
  // Bot-only: polling mode, no API server
  console.log('Starting Telegram bot (polling mode)...');
  const { startBot } = await import('../bot/telegram-bot.js');
  await startBot({
    token: process.env.TELEGRAM_BOT_TOKEN!,
    usePolling: true,
  });

} else {
  // "all" mode: start API + bot + health watcher
  console.log('Starting all services...\n');

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const isWebhookMode = !!webhookUrl;

  if (isWebhookMode) {
    // ── Webhook mode ──────────────────────────────────────────────────────
    // 1. Create the bot (do NOT start polling)
    // 2. Register webhook with Telegram
    // 3. Pass bot to the Fastify server so it mounts the webhook route
    console.log(`Webhook mode: ${webhookUrl}`);

    const { createKINBot } = await import('../bot/telegram-bot.js');
    const bot = createKINBot({ token: process.env.TELEGRAM_BOT_TOKEN! });

    // Tell Telegram where to send updates
    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      ...(webhookSecret ? { secret_token: webhookSecret } : {}),
    });
    console.log(`✓ Telegram webhook set to ${webhookUrl}`);

    // Start API with the bot wired in
    const { startServer } = await import('../api/server.js');
    await startServer({
      bot: bot as any,
      telegramWebhookSecret: webhookSecret,
    });

  } else {
    // ── Polling mode (development) ────────────────────────────────────────
    // 1. Start API server first
    // 2. Start bot in long-polling mode
    console.log('Polling mode (no TELEGRAM_WEBHOOK_URL set)');

    const { startServer } = await import('../api/server.js');
    await startServer();

    const { startBot } = await import('../bot/telegram-bot.js');
    await startBot({
      token: process.env.TELEGRAM_BOT_TOKEN!,
      usePolling: true,
    });
  }

  // ── Health watcher ────────────────────────────────────────────────────
  // Start after bot + API are up so the first probe reflects real state.
  try {
    const { startHealthWatcher } = await import('../runtime/health-watcher.js');
    startHealthWatcher({
      intervalMs: parseInt(process.env.HEALTH_INTERVAL_MS ?? '60000', 10),
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.ALERT_CHAT_ID,
    });
    console.log('✓ Health watcher started');
  } catch (err) {
    console.warn('⚠ Health watcher failed to start:', err);
  }
}
