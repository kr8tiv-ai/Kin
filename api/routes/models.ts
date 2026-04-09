/**
 * Model Management Routes — Admin endpoints for local Ollama model lifecycle.
 *
 * GET    /models/list    List locally installed Ollama models
 * POST   /models/pull    Pull (download) a model from the Ollama registry
 * DELETE /models/delete  Remove a model from the local Ollama instance
 * GET    /models/status  Check Ollama service health + version
 *
 * All routes require authentication. Pull and delete require admin privileges
 * (hero tier or ADMIN_USER_IDS env var). List and status are available
 * to all authenticated users so the dashboard can display local model info.
 *
 * These routes work WITHOUT any API keys — they talk directly to the local
 * Ollama HTTP API on the user's machine.
 */

import { FastifyPluginAsync } from 'fastify';
import { getOllamaClient } from '../../inference/local-llm.js';
import { requireAdmin } from '../lib/admin.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PullBody {
  model: string;
}

interface DeleteBody {
  model: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const modelRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /models/list ──────────────────────────────────────────────────
  // List all locally installed Ollama models. Available to all authed users.
  fastify.get('/models/list', async (_request, reply) => {
    const client = getOllamaClient();

    try {
      const models = await client.listModels();
      return {
        models: models.map((m) => ({
          name: m.name,
          size: m.size,
          sizeHuman: formatBytes(m.size),
          modifiedAt: m.modified_at,
          digest: m.digest,
          details: m.details ?? null,
        })),
        count: models.length,
      };
    } catch (err) {
      reply.status(503);
      return {
        error: 'Ollama is not reachable. Ensure it is running locally.',
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── POST /models/pull ─────────────────────────────────────────────────
  // Pull (download) a model. Admin only — models can be large.
  fastify.post<{ Body: PullBody }>('/models/pull', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { model } = request.body ?? {};

    if (!model?.trim()) {
      reply.status(400);
      return { error: 'model name is required' };
    }

    const client = getOllamaClient();

    try {
      // Check Ollama is reachable first
      const health = await client.checkHealth();
      if (!health.healthy) {
        reply.status(503);
        return { error: 'Ollama is not reachable', details: health.error };
      }

      // Start pull (blocking — streams progress internally)
      const progressUpdates: string[] = [];
      await client.pullModel(model.trim(), (status) => {
        progressUpdates.push(status);
      });

      return {
        success: true,
        model: model.trim(),
        message: `Model "${model.trim()}" pulled successfully`,
        progressSteps: progressUpdates.length,
      };
    } catch (err) {
      reply.status(500);
      return {
        error: `Failed to pull model "${model.trim()}"`,
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── DELETE /models/delete ─────────────────────────────────────────────
  // Delete a model from local storage. Admin only.
  fastify.post<{ Body: DeleteBody }>('/models/delete', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { model } = request.body ?? {};

    if (!model?.trim()) {
      reply.status(400);
      return { error: 'model name is required' };
    }

    const client = getOllamaClient();

    try {
      await client.deleteModel(model.trim());

      return {
        success: true,
        model: model.trim(),
        message: `Model "${model.trim()}" deleted successfully`,
      };
    } catch (err) {
      const status = (err as any).status === 404 ? 404 : 500;
      reply.status(status);
      return {
        error: status === 404
          ? `Model "${model.trim()}" not found`
          : `Failed to delete model "${model.trim()}"`,
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ── GET /models/status ────────────────────────────────────────────────
  // Check Ollama health + version. Available to all authed users.
  fastify.get('/models/status', async () => {
    const client = getOllamaClient();
    const health = await client.checkHealth();

    return {
      ollamaAvailable: health.healthy,
      version: health.version ?? null,
      latencyMs: Math.round(health.latencyMs),
      error: health.error ?? null,
    };
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default modelRoutes;
