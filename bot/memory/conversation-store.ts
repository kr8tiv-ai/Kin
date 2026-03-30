/**
 * Conversation Store - SQLite-based conversation persistence
 *
 * Provides persistent storage for conversation history with:
 * - Automatic cleanup of old conversations
 * - Efficient querying by user and time range
 * - Support for multiple companions per user
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface ConversationMemory {
  id: string;
  userId: string;
  companionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    provider?: 'local' | 'openai' | 'anthropic';
  };
}

export interface ConversationStoreConfig {
  dbPath?: string;
  maxMessagesPerUser?: number;
  maxAgeDays?: number;
}

// ============================================================================
// SQLite Store Implementation
// ============================================================================

class SQLiteConversationStore {
  private db: Database.Database;
  private maxMessagesPerUser: number;
  private maxAgeDays: number;

  constructor(config: ConversationStoreConfig = {}) {
    const dbPath = config.dbPath ?? path.join(process.cwd(), 'data', 'conversations.db');
    
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.maxMessagesPerUser = config.maxMessagesPerUser ?? 100;
    this.maxAgeDays = config.maxAgeDays ?? 30;

    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        companion_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_user_companion
        ON conversations(user_id, companion_id);

      CREATE INDEX IF NOT EXISTS idx_timestamp
        ON conversations(timestamp);

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user
        ON memories(user_id);
    `);
  }

  async addMessage(
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    companionId: string = 'cipher',
    metadata?: ConversationMemory['metadata']
  ): Promise<string> {
    const id = `msg-${crypto.randomUUID()}`;
    const timestamp = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, user_id, companion_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      userId,
      companionId,
      role,
      content,
      timestamp,
      metadata ? JSON.stringify(metadata) : null
    );

    // Cleanup old messages
    this.cleanupOldMessages(userId, companionId);

    return id;
  }

  async getHistory(
    userId: string,
    limit: number = 20,
    companionId: string = 'cipher'
  ): Promise<ConversationMemory[]> {
    const stmt = this.db.prepare(`
      SELECT id, user_id, companion_id, role, content, timestamp, metadata
      FROM conversations
      WHERE user_id = ? AND companion_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(userId, companionId, limit) as any[];

    return rows.reverse().map((row) => ({
      id: row.id,
      userId: row.user_id,
      companionId: row.companion_id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async getRecentMessages(
    userId: string,
    since: Date,
    companionId: string = 'cipher'
  ): Promise<ConversationMemory[]> {
    const stmt = this.db.prepare(`
      SELECT id, user_id, companion_id, role, content, timestamp, metadata
      FROM conversations
      WHERE user_id = ? AND companion_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(userId, companionId, since.getTime()) as any[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      companionId: row.companion_id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async clearHistory(userId: string, companionId?: string): Promise<void> {
    if (companionId) {
      const stmt = this.db.prepare(`
        DELETE FROM conversations
        WHERE user_id = ? AND companion_id = ?
      `);
      stmt.run(userId, companionId);
    } else {
      const stmt = this.db.prepare(`
        DELETE FROM conversations WHERE user_id = ?
      `);
      stmt.run(userId);
    }
  }

  getMessageCount(userId: string, companionId: string = 'cipher'): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM conversations
      WHERE user_id = ? AND companion_id = ?
    `);
    const result = stmt.get(userId, companionId) as { count: number };
    return result.count;
  }

  async getMemories(userId: string): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT content FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const rows = stmt.all(userId) as Array<{ content: string }>;
    return rows.map((r) => r.content);
  }

  async addMemory(userId: string, content: string): Promise<void> {
    const id = `mem-${crypto.randomUUID()}`;
    this.db.prepare(`
      INSERT INTO memories (id, user_id, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, content, Date.now());
  }

  private cleanupOldMessages(userId: string, companionId: string): void {
    // Remove messages older than maxAgeDays
    const cutoffTime = Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000;

    const deleteOld = this.db.prepare(`
      DELETE FROM conversations
      WHERE user_id = ? AND companion_id = ? AND timestamp < ?
    `);
    deleteOld.run(userId, companionId, cutoffTime);

    // If still over limit, remove oldest messages
    const count = this.getMessageCount(userId, companionId);
    if (count > this.maxMessagesPerUser) {
      const excess = count - this.maxMessagesPerUser;

      const deleteExcess = this.db.prepare(`
        DELETE FROM conversations
        WHERE rowid IN (
          SELECT rowid FROM conversations
          WHERE user_id = ? AND companion_id = ?
          ORDER BY timestamp ASC
          LIMIT ?
        )
      `);
      deleteExcess.run(userId, companionId, excess);
    }
  }

  close(): void {
    this.db.close();
  }
}

// ============================================================================
// In-Memory Store (for testing)
// ============================================================================

class InMemoryConversationStore {
  private messages: Map<string, ConversationMemory[]> = new Map();
  private maxMessagesPerUser: number;

  constructor(config: ConversationStoreConfig = {}) {
    this.maxMessagesPerUser = config.maxMessagesPerUser ?? 100;
  }

  private getKey(userId: string, companionId: string): string {
    return `${userId}:${companionId}`;
  }

  async addMessage(
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    companionId: string = 'cipher',
    metadata?: ConversationMemory['metadata']
  ): Promise<string> {
    const key = this.getKey(userId, companionId);
    const messages = this.messages.get(key) ?? [];

    const id = `msg-${crypto.randomUUID()}`;
    const memory: ConversationMemory = {
      id,
      userId,
      companionId,
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    messages.push(memory);

    // Cleanup old messages
    while (messages.length > this.maxMessagesPerUser) {
      messages.shift();
    }

    this.messages.set(key, messages);
    return id;
  }

  async getHistory(
    userId: string,
    limit: number = 20,
    companionId: string = 'cipher'
  ): Promise<ConversationMemory[]> {
    const key = this.getKey(userId, companionId);
    const messages = this.messages.get(key) ?? [];
    return messages.slice(-limit);
  }

  async getRecentMessages(
    userId: string,
    since: Date,
    companionId: string = 'cipher'
  ): Promise<ConversationMemory[]> {
    const key = this.getKey(userId, companionId);
    const messages = this.messages.get(key) ?? [];
    return messages.filter((m) => m.timestamp >= since);
  }

  async clearHistory(userId: string, companionId?: string): Promise<void> {
    if (companionId) {
      const key = this.getKey(userId, companionId);
      this.messages.delete(key);
    } else {
      // Clear all for user
      for (const key of this.messages.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.messages.delete(key);
        }
      }
    }
  }

  getMessageCount(userId: string, companionId: string = 'cipher'): number {
    const key = this.getKey(userId, companionId);
    return this.messages.get(key)?.length ?? 0;
  }

  private memoryStore = new Map<string, string[]>();

  async getMemories(userId: string): Promise<string[]> {
    return this.memoryStore.get(userId) ?? [];
  }

  async addMemory(userId: string, content: string): Promise<void> {
    const memories = this.memoryStore.get(userId) ?? [];
    memories.push(content);
    this.memoryStore.set(userId, memories);
  }

  close(): void {
    this.messages.clear();
    this.memoryStore.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let store: SQLiteConversationStore | InMemoryConversationStore | null = null;

export function getConversationStore(config?: ConversationStoreConfig) {
  if (!store) {
    // Use in-memory store in test environment
    if (process.env.NODE_ENV === 'test') {
      store = new InMemoryConversationStore(config);
    } else {
      store = new SQLiteConversationStore(config);
    }
  }
  return store;
}

// Export a default instance for convenience
export const conversationStore = {
  addMessage: async (...args: Parameters<SQLiteConversationStore['addMessage']>) =>
    getConversationStore().addMessage(...args),
  getHistory: async (...args: Parameters<SQLiteConversationStore['getHistory']>) =>
    getConversationStore().getHistory(...args),
  getRecentMessages: async (...args: Parameters<SQLiteConversationStore['getRecentMessages']>) =>
    getConversationStore().getRecentMessages(...args),
  clearHistory: async (...args: Parameters<SQLiteConversationStore['clearHistory']>) =>
    getConversationStore().clearHistory(...args),
  getMessageCount: async (...args: Parameters<SQLiteConversationStore['getMessageCount']>) =>
    getConversationStore().getMessageCount(...args),
  getMemories: async (userId: string) =>
    getConversationStore().getMemories(userId),
  addMemory: async (userId: string, content: string) =>
    getConversationStore().addMemory(userId, content),
  close: () => getConversationStore().close(),
};

export default conversationStore;
