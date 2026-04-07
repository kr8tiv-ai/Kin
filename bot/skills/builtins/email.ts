/**
 * Email Skill — Check inbox, read messages, search, draft, and send via Gmail.
 *
 * Uses the GmailManager singleton for OAuth2-authenticated Gmail API operations.
 * Follows the BrowserSkill pattern: same interface fields, error classification,
 * and markdown result formatting.
 *
 * @module bot/skills/builtins/email
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import { getGmailManager } from '../../../inference/gmail-manager.js';
import type { GmailManager, MessageSummary, MessageDetail } from '../../../inference/gmail-manager.js';

// ---------------------------------------------------------------------------
// Intent Detection
// ---------------------------------------------------------------------------

export type EmailIntent = 'check' | 'read' | 'search' | 'draft' | 'send';

interface ParsedIntent {
  intent: EmailIntent;
  query?: string;
  emailAddress?: string;
  draftId?: string;
  subject?: string;
}

/**
 * Parse the user's message into a structured intent with parameters.
 * Uses ordered regex matching — first match wins.
 */
export function parseEmailIntent(message: string): ParsedIntent | null {
  const msg = message.toLowerCase().trim();

  // --- Send draft ---
  if (/send\s+(?:the\s+)?(?:draft|email|message)/i.test(msg) || /mail\s+(?:send|deliver)/i.test(msg)) {
    const draftIdMatch = message.match(/draft\s+(?:id\s+)?([a-zA-Z0-9_-]+)/i);
    return {
      intent: 'send',
      draftId: draftIdMatch?.[1] || undefined,
    };
  }

  // --- Draft / compose ---
  if (
    /draft\s+.*(?:email|reply|message)\s*.*(?:to|about)/i.test(msg) ||
    /compose\s+.*(?:email|message)/i.test(msg) ||
    /write\s+.*(?:email|reply)/i.test(msg) ||
    // Simpler fallback: "draft a reply to X" or "draft an email"
    /draft\s+(?:a\s+)?(?:email|reply|message)/i.test(msg)
  ) {
    const emailMatch = message.match(/(?:to|for)\s+([\w.+-]+@[\w.-]+\.\w+)/i);
    const subjectMatch = message.match(/(?:about|subject|re:?)\s+["']?(.+?)["']?\s*$/i);
    return {
      intent: 'draft',
      emailAddress: emailMatch?.[1] || undefined,
      subject: subjectMatch?.[1] || undefined,
    };
  }

  // --- Read specific message ---
  if (
    /read\s+.*(?:email|message)\s*.*(?:from|about)/i.test(msg) ||
    /(?:show|open)\s+.*(?:email|message)/i.test(msg)
  ) {
    const fromMatch = message.match(/(?:from|by)\s+([\w.+-]+@[\w.-]+\.\w+|\w[\w\s]*\w)/i);
    const aboutMatch = message.match(/about\s+["']?(.+?)["']?\s*$/i);
    return {
      intent: 'read',
      query: fromMatch?.[1] || aboutMatch?.[1] || undefined,
    };
  }

  // --- Search ---
  if (
    /search\s+.*(?:email|inbox|gmail)\s*.*(?:for|about)/i.test(msg) ||
    /find\s+.*(?:email|message)\s*.*(?:from|about)/i.test(msg)
  ) {
    const queryMatch = message.match(/(?:for|about)\s+["']?(.+?)["']?\s*$/i);
    return {
      intent: 'search',
      query: queryMatch?.[1] || undefined,
    };
  }

  // --- Check inbox (broadest — must be last) ---
  if (
    /check\s+.*(?:my\s+)?(?:email|inbox|gmail)/i.test(msg) ||
    /(?:any|new)\s+(?:emails?|messages?)/i.test(msg) ||
    /email\s+summary/i.test(msg)
  ) {
    return { intent: 'check' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Result Formatting
// ---------------------------------------------------------------------------

function formatInboxResult(summary: { unreadCount: number; messages: MessageSummary[] }): string {
  const lines: string[] = [];

  lines.push(`📬 **Inbox Summary**\n`);
  lines.push(`**${summary.unreadCount}** unread message${summary.unreadCount === 1 ? '' : 's'}\n`);

  if (summary.messages.length === 0) {
    lines.push('🎉 Your inbox is clear — no unread messages!');
    return lines.join('\n');
  }

  // Flag urgent-looking messages (contains "urgent", "asap", "important" in subject/snippet)
  const urgentPattern = /urgent|asap|important|critical|deadline|action\s+required/i;

  for (const msg of summary.messages) {
    const isUrgent = urgentPattern.test(msg.subject) || urgentPattern.test(msg.snippet);
    const flag = isUrgent ? '🔴' : '📧';
    const fromName = msg.from.replace(/<[^>]+>/, '').trim();
    lines.push(`${flag} **${msg.subject || '(no subject)'}**`);
    lines.push(`   From: ${fromName}`);
    lines.push(`   ${msg.snippet.slice(0, 120)}${msg.snippet.length > 120 ? '…' : ''}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatMessageResult(detail: MessageDetail): string {
  const lines: string[] = [];
  const fromName = detail.from.replace(/<[^>]+>/, '').trim();

  lines.push(`📖 **${detail.subject || '(no subject)'}**\n`);
  lines.push(`**From:** ${fromName}`);
  lines.push(`**To:** ${detail.to}`);
  lines.push(`**Date:** ${detail.date}\n`);

  // Truncate long message bodies
  const body = detail.body || detail.snippet;
  const display = body.length > 2000 ? body.slice(0, 2000) + '…' : body;
  lines.push(display);

  return lines.join('\n');
}

function formatSearchResult(messages: MessageSummary[], query: string): string {
  const lines: string[] = [];

  lines.push(`🔍 **Search Results** — "${query}"\n`);
  lines.push(`Found **${messages.length}** matching message${messages.length === 1 ? '' : 's'}\n`);

  if (messages.length === 0) {
    lines.push('No messages matched your search.');
    return lines.join('\n');
  }

  for (const msg of messages) {
    const fromName = msg.from.replace(/<[^>]+>/, '').trim();
    lines.push(`📧 **${msg.subject || '(no subject)'}**`);
    lines.push(`   From: ${fromName} · ${msg.date}`);
    lines.push(`   ${msg.snippet.slice(0, 100)}${msg.snippet.length > 100 ? '…' : ''}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatDraftResult(draftId: string, to: string, subject: string): string {
  const lines: string[] = [];

  lines.push(`✏️ **Draft Created**\n`);
  lines.push(`**To:** ${to}`);
  lines.push(`**Subject:** ${subject}`);
  lines.push(`**Draft ID:** \`${draftId}\``);
  lines.push('');
  lines.push('Say "send draft" to send it, or edit it in Gmail.');

  return lines.join('\n');
}

function formatSendResult(messageId: string): string {
  return `✅ **Email Sent**\n\nMessage delivered successfully.\n📎 Message ID: \`${messageId}\``;
}

// ---------------------------------------------------------------------------
// Email Skill
// ---------------------------------------------------------------------------

export const emailSkill: KinSkill = {
  name: 'email',
  description: 'Check inbox, read messages, search, draft, and send via Gmail',

  triggers: [
    // Check inbox
    'check\\s+.*(?:my\\s+)?(?:email|inbox|gmail)',
    '(?:any|new)\\s+(?:emails?|messages?)',
    'email\\s+summary',
    // Read message
    'read\\s+.*(?:email|message)\\s*.*(?:from|about)',
    '(?:show|open)\\s+.*(?:email|message)',
    // Search
    'search\\s+.*(?:email|inbox|gmail)\\s*.*(?:for|about)',
    'find\\s+.*(?:email|message)\\s*.*(?:from|about)',
    // Draft
    'draft\\s+.*(?:email|reply|message)\\s*.*(?:to|about)',
    'compose\\s+.*(?:email|message)',
    'write\\s+.*(?:email|reply)',
    // Send
    'send\\s+.*(?:draft|email|message)',
    'mail\\s+.*(?:send|deliver)',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // 1. Parse intent from message
    const parsed = parseEmailIntent(ctx.message);
    if (!parsed) {
      return {
        content:
          '📧 I can help with email! Try:\n' +
          '• "Check my email" — inbox summary\n' +
          '• "Read email from John" — open a message\n' +
          '• "Search email for invoices" — find messages\n' +
          '• "Draft a reply to user@example.com" — compose\n' +
          '• "Send draft" — send a composed draft',
        type: 'text',
      };
    }

    // 2. Gate check — verify Gmail is connected
    let manager: GmailManager;
    try {
      manager = getGmailManager();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: `⚙️ Gmail integration is not configured: ${msg}\n\nAsk your admin to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET.`,
        type: 'error',
        metadata: { error: 'gmail_not_configured' },
      };
    }

    if (!manager.hasTokens(ctx.userId)) {
      return {
        content:
          '🔗 **Gmail Not Connected**\n\n' +
          'You need to connect your Gmail account first.\n' +
          'Visit your **Settings** page and click **Connect Gmail** to authorize access.',
        type: 'text',
        metadata: { error: 'gmail_not_connected', userId: ctx.userId },
      };
    }

    // 3. Execute based on intent
    try {
      switch (parsed.intent) {
        case 'check':
          return await executeCheckInbox(manager, ctx.userId);
        case 'read':
          return await executeReadMessage(manager, ctx.userId, parsed.query);
        case 'search':
          return await executeSearch(manager, ctx.userId, parsed.query);
        case 'draft':
          return await executeDraft(manager, ctx.userId, parsed.emailAddress, parsed.subject, ctx.message);
        case 'send':
          return await executeSend(manager, ctx.userId, parsed.draftId);
        default:
          return { content: 'Unknown email action.', type: 'error' };
      }
    } catch (error) {
      return classifyError(error, parsed.intent);
    }
  },
};

// ---------------------------------------------------------------------------
// Intent Executors
// ---------------------------------------------------------------------------

async function executeCheckInbox(
  manager: GmailManager,
  userId: string,
): Promise<SkillResult> {
  const inbox = await manager.listMessages(userId, { query: 'is:unread', maxResults: 10 });

  return {
    content: formatInboxResult(inbox),
    type: 'markdown',
    metadata: {
      intent: 'check',
      unreadCount: inbox.unreadCount,
      messageCount: inbox.messages.length,
    },
  };
}

async function executeReadMessage(
  manager: GmailManager,
  userId: string,
  query?: string,
): Promise<SkillResult> {
  if (!query) {
    return {
      content: '📖 Who is the message from, or what is it about?\n\nTry: "Read email from alice@example.com" or "Read email about project update"',
      type: 'text',
    };
  }

  // Search for messages matching the query, take the first one
  const results = await manager.listMessages(userId, { query, maxResults: 1 });

  if (results.messages.length === 0) {
    return {
      content: `📭 No messages found matching "${query}".`,
      type: 'text',
      metadata: { intent: 'read', query, found: false },
    };
  }

  const detail = await manager.getMessage(userId, results.messages[0]!.id);

  return {
    content: formatMessageResult(detail),
    type: 'markdown',
    metadata: { intent: 'read', messageId: detail.id, query },
  };
}

async function executeSearch(
  manager: GmailManager,
  userId: string,
  query?: string,
): Promise<SkillResult> {
  if (!query) {
    return {
      content: '🔍 What should I search for?\n\nTry: "Search email for invoices" or "Find email from boss"',
      type: 'text',
    };
  }

  const results = await manager.listMessages(userId, { query, maxResults: 10 });

  return {
    content: formatSearchResult(results.messages, query),
    type: 'markdown',
    metadata: { intent: 'search', query, resultCount: results.messages.length },
  };
}

async function executeDraft(
  manager: GmailManager,
  userId: string,
  emailAddress?: string,
  subject?: string,
  rawMessage?: string,
): Promise<SkillResult> {
  if (!emailAddress) {
    return {
      content: '✏️ Who should I address the draft to?\n\nTry: "Draft an email to alice@example.com about meeting notes"',
      type: 'text',
    };
  }

  const draftSubject = subject || 'New Message';
  // Extract body content from the message — everything after "saying" or "body" keywords
  const bodyMatch = rawMessage?.match(/(?:saying|body|message|content|text)\s*[:"]?\s*(.+)/i);
  const body = bodyMatch?.[1]?.replace(/["']$/, '').trim() || '';

  const result = await manager.createDraft(userId, emailAddress, draftSubject, body);

  return {
    content: formatDraftResult(result.draftId, emailAddress, draftSubject),
    type: 'markdown',
    metadata: {
      intent: 'draft',
      draftId: result.draftId,
      to: emailAddress,
      subject: draftSubject,
    },
  };
}

async function executeSend(
  manager: GmailManager,
  userId: string,
  draftId?: string,
): Promise<SkillResult> {
  if (!draftId) {
    return {
      content: '📤 Which draft should I send?\n\nTry: "Send draft abc123" — use the draft ID from when you created it.',
      type: 'text',
    };
  }

  const messageId = await manager.sendDraft(userId, draftId);

  return {
    content: formatSendResult(messageId),
    type: 'markdown',
    metadata: { intent: 'send', messageId, draftId },
  };
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

function classifyError(error: unknown, intent: string): SkillResult {
  const msg = error instanceof Error ? error.message : String(error);

  // Auth / token expired
  if (msg.includes('OAuth consent required') || msg.includes('No Gmail tokens') || msg.includes('invalid_grant')) {
    return {
      content: '🔐 Your Gmail connection has expired.\n\nVisit **Settings → Connect Gmail** to re-authorize access.',
      type: 'error',
      metadata: { intent, error: 'auth_expired' },
    };
  }

  // Rate limit
  if (msg.includes('Rate Limit') || msg.includes('429') || msg.includes('quota')) {
    return {
      content: '⏳ Gmail rate limit reached. Please try again in a few minutes.',
      type: 'error',
      metadata: { intent, error: 'rate_limit' },
    };
  }

  // Network / timeout
  if (msg.includes('timeout') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network')) {
    return {
      content: '🌐 Could not reach Gmail servers. Check your internet connection and try again.',
      type: 'error',
      metadata: { intent, error: 'network' },
    };
  }

  // Permission denied
  if (msg.includes('Insufficient Permission') || msg.includes('403')) {
    return {
      content: '🚫 Insufficient Gmail permissions.\n\nVisit **Settings → Connect Gmail** to re-authorize with the required scopes.',
      type: 'error',
      metadata: { intent, error: 'insufficient_permissions' },
    };
  }

  // Not found (e.g., message/draft ID doesn't exist)
  if (msg.includes('Not Found') || msg.includes('404') || msg.includes('not found')) {
    return {
      content: `📭 The requested ${intent === 'send' ? 'draft' : 'message'} was not found. It may have been deleted or the ID is incorrect.`,
      type: 'error',
      metadata: { intent, error: 'not_found' },
    };
  }

  // Generic
  return {
    content: `❌ Email operation failed: ${msg}`,
    type: 'error',
    metadata: { intent, error: 'unknown', message: msg },
  };
}

export default emailSkill;
