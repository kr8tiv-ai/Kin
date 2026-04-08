/**
 * Chat Routes — Real-time AI chat for the web dashboard.
 *
 * POST /chat         Send a message and get a companion response
 * POST /chat/stream  SSE streaming endpoint (real token-by-token via provider API)
 * GET  /chat/status  Provider availability check
 * GET  /chat/export  GDPR data export (conversations + memories)
 *
 * Uses the two-brain supervisor architecture:
 *   Local Ollama → Groq (free) → Anthropic/OpenAI (paid fallback)
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { supervisedChat } from '../../inference/supervisor.js';
import { FallbackHandler, type Message } from '../../inference/fallback-handler.js';
import { buildCompanionPrompt, buildSoulPrompt } from '../../inference/companion-prompts.js';
import type { AgeBracket } from '../../inference/child-safety.js';
import { getCompanionConfig } from '../../companions/config.js';
import { scoreDrift, needsReinforcement, buildReinforcementPrefix } from '../../inference/soul-drift.js';
import { getProviderHealth } from '../../inference/providers/circuit-breaker.js';
import { getMetricsCollector } from '../../inference/metrics.js';
import { loadUserTier, enforceMessageLimit } from '../middleware/subscription-gate.js';
import { getCredentialManager } from '../../inference/kin-credits.js';
import type { FrontierProviderId } from '../../inference/providers/types.js';

// ============================================================================
// Types
// ============================================================================

interface ChatBody {
  companionId: string;
  message: string;
  conversationId?: string;
}

interface ChatMediaMeta {
  url: string;
  type: 'video' | 'audio';
  mimeType: string;
}

interface ChatResponse {
  response: string;
  conversationId: string;
  companionId: string;
  route: string;
  latencyMs: number;
  media?: ChatMediaMeta;
}

// -- Data export types (GDPR) -------------------------------------------------

interface ExportConversation {
  id: string;
  companionId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ExportMessage[];
}

interface ExportMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ExportMemory {
  id: string;
  companionId: string | null;
  category: string | null;
  content: string;
  createdAt: string;
}

interface DataExportResponse {
  user: { id: string; exportedAt: string };
  conversations: ExportConversation[];
  memories: ExportMemory[];
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

// ============================================================================
// Fastify JSON Schemas (validation + documentation)
// ============================================================================

const chatBodySchema = {
  type: 'object' as const,
  required: ['message'],
  properties: {
    companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
    message: { type: 'string' as const, minLength: 1, maxLength: 4000 },
    conversationId: { type: 'string' as const, maxLength: 128 },
  },
  additionalProperties: false,
};

// ── Privacy mode helper ───────────────────────────────────────────────────

/**
 * Read the user's privacy_mode from user_preferences.
 * Defaults to 'private' if no row exists or on any error (safe default).
 */
function loadPrivacyMode(db: any, userId: string): 'private' | 'shared' {
  try {
    const row = db.prepare(
      `SELECT privacy_mode FROM user_preferences WHERE user_id = ?`
    ).get(userId) as { privacy_mode: string } | undefined;
    if (row?.privacy_mode === 'shared') return 'shared';
    return 'private';
  } catch {
    return 'private';
  }
}

/**
 * Read the user's language preference from user_preferences.
 * Defaults to 'en' if no row exists or on any error.
 */
function loadLanguagePreference(db: any, userId: string): string {
  try {
    const row = db.prepare(
      `SELECT language FROM user_preferences WHERE user_id = ?`
    ).get(userId) as { language: string } | undefined;
    return row?.language ?? 'en';
  } catch {
    return 'en';
  }
}

// ── Media metadata extraction ─────────────────────────────────────────────

/** Known Replicate CDN URL pattern and common media extensions. */
const MEDIA_URL_PATTERN = /https?:\/\/[^\s)]+\.(mp4|webm|mp3|wav|ogg|m4a|mpeg)/i;

/**
 * Attempt to extract media metadata from response content.
 * Media skills embed Replicate CDN URLs in the assistant response text.
 * Returns structured metadata for frontend player rendering, or null.
 */
