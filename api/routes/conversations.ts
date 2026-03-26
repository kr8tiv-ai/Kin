/**
 * Conversations Routes - Conversation history endpoints
 */

import { FastifyPluginAsync } from 'fastify';

interface ConversationParams {
  conversationId: string;
}

interface MessageQuery {
  limit?: number;
  before?: string; // message id
}

const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user's conversations
  fastify.get('/conversations', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const conversations = fastify.context.db.prepare(`
      SELECT 
        c.id,
        c.companion_id,
        c.created_at,
        c.updated_at,
        c.title,
        comp.name as companion_name,
        comp.type as companion_type,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c
      JOIN companions comp ON c.companion_id = comp.id
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
      LIMIT 50
    `).all(userId) as any[];

    return {
      conversations: conversations.map((c) => ({
        id: c.id,
        companionId: c.companion_id,
        companionName: c.companion_name,
        companionType: c.companion_type,
        createdAt: new Date(c.created_at).toISOString(),
        updatedAt: new Date(c.updated_at).toISOString(),
        title: c.title,
        messageCount: c.message_count,
      })),
    };
  });

  // Get conversation messages
  fastify.get<{ Params: ConversationParams; Querystring: MessageQuery }>(
    '/conversations/:conversationId/messages',
    async (request, reply) => {
      const { conversationId } = request.params;
      const { limit = 50, before } = request.query;
      const userId = (request.user as { userId: string }).userId;

      // Verify ownership
      const conversation = fastify.context.db.prepare(`
        SELECT 1 FROM conversations WHERE id = ? AND user_id = ?
      `).get(conversationId, userId);

      if (!conversation) {
        reply.status(404);
        return { error: 'Conversation not found' };
      }

      let query = `
        SELECT * FROM messages 
        WHERE conversation_id = ?
      `;
      const params: (string | number)[] = [conversationId];

      if (before) {
        query += ' AND id < (SELECT timestamp FROM messages WHERE id = ?)';
        params.push(before);
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const messages = fastify.context.db.prepare(query).all(...params) as any[];

      return {
        messages: messages.reverse().map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp).toISOString(),
          tokens: m.tokens_used,
          model: m.model,
          provider: m.provider,
        })),
      };
    }
  );

  // Create new conversation
  fastify.post<{ Body: { companionId: string; title?: string } }>(
    '/conversations',
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const { companionId, title } = request.body;

      const id = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      fastify.context.db.prepare(`
        INSERT INTO conversations (id, user_id, companion_id, title)
        VALUES (?, ?, ?, ?)
      `).run(id, userId, companionId, title ?? null);

      return {
        success: true,
        conversation: {
          id,
          companionId,
          title,
          createdAt: new Date().toISOString(),
        },
      };
    }
  );

  // Delete conversation
  fastify.delete<{ Params: ConversationParams }>(
    '/conversations/:conversationId',
    async (request, reply) => {
      const { conversationId } = request.params;
      const userId = (request.user as { userId: string }).userId;

      const result = fastify.context.db.prepare(`
        DELETE FROM conversations WHERE id = ? AND user_id = ?
      `).run(conversationId, userId);

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Conversation not found' };
      }

      return { success: true };
    }
  );
};

export default conversationRoutes;
