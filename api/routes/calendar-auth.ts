/**
 * Calendar OAuth Routes — Authorization flow for Google Calendar integration.
 *
 * Two JWT-protected endpoints:
 * 1. GET  /auth/calendar/authorize  → Returns Google OAuth2 consent URL
 * 2. POST /auth/calendar/callback   → Exchanges auth code for tokens, persists encrypted
 *
 * Follows the gmail-auth.ts pattern (K030) with calendar-specific scopes.
 *
 * @module api/routes/calendar-auth
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';

const callbackBodySchema = {
  type: 'object' as const,
  required: ['code', 'state'],
  properties: {
    code: { type: 'string' as const, minLength: 1 },
    state: { type: 'string' as const, minLength: 1 },
  },
  additionalProperties: false,
};

const calendarAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================================================
  // GET /auth/calendar/authorize — Generate Google Calendar OAuth2 consent URL
  // ==========================================================================

  fastify.get(
    '/auth/calendar/authorize',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    } as any,
    async (request, reply: FastifyReply) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        reply.status(500);
        return { error: 'Calendar OAuth not configured — GOOGLE_CLIENT_ID missing' };
      }

      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientSecret) {
        reply.status(500);
        return { error: 'Calendar OAuth not configured — GOOGLE_CLIENT_SECRET missing' };
      }

      const userId = (request.user as { userId: string }).userId;

      try {
        // Dynamic import to avoid hard dependency on googleapis at load time
        const { CalendarManager } = await import('../../inference/calendar-manager.js');
        const calManager = new CalendarManager(
          {
            clientId,
            clientSecret,
            redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? `${process.env.PUBLIC_URL ?? 'http://localhost:3002'}/auth/calendar/callback`,
          },
          fastify.context.config.jwtSecret,
        );
        const url = calManager.getAuthUrl(userId);
        return { url };
      } catch (err) {
        fastify.log.error({ err }, 'Failed to generate Calendar auth URL');
        reply.status(500);
        return { error: 'Failed to generate Calendar authorization URL' };
      }
    },
  );

  // ==========================================================================
  // POST /auth/calendar/callback — Exchange authorization code for tokens
  // ==========================================================================

  fastify.post<{ Body: { code: string; state: string } }>(
    '/auth/calendar/callback',
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
        return { error: 'Calendar OAuth not configured' };
      }

      try {
        const { CalendarManager } = await import('../../inference/calendar-manager.js');
        const calManager = new CalendarManager(
          {
            clientId,
            clientSecret,
            redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? `${process.env.PUBLIC_URL ?? 'http://localhost:3002'}/auth/calendar/callback`,
          },
          fastify.context.config.jwtSecret,
        );
        await calManager.exchangeCode(userId, code);

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fastify.log.error({ err, userId }, 'Calendar OAuth callback failed');

        if (message.includes('No refresh token')) {
          reply.status(400);
          return { error: 'No refresh token received — please re-authorize with full consent' };
        }

        reply.status(500);
        return { error: 'Failed to complete Calendar authorization' };
      }
    },
  );
};

export default calendarAuthRoutes;
