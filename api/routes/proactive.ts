/**
 * Proactive Companion Routes — Suggestion history, feedback, settings,
 * and calendar connection management.
 *
 * JWT-protected. All responses use camelCase keys (K005).
 *
 * @module api/routes/proactive
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ProactiveSuggestionRow } from '../../inference/proactive-types.js';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

interface FeedbackBody {
  feedback: 'helpful' | 'not_helpful';
}

interface SettingsBody {
  proactiveEnabled?: boolean;
  quietStart?: number | null;
  quietEnd?: number | null;
  maxDaily?: number;
  channels?: string[];
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const proactiveRoutes: FastifyPluginAsync = async (fastify) => {
  const db = () => fastify.context.db;

  // ==========================================================================
  // GET /proactive/suggestions — Recent suggestions for authenticated user
  // ==========================================================================

  fastify.get('/proactive/suggestions', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const rows = db().prepare(
      `SELECT id, user_id, companion_id, signal_id, content,
              delivery_channel, delivery_recipient_id, status,
              user_feedback, created_at, delivered_at
       FROM proactive_suggestions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    ).all(userId) as ProactiveSuggestionRow[];

    return {
      suggestions: rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        companionId: row.companion_id,
        signalId: row.signal_id,
        content: row.content,
        deliveryChannel: row.delivery_channel,
        deliveryRecipientId: row.delivery_recipient_id,
        status: row.status,
        userFeedback: row.user_feedback,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
      })),
    };
  });

  // ==========================================================================
  // POST /proactive/suggestions/:id/feedback — User feedback on a suggestion
  // ==========================================================================

  fastify.post<{ Params: { id: string }; Body: FeedbackBody }>(
    '/proactive/suggestions/:id/feedback',
    async (request, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;
      const { id } = request.params;
      const body = request.body ?? {} as FeedbackBody;

      // Validate feedback value
      if (!body.feedback || !['helpful', 'not_helpful'].includes(body.feedback)) {
        reply.status(400);
        return { error: 'Invalid feedback — must be "helpful" or "not_helpful"' };
      }

      // Check suggestion exists and belongs to user
      const suggestion = db().prepare(
        `SELECT id, user_id FROM proactive_suggestions WHERE id = ?`,
      ).get(id) as { id: string; user_id: string } | undefined;

      if (!suggestion) {
        reply.status(404);
        return { error: 'Suggestion not found' };
      }

      if (suggestion.user_id !== userId) {
        reply.status(403);
        return { error: 'Not authorized to update this suggestion' };
      }

      db().prepare(
        `UPDATE proactive_suggestions SET user_feedback = ? WHERE id = ?`,
      ).run(body.feedback, id);

      return { success: true, id, feedback: body.feedback };
    },
  );

  // ==========================================================================
  // GET /proactive/settings — Proactive preferences for user
  // ==========================================================================

  fastify.get('/proactive/settings', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const row = db().prepare(
      `SELECT proactive_enabled, proactive_quiet_start, proactive_quiet_end,
              proactive_max_daily, proactive_channels
       FROM user_preferences WHERE user_id = ?`,
    ).get(userId) as {
      proactive_enabled: number;
      proactive_quiet_start: number | null;
      proactive_quiet_end: number | null;
      proactive_max_daily: number;
      proactive_channels: string;
    } | undefined;

    if (!row) {
      return {
        proactiveEnabled: false,
        quietStart: null,
        quietEnd: null,
        maxDaily: 5,
        channels: [] as string[],
        calendarConnected: false,
      };
    }

    // Check if calendar tokens exist for this user
    const calRow = db().prepare(
      `SELECT id FROM oauth_tokens WHERE user_id = ? AND provider = 'google_calendar'`,
    ).get(userId) as { id: string } | undefined;

    let channels: string[] = [];
    try {
      channels = JSON.parse(row.proactive_channels ?? '[]');
    } catch {
      channels = [];
    }

    return {
      proactiveEnabled: !!row.proactive_enabled,
      quietStart: row.proactive_quiet_start,
      quietEnd: row.proactive_quiet_end,
      maxDaily: row.proactive_max_daily ?? 5,
      channels,
      calendarConnected: !!calRow,
    };
  });

  // ==========================================================================
  // PUT /proactive/settings — Update proactive preferences
  // ==========================================================================

  fastify.put<{ Body: SettingsBody }>('/proactive/settings', async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const body = request.body ?? {} as SettingsBody;

    // Validate ranges
    if (body.quietStart !== undefined && body.quietStart !== null) {
      if (!Number.isInteger(body.quietStart) || body.quietStart < 0 || body.quietStart > 23) {
        reply.status(400);
        return { error: 'quietStart must be an integer 0-23' };
      }
    }
    if (body.quietEnd !== undefined && body.quietEnd !== null) {
      if (!Number.isInteger(body.quietEnd) || body.quietEnd < 0 || body.quietEnd > 23) {
        reply.status(400);
        return { error: 'quietEnd must be an integer 0-23' };
      }
    }
    if (body.maxDaily !== undefined) {
      if (!Number.isInteger(body.maxDaily) || body.maxDaily < 1 || body.maxDaily > 20) {
        reply.status(400);
        return { error: 'maxDaily must be an integer 1-20' };
      }
    }
    if (body.channels !== undefined && !Array.isArray(body.channels)) {
      reply.status(400);
      return { error: 'channels must be an array' };
    }

    // Ensure user_preferences row exists
    const existing = db().prepare(
      `SELECT id FROM user_preferences WHERE user_id = ?`,
    ).get(userId) as { id: string } | undefined;

    if (!existing) {
      // Insert default row with proactive columns
      const id = `pref-${crypto.randomUUID()}`;
      db().prepare(
        `INSERT INTO user_preferences (id, user_id) VALUES (?, ?)`,
      ).run(id, userId);
    }

    // Build dynamic update
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (body.proactiveEnabled !== undefined) {
      updates.push('proactive_enabled = ?');
      params.push(body.proactiveEnabled ? 1 : 0);
    }
    if (body.quietStart !== undefined) {
      updates.push('proactive_quiet_start = ?');
      params.push(body.quietStart);
    }
    if (body.quietEnd !== undefined) {
      updates.push('proactive_quiet_end = ?');
      params.push(body.quietEnd);
    }
    if (body.maxDaily !== undefined) {
      updates.push('proactive_max_daily = ?');
      params.push(body.maxDaily);
    }
    if (body.channels !== undefined) {
      updates.push('proactive_channels = ?');
      params.push(JSON.stringify(body.channels));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(userId);

      db().prepare(
        `UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`,
      ).run(...params);
    }

    // Return updated preferences
    const row = db().prepare(
      `SELECT proactive_enabled, proactive_quiet_start, proactive_quiet_end,
              proactive_max_daily, proactive_channels
       FROM user_preferences WHERE user_id = ?`,
    ).get(userId) as {
      proactive_enabled: number;
      proactive_quiet_start: number | null;
      proactive_quiet_end: number | null;
      proactive_max_daily: number;
      proactive_channels: string;
    };

    let channels: string[] = [];
    try {
      channels = JSON.parse(row.proactive_channels ?? '[]');
    } catch {
      channels = [];
    }

    return {
      proactiveEnabled: !!row.proactive_enabled,
      quietStart: row.proactive_quiet_start,
      quietEnd: row.proactive_quiet_end,
      maxDaily: row.proactive_max_daily ?? 5,
      channels,
    };
  });

  // ==========================================================================
  // DELETE /proactive/calendar — Revoke calendar access
  // ==========================================================================

  fastify.delete('/proactive/calendar', async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;

    const result = db().prepare(
      `DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'google_calendar'`,
    ).run(userId);

    if (result.changes === 0) {
      reply.status(404);
      return { error: 'No calendar connection found' };
    }

    return { success: true };
  });
};

// Need crypto for UUID generation
import crypto from 'crypto';

export default proactiveRoutes;
