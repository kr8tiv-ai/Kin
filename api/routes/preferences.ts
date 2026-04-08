/**
 * Preferences Routes - User preferences and onboarding state
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface PreferencesBody {
  displayName?: string;
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
  goals?: string[];
  language?: string;
  tone?: 'friendly' | 'professional' | 'casual' | 'technical';
  privacyMode?: 'private' | 'shared';
  onboardingComplete?: boolean;
}

const VALID_EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_TONES = ['friendly', 'professional', 'casual', 'technical'];
const VALID_PRIVACY_MODES = ['private', 'shared'];

const preferencesRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user preferences
  fastify.get('/preferences', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const row = fastify.context.db.prepare(`
      SELECT display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete
      FROM user_preferences
      WHERE user_id = ?
    `).get(userId) as any;

    if (!row) {
      return {
        displayName: null,
        experienceLevel: 'beginner',
        goals: [],
        language: 'en',
        tone: 'friendly',
        privacyMode: 'private',
        onboardingComplete: false,
      };
    }

    let goals: string[] = [];
    try {
      goals = row.goals ? JSON.parse(row.goals) : [];
    } catch {
      goals = [];
    }

    return {
      displayName: row.display_name ?? null,
      experienceLevel: row.experience_level ?? 'beginner',
      goals,
      language: row.language ?? 'en',
      tone: row.tone ?? 'friendly',
      privacyMode: row.privacy_mode ?? 'private',
      onboardingComplete: row.onboarding_complete === 1,
    };
  });

  // Create or update user preferences
  fastify.put<{ Body: PreferencesBody }>('/preferences', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const body = request.body ?? {};

    // Validate experience level
    if (body.experienceLevel && !VALID_EXPERIENCE_LEVELS.includes(body.experienceLevel)) {
      reply.status(400);
      return { error: 'Invalid experience level' };
    }

    // Validate tone
    if (body.tone && !VALID_TONES.includes(body.tone)) {
      reply.status(400);
      return { error: 'Invalid tone' };
    }

    // Validate privacy mode
    if (body.privacyMode && !VALID_PRIVACY_MODES.includes(body.privacyMode)) {
      reply.status(400);
      return { error: 'Invalid privacy mode' };
    }

    // Block privacy_mode changes for child accounts — COPPA requires 'private'
    if (body.privacyMode !== undefined) {
      try {
        const prefs = fastify.context.db.prepare(
          `SELECT account_type FROM user_preferences WHERE user_id = ?`,
        ).get(userId) as { account_type: string | null } | undefined;

        if (prefs?.account_type === 'child') {
          reply.status(403);
          return { error: 'Child accounts cannot change privacy mode' };
        }
      } catch {
        // account_type column may not exist — allow update
      }
    }

    // Validate display name length
    if (body.displayName && body.displayName.length > 100) {
      reply.status(400);
      return { error: 'Display name must be 100 characters or less' };
    }

    // Validate goals
    if (body.goals && !Array.isArray(body.goals)) {
      reply.status(400);
      return { error: 'Goals must be an array' };
    }

    // Check if preferences exist
    const existing = fastify.context.db.prepare(`
      SELECT id FROM user_preferences WHERE user_id = ?
    `).get(userId) as any;

    if (existing) {
      // Build dynamic update
      const updates: string[] = [];
      const params: (string | number)[] = [];

      if (body.displayName !== undefined) {
        updates.push('display_name = ?');
        params.push(body.displayName ?? '');
      }
      if (body.experienceLevel !== undefined) {
        updates.push('experience_level = ?');
        params.push(body.experienceLevel);
      }
      if (body.goals !== undefined) {
        updates.push('goals = ?');
        params.push(JSON.stringify(body.goals));
      }
      if (body.language !== undefined) {
        updates.push('language = ?');
        params.push(body.language);
      }
      if (body.tone !== undefined) {
        updates.push('tone = ?');
        params.push(body.tone);
      }
      if (body.privacyMode !== undefined) {
        updates.push('privacy_mode = ?');
        params.push(body.privacyMode);
      }
      if (body.onboardingComplete !== undefined) {
        updates.push('onboarding_complete = ?');
        params.push(body.onboardingComplete ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(Date.now());
        params.push(userId);

        fastify.context.db.prepare(`
          UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?
        `).run(...params);
      }
    } else {
      // Insert new preferences
      const id = `pref-${crypto.randomUUID()}`;
      fastify.context.db.prepare(`
        INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        body.displayName ?? null,
        body.experienceLevel ?? 'beginner',
        body.goals ? JSON.stringify(body.goals) : '[]',
        body.language ?? 'en',
        body.tone ?? 'friendly',
        body.privacyMode ?? 'private',
        body.onboardingComplete ? 1 : 0,
      );
    }

    // Return updated preferences
    const row = fastify.context.db.prepare(`
      SELECT display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete
      FROM user_preferences
      WHERE user_id = ?
    `).get(userId) as any;

    let goals: string[] = [];
    try {
      goals = row.goals ? JSON.parse(row.goals) : [];
    } catch {
      goals = [];
    }

    return {
      displayName: row.display_name ?? null,
      experienceLevel: row.experience_level ?? 'beginner',
      goals,
      language: row.language ?? 'en',
      tone: row.tone ?? 'friendly',
      privacyMode: row.privacy_mode ?? 'private',
      onboardingComplete: row.onboarding_complete === 1,
    };
  });
};

export default preferencesRoutes;
