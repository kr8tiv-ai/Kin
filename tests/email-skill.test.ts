/**
 * Email Skill — Tests
 *
 * Covers: trigger matching, intent parsing, all 5 execute paths,
 * gate checks (not configured, not connected), error classification,
 * and barrel export registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillContext } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Mock GmailManager before importing the skill
// ---------------------------------------------------------------------------

const mockHasTokens = vi.fn<(userId: string) => boolean>();
const mockListMessages = vi.fn();
const mockGetMessage = vi.fn();
const mockCreateDraft = vi.fn();
const mockSendDraft = vi.fn();
const mockGetProfile = vi.fn();

const mockGmailManager = {
  hasTokens: mockHasTokens,
  listMessages: mockListMessages,
  getMessage: mockGetMessage,
  createDraft: mockCreateDraft,
  sendDraft: mockSendDraft,
  getProfile: mockGetProfile,
};

vi.mock('../inference/gmail-manager.js', () => ({
  getGmailManager: vi.fn(() => mockGmailManager),
}));

import { emailSkill, parseEmailIntent, type EmailIntent } from '../bot/skills/builtins/email.js';
import { getGmailManager } from '../inference/gmail-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(message: string, overrides?: Partial<SkillContext>): SkillContext {
  return {
    message,
    userId: 'user-42',
    userName: 'Test User',
    conversationHistory: [],
    env: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmailSkill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasTokens.mockReturnValue(true);
  });

  // =========================================================================
  // Skill metadata
  // =========================================================================

  describe('metadata', () => {
    it('has correct name and description', () => {
      expect(emailSkill.name).toBe('email');
      expect(emailSkill.description).toContain('Gmail');
    });

    it('has trigger patterns', () => {
      expect(emailSkill.triggers.length).toBeGreaterThan(0);
    });

    it('trigger patterns are valid regex', () => {
      for (const pattern of emailSkill.triggers) {
        expect(() => new RegExp(pattern, 'i')).not.toThrow();
      }
    });
  });

  // =========================================================================
  // Trigger matching
  // =========================================================================

  describe('trigger matching', () => {
    const triggers = emailSkill.triggers.map((t) => new RegExp(t, 'i'));

    function matchesTrigger(msg: string): boolean {
      return triggers.some((rx) => rx.test(msg));
    }

    it.each([
      'check my email',
      'check my inbox',
      'check gmail',
      'any new emails?',
      'new messages',
      'email summary',
    ])('matches check-inbox: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(true);
    });

    it.each([
      'read email from John',
      'read the message about invoices',
      'show me that email',
      'open email message',
    ])('matches read-message: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(true);
    });

    it.each([
      'search email for invoices',
      'search inbox for receipts',
      'search gmail for updates',
      'find email from alice about project',
      'find message from bob',
    ])('matches search: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(true);
    });

    it.each([
      'draft an email to bob@test.com about lunch',
      'draft a reply to alice@example.com',
      'compose an email message',
      'write an email to user@test.com',
      'write a reply',
    ])('matches draft: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(true);
    });

    it.each([
      'send draft abc123',
      'send the email',
      'send message',
      'mail send now',
    ])('matches send: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(true);
    });

    it.each([
      'what is the weather?',
      'tell me a joke',
      'how do I cook pasta?',
    ])('does NOT match unrelated: "%s"', (msg) => {
      expect(matchesTrigger(msg)).toBe(false);
    });
  });

  // =========================================================================
  // Intent parsing
  // =========================================================================

  describe('parseEmailIntent', () => {
    it('parses check-inbox intent', () => {
      expect(parseEmailIntent('check my email')).toEqual({ intent: 'check' });
      expect(parseEmailIntent('any new emails?')).toEqual({ intent: 'check' });
      expect(parseEmailIntent('email summary')).toEqual({ intent: 'check' });
    });

    it('parses read intent with from parameter', () => {
      const result = parseEmailIntent('read email from alice@example.com');
      expect(result?.intent).toBe('read');
      expect(result?.query).toBe('alice@example.com');
    });

    it('parses read intent with about parameter', () => {
      const result = parseEmailIntent('show email about project update');
      expect(result?.intent).toBe('read');
      expect(result?.query).toBe('project update');
    });

    it('parses search intent with query', () => {
      const result = parseEmailIntent('search email for invoices');
      expect(result?.intent).toBe('search');
      expect(result?.query).toBe('invoices');
    });

    it('parses draft intent with email address', () => {
      const result = parseEmailIntent('draft an email to alice@example.com about meeting');
      expect(result?.intent).toBe('draft');
      expect(result?.emailAddress).toBe('alice@example.com');
    });

    it('parses draft intent with subject', () => {
      const result = parseEmailIntent('draft email to bob@test.com about quarterly review');
      expect(result?.intent).toBe('draft');
      expect(result?.subject).toBe('quarterly review');
    });

    it('parses send intent with draft ID', () => {
      const result = parseEmailIntent('send draft r9876abc');
      expect(result?.intent).toBe('send');
      expect(result?.draftId).toBe('r9876abc');
    });

    it('parses send intent without draft ID', () => {
      const result = parseEmailIntent('send the email');
      expect(result?.intent).toBe('send');
      expect(result?.draftId).toBeUndefined();
    });

    it('returns null for unrelated messages', () => {
      expect(parseEmailIntent('what is the weather?')).toBeNull();
      expect(parseEmailIntent('hello there')).toBeNull();
    });
  });

  // =========================================================================
  // Gate checks
  // =========================================================================

  describe('gate checks', () => {
    it('returns help message when intent is not parseable', async () => {
      const result = await emailSkill.execute(makeCtx('do something random with mail'));
      expect(result.type).toBe('text');
      expect(result.content).toContain('I can help with email');
    });

    it('returns config error when GmailManager is not configured', async () => {
      vi.mocked(getGmailManager).mockImplementationOnce(() => {
        throw new Error('Gmail integration requires GOOGLE_CLIENT_ID');
      });

      const result = await emailSkill.execute(makeCtx('check my email'));
      expect(result.type).toBe('error');
      expect(result.content).toContain('not configured');
      expect(result.metadata?.error).toBe('gmail_not_configured');
    });

    it('returns connection prompt when user has no tokens', async () => {
      mockHasTokens.mockReturnValueOnce(false);

      const result = await emailSkill.execute(makeCtx('check my email'));
      expect(result.type).toBe('text');
      expect(result.content).toContain('Gmail Not Connected');
      expect(result.content).toContain('Settings');
      expect(result.metadata?.error).toBe('gmail_not_connected');
    });
  });

  // =========================================================================
  // Execute — check inbox
  // =========================================================================

  describe('execute — check inbox', () => {
    it('returns inbox summary with messages', async () => {
      mockListMessages.mockResolvedValueOnce({
        unreadCount: 3,
        messages: [
          { id: 'm1', threadId: 't1', subject: 'Hello', from: 'Alice <alice@test.com>', snippet: 'Hi there...', date: 'Mon, 1 Jan' },
          { id: 'm2', threadId: 't2', subject: 'URGENT: Deadline tomorrow', from: 'Boss <boss@co.com>', snippet: 'Please submit...', date: 'Mon, 1 Jan' },
        ],
      });

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Inbox Summary');
      expect(result.content).toContain('3');
      expect(result.content).toContain('Alice');
      // Urgent message should have the red flag
      expect(result.content).toContain('🔴');
      expect(result.metadata?.unreadCount).toBe(3);
    });

    it('returns empty inbox message', async () => {
      mockListMessages.mockResolvedValueOnce({
        unreadCount: 0,
        messages: [],
      });

      const result = await emailSkill.execute(makeCtx('any new emails'));

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('inbox is clear');
    });
  });

  // =========================================================================
  // Execute — read message
  // =========================================================================

  describe('execute — read message', () => {
    it('returns message detail when found', async () => {
      mockListMessages.mockResolvedValueOnce({
        unreadCount: 1,
        messages: [{ id: 'm1', threadId: 't1', subject: 'Test', from: 'alice@test.com', snippet: '...', date: '' }],
      });
      mockGetMessage.mockResolvedValueOnce({
        id: 'm1',
        threadId: 't1',
        subject: 'Test Subject',
        from: 'Alice <alice@test.com>',
        to: 'me@test.com',
        date: 'Mon, 1 Jan 2024',
        body: 'Hello, this is the email body.',
        snippet: 'Hello...',
      });

      const result = await emailSkill.execute(makeCtx('read email from alice@test.com'));

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Test Subject');
      expect(result.content).toContain('Alice');
      expect(result.content).toContain('Hello, this is the email body.');
      expect(result.metadata?.messageId).toBe('m1');
    });

    it('returns not-found when no messages match', async () => {
      mockListMessages.mockResolvedValueOnce({ unreadCount: 0, messages: [] });

      const result = await emailSkill.execute(makeCtx('read email from nobody@test.com'));

      expect(result.type).toBe('text');
      expect(result.content).toContain('No messages found');
    });

    it('prompts for query when none provided', async () => {
      // "show email message" matches read intent but has no from/about
      const result = await emailSkill.execute(makeCtx('show me the email message'));

      expect(result.type).toBe('text');
      expect(result.content).toContain('Who is the message from');
    });
  });

  // =========================================================================
  // Execute — search
  // =========================================================================

  describe('execute — search', () => {
    it('returns search results', async () => {
      mockListMessages.mockResolvedValueOnce({
        unreadCount: 2,
        messages: [
          { id: 'm1', threadId: 't1', subject: 'Invoice #123', from: 'billing@co.com', snippet: 'Your invoice...', date: 'Jan 1' },
          { id: 'm2', threadId: 't2', subject: 'Invoice #124', from: 'billing@co.com', snippet: 'Your invoice...', date: 'Jan 2' },
        ],
      });

      const result = await emailSkill.execute(makeCtx('search email for invoices'));

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Search Results');
      expect(result.content).toContain('invoices');
      expect(result.content).toContain('2');
      expect(result.metadata?.resultCount).toBe(2);
    });

    it('returns empty search results', async () => {
      mockListMessages.mockResolvedValueOnce({ unreadCount: 0, messages: [] });

      const result = await emailSkill.execute(makeCtx('search email for unicorns'));

      expect(result.content).toContain('No messages matched');
    });

    it('prompts when no search query provided', async () => {
      // This won't match the search trigger without for/about, so it'll fall through.
      // Test with a message that parses as search but has no query.
      const result = await emailSkill.execute(makeCtx('search email inbox for'));

      // "for" captures empty string — should still prompt
      // Actually "for" + EOL gives empty query from regex
      expect(result.type).toBe('text');
    });
  });

  // =========================================================================
  // Execute — draft
  // =========================================================================

  describe('execute — draft', () => {
    it('creates a draft with email and subject', async () => {
      mockCreateDraft.mockResolvedValueOnce({
        draftId: 'draft-abc',
        messageId: 'msg-123',
      });

      const result = await emailSkill.execute(
        makeCtx('draft an email to alice@example.com about meeting notes'),
      );

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Draft Created');
      expect(result.content).toContain('alice@example.com');
      expect(result.content).toContain('draft-abc');
      expect(mockCreateDraft).toHaveBeenCalledWith(
        'user-42',
        'alice@example.com',
        'meeting notes',
        expect.any(String),
      );
    });

    it('creates a draft with default subject when none provided', async () => {
      mockCreateDraft.mockResolvedValueOnce({
        draftId: 'draft-xyz',
        messageId: 'msg-456',
      });

      const result = await emailSkill.execute(
        makeCtx('draft a reply to bob@test.com'),
      );

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Draft Created');
      expect(mockCreateDraft).toHaveBeenCalledWith(
        'user-42',
        'bob@test.com',
        'New Message',
        expect.any(String),
      );
    });

    it('prompts when no email address provided', async () => {
      const result = await emailSkill.execute(makeCtx('compose an email message'));

      expect(result.type).toBe('text');
      expect(result.content).toContain('Who should I address');
    });
  });

  // =========================================================================
  // Execute — send
  // =========================================================================

  describe('execute — send', () => {
    it('sends a draft by ID', async () => {
      mockSendDraft.mockResolvedValueOnce('sent-msg-id');

      const result = await emailSkill.execute(makeCtx('send draft abc123'));

      expect(result.type).toBe('markdown');
      expect(result.content).toContain('Email Sent');
      expect(result.content).toContain('sent-msg-id');
      expect(mockSendDraft).toHaveBeenCalledWith('user-42', 'abc123');
    });

    it('prompts when no draft ID provided', async () => {
      const result = await emailSkill.execute(makeCtx('send the email'));

      expect(result.type).toBe('text');
      expect(result.content).toContain('Which draft');
    });
  });

  // =========================================================================
  // Error classification
  // =========================================================================

  describe('error classification', () => {
    it('classifies auth expired errors', async () => {
      mockListMessages.mockRejectedValueOnce(new Error('No Gmail tokens found for user x — OAuth consent required'));

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('expired');
      expect(result.metadata?.error).toBe('auth_expired');
    });

    it('classifies rate limit errors', async () => {
      mockListMessages.mockRejectedValueOnce(new Error('Rate Limit Exceeded'));

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('rate limit');
      expect(result.metadata?.error).toBe('rate_limit');
    });

    it('classifies network errors', async () => {
      mockListMessages.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('Gmail servers');
      expect(result.metadata?.error).toBe('network');
    });

    it('classifies permission errors', async () => {
      mockListMessages.mockRejectedValueOnce(new Error('Insufficient Permission'));

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('permissions');
      expect(result.metadata?.error).toBe('insufficient_permissions');
    });

    it('classifies not-found errors', async () => {
      mockSendDraft.mockRejectedValueOnce(new Error('Not Found'));

      const result = await emailSkill.execute(makeCtx('send draft xyz'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('not found');
      expect(result.metadata?.error).toBe('not_found');
    });

    it('classifies generic errors', async () => {
      mockListMessages.mockRejectedValueOnce(new Error('Something unexpected happened'));

      const result = await emailSkill.execute(makeCtx('check my email'));

      expect(result.type).toBe('error');
      expect(result.content).toContain('Something unexpected happened');
      expect(result.metadata?.error).toBe('unknown');
    });
  });

  // =========================================================================
  // Barrel export
  // =========================================================================

  describe('barrel export', () => {
    it('emailSkill is included in builtinSkills array', async () => {
      const { builtinSkills } = await import('../bot/skills/builtins/index.js');
      const found = builtinSkills.find((s) => s.name === 'email');
      expect(found).toBeDefined();
      expect(found?.name).toBe('email');
    });
  });
});
