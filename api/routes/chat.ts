/**
 * Chat Routes — Real-time AI chat for the web dashboard.
 *
 * POST /chat         Send a message and get a companion response
 * POST /chat/stream  (future) SSE streaming endpoint
 *
 * Uses the two-brain supervisor architecture:
 *   Local Ollama → Groq (free) → Anthropic/OpenAI (paid fallback)
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { supervisedChat } from '../../inference/supervisor.js';
import { FallbackHandler, type Message } from '../../inference/fallback-handler.js';
import { buildCompanionPrompt } from '../../inference/companion-prompts.js';
import { getCompanionConfig } from '../../companions/config.js';

// ============================================================================
// Types
// ============================================================================

interface ChatBody {
  companionId: string;
  message: string;
  conversationId?: string;
}

interface ChatResponse {
  response: string;
  conversationId: string;
  companionId: string;
  route: string;
  latencyMs: number;
}

// ============================================================================
// Shared fallback handler (singleton per process)
// ============================================================================

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
        openai: {
          apiKey: process.env.OPENAI_API_KEY,
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      },
    );
  }
  return fallback;
}

// ============================================================================
// Routes
// ============================================================================

const chatRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /chat ─────────────────────────────────────────────────────────
  fastify.post<{ Body: ChatBody }>('/chat', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId = 'cipher', message, conversationId: existingConvoId } = request.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.badRequest('Message is required');
    }

    if (message.length > 4000) {
      return reply.badRequest('Message too long (max 4000 characters)');
    }

    // Validate companion exists
    const config = getCompanionConfig(companionId);

    // Resolve or create conversation
    let conversationId = existingConvoId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      fastify.context.db.prepare(`
        INSERT INTO conversations (id, user_id, companion_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(conversationId, userId, companionId, message.slice(0, 80));
    }

    // Load recent messages for context
    const recentMessages = fastify.context.db.prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(conversationId) as Array<{ role: string; content: string }>;

    // Load user memories for context injection
    const memories = fastify.context.db.prepare(`
      SELECT category, content FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(userId) as Array<{ category: string; content: string }>;

    const memoryBlock = memories.length > 0
      ? `\n\nYou remember these things about the user:\n${memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')}`
      : '';

    // Build message array: system prompt + memories + history + new message
    const systemPrompt = buildCompanionPrompt(companionId, {
      userName: userId,
      timeContext: new Date().toLocaleString('en-US', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }),
    }) + memoryBlock;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      // History in chronological order (reverse the DESC query)
      ...recentMessages.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ];

    // Store user message
    fastify.context.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, 'user', ?, datetime('now'))
    `).run(crypto.randomUUID(), conversationId, message.trim());

    // Generate response via supervisor (two-brain architecture)
    const result = await supervisedChat(
      messages,
      companionId,
      getFallback(),
    );

    // Store assistant response
    fastify.context.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, 'assistant', ?, datetime('now'))
    `).run(crypto.randomUUID(), conversationId, result.content);

    // Update conversation timestamp
    fastify.context.db.prepare(`
      UPDATE conversations SET updated_at = datetime('now') WHERE id = ?
    `).run(conversationId);

    const response: ChatResponse = {
      response: result.content,
      conversationId,
      companionId,
      route: result.route,
      latencyMs: Math.round(result.latencyMs),
    };

    return response;
  });

  // ── GET /chat/status ───────────────────────────────────────────────────
  // Returns which LLM providers are configured and available
  fastify.get('/chat/status', async () => {
    const handler = getFallback();
    const availability = await handler.isFallbackAvailable();

    return {
      providers: {
        groq: { configured: availability.groq, model: process.env.GROQ_MODEL ?? 'qwen/qwen3-32b' },
        openai: { configured: availability.openai },
        anthropic: { configured: availability.anthropic },
      },
      preferredProvider: process.env.GROQ_API_KEY ? 'groq'
        : process.env.ANTHROPIC_API_KEY ? 'anthropic'
        : process.env.OPENAI_API_KEY ? 'openai'
        : 'none',
    };
  });
};

export default chatRoutes;
