/**
 * Progress Routes - User progress, XP, levels, badges, streaks
 */

import { FastifyPluginAsync } from 'fastify';

const progressRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /progress — current user's progress
  fastify.get('/progress', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const row = fastify.context.db.prepare(`
      SELECT * FROM progress WHERE user_id = ?
    `).get(userId) as any;

    if (!row) {
      // Return defaults for users without a progress row yet
      return {
        xp: 0,
        level: 1,
        totalMessages: 0,
        totalProjects: 0,
        totalVoiceNotes: 0,
        currentStreak: 0,
        longestStreak: 0,
        badges: [],
        lastActiveDate: null,
        joinedAt: null,
      };
    }

    let badges: string[] = [];
    try {
      badges = row.badges ? JSON.parse(row.badges) : [];
    } catch {
      badges = [];
    }

    // Get user join date
    const user = fastify.context.db.prepare(`
      SELECT created_at FROM users WHERE id = ?
    `).get(userId) as any;

    return {
      xp: row.xp ?? 0,
      level: row.level ?? 1,
      totalMessages: row.total_messages ?? 0,
      totalProjects: row.total_projects ?? 0,
      totalVoiceNotes: row.total_voice_notes ?? 0,
      currentStreak: row.current_streak ?? 0,
      longestStreak: row.longest_streak ?? 0,
      badges,
      lastActiveDate: row.last_active_date ?? null,
      joinedAt: user ? new Date(user.created_at).toISOString() : null,
    };
  });
};

export default progressRoutes;
