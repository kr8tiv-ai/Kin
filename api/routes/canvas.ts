/**
 * Canvas Routes — Live Canvas real-time web design studio.
 *
 * POST /canvas/generate  SSE endpoint that streams generated HTML from Cipher
 *
 * Uses the FallbackHandler.chatStream() async generator for real token
 * streaming, with structured SSE events for the frontend preview renderer.
 *
 * @module api/routes/canvas
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { FallbackHandler, type Message } from '../../inference/fallback-handler.js';
import { buildCanvasSystemPrompt } from '../../inference/canvas-prompts.js';

// ============================================================================
// Types
// ============================================================================

interface GenerateBody {
  projectId: string;
  prompt: string;
  existingCode?: string;
}

// ============================================================================
// Shared fallback handler (canvas-specific, higher token limit)
// ============================================================================

let canvasFallback: FallbackHandler | null = null;

function getCanvasFallback(): FallbackHandler {
  if (!canvasFallback) {
    canvasFallback = new FallbackHandler(
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
  return canvasFallback;
}

// ============================================================================
// JSON Schema for request validation
// ============================================================================

const generateBodySchema = {
  type: 'object' as const,
  required: ['projectId', 'prompt'],
  properties: {
    projectId: { type: 'string' as const, minLength: 1, maxLength: 128 },
    prompt: { type: 'string' as const, minLength: 1, maxLength: 8000 },
    existingCode: { type: 'string' as const, maxLength: 500_000 },
  },
  additionalProperties: false,
};

// ============================================================================
// Plugin
// ============================================================================

const canvasRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /canvas/generate ──────────────────────────────────────────────
  // SSE streaming endpoint for canvas HTML generation.
  //
  // Event types:
  //   { type: 'code_chunk', content: string }    — per-token fragment
  //   { type: 'preview_ready', html: string }    — full accumulated HTML on completion
  //   { type: 'done', projectId: string }        — terminal event
  //   { type: 'error', message: string }         — error event
  fastify.post<{ Body: GenerateBody }>('/canvas/generate', {
    schema: { body: generateBodySchema },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { projectId, prompt, existingCode } = request.body;

    // ── Validate project ownership ─────────────────────────────────────
    const project = fastify.context.db.prepare(
      `SELECT id, files FROM projects WHERE id = ? AND user_id = ?`,
    ).get(projectId, userId) as { id: string; files: string | null } | undefined;

    if (!project) {
      reply.status(404);
      return { error: 'Project not found' };
    }

    // ── Build messages ─────────────────────────────────────────────────
    // If existingCode isn't provided but the project already has an index.html,
    // use that as the refinement context.
    let codeContext = existingCode;
    if (!codeContext && project.files) {
      try {
        const files = JSON.parse(project.files);
        if (typeof files === 'object' && files !== null && typeof files['index.html'] === 'string') {
          codeContext = files['index.html'];
        }
      } catch { /* corrupted files JSON — ignore, treat as fresh generation */ }
    }

    const systemPrompt = buildCanvasSystemPrompt({
      userName: userId,
      existingCode: codeContext,
    });

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt.trim() },
    ];

    // ── SSE headers ────────────────────────────────────────────────────
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const handler = getCanvasFallback();
      let fullHtml = '';

      for await (const token of handler.chatStream(messages, {
        maxTokens: 8192,
        temperature: 0.7,
      })) {
        fullHtml += token;
        sendEvent({ type: 'code_chunk', content: token });
      }

      // ── Post-process: strip markdown fences if the model wraps output ──
      fullHtml = stripMarkdownFences(fullHtml);

      // ── Send full HTML preview ─────────────────────────────────────────
      sendEvent({ type: 'preview_ready', html: fullHtml });

      // ── Persist to project ─────────────────────────────────────────────
      // Merge with existing files (if any) — only overwrite index.html
      let existingFiles: Record<string, unknown> = {};
      if (project.files) {
        try {
          const parsed = JSON.parse(project.files);
          if (typeof parsed === 'object' && parsed !== null) {
            existingFiles = parsed;
          }
        } catch { /* start fresh */ }
      }
      existingFiles['index.html'] = fullHtml;

      fastify.context.db.prepare(
        `UPDATE projects SET files = ?, status = 'preview', updated_at = strftime('%s', 'now') * 1000 WHERE id = ? AND user_id = ?`,
      ).run(JSON.stringify(existingFiles), projectId, userId);

      // ── Terminal event ─────────────────────────────────────────────────
      sendEvent({ type: 'done', projectId });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      fastify.log.error({ err, projectId, userId }, '[canvas] Generation error');
      sendEvent({ type: 'error', message });
    }

    reply.raw.end();
  });
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip markdown code fences that some models wrap around HTML output.
 * Handles ```html ... ``` and ``` ... ``` patterns.
 */
function stripMarkdownFences(html: string): string {
  let trimmed = html.trim();

  // Remove leading ```html or ``` with optional language tag
  if (/^```(?:html)?\s*\n/.test(trimmed)) {
    trimmed = trimmed.replace(/^```(?:html)?\s*\n/, '');
  }

  // Remove trailing ```
  if (/\n```\s*$/.test(trimmed)) {
    trimmed = trimmed.replace(/\n```\s*$/, '');
  }

  return trimmed;
}

// ============================================================================
// Exports
// ============================================================================

export default canvasRoutes;
