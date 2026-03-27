/**
 * Memory Routes - Memory and preference endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface MemoryQuery {
  type?: 'personal' | 'preference' | 'context' | 'event';
  limit?: number;
}

const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user's memories
  fastify.get<{ Querystring: MemoryQuery }>('/memories', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { type, limit: rawLimit = 100 } = request.query;
    const limit = Math.min(Math.max(Number(rawLimit) || 100, 1), 100);

    let query = `
      SELECT * FROM memories 
      WHERE user_id = ?
    `;
    const params: (string | number)[] = [userId];

    if (type) {
      query += ' AND memory_type = ?';
      params.push(type);
    }

    query += ' ORDER BY importance DESC, last_accessed_at DESC LIMIT ?';
    params.push(limit);

    const memories = fastify.context.db.prepare(query).all(...params) as any[];

    return {
      memories: memories.map((m) => ({
        id: m.id,
        companionId: m.companion_id,
        type: m.memory_type,
        content: m.is_transferable ? m.content : '[Personal - not transferable]',
        importance: m.importance,
        isTransferable: m.is_transferable === 1,
        createdAt: new Date(m.created_at).toISOString(),
        accessCount: m.access_count,
      })),
    };
  });

  // Add memory
  fastify.post<{ Body: {
    companionId: string;
    type: 'personal' | 'preference' | 'context' | 'event';
    content: string;
    importance?: number;
    isTransferable?: boolean;
  } }>('/memories', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId, type, content, importance: rawImportance = 0.5, isTransferable = false } = request.body;
    const importance = Math.min(Math.max(Number(rawImportance) || 0.5, 0), 1);
    if (!content || typeof content !== 'string' || content.length > 10000) {
      return { error: 'Content required, max 10000 chars' };
    }

    const id = `mem-${crypto.randomUUID()}`;
    
    fastify.context.db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, companionId, type, content, importance, isTransferable ? 1 : 0);

    return {
      success: true,
      memory: {
        id,
        companionId,
        type,
        importance,
        isTransferable,
      },
    };
  });

  // Get preferences
  fastify.get('/preferences', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const preferences = fastify.context.db.prepare(`
      SELECT content, companion_id FROM memories
      WHERE user_id = ? AND memory_type = 'preference'
      ORDER BY importance DESC
    `).all(userId) as any[];

    // Group by companion
    const grouped: Record<string, string[]> = {};
    for (const pref of preferences) {
      if (!grouped[pref.companion_id]) {
        grouped[pref.companion_id] = [];
      }
      grouped[pref.companion_id]!.push(pref.content);
    }

    return { preferences: grouped };
  });

  // Delete memory
  fastify.delete<{ Params: { memoryId: string } }>(
    '/memories/:memoryId',
    async (request, reply) => {
      const { memoryId } = request.params;
      const userId = (request.user as { userId: string }).userId;

      const result = fastify.context.db.prepare(`
        DELETE FROM memories WHERE id = ? AND user_id = ?
      `).run(memoryId, userId);

      if (result.changes === 0) {
        reply.status(404);
        return { error: 'Memory not found' };
      }

      return { success: true };
    }
  );
};

export default memoryRoutes;
