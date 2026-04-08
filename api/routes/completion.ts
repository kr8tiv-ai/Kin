import { FastifyPluginAsync } from 'fastify';
import { getCompletionStatus } from '../lib/completion-status.js';

const completionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/completion/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const status = await getCompletionStatus(userId, fastify.context.db);
    return status;
  });

  fastify.post('/completion/complete', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;

    // Check if already marked complete in DB
    const prefs = fastify.context.db.prepare(
      'SELECT deployment_complete FROM user_preferences WHERE user_id = ?'
    ).get(userId) as { deployment_complete?: number } | undefined;

    if (prefs?.deployment_complete === 1) {
      reply.status(400);
      return { success: false, error: 'Already complete' };
    }

    // Check gate readiness using the corrected formula
    const status = await getCompletionStatus(userId, fastify.context.db);
    const blockingGate = status.gates.find(g => !g.ready);
    if (blockingGate) {
      reply.status(400);
      return {
        success: false,
        error: `${blockingGate.label} must be ready before completing`,
        blockingGate: blockingGate.id,
      };
    }

    try {
      fastify.context.db.prepare(`
        UPDATE user_preferences
        SET deployment_complete = 1, updated_at = ?
        WHERE user_id = ?
      `).run(Date.now(), userId);

      return { success: true };
    } catch (err) {
      fastify.log.error({ err }, 'Failed to mark deployment complete');
      reply.status(500);
      return { success: false, error: 'Failed to save completion state' };
    }
  });
};

export default completionRoutes;
