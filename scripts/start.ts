#!/usr/bin/env node
/**
 * KIN Platform Startup Script
 * Validates environment and starts the platform
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

// Start the appropriate service
const mode = process.argv[2] || 'all';

if (mode === 'api') {
  console.log('Starting API server...');
  import('../api/server.js');
} else if (mode === 'bot') {
  console.log('Starting Telegram bot...');
  import('../bot/telegram-bot.js');
} else {
  console.log('Starting all services...\n');

  // Start API
  import('../api/server.js');

  // Start bot after a short delay
  setTimeout(() => {
    import('../bot/telegram-bot.js');
  }, 1000);
}
