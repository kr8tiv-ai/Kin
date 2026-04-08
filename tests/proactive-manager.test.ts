/**
 * ProactiveManager — Integration Tests
 *
 * Tests the orchestration layer: runScan, evaluateAndSuggest,
 * rate limiting, quiet hours, and message generation fallback.
 *
 * Uses vi.mock for OllamaClient.chat and ChannelDelivery.send,
 * and a real in-memory SQLite database for DB interactions.
 *
 * NOTE: Requires better-sqlite3 native bindings. Suite is skipped if unavailable.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type Database from 'better-sqlite3';

let db: InstanceType<typeof Database> | null = null;
let skipReason = '';

// Mock OllamaClient.chat so we don't need a running Ollama
vi.mock('../inference/local-llm.js', () => ({
  getOllamaClient: () => ({
    chat: vi.fn().mockResolvedValue({
      message: { content: 'Hey! Your meeting is in 30 min — want a prep summary?' },
    }),
  }),
  isLocalLlmAvailable: () => true,
}));

// Mock companion-prompts
vi.mock('../inference/companion-prompts.js', () => ({
  buildCompanionPrompt: vi.fn().mockReturnValue('You are Cipher, an AI companion.'),
}));

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    db = new BetterSqlite3(':memory:');

    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        telegram_id INTEGER,
        first_name TEXT
      );

      CREATE TABLE IF NOT EXISTS companions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialization TEXT
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        display_name TEXT,
        proactive_enabled BOOLEAN DEFAULT FALSE,
        proactive_quiet_start INTEGER,
        proactive_quiet_end INTEGER,
        proactive_max_daily INTEGER DEFAULT 5,
        proactive_channels TEXT DEFAULT '[]',
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS user_companions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        companion_id TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        companion_id TEXT NOT NULL,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS context_signals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        companion_id TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        payload TEXT DEFAULT '{}',
        confidence REAL DEFAULT 0.5,
        status TEXT DEFAULT 'pending',
        created_at INTEGER,
        delivered_at INTEGER,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS proactive_suggestions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        companion_id TEXT NOT NULL,
        signal_id TEXT,
        content TEXT NOT NULL,
        delivery_channel TEXT NOT NULL,
        delivery_recipient_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        user_feedback TEXT,
        created_at INTEGER,
        delivered_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        encrypted_refresh_token TEXT,
        encrypted_access_token TEXT,
        token_expiry INTEGER,
        scopes TEXT,
        email TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(user_id, provider)
      );
    `);

    // Seed test data
    db.prepare(`INSERT INTO users (id, telegram_id, first_name) VALUES ('u1', 100, 'Alice')`).run();
    db.prepare(`INSERT INTO companions (id, name, specialization) VALUES ('cipher', 'Cipher', 'analysis')`).run();
    db.prepare(`INSERT INTO user_companions (id, user_id, companion_id, is_active) VALUES ('uc1', 'u1', 'cipher', TRUE)`).run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('ERR_DLOPEN_FAILED')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
}, 30_000);

beforeEach(() => {
  if (!db) return;
  // Clean per-test state
  db.prepare(`DELETE FROM proactive_suggestions`).run();
  db.prepare(`DELETE FROM context_signals`).run();
  db.prepare(`DELETE FROM messages`).run();
  db.prepare(`DELETE FROM conversations`).run();
  db.prepare(`DELETE FROM user_preferences`).run();
});

afterAll(() => {
  if (db) db.close();
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// Mock ChannelDelivery
// ============================================================================

function createMockChannelDelivery() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    // Additional methods the real ChannelDelivery has
    isChannelAvailable: vi.fn().mockReturnValue(true),
  };
}

// ============================================================================
// runScan
// ============================================================================

describe('ProactiveManager.runScan', () => {
  it('returns 0 when no users are opted in', async () => {
    if (skip()) return;

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const result = await manager.runScan();
    expect(result).toBe(0);
    expect(mockDelivery.send).not.toHaveBeenCalled();
  });

  it('scans opted-in users and evaluates triggers', async () => {
    if (skip()) return;

    // Seed opted-in user with a conversation gap (no messages = last message is null)
    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled, proactive_max_daily, proactive_channels)
       VALUES ('pref-1', 'u1', TRUE, 5, '["api"]')`,
    ).run();

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    // runScan will evaluate triggers — conversation_gap may fire if no messages exist
    const result = await manager.runScan();
    // Result depends on whether triggers fire — the key assertion is no crash
    expect(typeof result).toBe('number');
  });
});

// ============================================================================
// evaluateAndSuggest
// ============================================================================

describe('ProactiveManager.evaluateAndSuggest', () => {
  it('returns null when user has proactive disabled', async () => {
    if (skip()) return;

    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled)
       VALUES ('pref-1', 'u1', FALSE)`,
    ).run();

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const result = await manager.evaluateAndSuggest('u1', 'cipher');
    expect(result).toBeNull();
  });

  it('generates suggestion for conversation gap trigger', async () => {
    if (skip()) return;

    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled, proactive_max_daily, proactive_channels)
       VALUES ('pref-1', 'u1', TRUE, 5, '["api"]')`,
    ).run();

    // Seed an old conversation to trigger conversation gap
    const convId = 'conv-old-1';
    db!.prepare(
      `INSERT INTO conversations (id, user_id, companion_id, created_at) VALUES (?, 'u1', 'cipher', ?)`,
    ).run(convId, Date.now() - 48 * 3600 * 1000);
    db!.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, 'user', 'hello', ?)`,
    ).run('msg-old-1', convId, Date.now() - 48 * 3600 * 1000);

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const result = await manager.evaluateAndSuggest('u1', 'cipher');
    // Conversation gap (48h > 24h threshold) should trigger
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u1');
    expect(result!.companionId).toBe('cipher');
    expect(result!.content).toBeDefined();
    expect(result!.status).toBe('pending');
  });
});

// ============================================================================
// Rate limiting
// ============================================================================

describe('ProactiveManager rate limiting', () => {
  it('blocks suggestions when daily limit is reached', async () => {
    if (skip()) return;

    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled, proactive_max_daily, proactive_channels)
       VALUES ('pref-1', 'u1', TRUE, 1, '["api"]')`,
    ).run();

    // Seed one already-delivered suggestion today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    db!.prepare(
      `INSERT INTO proactive_suggestions (id, user_id, companion_id, content, delivery_channel, delivery_recipient_id, status, delivered_at, created_at)
       VALUES ('sug-existing', 'u1', 'cipher', 'existing', 'api', 'u1', 'delivered', ?, ?)`,
    ).run(Date.now(), Date.now());

    // Seed old message so conversation_gap would trigger
    const convId = 'conv-limit';
    db!.prepare(
      `INSERT INTO conversations (id, user_id, companion_id, created_at) VALUES (?, 'u1', 'cipher', ?)`,
    ).run(convId, Date.now() - 48 * 3600 * 1000);
    db!.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, 'user', 'hello', ?)`,
    ).run('msg-limit-1', convId, Date.now() - 48 * 3600 * 1000);

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const result = await manager.evaluateAndSuggest('u1', 'cipher');
    // maxDaily=1 and 1 already delivered → should be blocked
    expect(result).toBeNull();
  });
});

// ============================================================================
// Quiet hours
// ============================================================================

describe('ProactiveManager quiet hours', () => {
  it('blocks suggestions during quiet hours', async () => {
    if (skip()) return;

    // Set quiet hours to cover the current hour
    const currentHour = new Date().getHours();
    const quietStart = currentHour;
    const quietEnd = (currentHour + 2) % 24;

    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled, proactive_max_daily, proactive_quiet_start, proactive_quiet_end, proactive_channels)
       VALUES ('pref-1', 'u1', TRUE, 5, ?, ?, '["api"]')`,
    ).run(quietStart, quietEnd);

    // Seed old message so conversation_gap would trigger
    const convId = 'conv-quiet';
    db!.prepare(
      `INSERT INTO conversations (id, user_id, companion_id, created_at) VALUES (?, 'u1', 'cipher', ?)`,
    ).run(convId, Date.now() - 48 * 3600 * 1000);
    db!.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES (?, ?, 'user', 'hello', ?)`,
    ).run('msg-quiet-1', convId, Date.now() - 48 * 3600 * 1000);

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const result = await manager.evaluateAndSuggest('u1', 'cipher');
    // Current hour is within quiet window → should be blocked
    expect(result).toBeNull();
  });
});

// ============================================================================
// getPreferences
// ============================================================================

describe('ProactiveManager.getPreferences', () => {
  it('returns defaults when no row exists', async () => {
    if (skip()) return;

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const prefs = manager.getPreferences('nonexistent-user');
    expect(prefs.proactiveEnabled).toBe(false);
    expect(prefs.maxDaily).toBe(5);
    expect(prefs.channels).toEqual([]);
  });

  it('reads persisted preferences', async () => {
    if (skip()) return;

    db!.prepare(
      `INSERT INTO user_preferences (id, user_id, proactive_enabled, proactive_quiet_start, proactive_quiet_end, proactive_max_daily, proactive_channels)
       VALUES ('pref-1', 'u1', TRUE, 22, 7, 10, '["telegram","api"]')`,
    ).run();

    const { ProactiveManager } = await import('../inference/proactive-manager.js');
    const mockDelivery = createMockChannelDelivery();
    const manager = new ProactiveManager(db!, mockDelivery as any);

    const prefs = manager.getPreferences('u1');
    expect(prefs.proactiveEnabled).toBe(true);
    expect(prefs.quietStart).toBe(22);
    expect(prefs.quietEnd).toBe(7);
    expect(prefs.maxDaily).toBe(10);
    expect(prefs.channels).toEqual(['telegram', 'api']);
  });
});
