import { FastifyPluginAsync } from 'fastify';
import { getCompletionStatus, getCompletionEligibility } from '../lib/completion-status.js';

const completionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/completion/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const status = getCompletionStatus(userId, fastify.context.db);
    return status;
  });

  fastify.post('/completion/complete', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    
    const eligibility = getCompletionEligibility(userId, fastify.context.db);
    
    if (!eligibility.eligible) {
      reply.status(400);
      return { success: false, error: eligibility.reason };
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
