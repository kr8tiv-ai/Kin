import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let token = '';
let userId = '';

const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'GROQ_API_KEY',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'WHATSAPP_AUTH_DIR',
] as const;

const previousEnv: Record<string, string | undefined> = {};

describe('setup-wizard routes', () => {
  beforeAll(async () => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
    }

    process.env.TELEGRAM_BOT_TOKEN = 'tg-super-secret-test-token';
    process.env.GROQ_API_KEY = 'groq-super-secret-test-key';
    process.env.DISCORD_BOT_TOKEN = 'discord-test-token';
    process.env.DISCORD_CLIENT_ID = 'discord-app-test-id';
    process.env.WHATSAPP_AUTH_DIR = '.tmp-whatsapp-auth';

    const { createServer } = await import('../api/server.js');
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'setup-wizard-test-secret',
      rateLimitMax: 10000,
    });

    await server.ready();

    const login = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 777001, firstName: 'WizardTest' },
    });

    const loginBody = login.json<{ token: string; user: { id: string } }>();
    token = loginBody.token;
    userId = loginBody.user.id;
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }

    await server.close();
  });

  describe('GET /setup-wizard/status', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns deterministic step IDs and completion metadata', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        steps: Array<{ id: string; message: string; nextActions: string[] }>;
        completion: { persisted: boolean; eligible: boolean; reason: string | null };
        isComplete: boolean;
      }>();

      expect(body.steps.map((step) => step.id)).toEqual([
        'keys',
        'telegram',
        'discord',
        'whatsapp',
      ]);

      expect(body.steps.every((step) => typeof step.message === 'string')).toBe(true);
      expect(body.steps.every((step) => Array.isArray(step.nextActions))).toBe(true);
      expect(typeof body.completion.persisted).toBe('boolean');
      expect(typeof body.completion.eligible).toBe('boolean');
      expect(typeof body.isComplete).toBe('boolean');
    });

    it('never exposes secret values in response body', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const bodyText = response.body;

      expect(bodyText).not.toContain('tg-super-secret-test-token');
      expect(bodyText).not.toContain('groq-super-secret-test-key');
      expect(bodyText.toLowerCase()).not.toContain('token=');
      expect(bodyText.toLowerCase()).not.toContain('api_key=');
      expect(bodyText.toLowerCase()).not.toContain('secret=');
    });
  });

  describe('POST /setup-wizard/complete', () => {
    it('returns 401 without auth', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects malformed completion payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('requires explicit confirmation', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { confirmed: false },
      });

      expect(response.statusCode).toBe(400);
    });

    it('marks completion state and persists it for the authenticated user', async () => {
      const completeResponse = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { confirmed: true },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completeBody = completeResponse.json<{ success: boolean; isComplete: boolean }>();
      expect(completeBody.success).toBe(true);
      expect(completeBody.isComplete).toBe(true);

      const persisted = server.context.db
        .prepare('SELECT setup_wizard_complete FROM user_preferences WHERE user_id = ?')
        .get(userId) as { setup_wizard_complete: number } | undefined;

      expect(persisted?.setup_wizard_complete).toBe(1);

      const statusResponse = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const status = statusResponse.json<{
        completion: { persisted: boolean; eligible: boolean };
        isComplete: boolean;
      }>();

      expect(status.completion.persisted).toBe(true);
      expect(status.completion.eligible).toBe(true);
      expect(status.isComplete).toBe(true);
    });

    it('fails closed when a required key is missing', async () => {
      const previousGroq = process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY;

      const response = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { confirmed: true },
      });

      if (previousGroq === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = previousGroq;
      }

      expect(response.statusCode).toBe(400);
    });
  });

  describe('/auth/verify integration', () => {
    it('includes setupWizardComplete in the auth payload', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/verify',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ user: { setupWizardComplete: boolean } }>();
      expect(typeof body.user.setupWizardComplete).toBe('boolean');
    });
  });
});
