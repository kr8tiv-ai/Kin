/**
 * Auth Routes - Authentication endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

interface TelegramAuth {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Telegram login widget verification
  fastify.post<{ Body: TelegramAuth }>('/auth/telegram', async (request, reply) => {
    const telegramData = request.body;
    
    // Verify Telegram hash
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      reply.status(500);
      return { error: 'Telegram bot token not configured' };
    }

    // Create check string
    const { hash, ...data } = telegramData;
    const checkString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${(data as any)[key]}`)
      .join('\n');

    // Verify hash (simplified - in production use proper Telegram verification)
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (hash !== expectedHash) {
      reply.status(401);
      return { error: 'Invalid Telegram authentication' };
    }

    // Check auth date (must be within 24 hours)
    const authAge = Date.now() / 1000 - telegramData.auth_date;
    if (authAge > 86400) {
      reply.status(401);
      return { error: 'Authentication expired' };
    }

    // Find or create user
    let user = fastify.context.db.prepare(`
      SELECT * FROM users WHERE telegram_id = ?
    `).get(telegramData.id) as any;

    if (!user) {
      const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      fastify.context.db.prepare(`
        INSERT INTO users (id, telegram_id, first_name, last_name, username)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        telegramData.id,
        telegramData.first_name,
        telegramData.last_name ?? null,
        telegramData.username ?? null
      );

      user = fastify.context.db.prepare(`
        SELECT * FROM users WHERE id = ?
      `).get(userId) as any;
    }

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      telegramId: user.telegram_id,
      tier: user.tier,
    }, { expiresIn: '7d' });

    return {
      token,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        tier: user.tier,
      },
    };
  });

  // Verify token
  fastify.get('/auth/verify', async (request) => {
    try {
      const decoded = await request.jwtVerify() as { userId: string };
      return { valid: true, userId: decoded.userId };
    } catch {
      return { valid: false };
    }
  });

  // Development login (skip in production)
  if (fastify.context.config.environment === 'development') {
    fastify.post<{ Body: { telegramId: number; firstName: string } }>(
      '/auth/dev-login',
      async (request, reply) => {
        const { telegramId, firstName } = request.body;

        // Find or create user
        let user = fastify.context.db.prepare(`
          SELECT * FROM users WHERE telegram_id = ?
        `).get(telegramId) as any;

        if (!user) {
          const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          fastify.context.db.prepare(`
            INSERT INTO users (id, telegram_id, first_name)
            VALUES (?, ?, ?)
          `).run(userId, telegramId, firstName);

          user = fastify.context.db.prepare(`
            SELECT * FROM users WHERE id = ?
          `).get(userId) as any;
        }

        const token = fastify.jwt.sign({
          userId: user.id,
          telegramId: user.telegram_id,
          tier: user.tier,
        }, { expiresIn: '7d' });

        return { token, user };
      }
    );
  }
};

export default authRoutes;
