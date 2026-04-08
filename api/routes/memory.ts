/**
 * Memory Routes - Memory and preference endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface MemoryQuery {
  type?: 'personal' | 'preference' | 'context' | 'event';
  limit?: number;
  sort?: 'importance_desc' | 'created_at_desc';
  offset?: number;
  companionId?: string;
}

interface BatchDeleteBody {
  ids: string[];
}

const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user's memories
  fastify.get<{ Querystring: MemoryQuery }>('/memories', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { type, limit: rawLimit = 100, sort = 'importance_desc', offset: rawOffset = 0, companionId } = request.query;
    const limit = Math.min(Math.max(Number(rawLimit) || 100, 1), 100);
    const offset = Math.max(Number(rawOffset) || 0, 0);

    let query = `
      SELECT * FROM memories 
      WHERE user_id = ?
    `;
    const params: (string | number)[] = [userId];

    if (type) {
      query += ' AND memory_type = ?';
      params.push(type);
    }

    if (companionId) {
      query += ' AND companion_id = ?';
      params.push(companionId);
    }

    if (sort === 'created_at_desc') {
      query += ' ORDER BY created_at DESC';
    } else {
      query += ' ORDER BY importance DESC, last_accessed_at DESC';
    }

    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

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
        lastAccessedAt: m.last_accessed_at ? new Date(m.last_accessed_at).toISOString() : null,
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
  fastify.get('/memory-preferences', async (request) => {
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

  // Batch delete memories
  fastify.post<{ Body: BatchDeleteBody }>(
    '/memories/batch-delete',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { ids } = request.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        reply.status(400);
        return { error: 'ids must be a non-empty array' };
      }

      if (ids.length > 100) {
        reply.status(400);
        return { error: 'Maximum 100 ids per batch delete' };
      }

      // Validate all ids are strings
      if (ids.some((id) => typeof id !== 'string')) {
        reply.status(400);
        return { error: 'All ids must be strings' };
      }

      const placeholders = ids.map(() => '?').join(',');
      const deleteStmt = fastify.context.db.prepare(
        `DELETE FROM memories WHERE id IN (${placeholders}) AND user_id = ?`
      );

      const result = fastify.context.db.transaction(() => {
        return deleteStmt.run(...ids, userId);
      })();

      return { success: true, deleted: result.changes };
    }
  );
};

export default memoryRoutes;
