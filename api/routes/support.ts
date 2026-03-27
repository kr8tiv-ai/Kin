/**
 * Support Routes - Support tickets and feature requests
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface TicketParams {
  ticketId: string;
}

const supportRoutes: FastifyPluginAsync = async (fastify) => {
  // Get feature requests
  fastify.get('/features', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const features = fastify.context.db.prepare(`
      SELECT 
        fr.*,
        (SELECT COUNT(*) FROM feature_votes WHERE feature_id = fr.id) as user_voted
      FROM feature_requests fr
      LEFT JOIN feature_votes fv ON fr.id = fv.feature_id AND fv.user_id = ?
      ORDER BY fr.votes DESC, fr.created_at DESC
      LIMIT 50
    `).all(userId) as any[];

    return {
      features: features.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        status: f.status,
        votes: f.votes,
        userVoted: f.user_voted > 0,
        createdAt: new Date(f.created_at).toISOString(),
      })),
    };
  });

  // Create feature request
  fastify.post<{ Body: { title: string; description: string } }>(
    '/features',
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const { title, description } = request.body;

      const id = `feat-${crypto.randomUUID()}`;

      fastify.context.db.prepare(`
        INSERT INTO feature_requests (id, user_id, title, description)
        VALUES (?, ?, ?, ?)
      `).run(id, userId, title, description);

      return {
        success: true,
        feature: { id, title, description, votes: 0 },
      };
    }
  );

  // Vote for feature
  fastify.post<{ Params: { featureId: string } }>(
    '/features/:featureId/vote',
    async (request, reply) => {
      const { featureId } = request.params;
      const userId = (request.user as { userId: string }).userId;

      // Check if already voted
      const existing = fastify.context.db.prepare(`
        SELECT 1 FROM feature_votes WHERE feature_id = ? AND user_id = ?
      `).get(featureId, userId);

      if (existing) {
        reply.status(409);
        return { error: 'Already voted' };
      }

      // Add vote
      fastify.context.db.prepare(`
        INSERT INTO feature_votes (id, feature_id, user_id)
        VALUES (?, ?, ?)
      `).run(`vote-${crypto.randomUUID()}`, featureId, userId);

      // Update vote count
      fastify.context.db.prepare(`
        UPDATE feature_requests SET votes = votes + 1 WHERE id = ?
      `).run(featureId);

      return { success: true };
    }
  );

  // Remove vote
  fastify.delete<{ Params: { featureId: string } }>(
    '/features/:featureId/vote',
    async (request) => {
      const { featureId } = request.params;
      const userId = (request.user as { userId: string }).userId;

      fastify.context.db.prepare(`
        DELETE FROM feature_votes WHERE feature_id = ? AND user_id = ?
      `).run(featureId, userId);

      fastify.context.db.prepare(`
        UPDATE feature_requests SET votes = votes - 1 WHERE id = ?
      `).run(featureId);

      return { success: true };
    }
  );

  // Get support tickets
  fastify.get('/tickets', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const tickets = fastify.context.db.prepare(`
      SELECT * FROM support_tickets
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId) as any[];

    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: new Date(t.created_at).toISOString(),
        updatedAt: new Date(t.updated_at).toISOString(),
      })),
    };
  });

  // Create support ticket
  fastify.post<{ Body: { subject: string; companionId?: string; priority?: string } }>(
    '/tickets',
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const { subject, companionId, priority = 'normal' } = request.body;

      const id = `tkt-${crypto.randomUUID()}`;

      fastify.context.db.prepare(`
        INSERT INTO support_tickets (id, user_id, companion_id, subject, priority)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, companionId ?? null, subject, priority);

      return {
        success: true,
        ticket: { id, subject, status: 'open', priority },
      };
    }
  );
};

export default supportRoutes;
