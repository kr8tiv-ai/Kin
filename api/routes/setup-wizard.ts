import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

import { getWizardStatus } from '../lib/setup-wizard-status.js';

interface CompleteWizardBody {
  confirmed: boolean;
}

const completeWizardSchema = {
  type: 'object' as const,
  required: ['confirmed'],
  properties: {
    confirmed: { type: 'boolean' as const },
  },
  additionalProperties: false,
};

const setupWizardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/setup-wizard/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    return getWizardStatus(userId, fastify.context.db);
  });

  fastify.post<{ Body: CompleteWizardBody }>(
    '/setup-wizard/complete',
    {
      schema: {
        body: completeWizardSchema,
      },
    } as any,
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;

      if (!request.body.confirmed) {
        (reply as any).status(400);
        return { success: false, error: 'Setup completion requires explicit confirmation' };
      }

      const status = getWizardStatus(userId, fastify.context.db);
      if (!status.completion.eligible) {
        (reply as any).status(400);
        return { success: false, error: status.completion.reason };
      }

      try {
        const now = Date.now();

        fastify.context.db.prepare(`
          INSERT INTO user_preferences (
            id,
            user_id,
            setup_wizard_complete,
            created_at,
            updated_at
          ) VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            setup_wizard_complete = 1,
            updated_at = excluded.updated_at
        `).run(`pref-${crypto.randomUUID()}`, userId, now, now);

        const updatedStatus = getWizardStatus(userId, fastify.context.db);

        return {
          success: true,
          isComplete: updatedStatus.isComplete,
          completion: updatedStatus.completion,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Failed to mark wizard complete');
        (reply as any).status(500);
        return { success: false, error: 'Failed to save completion state' };
      }
    },
  );
};

export default setupWizardRoutes;
