/**
 * Scheduler Routes — Job management CRUD and webhook ingestion.
 *
 * Two Fastify plugins are exported:
 * - `schedulerRoutes` (default) — JWT-protected CRUD for scheduled_jobs
 * - `webhookRoutes` — Public webhook ingestion with HMAC-SHA256 verification
 *
 * Both plugins receive `schedulerManager` and `channelDelivery` via options.
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import type { SchedulerManager, CreateJobOpts } from '../../inference/scheduler-manager.js';
import type { ChannelDelivery } from '../../inference/channel-delivery.js';
import type { KinSkill, SkillContext } from '../../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchedulerRouteOpts {
  schedulerManager: SchedulerManager;
}

export interface WebhookRouteOpts {
  channelDelivery: ChannelDelivery;
  skillResolver: (name: string) => KinSkill | undefined;
}

interface CreateJobBody {
  companionId: string;
  skillName: string;
  skillArgs?: Record<string, unknown>;
  cronExpression: string;
  timezone?: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  maxRuns?: number;
}

interface JobIdParams {
  id: string;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 verification
// ---------------------------------------------------------------------------

function verifyHmac(rawBody: Buffer | string, signature: string, secret: string): boolean {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8'))
      .digest('hex');

    if (signature.length !== expected.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Protected CRUD routes (require JWT)
// ---------------------------------------------------------------------------

const schedulerRoutes: FastifyPluginAsync<SchedulerRouteOpts> = async (fastify, opts) => {
  const { schedulerManager } = opts;

  // GET /scheduler/jobs — list all jobs for the authenticated user
  fastify.get('/scheduler/jobs', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const jobs = schedulerManager.listJobs(userId);
    return { jobs };
  });

  // POST /scheduler/jobs — create a new scheduled job
  fastify.post<{ Body: CreateJobBody }>('/scheduler/jobs', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const body = request.body ?? {} as CreateJobBody;

    // Validate required fields
    const required = ['companionId', 'skillName', 'cronExpression', 'deliveryChannel', 'deliveryRecipientId'] as const;
    for (const field of required) {
      if (!body[field]) {
        reply.status(400);
        return { error: `Missing required field: ${field}` };
      }
    }

    try {
      const job = schedulerManager.createJob({
        userId,
        companionId: body.companionId,
        skillName: body.skillName,
        skillArgs: body.skillArgs,
        cronExpression: body.cronExpression,
        timezone: body.timezone,
        deliveryChannel: body.deliveryChannel,
        deliveryRecipientId: body.deliveryRecipientId,
        maxRuns: body.maxRuns ?? null,
      });
      reply.status(201);
      return { job };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(400);
      return { error: msg };
    }
  });

  // DELETE /scheduler/jobs/:id — delete a job (ownership enforced)
  fastify.delete<{ Params: JobIdParams }>('/scheduler/jobs/:id', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const job = schedulerManager.getJob(id);
    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    if (job.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this job' };
    }

    schedulerManager.deleteJob(id);
    reply.status(204);
    return;
  });

  // POST /scheduler/jobs/:id/pause — pause a job (ownership enforced)
  fastify.post<{ Params: JobIdParams }>('/scheduler/jobs/:id/pause', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const job = schedulerManager.getJob(id);
    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    if (job.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this job' };
    }

    const updated = schedulerManager.pauseJob(id);
    return { job: updated };
  });

  // POST /scheduler/jobs/:id/resume — resume a paused job (ownership enforced)
  fastify.post<{ Params: JobIdParams }>('/scheduler/jobs/:id/resume', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const job = schedulerManager.getJob(id);
    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    if (job.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this job' };
    }

    const updated = schedulerManager.resumeJob(id);
    return { job: updated };
  });
};

// ---------------------------------------------------------------------------
// Public webhook route (HMAC-SHA256, no JWT)
// ---------------------------------------------------------------------------

export const webhookRoutes: FastifyPluginAsync<WebhookRouteOpts> = async (fastify, opts) => {
  const { channelDelivery, skillResolver } = opts;

  // Parse application/json as raw buffer for HMAC verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // POST /webhooks/:hookId — ingest external webhook
  fastify.post<{ Params: { hookId: string } }>('/webhooks/:hookId', async (request, reply) => {
    const { hookId } = request.params;
    const db = fastify.context.db;

    // Look up webhook trigger
    const row = db.prepare(
      'SELECT * FROM webhook_triggers WHERE id = ? AND is_active = 1',
    ).get(hookId) as any;

    if (!row) {
      reply.status(404);
      return { error: 'Webhook not found or inactive' };
    }

    // Get raw body as Buffer
    const rawBody: Buffer = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(
          typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body),
        );

    // Verify HMAC-SHA256 signature
    const signature = request.headers['x-webhook-signature'] as string | undefined;
    if (!signature) {
      reply.status(401);
      return { error: 'Missing x-webhook-signature header' };
    }

    if (!verifyHmac(rawBody, signature, row.hmac_secret)) {
      reply.status(401);
      return { error: 'Invalid webhook signature' };
    }

    // Parse request body for any extra context
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      // empty payload is fine
    }

    // Execute skill — fire-and-forget error handling
    const skill = skillResolver(row.skill_name);
    if (!skill) {
      // Update error on trigger row, still return 200 (accepted)
      db.prepare(
        'UPDATE webhook_triggers SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?',
      ).run(Date.now(), hookId);
      request.log.error({ hookId, skillName: row.skill_name }, 'webhook skill not found');
      return { accepted: true, error: `Skill "${row.skill_name}" not found` };
    }

    let skillArgs: Record<string, unknown> = {};
    try {
      skillArgs = row.skill_args ? JSON.parse(row.skill_args) : {};
    } catch {
      // use empty
    }

    const ctx: SkillContext = {
      message: typeof skillArgs.message === 'string' ? skillArgs.message : row.skill_name,
      userId: row.user_id,
      userName: 'webhook',
      conversationHistory: [],
      env: process.env as Record<string, string | undefined>,
    };

    try {
      const result = await skill.execute(ctx);

      // Deliver result
      try {
        await channelDelivery.send(
          row.delivery_channel,
          row.delivery_recipient_id,
          result.content,
        );
      } catch (deliveryErr) {
        const msg = deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
        request.log.error({ hookId, err: msg }, 'webhook delivery error');
      }
    } catch (execErr) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      request.log.error({ hookId, err: msg }, 'webhook skill execution error');
    }

    // Update trigger stats
    db.prepare(
      'UPDATE webhook_triggers SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?',
    ).run(Date.now(), hookId);

    return { accepted: true };
  });
};

export default schedulerRoutes;
