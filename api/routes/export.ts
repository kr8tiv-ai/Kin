/**
 * Export Routes — Full-state archive export.
 *
 * GET /export/archive  — streams a versioned ZIP archive (v1 schema)
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

    const { archive, finalized } = await buildExportArchive({
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

  // Deprecated GET /export/data and GET /export/download removed.
  // Use GET /export/archive for full-state export.
};

export default exportRoutes;
