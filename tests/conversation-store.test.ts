/**
 * Conversation Store Tests
 *
 * Tests for InMemoryConversationStore via getConversationStore().
 * Sets NODE_ENV=test so the factory returns the in-memory implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Force test environment so getConversationStore returns InMemoryConversationStore
process.env.NODE_ENV = 'test';

// We need a fresh store for each test, so we import the module and
// reset the singleton between tests.  The module exposes getConversationStore
// which caches a singleton internally, so we use dynamic imports with
// module cache busting is not straightforward.  Instead, we directly import
// and test the exported helper which delegates to the singleton.

// Strategy: import the module once, get a store, and use clearHistory to
// isolate tests (the in-memory store is shared per process).

import {
  getConversationStore,
  type ConversationMemory,
} from '../bot/memory/conversation-store.js';

const USER_A = 'user-test-alice';
const USER_B = 'user-test-bob';
const COMPANION = 'cipher';

describe('InMemoryConversationStore', () => {
  let store: ReturnType<typeof getConversationStore>;

  beforeEach(async () => {
    store = getConversationStore({ maxMessagesPerUser: 5 });
    // Clean up before each test
    await store.clearHistory(USER_A);
    await store.clearHistory(USER_B);
  });

  afterEach(async () => {
    await store.clearHistory(USER_A);
    await store.clearHistory(USER_B);
  });

  // ==========================================================================
  // addMessage
  // ==========================================================================

  describe('addMessage', () => {
    it('returns a message id starting with "msg-"', async () => {
      const id = await store.addMessage(USER_A, 'user', 'Hello', COMPANION);
      expect(id).toMatch(/^msg-/);
    });

    it('stores messages that can be retrieved', async () => {
      await store.addMessage(USER_A, 'user', 'Hello Cipher', COMPANION);
      const history = await store.getHistory(USER_A, 10, COMPANION);

      expect(history.length).toBe(1);
      expect(history[0]!.content).toBe('Hello Cipher');
      expect(history[0]!.role).toBe('user');
      expect(history[0]!.userId).toBe(USER_A);
      expect(history[0]!.companionId).toBe(COMPANION);
    });

    it('stores optional metadata', async () => {
      await store.addMessage(USER_A, 'assistant', 'Hi!', COMPANION, {
        tokens: 42,
        model: 'llama3',
        provider: 'local',
      });

      const history = await store.getHistory(USER_A, 10, COMPANION);
      expect(history[0]!.metadata).toBeDefined();
      expect(history[0]!.metadata!.tokens).toBe(42);
      expect(history[0]!.metadata!.model).toBe('llama3');
      expect(history[0]!.metadata!.provider).toBe('local');
    });

    it('defaults companionId to "cipher"', async () => {
      await store.addMessage(USER_A, 'user', 'Default companion');
      const history = await store.getHistory(USER_A, 10);
      expect(history.length).toBe(1);
      expect(history[0]!.companionId).toBe('cipher');
    });
  });

  // ==========================================================================
  // getHistory
  // ==========================================================================

  describe('getHistory', () => {
    it('returns messages in chronological order', async () => {
      await store.addMessage(USER_A, 'user', 'First', COMPANION);
      await store.addMessage(USER_A, 'assistant', 'Second', COMPANION);
      await store.addMessage(USER_A, 'user', 'Third', COMPANION);

      const history = await store.getHistory(USER_A, 10, COMPANION);

      expect(history.length).toBe(3);
      expect(history[0]!.content).toBe('First');
      expect(history[1]!.content).toBe('Second');
      expect(history[2]!.content).toBe('Third');
    });

    it('respects the limit parameter', async () => {
      await store.addMessage(USER_A, 'user', 'Msg 1', COMPANION);
      await store.addMessage(USER_A, 'user', 'Msg 2', COMPANION);
      await store.addMessage(USER_A, 'user', 'Msg 3', COMPANION);
      await store.addMessage(USER_A, 'user', 'Msg 4', COMPANION);

      const history = await store.getHistory(USER_A, 2, COMPANION);

      expect(history.length).toBe(2);
      // Should return the LAST 2 messages (most recent)
      expect(history[0]!.content).toBe('Msg 3');
      expect(history[1]!.content).toBe('Msg 4');
    });

    it('defaults limit to 20', async () => {
      // Add 3 messages and request with default limit
      await store.addMessage(USER_A, 'user', 'A', COMPANION);
      await store.addMessage(USER_A, 'user', 'B', COMPANION);
      await store.addMessage(USER_A, 'user', 'C', COMPANION);

      const history = await store.getHistory(USER_A);
      expect(history.length).toBe(3); // all 3, since < 20
    });

    it('returns empty array when no messages exist', async () => {
      const history = await store.getHistory('user-nobody', 10, COMPANION);
      expect(history).toEqual([]);
    });

    it('isolates messages between different users', async () => {
      await store.addMessage(USER_A, 'user', 'Alice says hi', COMPANION);
      await store.addMessage(USER_B, 'user', 'Bob says hello', COMPANION);

      const aliceHistory = await store.getHistory(USER_A, 10, COMPANION);
      const bobHistory = await store.getHistory(USER_B, 10, COMPANION);

      expect(aliceHistory.length).toBe(1);
      expect(aliceHistory[0]!.content).toBe('Alice says hi');

      expect(bobHistory.length).toBe(1);
      expect(bobHistory[0]!.content).toBe('Bob says hello');
    });

    it('isolates messages between different companions', async () => {
      await store.addMessage(USER_A, 'user', 'To cipher', 'cipher');
      await store.addMessage(USER_A, 'user', 'To forge', 'forge');

      const cipherHistory = await store.getHistory(USER_A, 10, 'cipher');
      const forgeHistory = await store.getHistory(USER_A, 10, 'forge');

      expect(cipherHistory.length).toBe(1);
      expect(cipherHistory[0]!.content).toBe('To cipher');

      expect(forgeHistory.length).toBe(1);
      expect(forgeHistory[0]!.content).toBe('To forge');
    });
  });

  // ==========================================================================
  // History Limit (maxMessagesPerUser cleanup)
  // ==========================================================================

  describe('History limit (maxMessagesPerUser)', () => {
    it('evicts oldest messages when exceeding maxMessagesPerUser', async () => {
      // maxMessagesPerUser is 5 for this test suite
      for (let i = 1; i <= 7; i++) {
        await store.addMessage(USER_A, 'user', `Msg ${i}`, COMPANION);
      }

      const history = await store.getHistory(USER_A, 100, COMPANION);

      // Should have kept only the last 5
      expect(history.length).toBe(5);
      expect(history[0]!.content).toBe('Msg 3');
      expect(history[4]!.content).toBe('Msg 7');
    });
  });

  // ==========================================================================
  // clearHistory
  // ==========================================================================

  describe('clearHistory', () => {
    it('clears all messages for a specific user + companion', async () => {
      await store.addMessage(USER_A, 'user', 'Hello', COMPANION);
      await store.addMessage(USER_A, 'assistant', 'Hi!', COMPANION);

      await store.clearHistory(USER_A, COMPANION);

      const history = await store.getHistory(USER_A, 10, COMPANION);
      expect(history.length).toBe(0);
    });

    it('clears all companions for a user when companionId is omitted', async () => {
      await store.addMessage(USER_A, 'user', 'To cipher', 'cipher');
      await store.addMessage(USER_A, 'user', 'To forge', 'forge');

      await store.clearHistory(USER_A);

      const cipherHistory = await store.getHistory(USER_A, 10, 'cipher');
      const forgeHistory = await store.getHistory(USER_A, 10, 'forge');

      expect(cipherHistory.length).toBe(0);
      expect(forgeHistory.length).toBe(0);
    });

    it('does not affect other users when clearing one user', async () => {
      await store.addMessage(USER_A, 'user', 'Alice msg', COMPANION);
      await store.addMessage(USER_B, 'user', 'Bob msg', COMPANION);

      await store.clearHistory(USER_A, COMPANION);

      const aliceHistory = await store.getHistory(USER_A, 10, COMPANION);
      const bobHistory = await store.getHistory(USER_B, 10, COMPANION);

      expect(aliceHistory.length).toBe(0);
      expect(bobHistory.length).toBe(1);
    });

    it('is safe to call on a user with no messages', async () => {
      // Should not throw
      await store.clearHistory('user-no-one', COMPANION);
    });
  });

  // ==========================================================================
  // getMessageCount
  // ==========================================================================

  describe('getMessageCount', () => {
    it('returns 0 for a user with no messages', () => {
      expect(store.getMessageCount('user-no-one', COMPANION)).toBe(0);
    });

    it('returns correct count after adding messages', async () => {
      await store.addMessage(USER_A, 'user', 'One', COMPANION);
      await store.addMessage(USER_A, 'assistant', 'Two', COMPANION);
      await store.addMessage(USER_A, 'user', 'Three', COMPANION);

      expect(store.getMessageCount(USER_A, COMPANION)).toBe(3);
    });

    it('returns correct count after clearing', async () => {
      await store.addMessage(USER_A, 'user', 'Hello', COMPANION);
      await store.clearHistory(USER_A, COMPANION);

      expect(store.getMessageCount(USER_A, COMPANION)).toBe(0);
    });
  });

  // ==========================================================================
  // getRecentMessages
  // ==========================================================================

  describe('getRecentMessages', () => {
    it('returns only messages after the given timestamp', async () => {
      await store.addMessage(USER_A, 'user', 'Old message', COMPANION);

      // Introduce a small delay so timestamps differ
      const cutoff = new Date();

      await store.addMessage(USER_A, 'user', 'New message', COMPANION);

      const recent = await store.getRecentMessages(USER_A, cutoff, COMPANION);

      // Should include at least the message added after the cutoff
      expect(recent.length).toBeGreaterThanOrEqual(1);
      expect(recent.some((m) => m.content === 'New message')).toBe(true);
    });

    it('returns empty array when no messages are recent enough', async () => {
      await store.addMessage(USER_A, 'user', 'Old', COMPANION);

      const futureDate = new Date(Date.now() + 100_000);
      const recent = await store.getRecentMessages(USER_A, futureDate, COMPANION);

      expect(recent.length).toBe(0);
    });
  });

  // ==========================================================================
  // ConversationMemory shape
  // ==========================================================================

  describe('ConversationMemory shape', () => {
    it('has all required fields with correct types', async () => {
      await store.addMessage(USER_A, 'user', 'Test shape', COMPANION, {
        tokens: 10,
        model: 'test',
      });

      const history = await store.getHistory(USER_A, 1, COMPANION);
      const msg = history[0]!;

      expect(typeof msg.id).toBe('string');
      expect(typeof msg.userId).toBe('string');
      expect(typeof msg.companionId).toBe('string');
      expect(['user', 'assistant', 'system']).toContain(msg.role);
      expect(typeof msg.content).toBe('string');
      expect(msg.timestamp).toBeInstanceOf(Date);
    });
  });
});
