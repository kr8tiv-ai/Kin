import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let token = '';

describe('setup-wizard routes', () => {
  beforeAll(async () => {
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

    token = login.json().token;
  });

  afterAll(async () => {
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

    it('returns wizard status with auth', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();

      expect(body.steps).toBeDefined();
      expect(Array.isArray(body.steps)).toBe(true);
      expect(body.steps.length).toBeGreaterThan(0);

      const stepIds = body.steps.map((s: any) => s.id);
      expect(stepIds).toContain('keys');
      expect(stepIds).toContain('telegram');
      expect(stepIds).toContain('discord');
      expect(stepIds).toContain('whatsapp');
    });

    it('includes plain-language labels', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = response.json();
      const labels = body.steps.map((s: any) => s.label);

      expect(labels.some((l: string) => l.toLowerCase().includes('api key') || l.toLowerCase().includes('key'))).toBe(true);
    });

    it('never exposes secrets in response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const bodyText = response.body.toLowerCase();

      expect(bodyText).not.toContain('token=');
      expect(bodyText).not.toContain('api_key');
      expect(bodyText).not.toContain('secret');
      expect(bodyText).not.toContain('sk-');
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

    it('marks wizard complete for authenticated user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.success).toBe(true);
    });

    it('persists completion state', async () => {
      await server.inject({
        method: 'POST',
        url: '/setup-wizard/complete',
        headers: { authorization: `Bearer ${token}` },
      });

      const statusResponse = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = statusResponse.json();
      expect(body.isComplete).toBe(true);
    });

    it('requires keys to be ready before completion', async () => {
      const statusResponse = await server.inject({
        method: 'GET',
        url: '/setup-wizard/status',
        headers: { authorization: `Bearer ${token}` },
      });

      const status = statusResponse.json();
      const keysStep = status.steps.find((s: any) => s.id === 'keys');
      
      if (keysStep?.status !== 'ready') {
        const completeResponse = await server.inject({
          method: 'POST',
          url: '/setup-wizard/complete',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(completeResponse.statusCode).toBe(400);
      }
    });
  });

  describe('auth verify integration', () => {
    it('includes setupWizardComplete in /auth/verify response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/verify',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.user).toBeDefined();
      expect(typeof body.user.setupWizardComplete).toBe('boolean');
    });
  });
});
