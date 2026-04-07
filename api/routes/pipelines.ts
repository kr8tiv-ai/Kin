/**
 * Pipeline Routes — Workflow pipeline CRUD, manual run, and run history.
 *
 * JWT-protected endpoints for managing multi-step workflow pipelines.
 * Follows scheduler-routes.ts patterns for type safety, ownership enforcement,
 * and camelCase responses.
 *
 * @module api/routes/pipelines
 */

import { FastifyPluginAsync } from 'fastify';
import type { PipelineManager, CreatePipelineOpts, PipelineStep } from '../../inference/pipeline-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineRouteOpts {
  pipelineManager: PipelineManager;
}

interface CreatePipelineBody {
  companionId: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  triggerType?: 'manual' | 'cron';
  cronExpression?: string;
  timezone?: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
}

interface PipelineIdParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Protected CRUD + run routes (require JWT)
// ---------------------------------------------------------------------------

const pipelineRoutes: FastifyPluginAsync<PipelineRouteOpts> = async (fastify, opts) => {
  const { pipelineManager } = opts;

  // POST /pipelines — create a new pipeline
  fastify.post<{ Body: CreatePipelineBody }>('/pipelines', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const body = request.body ?? {} as CreatePipelineBody;

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      reply.status(400);
      return { error: 'Missing required field: name' };
    }
    if (!body.companionId) {
      reply.status(400);
      return { error: 'Missing required field: companionId' };
    }
    if (!body.deliveryChannel) {
      reply.status(400);
      return { error: 'Missing required field: deliveryChannel' };
    }
    if (!body.deliveryRecipientId) {
      reply.status(400);
      return { error: 'Missing required field: deliveryRecipientId' };
    }
    if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
      reply.status(400);
      return { error: 'Missing required field: steps (must be a non-empty array)' };
    }

    try {
      const pipeline = pipelineManager.createPipeline({
        userId,
        companionId: body.companionId,
        name: body.name.trim(),
        description: body.description,
        steps: body.steps,
        triggerType: body.triggerType,
        cronExpression: body.cronExpression,
        timezone: body.timezone,
        deliveryChannel: body.deliveryChannel,
        deliveryRecipientId: body.deliveryRecipientId,
      });
      reply.status(201);
      return { pipeline };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(400);
      return { error: msg };
    }
  });

  // GET /pipelines — list all pipelines for the authenticated user
  fastify.get('/pipelines', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const pipelines = pipelineManager.listPipelines(userId);
    return { pipelines };
  });

  // GET /pipelines/:id — get a single pipeline with run history
  fastify.get<{ Params: PipelineIdParams }>('/pipelines/:id', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const pipeline = pipelineManager.getPipeline(id);
    if (!pipeline) {
      reply.status(404);
      return { error: 'Pipeline not found' };
    }

    // Ownership enforcement
    if (pipeline.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this pipeline' };
    }

    const runs = pipelineManager.listRuns(id);
    return { pipeline, runs };
  });

  // DELETE /pipelines/:id — delete a pipeline (ownership enforced)
  fastify.delete<{ Params: PipelineIdParams }>('/pipelines/:id', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const pipeline = pipelineManager.getPipeline(id);
    if (!pipeline) {
      reply.status(404);
      return { error: 'Pipeline not found' };
    }

    if (pipeline.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this pipeline' };
    }

    pipelineManager.deletePipeline(id, userId);
    reply.status(204);
    return;
  });

  // POST /pipelines/:id/run — manual trigger (async, returns 202)
  fastify.post<{ Params: PipelineIdParams }>('/pipelines/:id/run', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const pipeline = pipelineManager.getPipeline(id);
    if (!pipeline) {
      reply.status(404);
      return { error: 'Pipeline not found' };
    }

    if (pipeline.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this pipeline' };
    }

    // Fire-and-forget execution — return 202 immediately
    pipelineManager.executePipeline(id).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline-routes] Manual run error for pipeline ${id}: ${msg}`);
    });

    reply.status(202);
    return { accepted: true, pipelineId: id };
  });

  // GET /pipelines/:id/runs — execution history for a pipeline
  fastify.get<{ Params: PipelineIdParams }>('/pipelines/:id/runs', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const pipeline = pipelineManager.getPipeline(id);
    if (!pipeline) {
      reply.status(404);
      return { error: 'Pipeline not found' };
    }

    if (pipeline.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this pipeline' };
    }

    const runs = pipelineManager.listRuns(id);
    return { runs };
  });
};

export default pipelineRoutes;