function extractMediaMeta(content: string): ChatMediaMeta | null {
  const match = content.match(MEDIA_URL_PATTERN);
  if (!match) return null;

  const url = match[0];
  const ext = (match[1] ?? 'mp4').toLowerCase();

  const videoExts = ['mp4', 'webm'];
  const type: 'video' | 'audio' = videoExts.includes(ext) ? 'video' : 'audio';

  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    mpeg: 'audio/mpeg',
  };

  return {
    url,
    type,
    mimeType: mimeMap[ext] ?? (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
  };
}

// ── Soul injection helper ─────────────────────────────────────────────────

interface SoulRow {
  traits: string;
  soul_values: string;
  style: string;
  custom_instructions: string | null;
  boundaries: string;
  anti_patterns: string;
  drift_score: number;
  custom_name: string | null;
}

function loadSoulConfig(db: any, userId: string, companionId: string) {
  const row = db.prepare(`
    SELECT traits, soul_values, style, custom_instructions, boundaries,
           anti_patterns, drift_score, custom_name
    FROM companion_souls
    WHERE user_id = ? AND companion_id = ?
  `).get(userId, companionId) as SoulRow | undefined;

  if (!row) return null;

  return {
    config: {
      customName: row.custom_name ?? undefined,
      traits: JSON.parse(row.traits),
      values: JSON.parse(row.soul_values),
      style: JSON.parse(row.style),
      customInstructions: row.custom_instructions ?? '',
      boundaries: JSON.parse(row.boundaries),
      antiPatterns: JSON.parse(row.anti_patterns),
    },
    driftScore: row.drift_score,
  };
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /chat ─────────────────────────────────────────────────────────
  fastify.post<{ Body: ChatBody }>('/chat', {
    schema: { body: chatBodySchema },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: [enforceMessageLimit()],
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string; ageBracket?: string }).userId;
    const ageBracket = ((request.user as { ageBracket?: string }).ageBracket ?? 'adult') as AgeBracket;
    const { companionId = 'cipher', message, conversationId: existingConvoId } = request.body;

    // Validate companion exists
    const config = getCompanionConfig(companionId);

    // Resolve or create conversation
    let conversationId = existingConvoId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      fastify.context.db.prepare(`
        INSERT INTO conversations (id, user_id, companion_id, title)
        VALUES (?, ?, ?, ?)
      `).run(conversationId, userId, companionId, message.slice(0, 80));
    }

    // Load recent messages for context
    const recentMessages = fastify.context.db.prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(conversationId) as Array<{ role: string; content: string }>;

    // Build message array: system prompt + history + new message
    // Memory injection + Supermemory storage handled centrally by supervisor
    const language = loadLanguagePreference(fastify.context.db, userId);
    const basePrompt = buildCompanionPrompt(companionId, {
      userName: userId,
      timeContext: new Date().toLocaleString('en-US', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }),
    }, { language });

    // Inject soul config if user has customized companion personality
    const soul = loadSoulConfig(fastify.context.db, userId, companionId);
    let systemPrompt = basePrompt;
    if (soul) {
      systemPrompt += '\n\n' + buildSoulPrompt(soul.config);
      if (needsReinforcement(soul.driftScore)) {
        systemPrompt = buildReinforcementPrefix(soul.config) + '\n\n' + systemPrompt;
      }
    }

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
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'user', ?)
    `).run(crypto.randomUUID(), conversationId, message.trim());

    // Generate response via supervisor (two-brain architecture)
    const privacyMode = loadPrivacyMode(fastify.context.db, userId);
    const userTier = loadUserTier(fastify.context.db, userId);

    // Resolve KIN Credits credential for PinkBrain-funded routing
    let kinCredential: { type: 'cli' | 'api'; credential: string; providerId: FrontierProviderId } | undefined;
    const credMgr = getCredentialManager();
    if (credMgr) {
      const cred = credMgr.getCredential(userId, config.frontierProvider);
      if (cred) {
        kinCredential = {
          type: cred.credentialType,
          credential: cred.credential,
          providerId: cred.providerId as FrontierProviderId,
        };
      }
    }

    const result = await supervisedChat(
      messages,
      companionId,
      getFallback(),
      {
        taskType: 'chat',
        userId,
        privacyMode,
        userTier,
        kinCredential,
        ageBracket,
        memoryFallback: async () => {
          const rows = fastify.context.db.prepare(`
            SELECT memory_type, content FROM memories
            WHERE user_id = ? ORDER BY last_accessed_at DESC LIMIT 20
          `).all(userId) as Array<{ memory_type: string; content: string }>;
          return rows.map(m => `[${m.memory_type}] ${m.content}`);
        },
      },
    );

    // Store assistant response
    fastify.context.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'assistant', ?)
    `).run(crypto.randomUUID(), conversationId, result.content);

    // Update conversation timestamp
    fastify.context.db.prepare(`
      UPDATE conversations SET updated_at = (strftime('%s','now')*1000) WHERE id = ?
    `).run(conversationId);

    // Drift scoring every 10 assistant messages
    if (soul) {
      const aCount = (fastify.context.db.prepare(
        `SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND role = 'assistant'`,
      ).get(conversationId) as { count: number }).count;

      if (aCount > 0 && aCount % 10 === 0) {
        const recent = fastify.context.db.prepare(
          `SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY timestamp DESC LIMIT 10`,
        ).all(conversationId) as Array<{ content: string }>;

        const newDrift = scoreDrift(soul.config, recent);
        fastify.context.db.prepare(
          `UPDATE companion_souls SET drift_score = ?, updated_at = (strftime('%s','now')*1000) WHERE user_id = ? AND companion_id = ?`,
        ).run(newDrift, userId, companionId);
      }
    }

    const response: ChatResponse = {
      response: result.content,
      conversationId,
      companionId,
      route: result.route,
      latencyMs: Math.round(result.latencyMs),
    };

    // Surface media metadata when the response contains a Replicate CDN URL.
    // Media skills embed URLs in the response text — extract and attach as
    // structured metadata so the frontend can render a player widget.
    const mediaMeta = extractMediaMeta(result.content);
    if (mediaMeta) {
      response.media = mediaMeta;
    }

    return response;
  });

  // ── POST /chat/stream ────────────────────────────────────────────────
  // Real SSE streaming — tokens are yielded from the provider API as they
  // are generated. Falls back to buffered word-by-word if streaming fails.
  fastify.post<{ Body: ChatBody }>('/chat/stream', {
    schema: { body: chatBodySchema },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: [enforceMessageLimit()],
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string; ageBracket?: string }).userId;
    const streamAgeBracket = ((request.user as { ageBracket?: string }).ageBracket ?? 'adult') as AgeBracket;
    const { companionId = 'cipher', message, conversationId: existingConvoId } = request.body;

    // Validate companion exists
    const config = getCompanionConfig(companionId);

    // Resolve or create conversation
    let conversationId = existingConvoId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      fastify.context.db.prepare(`
        INSERT INTO conversations (id, user_id, companion_id, title)
        VALUES (?, ?, ?, ?)
      `).run(conversationId, userId, companionId, message.slice(0, 80));
    }

    // Load recent messages for context
    const recentMessages = fastify.context.db.prepare(`
      SELECT role, content
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(conversationId) as Array<{ role: string; content: string }>;

    // Build message array: system prompt + history + new message
    const streamLanguage = loadLanguagePreference(fastify.context.db, userId);
    const basePrompt = buildCompanionPrompt(companionId, {
      userName: userId,
      timeContext: new Date().toLocaleString('en-US', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
      }),
    }, { language: streamLanguage });

    // Inject soul config if user has customized companion personality
    const soul = loadSoulConfig(fastify.context.db, userId, companionId);
    let systemPrompt = basePrompt;
    if (soul) {
      systemPrompt += '\n\n' + buildSoulPrompt(soul.config);
      if (needsReinforcement(soul.driftScore)) {
        systemPrompt = buildReinforcementPrefix(soul.config) + '\n\n' + systemPrompt;
      }
    }

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message.trim() },
    ];

    // Store user message
    fastify.context.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'user', ?)
    `).run(crypto.randomUUID(), conversationId, message.trim());

    // Set SSE headers
    const start = performance.now();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // Real token streaming via provider API (Groq/OpenAI/Anthropic)
      const handler = getFallback();
      let fullResponse = '';

      for await (const token of handler.chatStream(messages, {
        maxTokens: 4096,
        temperature: 0.8,
      })) {
        fullResponse += token;
        const chunk = JSON.stringify({ content: token, done: false });
        reply.raw.write(`data: ${chunk}\n\n`);
      }

      // Store assistant response
      if (fullResponse) {
        fastify.context.db.prepare(`
          INSERT INTO messages (id, conversation_id, role, content)
          VALUES (?, ?, 'assistant', ?)
        `).run(crypto.randomUUID(), conversationId, fullResponse);

        // Update conversation timestamp
        fastify.context.db.prepare(`
          UPDATE conversations SET updated_at = (strftime('%s','now')*1000) WHERE id = ?
        `).run(conversationId);

        // Drift scoring every 10 assistant messages
        if (soul) {
          const aCount = (fastify.context.db.prepare(
            `SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND role = 'assistant'`,
          ).get(conversationId) as { count: number }).count;

          if (aCount > 0 && aCount % 10 === 0) {
            const recent = fastify.context.db.prepare(
              `SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY timestamp DESC LIMIT 10`,
            ).all(conversationId) as Array<{ content: string }>;

            const newDrift = scoreDrift(soul.config, recent);
            fastify.context.db.prepare(
              `UPDATE companion_souls SET drift_score = ?, updated_at = (strftime('%s','now')*1000) WHERE user_id = ? AND companion_id = ?`,
            ).run(newDrift, userId, companionId);
          }
        }
      }

      // Send final SSE event with metadata (includes media if present)
      const streamMediaMeta = extractMediaMeta(fullResponse);
      const finalChunk = JSON.stringify({
        content: '',
        done: true,
        conversationId,
        companionId,
        route: 'streaming',
        latencyMs: Math.round(performance.now() - start),
        ...(streamMediaMeta ? { mediaUrl: streamMediaMeta.url, mediaType: streamMediaMeta.type, mediaMimeType: streamMediaMeta.mimeType } : {}),
      });
      reply.raw.write(`data: ${finalChunk}\n\n`);
    } catch (err) {
      // Streaming failed — fall back to non-streaming supervisor call
      try {
        const streamPrivacyMode = loadPrivacyMode(fastify.context.db, userId);
        const streamUserTier = loadUserTier(fastify.context.db, userId);

        // Resolve KIN Credits credential for PinkBrain-funded routing (streaming fallback)
        let streamKinCredential: { type: 'cli' | 'api'; credential: string; providerId: FrontierProviderId } | undefined;
        const streamCredMgr = getCredentialManager();
        if (streamCredMgr) {
          const cred = streamCredMgr.getCredential(userId, config.frontierProvider);
          if (cred) {
            streamKinCredential = {
              type: cred.credentialType,
              credential: cred.credential,
              providerId: cred.providerId as FrontierProviderId,
            };
          }
        }

        const result = await supervisedChat(
          messages,
          companionId,
          getFallback(),
          {
            taskType: 'chat',
            userId,
            privacyMode: streamPrivacyMode,
            userTier: streamUserTier,
            kinCredential: streamKinCredential,
            ageBracket: streamAgeBracket,
            memoryFallback: async () => {
              const rows = fastify.context.db.prepare(`
                SELECT memory_type, content FROM memories
                WHERE user_id = ? ORDER BY last_accessed_at DESC LIMIT 20
              `).all(userId) as Array<{ memory_type: string; content: string }>;
              return rows.map(m => `[${m.memory_type}] ${m.content}`);
            },
          },
        );

        // Store and stream the buffered response word-by-word
        fastify.context.db.prepare(`
          INSERT INTO messages (id, conversation_id, role, content)
          VALUES (?, ?, 'assistant', ?)
        `).run(crypto.randomUUID(), conversationId, result.content);

        fastify.context.db.prepare(`
          UPDATE conversations SET updated_at = (strftime('%s','now')*1000) WHERE id = ?
        `).run(conversationId);

        const words = result.content.split(/(\s+)/);
        for (const word of words) {
          if (word) {
            reply.raw.write(`data: ${JSON.stringify({ content: word, done: false })}\n\n`);
          }
        }

        const fallbackMediaMeta = extractMediaMeta(result.content);
        reply.raw.write(`data: ${JSON.stringify({
          content: '',
          done: true,
          conversationId,
          companionId,
          route: result.route,
          latencyMs: Math.round(performance.now() - start),
          ...(fallbackMediaMeta ? { mediaUrl: fallbackMediaMeta.url, mediaType: fallbackMediaMeta.type, mediaMimeType: fallbackMediaMeta.mimeType } : {}),
        })}\n\n`);
      } catch (innerErr) {
        reply.raw.write(`data: ${JSON.stringify({
          content: '',
          done: true,
          error: innerErr instanceof Error ? innerErr.message : 'Internal server error',
        })}\n\n`);
      }
    }

    reply.raw.end();
  });

  // ── GET /chat/status ───────────────────────────────────────────────────
  // Returns provider config, circuit breaker health, and metrics summary
  fastify.get('/chat/status', async () => {
    const handler = getFallback();
    const availability = await handler.isFallbackAvailable();

    // Circuit breaker health for each tracked provider
    const circuitBreakers = getProviderHealth().map(cb => ({
      providerId: cb.providerId,
      state: cb.state,
      failures: cb.failures,
      healthy: cb.healthy,
    }));

    // Aggregate metrics summary
    const collector = getMetricsCollector();
    const summary = collector.getMetrics();
    const metrics = {
      totalRequests: summary.totalRequests,
      successRate: summary.successRate,
      avgLatencyMs: Math.round(summary.avgLatencyMs),
    };

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
      circuitBreakers,
      metrics,
    };
  });

  // ── GET /chat/export ──────────────────────────────────────────────────
  // GDPR data export — returns all conversations, messages, and memories
  // belonging to the authenticated user as a single JSON payload.
  fastify.get('/chat/export', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    // Fetch all conversations for the user
    const rawConversations = fastify.context.db.prepare(`
      SELECT id, companion_id, title, created_at, updated_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId) as Array<{
      id: string;
      companion_id: string;
      title: string | null;
      created_at: number;
      updated_at: number;
    }>;

    // Fetch messages for each conversation
    const conversations: ExportConversation[] = rawConversations.map((c) => {
      const rawMessages = fastify.context.db.prepare(`
        SELECT id, role, content, timestamp
        FROM messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `).all(c.id) as Array<{
        id: string;
        role: string;
        content: string;
        timestamp: number;
      }>;

      return {
        id: c.id,
        companionId: c.companion_id,
        title: c.title,
        createdAt: new Date(c.created_at).toISOString(),
        updatedAt: new Date(c.updated_at).toISOString(),
        messages: rawMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.timestamp).toISOString(),
        })),
      };
    });

    // Fetch all memories for the user
    const rawMemories = fastify.context.db.prepare(`
      SELECT id, companion_id, memory_type, content, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at ASC
    `).all(userId) as Array<{
      id: string;
      companion_id: string | null;
      memory_type: string | null;
      content: string;
      created_at: number;
    }>;

    const memories: ExportMemory[] = rawMemories.map((m) => ({
      id: m.id,
      companionId: m.companion_id,
      category: m.memory_type,
      content: m.content,
      createdAt: new Date(m.created_at).toISOString(),
    }));

    const response: DataExportResponse = {
      user: {
        id: userId,
        exportedAt: new Date().toISOString(),
      },
      conversations,
      memories,
    };

    return response;
  });
};

export default chatRoutes;
