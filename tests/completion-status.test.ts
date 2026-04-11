import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

let server: FastifyInstance;
let token = '';
let userId = '';
let canRunSqlite = true;

const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'GROQ_API_KEY',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'WHATSAPP_AUTH_DIR',
  'INSTALLER_STATE_DIR',
] as const;

const previousEnv: Record<string, string | undefined> = {};

try {
  const probe = new Database(':memory:');
  probe.close();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3') || msg.includes('NODE_MODULE_VERSION')) {
    console.warn(
      `⚠ Skipping completion-status tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
    canRunSqlite = false;
  } else {
    throw err;
  }
}

const describeSqlite = canRunSqlite ? describe : describe.skip;

describeSqlite('completion-status', () => {
  beforeAll(async () => {
    // Save and set env
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
    }
    process.env.TELEGRAM_BOT_TOKEN = 'test-tg-token';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.DISCORD_BOT_TOKEN = 'test-discord-token';
    process.env.DISCORD_CLIENT_ID = 'test-discord-id';
    process.env.WHATSAPP_AUTH_DIR = '.tmp-whatsapp';
    delete process.env.INSTALLER_STATE_DIR; // Local-only: installer gate = ready

    const { createServer } = await import('../api/server.js');
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'completion-test-secret',
      rateLimitMax: 10000,
    });

    await server.ready();

    const login = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 888001, firstName: 'CompletionTest' },
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
    await server?.close();
  });

  // Mark wizard complete before each test so wizard gate doesn't block unless we want it to
  beforeEach(() => {
    server.context.db.prepare(`
      UPDATE user_preferences SET setup_wizard_complete = 1, deployment_complete = 0 WHERE user_id = ?
    `).run(userId);
  });

  // --- Helper ---
  async function getStatus() {
    const res = await server.inject({
      method: 'GET',
      url: '/completion/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  // ==========================================================================
  // 1. All gates ready → overallComplete true, zero blocking reasons
  // ==========================================================================
  it('all gates ready → overallComplete true, zero blocking reasons', async () => {
    const body = await getStatus();

    expect(body.overallComplete).toBe(true);
    expect(body.blockingReasons).toEqual([]);
    expect(body.gates).toBeInstanceOf(Array);

    const installerGate = body.gates.find((g: any) => g.id === 'installer');
    expect(installerGate.ready).toBe(true);

    const wizardGate = body.gates.find((g: any) => g.id === 'wizard');
    expect(wizardGate.ready).toBe(true);
  });

  // ==========================================================================
  // 2. Installer not ready → overallComplete false, installer gate blocking
  // ==========================================================================
  it('installer not ready → overallComplete false, installer gate blocking', async () => {
    // Set INSTALLER_STATE_DIR to a path so the installer gate evaluates
    const prevDir = process.env.INSTALLER_STATE_DIR;
    process.env.INSTALLER_STATE_DIR = '/tmp/fake-installer-state-dir-completiontest';

    // Create a state file that says status != 'complete'
    const fs = await import('fs');
    const path = `/tmp/fake-installer-state-dir-completiontest/${userId}.json`;
    fs.mkdirSync('/tmp/fake-installer-state-dir-completiontest', { recursive: true });
    fs.writeFileSync(path, JSON.stringify({ status: 'in-progress', currentPhase: 'dependencies' }));

    try {
      const body = await getStatus();
      expect(body.overallComplete).toBe(false);

      const installerGate = body.gates.find((g: any) => g.id === 'installer');
      expect(installerGate.ready).toBe(false);
      expect(installerGate.recoveryActions.length).toBeGreaterThan(0);
      expect(body.blockingReasons.length).toBeGreaterThan(0);
    } finally {
      // Cleanup
      try { fs.unlinkSync(path); } catch {}
      try { fs.rmdirSync('/tmp/fake-installer-state-dir-completiontest'); } catch {}
      if (prevDir === undefined) {
        delete process.env.INSTALLER_STATE_DIR;
      } else {
        process.env.INSTALLER_STATE_DIR = prevDir;
      }
    }
  });

  // ==========================================================================
  // 3. Wizard not ready → overallComplete false, wizard gate blocking
  // ==========================================================================
  it('wizard not ready → overallComplete false, wizard gate blocking', async () => {
    // Remove a required env key to make wizard step block
    const prevGroq = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    // Also un-persist wizard completion
    server.context.db.prepare(`
      UPDATE user_preferences SET setup_wizard_complete = 0 WHERE user_id = ?
    `).run(userId);

    try {
      const body = await getStatus();
      expect(body.overallComplete).toBe(false);

      const wizardGate = body.gates.find((g: any) => g.id === 'wizard');
      expect(wizardGate.ready).toBe(false);
      expect(wizardGate.recoveryActions).toContain('open-setup-wizard');
    } finally {
      if (prevGroq === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = prevGroq;
      }
    }
  });

  // ==========================================================================
  // 4. Cloud deploy exists but not ready → overallComplete false, cloud gate blocking
  // ==========================================================================
  it('cloud deploy exists but not ready → overallComplete false, cloud gate blocking', async () => {
    // Insert a project with a deploy_provider but status != 'deployed'
    const { randomUUID } = await import('crypto');
    const projectId = randomUUID();
    server.context.db.prepare(`
      INSERT INTO projects (id, user_id, companion_id, name, project_type, status, deploy_provider)
      VALUES (?, ?, 'cipher', 'Test Project', 'website', 'in_progress', 'vercel')
    `).run(projectId, userId);

    try {
      const body = await getStatus();
      expect(body.overallComplete).toBe(false);

      const cloudGate = body.gates.find((g: any) => g.id === 'cloud');
      expect(cloudGate.ready).toBe(false);
      expect(cloudGate.recoveryActions).toContain('check-deploy-status');
      expect(body.blockingReasons).toContain('Cloud deployment not yet verified');
    } finally {
      server.context.db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
    }
  });

  // ==========================================================================
  // 5. No cloud deploy → overallComplete true (cloud gate skipped), totalGates = 2
  // ==========================================================================
  it('no cloud deploy → overallComplete true (cloud gate skipped), totalGates = 2', async () => {
    // Ensure no projects with deploy_provider exist
    server.context.db.prepare(`DELETE FROM projects WHERE user_id = ?`).run(userId);

    const body = await getStatus();
    expect(body.overallComplete).toBe(true);
    expect(body.progress.totalGates).toBe(2);
    expect(body.progress.completedGates).toBe(2);
    expect(body.progress.summary).toBe('2 of 2 setup gates complete');

    const cloudGate = body.gates.find((g: any) => g.id === 'cloud');
    expect(cloudGate.description).toBe('No cloud deployment configured (optional)');
    // Cloud gate shows as ready (not applicable = passes gate math)
    expect(cloudGate.ready).toBe(true);
  });

  // ==========================================================================
  // 6. POST /completion/complete rejects when gates are blocking
  // ==========================================================================
  it('POST /completion/complete rejects when gates are blocking', async () => {
    // Remove GROQ key to make wizard block
    const prevGroq = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    server.context.db.prepare(`
      UPDATE user_preferences SET setup_wizard_complete = 0 WHERE user_id = ?
    `).run(userId);

    try {
      const res = await server.inject({
        method: 'POST',
        url: '/completion/complete',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
    } finally {
      if (prevGroq === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = prevGroq;
      }
    }
  });

  // ==========================================================================
  // 7. POST /completion/complete succeeds when all applicable gates pass
  // ==========================================================================
  it('POST /completion/complete succeeds when all applicable gates pass', async () => {
    // All env keys set, wizard complete, no cloud deploy → all gates pass
    server.context.db.prepare(`DELETE FROM projects WHERE user_id = ?`).run(userId);

    const res = await server.inject({
      method: 'POST',
      url: '/completion/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
  });

  // ==========================================================================
  // 8. Plain-language descriptions are non-empty strings
  // ==========================================================================
  it('plain-language descriptions are non-empty strings', async () => {
    const body = await getStatus();
    for (const gate of body.gates) {
      expect(typeof gate.description).toBe('string');
      expect(gate.description.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // 9. Recovery actions are non-empty arrays when gate is not ready
  // ==========================================================================
  it('recovery actions are non-empty arrays when gate is not ready', async () => {
    // Make wizard not ready
    const prevGroq = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    server.context.db.prepare(`
      UPDATE user_preferences SET setup_wizard_complete = 0 WHERE user_id = ?
    `).run(userId);

    try {
      const body = await getStatus();
      const wizardGate = body.gates.find((g: any) => g.id === 'wizard');
      expect(wizardGate.ready).toBe(false);
      expect(Array.isArray(wizardGate.recoveryActions)).toBe(true);
      expect(wizardGate.recoveryActions.length).toBeGreaterThan(0);
    } finally {
      if (prevGroq === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = prevGroq;
      }
    }
  });

  // ==========================================================================
  // Negative: Missing user_preferences row → defaults
  // ==========================================================================
  it('missing user_preferences row → wizard gate not-ready, installer ready', async () => {
    // Create a fresh user with no preferences row
    const login2 = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 888999, firstName: 'NoPrefUser' },
    });
    const { token: token2, user: user2 } = login2.json<{ token: string; user: { id: string } }>();

    // Delete their preferences row (dev-login creates one)
    server.context.db.prepare(`DELETE FROM user_preferences WHERE user_id = ?`).run(user2.id);

    const res = await server.inject({
      method: 'GET',
      url: '/completion/status',
      headers: { authorization: `Bearer ${token2}` },
    });
    const body = res.json();

    const wizardGate = body.gates.find((g: any) => g.id === 'wizard');
    expect(wizardGate.ready).toBe(false);

    // Installer ready because no INSTALLER_STATE_DIR
    const installerGate = body.gates.find((g: any) => g.id === 'installer');
    expect(installerGate.ready).toBe(true);
  });

  // ==========================================================================
  // Negative: No projects rows → cloud gate is not applicable, totalGates = 2
  // ==========================================================================
  it('no projects rows → cloud gate not applicable, totalGates = 2', async () => {
    server.context.db.prepare(`DELETE FROM projects WHERE user_id = ?`).run(userId);

    const body = await getStatus();
    expect(body.progress.totalGates).toBe(2);
  });

  // ==========================================================================
  // Negative: Already-complete user calling POST /completion/complete → 400
  // ==========================================================================
  it('already-complete user calling POST /completion/complete → returns 400', async () => {
    // Mark deployment_complete
    server.context.db.prepare(`
      UPDATE user_preferences SET deployment_complete = 1 WHERE user_id = ?
    `).run(userId);

    const res = await server.inject({
      method: 'POST',
      url: '/completion/complete',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Already complete');
  });

  // ==========================================================================
  // Progress summary reads like plain English
  // ==========================================================================
  it('progress summary reads like plain English', async () => {
    const body = await getStatus();
    expect(body.progress.summary).toMatch(/^\d+ of \d+ setup gates complete$/);
  });
});
