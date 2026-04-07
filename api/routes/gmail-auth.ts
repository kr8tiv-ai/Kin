/**
 * Gmail OAuth Routes — Authorization flow for Gmail integration.
 *
 * Two JWT-protected endpoints:
 * 1. GET  /auth/gmail/authorize  → Returns Google OAuth2 consent URL
 * 2. POST /auth/gmail/callback   → Exchanges auth code for tokens, persists encrypted
 *
 * Both routes are rate-limited to 10 requests/minute per IP.
 *
 * @module api/routes/gmail-auth
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getGmailManager, GMAIL_SCOPES } from '../../inference/gmail-manager.js';

// JSON schemas for request validation
const callbackBodySchema = {
  type: 'object' as const,
  required: ['code', 'state'],
  properties: {
    code: { type: 'string' as const, minLength: 1 },
    state: { type: 'string' as const, minLength: 1 },
  },
  additionalProperties: false,
};

const gmailAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================================================
  // GET /auth/gmail/authorize — Generate Google OAuth2 consent URL
  // ==========================================================================

  fastify.get(
    '/auth/gmail/authorize',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply: FastifyReply) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        reply.status(500);
        return { error: 'Gmail OAuth not configured — GOOGLE_CLIENT_ID missing' };
      }

      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientSecret) {
        reply.status(500);
        return { error: 'Gmail OAuth not configured — GOOGLE_CLIENT_SECRET missing' };
      }

      const userId = (request.user as { userId: string }).userId;

      try {
        const manager = getGmailManager();
        const url = manager.getAuthUrl(userId);
        return { url };
      } catch (err) {
        fastify.log.error({ err }, 'Failed to generate Gmail auth URL');
        reply.status(500);
        return { error: 'Failed to generate Gmail authorization URL' };
      }
    },
  );

  // ==========================================================================
  // POST /auth/gmail/callback — Exchange authorization code for tokens
  // ==========================================================================

  fastify.post<{ Body: { code: string; state: string } }>(
    '/auth/gmail/callback',
    {
      schema: { body: callbackBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply: FastifyReply) => {
      const { code, state } = request.body;
      const userId = (request.user as { userId: string }).userId;

      // CSRF protection: state must match authenticated user's ID
      if (state !== userId) {
        reply.status(401);
        return { error: 'Invalid state parameter — possible CSRF attempt' };
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        reply.status(500);
        return { error: 'Gmail OAuth not configured' };
      }

      try {
        const manager = getGmailManager();
        const email = await manager.exchangeCode(userId, code);

        return { success: true, email };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fastify.log.error({ err, userId }, 'Gmail OAuth callback failed');

        // Distinguish user-facing errors
        if (message.includes('No refresh token')) {
          reply.status(400);
          return { error: 'No refresh token received — please re-authorize with full consent' };
        }

        reply.status(500);
        return { error: 'Failed to complete Gmail authorization' };
      }
    },
  );
};

export default gmailAuthRoutes;
