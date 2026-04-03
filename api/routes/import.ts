import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import type { ExportData } from './export.js';

const importRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { importData: ExportData } }>(
    '/import/data',
    {
      schema: {
        body: {
          type: 'object',
          required: ['importData'],
          properties: {
            importData: { type: 'object' },
          },
        },
      },
    } as any,
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const importData = request.body.importData;

      if (!importData.version) {
        return reply.status(400).send({ success: false, error: 'Invalid import file: missing version' });
      }

      const results = {
        preferences: false,
        memories: 0,
        customizations: 0,
      };

      try {
        if (importData.preferences) {
          const prefs = importData.preferences;
          const existingPrefs = fastify.context.db.prepare(
            `SELECT id FROM user_preferences WHERE user_id = ?`
          ).get(userId);

          if (existingPrefs) {
            fastify.context.db.prepare(`
              UPDATE user_preferences SET display_name = ?, experience_level = ?, goals = ?, language = ?, tone = ?, privacy_mode = ?, updated_at = ?
              WHERE user_id = ?
            `).run(
              prefs.displayName ?? null,
              prefs.experienceLevel ?? 'beginner',
              JSON.stringify(prefs.goals ?? []),
              prefs.language ?? 'en',
              prefs.tone ?? 'friendly',
              prefs.privacyMode ?? 'private',
              Date.now(),
              userId
            );
          } else {
            fastify.context.db.prepare(`
              INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).run(
              `pref-${crypto.randomUUID()}`,
              userId,
              prefs.displayName ?? null,
              prefs.experienceLevel ?? 'beginner',
              JSON.stringify(prefs.goals ?? []),
              prefs.language ?? 'en',
              prefs.tone ?? 'friendly',
              prefs.privacyMode ?? 'private'
            );
          }
          results.preferences = true;
        }

        if (importData.memories?.length > 0) {
          for (const memory of importData.memories) {
            try {
              fastify.context.db.prepare(`
                INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, created_at, last_accessed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                memory.id ?? `mem-${crypto.randomUUID()}`,
                userId,
                memory.companionId,
                memory.memoryType ?? 'context',
                memory.content,
                memory.importance ?? 0.5,
                new Date(memory.createdAt).getTime() ?? Date.now(),
                Date.now()
              );
              results.memories++;
            } catch {
            }
          }
        }

        if (importData.customizations?.length > 0) {
          for (const custom of importData.customizations) {
            try {
              fastify.context.db.prepare(`
                INSERT OR REPLACE INTO companion_customizations (id, user_id, companion_id, custom_name, tone_override, personality_notes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                `custom-${crypto.randomUUID()}`,
                userId,
                custom.companionId,
                custom.customName ?? null,
                custom.toneOverride ?? null,
                custom.personalityNotes ?? null,
                Date.now()
              );
              results.customizations++;
            } catch {
            }
          }
        }

        return {
          success: true,
          imported: results,
        };
      } catch (err) {
        fastify.log.error({ err }, 'Import failed');
        return reply.status(500).send({ success: false, error: 'Import failed' });
      }
    }
  );
};

export default importRoutes;
