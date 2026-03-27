/**
 * Kin Routes - Kin status and management endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface KinStatusParams {
  kinId: string;
}

interface KinStatusQuery {
  limit?: number;
  offset?: number;
  companionId?: string;
}

const kinRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all kin statuses for user
  fastify.get<{ Querystring: KinStatusQuery }>('/kin', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { limit: rawLimit = 20, offset: rawOffset = 0, companionId } = request.query;
    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
    const offset = Math.max(Number(rawOffset) || 0, 0);

    let query = `
      SELECT * FROM kin_status_records 
      WHERE kin_id IN (SELECT id FROM user_companions WHERE user_id = ?)
    `;
    const params: (string | number)[] = [userId];

    if (companionId) {
      query += ' AND companion_id = ?';
      params.push(companionId);
    }

    query += ' ORDER BY recorded_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const records = fastify.context.db.prepare(query).all(...params) as any[];

    return {
      records: records.map((r) => ({
        id: r.id,
        kinId: r.kin_id,
        companionId: r.companion_id,
        status: r.status,
        lastActiveAt: new Date(r.last_active_at).toISOString(),
        messageCount: r.message_count,
        sessionDurationSeconds: r.session_duration_seconds,
        driftScore: r.drift_score,
        healthScore: r.health_score,
        specializationAlignment: r.specialization_alignment,
        currentTask: r.current_task,
        errorCount: r.error_count,
        lastError: r.last_error,
        recordedAt: new Date(r.recorded_at).toISOString(),
      })),
      pagination: {
        limit,
        offset,
        total: records.length,
      },
    };
  });

  // Get specific kin status
  fastify.get<{ Params: KinStatusParams }>('/kin/:kinId', async (request, reply) => {
    const { kinId } = request.params;
    const userId = (request.user as { userId: string }).userId;

    // Verify ownership
    const ownership = fastify.context.db.prepare(`
      SELECT 1 FROM user_companions WHERE user_id = ? AND id = ?
    `).get(userId, kinId);

    if (!ownership) {
      reply.status(404);
      return { error: 'Kin not found' };
    }

    const record = fastify.context.db.prepare(`
      SELECT * FROM kin_status_records 
      WHERE kin_id = ? 
      ORDER BY recorded_at DESC 
      LIMIT 1
    `).get(kinId) as any;

    if (!record) {
      reply.status(404);
      return { error: 'No status records found' };
    }

    return {
      id: record.id,
      kinId: record.kin_id,
      companionId: record.companion_id,
      status: record.status,
      lastActiveAt: new Date(record.last_active_at).toISOString(),
      messageCount: record.message_count,
      sessionDurationSeconds: record.session_duration_seconds,
      driftScore: record.drift_score,
      healthScore: record.health_score,
      specializationAlignment: record.specialization_alignment,
      currentTask: record.current_task,
      errorCount: record.error_count,
      lastError: record.last_error,
      recordedAt: new Date(record.recorded_at).toISOString(),
    };
  });

  // Get user's companions
  fastify.get('/kin/companions', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const companions = fastify.context.db.prepare(`
      SELECT 
        uc.id as user_companion_id,
        uc.claimed_at,
        uc.is_active,
        uc.nft_mint_address,
        c.id as companion_id,
        c.name,
        c.type,
        c.specialization
      FROM user_companions uc
      JOIN companions c ON uc.companion_id = c.id
      WHERE uc.user_id = ?
      ORDER BY uc.claimed_at DESC
    `).all(userId) as any[];

    return {
      companions: companions.map((c) => ({
        id: c.user_companion_id,
        companion: {
          id: c.companion_id,
          name: c.name,
          type: c.type,
          specialization: c.specialization,
        },
        claimedAt: new Date(c.claimed_at).toISOString(),
        isActive: c.is_active === 1,
        nftMintAddress: c.nft_mint_address,
      })),
    };
  });

  // Claim a companion
  fastify.post<{ Body: { companionId: string } }>('/kin/claim', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.body;

    // Check if companion exists
    const companion = fastify.context.db.prepare(`
      SELECT id FROM companions WHERE id = ?
    `).get(companionId);

    if (!companion) {
      reply.status(404);
      return { error: 'Companion not found' };
    }

    // Check if already claimed
    const existing = fastify.context.db.prepare(`
      SELECT 1 FROM user_companions WHERE user_id = ? AND companion_id = ?
    `).get(userId, companionId);

    if (existing) {
      reply.status(409);
      return { error: 'Companion already claimed' };
    }

    // Claim companion
    const id = `uc-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO user_companions (id, user_id, companion_id)
      VALUES (?, ?, ?)
    `).run(id, userId, companionId);

    return {
      success: true,
      userCompanionId: id,
      companionId,
    };
  });
};

export default kinRoutes;
