import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance | null = null;
let token = '';
let userId = '';

beforeAll(async () => {
  const { createServer } = await import('../api/server.js');

  server = await createServer({
    environment: 'development',
    databasePath: ':memory:',
    jwtSecret: 'first-message-test-secret',
    rateLimitMax: 10000,
  });

  await server.ready();

  const login = await server.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { telegramId: 991001, firstName: 'Jordan' },
  });

  const loginBody = login.json<{ token: string; user: { id: string } }>();
  token = loginBody.token;
  userId = loginBody.user.id;
});

afterAll(async () => {
  if (server) await server.close();
});

describe('first-message route', () => {
  it('requires auth', async () => {
    if (!server) return;

    const response = await server.inject({
      method: 'POST',
      url: '/first-message',
      payload: { companionId: 'cipher' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the companion is not claimed', async () => {
    if (!server) return;

    const response = await server.inject({
      method: 'POST',
      url: '/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: { companionId: 'cipher' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('creates a personalized starter conversation and assistant welcome on both route paths', async () => {
    if (!server) return;

    server.context.db.prepare(`
      INSERT INTO user_companions (id, user_id, companion_id, is_active)
      VALUES ('uc-first', ?, 'cipher', 1)
    `).run(userId);

    server.context.db.prepare(`
      INSERT INTO user_preferences (
        id, user_id, display_name, experience_level, goals, language, tone, privacy_mode, onboarding_complete
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(user_id) DO UPDATE SET
        display_name = excluded.display_name,
        experience_level = excluded.experience_level,
        goals = excluded.goals,
        language = excluded.language,
        tone = excluded.tone,
        privacy_mode = excluded.privacy_mode,
        onboarding_complete = excluded.onboarding_complete
    `).run(
      'pref-first',
      userId,
      'Jordan',
      'beginner',
      JSON.stringify(['Build a Website', 'Grow My Brand']),
      'en',
      'friendly',
      'private',
    );

    server.context.db.prepare(`
      INSERT INTO memories (id, user_id, companion_id, memory_type, content, importance, is_transferable)
      VALUES
        ('mem-occ', ?, 'cipher', 'personal', 'Occupation/Industry: founder', 0.8, 1),
        ('mem-interest', ?, 'cipher', 'preference', 'Interests: design systems and storytelling', 0.8, 1),
        ('mem-project', ?, 'cipher', 'context', 'Currently working on: a premium landing page', 0.8, 1)
    `).run(userId, userId, userId);

    const legacyResponse = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: { companionId: 'cipher' },
    });

    expect(legacyResponse.statusCode).toBe(200);

    const response = await server.inject({
      method: 'POST',
      url: '/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: { companionId: 'cipher' },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      conversationId: string;
      companionId: string;
      companionName: string;
      welcomeMessage: string;
      suggestedReplies: string[];
    }>();

    expect(body.companionId).toBe('cipher');
    expect(body.companionName).toBe('Cipher');
    expect(body.conversationId).toMatch(/^conv-/);
    expect(body.welcomeMessage).toContain('Hi Jordan');
    expect(body.welcomeMessage).toContain('a premium landing page');
    expect(body.welcomeMessage).toContain('build a website');
    expect(body.welcomeMessage).toContain('privacy first');
    expect(body.suggestedReplies).toHaveLength(3);
    expect(body.suggestedReplies[0]).toContain('a premium landing page');

    const conversation = server.context.db.prepare(`
      SELECT id, title FROM conversations WHERE id = ?
    `).get(body.conversationId) as { id: string; title: string } | undefined;
    expect(conversation?.title).toBe('Meet Cipher');

    const messages = server.context.db.prepare(`
      SELECT role, content, model, provider FROM messages WHERE conversation_id = ?
    `).all(body.conversationId) as Array<{
      role: string;
      content: string;
      model: string | null;
      provider: string | null;
    }>;

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('assistant');
    expect(messages[0]?.content).toBe(body.welcomeMessage);
    expect(messages[0]?.model).toBe('starter-seed');
    expect(messages[0]?.provider).toBe('local');
  });
});
