import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

let server: FastifyInstance;
let token = '';
let tempStateDir = '';
let canRunSqlite = true;

try {
  const probe = new Database(':memory:');
  probe.close();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3') || msg.includes('NODE_MODULE_VERSION')) {
    console.warn(
      `⚠ Skipping installer-routes tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
    canRunSqlite = false;
  } else {
    throw err;
  }
}

const describeSqlite = canRunSqlite ? describe : describe.skip;

describeSqlite('installer routes', () => {
  beforeAll(async () => {
    tempStateDir = mkdtempSync(path.join(os.tmpdir(), 'installer-route-test-'));
    process.env.INSTALLER_STATE_DIR = tempStateDir;

    const { createServer } = await import('../api/server.js');
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'installer-routes-test-secret',
      rateLimitMax: 10000,
    });

    await server.ready();

    const login = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 777001, firstName: 'InstallerTest' },
    });

    token = login.json<{ token: string }>().token;
  });

  afterAll(async () => {
    delete process.env.INSTALLER_STATE_DIR;
    rmSync(tempStateDir, { recursive: true, force: true });
    await server?.close();
  });

  beforeEach(async () => {
    // Reset state before each case
    await server.inject({
      method: 'POST',
      url: '/installer/restart',
      headers: { authorization: `Bearer ${token}` },
    });
  });

  it('GET /installer/status returns current installer state', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/installer/status',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      status: string;
      currentPhase: string;
      retryCount: number;
      maxRetries: number;
    }>();

    expect(body.status).toBe('idle');
    expect(body.currentPhase).toBe('preflight');
    expect(body.retryCount).toBe(0);
    expect(body.maxRetries).toBeGreaterThanOrEqual(1);
  });

  it('POST /installer/retry executes installer and returns updated state', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/installer/retry',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; currentPhase: string }>();

    expect(body.status).toBe('complete');
    expect(body.currentPhase).toBe('complete');
  });

  it('POST /installer/confirm-external validates payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/installer/confirm-external',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /installer/restart resets installer state to idle preflight', async () => {
    await server.inject({
      method: 'POST',
      url: '/installer/retry',
      headers: { authorization: `Bearer ${token}` },
    });

    const restart = await server.inject({
      method: 'POST',
      url: '/installer/restart',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(restart.statusCode).toBe(200);

    const body = restart.json<{ status: string; currentPhase: string }>();
    expect(body.status).toBe('idle');
    expect(body.currentPhase).toBe('preflight');
  });
});
