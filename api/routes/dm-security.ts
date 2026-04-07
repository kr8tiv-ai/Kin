/**
 * DM Security Routes — Manage DM allowlist and pairing codes from the dashboard
 *
 * All endpoints are JWT-protected (registered inside the protected scope in server.ts).
 * Responses use camelCase keys per K005.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  getAllowlist,
  getPendingCodes,
  approveSender,
  revokeSender,
} from '../../bot/utils/dm-security.js';

const VALID_CHANNELS = ['telegram', 'whatsapp', 'discord'];

interface ApproveBody {
  channel: string;
  senderId: string;
  displayName?: string;
}

interface RevokeBody {
  channel: string;
  senderId: string;
}

const dmSecurityRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // GET /dm-security/allowlist — all approved senders, optional ?channel= filter
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { channel?: string } }>(
    '/dm-security/allowlist',
    async (request, reply) => {
      const { channel } = request.query;
      if (channel && !VALID_CHANNELS.includes(channel)) {
        reply.status(400);
        return { error: 'Invalid channel. Must be one of: telegram, whatsapp, discord' };
      }

      const entries = getAllowlist(fastify.context.db, channel);
      return { allowlist: entries };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /dm-security/pending — pending (non-expired) pairing codes
  // ---------------------------------------------------------------------------
  fastify.get<{ Querystring: { channel?: string } }>(
    '/dm-security/pending',
    async (request, reply) => {
      const { channel } = request.query;
      if (channel && !VALID_CHANNELS.includes(channel)) {
        reply.status(400);
        return { error: 'Invalid channel. Must be one of: telegram, whatsapp, discord' };
      }

      const entries = getPendingCodes(fastify.context.db, channel);
      return { pending: entries };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /dm-security/approve — approve a sender directly from dashboard
  // ---------------------------------------------------------------------------
  fastify.post<{ Body: ApproveBody }>(
    '/dm-security/approve',
    async (request, reply) => {
      const { channel, senderId, displayName } = request.body ?? {} as ApproveBody;

      if (!channel || !senderId) {
        reply.status(400);
        return { error: 'channel and senderId are required' };
      }

      if (!VALID_CHANNELS.includes(channel)) {
        reply.status(400);
        return { error: 'Invalid channel. Must be one of: telegram, whatsapp, discord' };
      }

      if (typeof senderId !== 'string' || senderId.trim().length === 0) {
        reply.status(400);
        return { error: 'senderId must be a non-empty string' };
      }

      const userId = (request.user as { userId: string }).userId;
      approveSender(fastify.context.db, channel, senderId, userId, displayName);

      return { success: true, senderId, channel };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /dm-security/revoke — revoke a sender from the allowlist
  // ---------------------------------------------------------------------------
  fastify.post<{ Body: RevokeBody }>(
    '/dm-security/revoke',
    async (request, reply) => {
      const { channel, senderId } = request.body ?? {} as RevokeBody;

      if (!channel || !senderId) {
        reply.status(400);
        return { error: 'channel and senderId are required' };
      }

      if (!VALID_CHANNELS.includes(channel)) {
        reply.status(400);
        return { error: 'Invalid channel. Must be one of: telegram, whatsapp, discord' };
      }

      const revoked = revokeSender(fastify.context.db, channel, senderId);
      return { success: true, revoked };
    },
  );
};

export default dmSecurityRoutes;
