import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { getWizardStatus, getCompletionEligibility } from '../lib/setup-wizard-status.js';

const setupWizardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/setup-wizard/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const status = getWizardStatus(userId, fastify.context.db);
    return status;
  });

  fastify.post('/setup-wizard/complete', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    
    const status = getWizardStatus(userId, fastify.context.db);
    const eligibility = getCompletionEligibility(status);
    
    if (!eligibility.eligible) {
      reply.status(400);
      return { success: false, error: eligibility.reason };
    }

    try {
      fastify.context.db.prepare(`
        UPDATE user_preferences 
        SET setup_wizard_complete = 1, updated_at = ?
        WHERE user_id = ?
      `).run(Date.now(), userId);
      
      return { success: true };
    } catch (err) {
      fastify.log.error({ err }, 'Failed to mark wizard complete');
      reply.status(500);
      return { success: false, error: 'Failed to save completion state' };
    }
  });
};

export default setupWizardRoutes;
