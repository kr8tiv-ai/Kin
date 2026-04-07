/**
 * Export Routes — Full-state archive export and legacy flat-JSON endpoints.
 *
 * GET /export/archive  — streams a versioned ZIP archive (v1 schema)
 * GET /export/data     — (deprecated) flat JSON export
 * GET /export/download — (deprecated) flat JSON download with Content-Disposition
 *
 * All routes are JWT-protected (registered under the protectedFastify scope).
 *
 * @module api/routes/export
 */

import { FastifyPluginAsync } from 'fastify';
import { buildExportArchive } from '../lib/archive-builder.js';

// Legacy flat-JSON shape (preserved for backward compatibility)
export interface ExportData {
  user: {
    id: string;
    firstName: string;
    lastName?: string;
    tier: string;
    createdAt: string;
  };
  companions: Array<{
    id: string;
    name: string;
    type: string;
    claimedAt: string;
  }>;
  preferences: {
    displayName?: string;
    experienceLevel: string;
    goals: string[];
    language: string;
    tone: string;
    privacyMode: string;
  };
  memories: Array<{
    id: string;
    companionId: string;
    memoryType: string;
    content: string;
    importance: number;
    createdAt: string;
  }>;
  conversations: Array<{
    id: string;
    companionId: string;
    title?: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  customizations: Array<{
    companionId: string;
    customName?: string;
    toneOverride?: string;
    personalityNotes?: string;
  }>;
  exportedAt: string;
  version: string;
}

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================================================
  // NEW: GET /export/archive — streaming ZIP with full-state data + manifest
  // ==========================================================================

  fastify.get('/export/archive', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const db = fastify.context.db;

    // Verify user exists
    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as
      | { id: string }
      | undefined;

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `kin-export-${userId}-${timestamp}.zip`;

    request.log.info({ userId }, 'Export archive requested');

    const { archive, finalized } = buildExportArchive({
      db,
      userId,
      logger: {
        info: (msg, ctx) => request.log.info(ctx ?? {}, msg),
        warn: (msg, ctx) => request.log.warn(ctx ?? {}, msg),
        error: (msg, ctx) => request.log.error(ctx ?? {}, msg),
      },
    });

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the archive to the response
    // Fastify supports sending a stream via reply.send()
    reply.send(archive);

    // Await finalization for logging (fire-and-forget — response is already streaming)
    finalized.then(({ totalBytes }) => {
      request.log.info({ userId, totalBytes, filename }, 'Export archive streamed');
    }).catch((err) => {
      request.log.error({ userId, error: err.message }, 'Export archive stream error');
    });

    return reply;
  });

  // ==========================================================================
  // DEPRECATED: GET /export/data — flat JSON export (backward compatible)
  // ==========================================================================

  fastify.get('/export/data', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;

    reply.header('X-Deprecated', 'Use GET /export/archive for full-state export');

    const user = fastify.context.db.prepare(`
      SELECT id, first_name, last_name, tier, created_at FROM users WHERE id = ?
    `).get(userId) as any;

    if (!user) {
      return { error: 'User not found' };
    }

    const companions = fastify.context.db.prepare(`
      SELECT id, companion_id, claimed_at FROM user_companions WHERE user_id = ?
    `).all(userId) as any;

    const companionsList = companions.length > 0
      ? fastify.context.db.prepare(
          `SELECT id, name, type FROM companions WHERE id IN (${companions.map(() => '?').join(',')})`,
        ).all(...companions.map((c: any) => c.companion_id)) as any
      : [];

    const companionMap = new Map<string, any>(companionsList.map((c: any) => [c.id, c]));

    const preferences = fastify.context.db.prepare(`
      SELECT display_name, experience_level, goals, language, tone, privacy_mode 
      FROM user_preferences WHERE user_id = ?
    `).get(userId) as any;

    const memories = fastify.context.db.prepare(`
      SELECT id, companion_id, memory_type, content, importance, created_at 
      FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000
    `).all(userId) as any;

    const conversations = fastify.context.db.prepare(`
      SELECT c.id, c.companion_id, c.title, c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
      FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC
    `).all(userId) as any;

    const customizations = fastify.context.db.prepare(`
      SELECT companion_id, custom_name, tone_override, personality_notes 
      FROM companion_customizations WHERE user_id = ?
    `).all(userId) as any;

    const exportData: ExportData = {
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        tier: user.tier,
        createdAt: new Date(user.created_at).toISOString(),
      },
      companions: companions.map((c: any) => ({
        id: c.companion_id,
        name: companionMap.get(c.companion_id)?.name ?? c.companion_id,
        type: companionMap.get(c.companion_id)?.type ?? 'unknown',
        claimedAt: new Date(c.claimed_at).toISOString(),
      })),
      preferences: {
        displayName: preferences?.display_name,
        experienceLevel: preferences?.experience_level ?? 'beginner',
        goals: preferences?.goals ? JSON.parse(preferences.goals) : [],
        language: preferences?.language ?? 'en',
        tone: preferences?.tone ?? 'friendly',
        privacyMode: preferences?.privacy_mode ?? 'private',
      },
      memories: memories.map((m: any) => ({
        id: m.id,
        companionId: m.companion_id,
        memoryType: m.memory_type,
        content: m.content,
        importance: m.importance,
        createdAt: new Date(m.created_at).toISOString(),
      })),
      conversations: conversations.map((c: any) => ({
        id: c.id,
        companionId: c.companion_id,
        title: c.title,
        messageCount: c.message_count,
        createdAt: new Date(c.created_at).toISOString(),
        updatedAt: new Date(c.updated_at).toISOString(),
      })),
      customizations: customizations.map((c: any) => ({
        companionId: c.companion_id,
        customName: c.custom_name,
        toneOverride: c.tone_override,
        personalityNotes: c.personality_notes,
      })),
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };

    return exportData;
  });

  // ==========================================================================
  // DEPRECATED: GET /export/download — flat JSON file download
  // ==========================================================================

  fastify.get('/export/download', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;

    reply.header('X-Deprecated', 'Use GET /export/archive for full-state export');

    const user = fastify.context.db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
    if (!user) {
      return { error: 'User not found' };
    }

    const exportData = await fastify.inject({
      method: 'GET',
      url: '/export/data',
      headers: request.headers,
    });

    const data = JSON.stringify(exportData.json(), null, 2);

    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="kin-export-${userId}-${Date.now()}.json"`,
    );

    return data;
  });
};

export default exportRoutes;
