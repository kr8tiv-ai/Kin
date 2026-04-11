import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

import {
  getAuthRedirectPath,
  shouldRenderProtectedChildren,
  type AuthRedirectInput,
} from '../web/src/lib/auth-redirects.js';

// ============================================================================
// Backend: /auth/verify payload tests
// ============================================================================

let server: FastifyInstance;
let token = '';
let userId = '';
let canRunSqlite = true;

try {
  const probe = new Database(':memory:');
  probe.close();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3') || msg.includes('NODE_MODULE_VERSION')) {
    console.warn(
      `⚠ Skipping setup-wizard-auth-gate backend tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
    canRunSqlite = false;
  } else {
    throw err;
  }
}

const describeSqlite = canRunSqlite ? describe : describe.skip;

describeSqlite('setup wizard auth gate', () => {
  beforeAll(async () => {
    const { createServer } = await import('../api/server.js');
    server = await createServer({
      environment: 'development',
      databasePath: ':memory:',
      jwtSecret: 'setup-wizard-auth-gate-test-secret',
      rateLimitMax: 10000,
    });

    await server.ready();

    const login = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 880001, firstName: 'GateTest' },
    });

    const loginBody = login.json<{ token: string; user: { id: string } }>();
    token = loginBody.token;
    userId = loginBody.user.id;
  });

  afterAll(async () => {
    await server?.close();
  });

  // --- /auth/verify contract ---

  it('GET /auth/verify includes setupWizardComplete field defaulting to false', async () => {
    // dev-login auto-completes onboarding but not setup wizard
    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      valid: boolean;
      user: {
        onboardingComplete: boolean;
        setupWizardComplete: boolean;
        deploymentComplete: boolean;
      };
    }>();

    expect(body.valid).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.onboardingComplete).toBe(true);
    expect(body.user.setupWizardComplete).toBe(false);
    // deploymentComplete should also be present
    expect(typeof body.user.deploymentComplete).toBe('boolean');
  });

  it('GET /auth/verify reflects persisted setup_wizard_complete = true', async () => {
    server.context.db
      .prepare('UPDATE user_preferences SET setup_wizard_complete = 1 WHERE user_id = ?')
      .run(userId);

    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { setupWizardComplete: boolean } }>();
    expect(body.user.setupWizardComplete).toBe(true);

    // Reset for other tests
    server.context.db
      .prepare('UPDATE user_preferences SET setup_wizard_complete = 0 WHERE user_id = ?')
      .run(userId);
  });

  // --- Negative: missing/invalid JWT ---

  it('GET /auth/verify returns valid:false with missing JWT', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ valid: boolean }>();
    expect(body.valid).toBe(false);
  });

  it('GET /auth/verify returns valid:false with invalid JWT', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: 'Bearer this.is.garbage' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ valid: boolean }>();
    expect(body.valid).toBe(false);
  });

  // --- Negative: missing preference row ---

  it('GET /auth/verify returns false for setupWizardComplete when preference row is missing', async () => {
    // Create a user without preferences
    const bareLogin = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 880099, firstName: 'NoPref' },
    });
    const bareBody = bareLogin.json<{ token: string; user: { id: string } }>();

    // Delete the prefs row that dev-login auto-creates
    server.context.db
      .prepare('DELETE FROM user_preferences WHERE user_id = ?')
      .run(bareBody.user.id);

    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${bareBody.token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      valid: boolean;
      user: { onboardingComplete: boolean; setupWizardComplete: boolean };
    }>();

    expect(body.valid).toBe(true);
    // When no prefs row, both should default to false (fail-closed)
    expect(body.user.onboardingComplete).toBe(false);
    expect(body.user.setupWizardComplete).toBe(false);
  });

  // --- Negative: null user ---

  it('GET /auth/verify returns valid:false when user row is deleted', async () => {
    // Create a temp user, get their token, then delete them
    const tempLogin = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 889999, firstName: 'TempUser' },
    });
    const tempBody = tempLogin.json<{ token: string; user: { id: string } }>();

    // Delete the user
    server.context.db
      .prepare('DELETE FROM user_preferences WHERE user_id = ?')
      .run(tempBody.user.id);
    server.context.db
      .prepare('DELETE FROM users WHERE id = ?')
      .run(tempBody.user.id);

    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${tempBody.token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ valid: boolean }>();
    expect(body.valid).toBe(false);
  });

  // --- Verify camelCase response contract ---

  it('GET /auth/verify uses camelCase keys in user payload', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: { authorization: `Bearer ${token}` },
    });

    const body = response.json<{ user: Record<string, unknown> }>();
    const userKeys = Object.keys(body.user);

    // Must have camelCase keys, not snake_case
    expect(userKeys).toContain('firstName');
    expect(userKeys).toContain('onboardingComplete');
    expect(userKeys).toContain('setupWizardComplete');
    expect(userKeys).toContain('deploymentComplete');
    expect(userKeys).toContain('authProvider');
    expect(userKeys).toContain('createdAt');

    // Must NOT have snake_case keys
    expect(userKeys).not.toContain('first_name');
    expect(userKeys).not.toContain('onboarding_complete');
    expect(userKeys).not.toContain('setup_wizard_complete');
    expect(userKeys).not.toContain('deployment_complete');
    expect(userKeys).not.toContain('auth_provider');
    expect(userKeys).not.toContain('created_at');
  });
});

// ============================================================================
// Client-side: redirect decision logic
// ============================================================================

describe('getAuthRedirectPath', () => {
  const base: AuthRedirectInput = {
    loading: false,
    isAuthenticated: true,
    onboardingComplete: true,
    setupWizardComplete: true,
    deploymentComplete: true,
    pathname: '/dashboard/chat',
  };

  function make(overrides: Partial<AuthRedirectInput>): AuthRedirectInput {
    return { ...base, ...overrides };
  }

  // --- Loading state ---

  it('returns null while loading (no redirect during load)', () => {
    expect(getAuthRedirectPath(make({ loading: true }))).toBeNull();
  });

  // --- Gate 1: unauthenticated → /login ---

  it('redirects unauthenticated users to /login', () => {
    expect(
      getAuthRedirectPath(
        make({ isAuthenticated: false, onboardingComplete: false, setupWizardComplete: false }),
      ),
    ).toBe('/login');
  });

  it('redirects unauthenticated users to /login even from /dashboard/setup', () => {
    expect(
      getAuthRedirectPath(
        make({ isAuthenticated: false, pathname: '/dashboard/setup' }),
      ),
    ).toBe('/login');
  });

  // --- Gate 2: onboarding incomplete → /onboard ---

  it('redirects to /onboard when onboarding is incomplete', () => {
    expect(
      getAuthRedirectPath(
        make({ onboardingComplete: false, setupWizardComplete: false, pathname: '/dashboard' }),
      ),
    ).toBe('/onboard');
  });

  it('allows user to stay on /onboard when onboarding is incomplete', () => {
    expect(
      getAuthRedirectPath(
        make({ onboardingComplete: false, setupWizardComplete: false, pathname: '/onboard' }),
      ),
    ).toBeNull();
  });

  it('redirects away from /onboard once onboarding is complete', () => {
    expect(
      getAuthRedirectPath(make({ pathname: '/onboard' })),
    ).toBe('/dashboard');
  });

  // --- Gate 3: setup wizard incomplete → /dashboard/setup ---

  it('redirects to /dashboard/setup when setup wizard is incomplete', () => {
    expect(
      getAuthRedirectPath(
        make({ setupWizardComplete: false, deploymentComplete: false, pathname: '/dashboard/chat' }),
      ),
    ).toBe('/dashboard/setup');
  });

  it('allows user to stay on /dashboard/setup when setup is incomplete', () => {
    expect(
      getAuthRedirectPath(
        make({ setupWizardComplete: false, deploymentComplete: false, pathname: '/dashboard/setup' }),
      ),
    ).toBeNull();
  });

  // --- Gate 4: deployment incomplete keeps user on setup ---

  it('keeps user on /dashboard/setup when deployment is false', () => {
    expect(
      getAuthRedirectPath(
        make({ setupWizardComplete: true, deploymentComplete: false, pathname: '/dashboard/setup' }),
      ),
    ).toBeNull();
  });

  it('redirects to /dashboard/setup when deployment is false and user navigates elsewhere', () => {
    expect(
      getAuthRedirectPath(
        make({ setupWizardComplete: true, deploymentComplete: false, pathname: '/dashboard/chat' }),
      ),
    ).toBe('/dashboard/setup');
  });

  // --- Happy path: everything complete ---

  it('redirects away from /dashboard/setup once fully complete', () => {
    expect(
      getAuthRedirectPath(make({ pathname: '/dashboard/setup' })),
    ).toBe('/dashboard');
  });

  it('returns null for any dashboard route when fully complete', () => {
    expect(getAuthRedirectPath(make({ pathname: '/dashboard/chat' }))).toBeNull();
    expect(getAuthRedirectPath(make({ pathname: '/dashboard/settings' }))).toBeNull();
    expect(getAuthRedirectPath(make({ pathname: '/dashboard' }))).toBeNull();
  });

  // --- Boundary conditions from Q7 ---

  it('boundary: onboarding=false + setup=false → /onboard (onboarding takes priority)', () => {
    expect(
      getAuthRedirectPath(
        make({
          onboardingComplete: false,
          setupWizardComplete: false,
          deploymentComplete: false,
          pathname: '/dashboard',
        }),
      ),
    ).toBe('/onboard');
  });

  it('boundary: onboarding=true + setup=false → /dashboard/setup', () => {
    expect(
      getAuthRedirectPath(
        make({
          onboardingComplete: true,
          setupWizardComplete: false,
          deploymentComplete: false,
          pathname: '/dashboard',
        }),
      ),
    ).toBe('/dashboard/setup');
  });

  it('boundary: onboarding=true + setup=true + deployment=true → no redirect from /dashboard', () => {
    expect(
      getAuthRedirectPath(
        make({
          onboardingComplete: true,
          setupWizardComplete: true,
          deploymentComplete: true,
          pathname: '/dashboard',
        }),
      ),
    ).toBeNull();
  });

  // --- Help page exception ---

  it('allows /dashboard/help even when deployment is incomplete', () => {
    expect(
      getAuthRedirectPath(
        make({
          setupWizardComplete: true,
          deploymentComplete: false,
          pathname: '/dashboard/help',
        }),
      ),
    ).toBeNull();
  });
});

// ============================================================================
// shouldRenderProtectedChildren
// ============================================================================

describe('shouldRenderProtectedChildren', () => {
  it('returns false while loading', () => {
    expect(
      shouldRenderProtectedChildren({
        loading: true,
        isAuthenticated: false,
        onboardingComplete: false,
        setupWizardComplete: false,
        deploymentComplete: false,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });

  it('returns false when redirect is needed', () => {
    expect(
      shouldRenderProtectedChildren({
        loading: false,
        isAuthenticated: false,
        onboardingComplete: false,
        setupWizardComplete: false,
        deploymentComplete: false,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });

  it('returns true when no redirect needed', () => {
    expect(
      shouldRenderProtectedChildren({
        loading: false,
        isAuthenticated: true,
        onboardingComplete: true,
        setupWizardComplete: true,
        deploymentComplete: true,
        pathname: '/dashboard/chat',
      }),
    ).toBe(true);
  });
});
