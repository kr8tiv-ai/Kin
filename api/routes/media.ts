/**
 * Media Routes — Video and music generation via Replicate API.
 *
 * POST /media/generate   Generate video or audio, returns result on completion
 * GET  /media/:id/status  Query generation status by tracking ID
 * GET  /media/:id         Redirect to CDN URL (completed) or return status
 *
 * All endpoints are JWT-protected (registered inside the protected scope).
 * Uses the MediaManager singleton from inference/media-manager.ts.
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getMediaManager } from '../../inference/media-manager.js';

// ============================================================================
// Types
// ============================================================================

interface GenerateBody {
  type: 'video' | 'audio';
  prompt: string;
  companionId?: string;
}

// ============================================================================
// JSON Schemas
// ============================================================================

const generateBodySchema = {
  type: 'object' as const,
  required: ['type', 'prompt'],
  properties: {
    type: { type: 'string' as const, enum: ['video', 'audio'] },
    prompt: { type: 'string' as const, minLength: 1, maxLength: 2000 },
    companionId: { type: 'string' as const, maxLength: 64 },
  },
  additionalProperties: false,
};

const idParamSchema = {
  type: 'object' as const,
  required: ['id'],
  properties: {
    id: { type: 'string' as const, minLength: 1, maxLength: 128 },
  },
};

// ============================================================================
// Route Plugin
// ============================================================================

const mediaRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /media/generate ───────────────────────────────────────────────
  // Generates video or audio via Replicate. Returns the generation result
  // once complete (id, status, url, mimeType) or an error.
  // Rate limited to 10 requests per minute to prevent abuse.
  fastify.post<{ Body: GenerateBody }>('/media/generate', {
    schema: { body: generateBodySchema },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { type, prompt } = request.body;

    const manager = getMediaManager();

    try {
      const result = type === 'video'
        ? await manager.generateVideo(prompt, userId)
        : await manager.generateMusic(prompt, userId);

      if (result.status === 'completed') {
        return {
          id: result.result.id,
          status: 'completed',
          url: result.result.url,
          mimeType: result.result.mimeType,
          durationMs: result.result.durationMs,
        };
      }

      // Error / rate-limited / timeout
      const statusCode = result.status === 'rate-limited' ? 429 : 500;
      reply.status(statusCode);
      return {
        status: result.status,
        error: result.error,
      };
    } catch (err) {
      // MediaManager should never throw — but guard against unexpected errors
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error(`[media] Unexpected generation error: ${msg}`);
      reply.status(500);
      return { status: 'error', error: 'Internal generation error' };
    }
  });

  // ── GET /media/:id/status ──────────────────────────────────────────────
  // Returns the current generation status for a tracking ID.
  fastify.get<{ Params: { id: string } }>('/media/:id/status', {
    schema: { params: idParamSchema },
  }, async (request, reply: FastifyReply) => {
    const { id } = request.params;
    const record = getMediaManager().getGenerationStatus(id);

    if (!record) {
      reply.status(404);
      return { error: 'Generation not found' };
    }

    const response: Record<string, unknown> = {
      id: record.id,
      status: record.status,
    };

    if (record.result) {
      response.url = record.result.url;
      response.mimeType = record.result.mimeType;
    }

    if (record.error) {
      response.error = record.error;
    }

    return response;
  });

  // ── GET /media/:id ────────────────────────────────────────────────────
  // Completed → 302 redirect to CDN URL.
  // Generating → 202 with status.
  // Failed / not found → 404 with error.
  fastify.get<{ Params: { id: string } }>('/media/:id', {
    schema: { params: idParamSchema },
  }, async (request, reply: FastifyReply) => {
    const { id } = request.params;
    const record = getMediaManager().getGenerationStatus(id);

    if (!record) {
      reply.status(404);
      return { error: 'Generation not found' };
    }

    switch (record.status) {
      case 'completed':
        if (record.result?.url) {
          reply.status(302);
          return reply.redirect(record.result.url);
        }
        reply.status(500);
        return { error: 'Generation completed but no URL available' };

      case 'pending':
      case 'running':
        reply.status(202);
        return {
          id: record.id,
          status: record.status,
          message: 'Generation in progress',
        };

      case 'error':
      case 'generation-timeout':
        reply.status(404);
        return {
          id: record.id,
          status: record.status,
          error: record.error ?? 'Generation failed',
        };

      case 'rate-limited':
        reply.status(429);
        return {
          id: record.id,
          status: record.status,
          error: record.error ?? 'Rate limited',
        };

      default:
        reply.status(500);
        return { error: 'Unknown generation status' };
    }
  });
};

export default mediaRoutes;
