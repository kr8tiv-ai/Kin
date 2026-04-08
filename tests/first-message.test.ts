/**
 * First Message Endpoint Tests
 *
 * Tests POST /kin/first-message — generate a personalized first companion
 * message on onboarding completion.
 *
 * Uses Fastify inject() with mocked supervisedChat.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ============================================================================
// Mocks — hoisted before any imports that reference them
// ============================================================================

const mockSupervisedChat = vi.fn();

vi.mock('../inference/supervisor.js', () => ({
  supervisedChat: (...args: any[]) => mockSupervisedChat(...args),
}));

vi.mock('../inference/fallback-handler.js', () => ({
  FallbackHandler: class {},
}));

vi.mock('../inference/companion-prompts.js', () => ({
  buildCompanionPrompt: vi.fn().mockReturnValue('mock system prompt'),
  COMPANION_SYSTEM_PROMPTS: {
    cipher: 'mock prompt',
    mischief: 'mock prompt',
    vortex: 'mock prompt',
    forge: 'mock prompt',
    aether: 'mock prompt',
    catalyst: 'mock prompt',
  },
  COMPANION_SHORT_PROMPTS: {
    cipher: 'mock short',
    mischief: 'mock short',
    vortex: 'mock short',
    forge: 'mock short',
    aether: 'mock short',
    catalyst: 'mock short',
  },
  getAvailableCompanions: () => ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst'],
  buildSoulPrompt: () => '',
}));

// ============================================================================
// Server setup
// ============================================================================

let server: FastifyInstance | null = null;
let skipReason = '';

function isOptionalDependencyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('better-sqlite3') ||
    msg.includes('ERR_DLOPEN_FAILED') ||
    msg.includes('ERR_MODULE_NOT_FOUND') ||
    msg.includes('dockerode')
  );
}

async function getAuthToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { telegramId: 999999, firstName: 'TestUser' },
  });
  const body = JSON.parse(res.body);
  return body.token;
}

beforeAll(async () => {
  try {
    // Race server creation against a timeout — better-sqlite3 can hang
    // indefinitely on Windows/WSL when native bindings aren't available (K001)
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server creation timed out — likely better-sqlite3 native module hang')), 20_000),
    );

    const create = async () => {
      const { createServer } = await import('../api/server.js');
      const s = await createServer({
        environment: 'development',
        databasePath: ':memory:',
        jwtSecret: 'test-secret',
      });
      await s.ready();
      return s;
    };

    server = await Promise.race([create(), timeout]);
  } catch (err) {
    if (isOptionalDependencyError(err) || (err instanceof Error && err.message.includes('timed out'))) {
      skipReason = `Skipping — ${(err as Error).message.slice(0, 100)}`;
      console.warn(skipReason);
    } else {
      throw err;
    }
  }
}, 25_000);

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  mockSupervisedChat.mockReset();
});

// ============================================================================
// Tests
// ============================================================================

describe('POST /kin/first-message', () => {
  it('generates a personalized first message', async () => {
    if (!server) return console.warn(skipReason);

    mockSupervisedChat.mockResolvedValueOnce({
      content: 'Hey there, Alex! Excited to start building awesome things together! 🐙',
      route: 'local',
      supervisorUsed: false,
      latencyMs: 150,
      companionId: 'cipher',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });

    const token = await getAuthToken(server);
    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        companionId: 'cipher',
        userProfile: {
          displayName: 'Alex',
          interests: ['web design', 'React'],
          goals: ['build a portfolio site'],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBeTruthy();
    expect(body.companionId).toBe('cipher');
    expect(body.route).toBe('local');
    expect(body.latencyMs).toBeTypeOf('number');

    // Verify supervisedChat was called with user context in the prompt
    expect(mockSupervisedChat).toHaveBeenCalledOnce();
    const [messages, companionId] = mockSupervisedChat.mock.calls[0];
    expect(companionId).toBe('cipher');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Alex');
    expect(messages[1].content).toContain('web design');
    expect(messages[1].content).toContain('build a portfolio site');
  });

  it('returns 404 for invalid companion ID', async () => {
    if (!server) return console.warn(skipReason);

    const token = await getAuthToken(server);
    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        companionId: 'nonexistent-companion',
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Companion not found');
    expect(mockSupervisedChat).not.toHaveBeenCalled();
  });

  it('uses fallback text when no userProfile is provided', async () => {
    if (!server) return console.warn(skipReason);

    mockSupervisedChat.mockResolvedValueOnce({
      content: 'Hey friend! Ready to explore some cool strategies together? 🐉',
      route: 'local',
      supervisorUsed: false,
      latencyMs: 120,
      companionId: 'vortex',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });

    const token = await getAuthToken(server);
    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        companionId: 'vortex',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBeTruthy();
    expect(body.companionId).toBe('vortex');

    // Verify fallback defaults are used in the prompt
    const [messages] = mockSupervisedChat.mock.calls[0];
    expect(messages[1].content).toContain('friend');
    expect(messages[1].content).toContain('exploring new things');
    expect(messages[1].content).toContain('learning and growing');
  });

  it('returns 500 when supervisor fails', async () => {
    if (!server) return console.warn(skipReason);

    mockSupervisedChat.mockRejectedValueOnce(new Error('Ollama connection refused'));

    const token = await getAuthToken(server);
    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        companionId: 'cipher',
        userProfile: { displayName: 'Test' },
      },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to generate first companion message');
  });

  it('requires authentication', async () => {
    if (!server) return console.warn(skipReason);

    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      payload: { companionId: 'cipher' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('validates request body — missing companionId', async () => {
    if (!server) return console.warn(skipReason);

    const token = await getAuthToken(server);
    const res = await server.inject({
      method: 'POST',
      url: '/kin/first-message',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    // Fastify schema validation returns 400
    expect(res.statusCode).toBe(400);
  });
});
