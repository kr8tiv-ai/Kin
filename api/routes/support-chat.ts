/**
 * Support Chat Routes — AI-powered customer service chatbot.
 *
 * POST /support/chat          Send a message to the AI support bot
 * POST /support/chat/escalate Escalate to human customer service
 * GET  /support/chat/history  Get chat history for current session
 * GET  /support/faq           Get FAQ entries (for search/display)
 *
 * The AI support bot:
 *   1. Searches FAQ database for matching answers
 *   2. If no FAQ match, generates a response using the inference stack
 *   3. Provides an escalation button that creates a support ticket + alerts
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { FallbackHandler, type Message } from '../../inference/fallback-handler.js';

// ---------------------------------------------------------------------------
// Shared fallback handler (singleton, same pattern as chat.ts)
// ---------------------------------------------------------------------------

let fallback: FallbackHandler | null = null;

function getFallback(): FallbackHandler {
  if (!fallback) {
    fallback = new FallbackHandler(
      { preferredProvider: process.env.GROQ_API_KEY ? 'groq' : undefined },
      {
        groq: {
          apiKey: process.env.GROQ_API_KEY,
          model: process.env.GROQ_MODEL ?? 'qwen/qwen3-32b',
        },
        openai: { apiKey: process.env.OPENAI_API_KEY },
        anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      },
    );
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Support system prompt
// ---------------------------------------------------------------------------

const SUPPORT_SYSTEM_PROMPT = `You are KIN Support — the official AI customer service assistant for the KIN AI companion platform.

Your role:
- Answer questions about KIN: companions, pricing, NFTs, skills, billing, and technical setup
- Be warm, concise, and helpful. Match the KIN brand: futuristic but approachable
- If you don't know an answer, say so and suggest the user escalate to human support
- Never make up features or pricing that don't exist
- When relevant, link to specific dashboard pages (e.g., /dashboard/billing, /dashboard/skills)

Key facts about KIN:
- 6 AI companions: Cipher (code), Mischief (social), Vortex (data), Forge (architecture), Aether (creative), Catalyst (habits)
- Each powered by a different frontier AI model
- Free tier: 1 companion, 50 msgs/day, powered by Groq Qwen 3 32B (zero cost)
- Hatchling: 1 premium companion, unlimited messages, Supermemory Pro, Telegram + WhatsApp + Voice, automation
- Elder: Up to 3 companions, priority support, advanced workflow automation, hands-on configuration help
- Hero: All 6 companions, API access, dedicated support, deep customization, multi-agent integrations
- NFTs on Solana — companions are mintable NFTs that carry skills when transferred
- Skills marketplace: built-in + custom (from GitHub repos, $4.99 review fee)
- Works on Telegram, Discord, WhatsApp, and web dashboard
- Local KIN: users can run Ollama locally, heartbeat monitors health

If the user seems frustrated, has a billing issue, or has a problem you can't solve, suggest they escalate to human support using the escalation button.`;

// ---------------------------------------------------------------------------
// FAQ search (simple keyword matching)
// ---------------------------------------------------------------------------

function searchFaq(
  db: any,
  query: string,
): Array<{ question: string; answer: string }> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return [];

  // Build a simple relevance query
  const conditions = words.map(() => `(LOWER(question) LIKE ? OR LOWER(answer) LIKE ?)`);
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

  const rows = db.prepare(`
    SELECT question, answer FROM support_faq
    WHERE ${conditions.join(' OR ')}
    LIMIT 3
  `).all(...params) as Array<{ question: string; answer: string }>;

  return rows;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatBody {
  message: string;
  chatId?: string;
}

interface EscalateBody {
  chatId: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// JSON Schemas for validation
const supportChatSchema = {
  type: 'object' as const,
  required: ['message'],
  properties: {
    message: { type: 'string' as const, minLength: 1, maxLength: 2000 },
    chatId: { type: 'string' as const, maxLength: 128 },
  },
  additionalProperties: false,
};

const escalateSchema = {
  type: 'object' as const,
  required: ['chatId'],
  properties: {
    chatId: { type: 'string' as const, minLength: 1, maxLength: 128 },
    reason: { type: 'string' as const, maxLength: 500 },
  },
  additionalProperties: false,
};

const supportChatRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /support/chat ──────────────────────────────────────────────────
  fastify.post<{ Body: ChatBody }>('/support/chat', {
    schema: { body: supportChatSchema },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { message, chatId: existingChatId } = request.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.badRequest('Message is required');
    }

    if (message.length > 2000) {
      return reply.badRequest('Message too long (max 2000 characters)');
    }

    // Resolve or create chat session
    let chatId = existingChatId;
    if (!chatId) {
      chatId = `sc-${crypto.randomUUID()}`;
      fastify.context.db.prepare(`
        INSERT INTO support_chats (id, user_id) VALUES (?, ?)
      `).run(chatId, userId);
    }

    // Store user message
    fastify.context.db.prepare(`
      INSERT INTO support_messages (id, chat_id, role, content)
      VALUES (?, ?, 'user', ?)
    `).run(`sm-${crypto.randomUUID()}`, chatId, message.trim());

    // Search FAQ for relevant answers
    const faqMatches = searchFaq(fastify.context.db, message);
    let faqContext = '';
    if (faqMatches.length > 0) {
      faqContext = '\n\nRelevant FAQ entries:\n' +
        faqMatches.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
    }

    // Load recent chat history
    const history = fastify.context.db.prepare(`
      SELECT role, content FROM support_messages
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(chatId) as Array<{ role: string; content: string }>;

    // Build messages for inference
    const messages: Message[] = [
      { role: 'system', content: SUPPORT_SYSTEM_PROMPT + faqContext },
      ...history.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Generate response via fallback handler (uses Groq free tier first)
    const handler = getFallback();
    let responseContent: string;

    try {
      const result = await handler.chat(messages, {
        maxTokens: 500,
        temperature: 0.7,
      });
      responseContent = result.content;
    } catch {
      responseContent = "I'm having trouble connecting right now. Please try again in a moment, or use the escalation button to reach our human support team.";
    }

    // Store assistant response
    fastify.context.db.prepare(`
      INSERT INTO support_messages (id, chat_id, role, content)
      VALUES (?, ?, 'assistant', ?)
    `).run(`sm-${crypto.randomUUID()}`, chatId, responseContent);

    return {
      response: responseContent,
      chatId,
      faqMatched: faqMatches.length > 0,
    };
  });

  // ── POST /support/chat/escalate ──────────────────────────────────────
  // Escalate to human customer service. Creates a support ticket and alerts.
  fastify.post<{ Body: EscalateBody }>('/support/chat/escalate', {
    schema: { body: escalateSchema },
  } as any, async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { chatId, reason } = request.body;

    // Mark chat as escalated
    if (chatId) {
      fastify.context.db.prepare(`
        UPDATE support_chats SET status = 'escalated', escalated_at = ? WHERE id = ?
      `).run(Date.now(), chatId);
    }

    // Get the user for context
    const user = fastify.context.db.prepare(
      `SELECT first_name, username, tier FROM users WHERE id = ?`,
    ).get(userId) as any;

    // Get recent chat messages for context
    let chatContext = '';
    if (chatId) {
      const recentMessages = fastify.context.db.prepare(`
        SELECT role, content FROM support_messages
        WHERE chat_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(chatId) as Array<{ role: string; content: string }>;

      chatContext = recentMessages
        .reverse()
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
    }

    // Create a support ticket
    const ticketId = `tkt-${crypto.randomUUID()}`;
    const subject = reason
      ? `Escalated: ${reason.slice(0, 100)}`
      : 'Escalated from AI support chat';

    fastify.context.db.prepare(`
      INSERT INTO support_tickets (id, user_id, subject, priority, status)
      VALUES (?, ?, ?, 'high', 'open')
    `).run(ticketId, userId, subject);

    // Alert via Slack webhook if configured
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      const userName = user?.first_name ?? user?.username ?? 'Unknown';
      const tier = user?.tier ?? 'free';
      const alertText = [
        `🚨 *Support Escalation*`,
        `User: ${userName} (${tier})`,
        reason ? `Reason: ${reason}` : '',
        chatContext ? `\nRecent chat:\n\`\`\`${chatContext.slice(0, 500)}\`\`\`` : '',
        `Ticket: ${ticketId}`,
      ]
        .filter(Boolean)
        .join('\n');

      fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: alertText }),
      }).catch(() => {}); // Fire and forget
    }

    // Alert via Telegram if configured
    const alertChatId = process.env.ALERT_CHAT_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (alertChatId && botToken) {
      const text = `🚨 Support escalation from ${user?.first_name ?? 'user'} (${user?.tier ?? 'free'})\n\nReason: ${reason ?? 'No reason given'}\nTicket: ${ticketId}`;
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: alertChatId, text, parse_mode: 'HTML' }),
      }).catch(() => {});
    }

    // Add a system message to the chat
    if (chatId) {
      fastify.context.db.prepare(`
        INSERT INTO support_messages (id, chat_id, role, content)
        VALUES (?, ?, 'assistant', ?)
      `).run(
        `sm-${crypto.randomUUID()}`,
        chatId,
        "I've escalated your request to our human support team. They'll reach out to you shortly. Your ticket ID is: " + ticketId,
      );
    }

    return {
      success: true,
      ticketId,
      message: 'Your request has been escalated to our support team.',
    };
  });

  // ── GET /support/chat/history ──────────────────────────────────────────
  fastify.get<{
    Querystring: { chatId?: string };
  }>('/support/chat/history', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { chatId } = request.query;

    if (chatId) {
      // Verify ownership
      const chat = fastify.context.db.prepare(
        `SELECT id, status FROM support_chats WHERE id = ? AND user_id = ?`,
      ).get(chatId, userId) as any;

      if (!chat) return { messages: [], chatId: null, status: null };

      const messages = fastify.context.db.prepare(`
        SELECT id, role, content, created_at FROM support_messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
      `).all(chatId) as any[];

      return {
        chatId,
        status: chat.status,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.created_at).toISOString(),
        })),
      };
    }

    // Return most recent active chat
    const latest = fastify.context.db.prepare(`
      SELECT id, status FROM support_chats
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get(userId) as any;

    if (!latest) return { messages: [], chatId: null, status: null };

    const messages = fastify.context.db.prepare(`
      SELECT id, role, content, created_at FROM support_messages
      WHERE chat_id = ?
      ORDER BY created_at ASC
    `).all(latest.id) as any[];

    return {
      chatId: latest.id,
      status: latest.status,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    };
  });

  // ── GET /support/faq ──────────────────────────────────────────────────
  fastify.get<{
    Querystring: { search?: string; category?: string };
  }>('/support/faq', async (request) => {
    const { search, category } = request.query;

    let sql = `SELECT id, question, answer, category FROM support_faq WHERE 1=1`;
    const params: any[] = [];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      sql += ` AND (LOWER(question) LIKE ? OR LOWER(answer) LIKE ?)`;
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like);
    }

    sql += ` ORDER BY category, question`;

    const rows = fastify.context.db.prepare(sql).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
    }));
  });
};

export default supportChatRoutes;
