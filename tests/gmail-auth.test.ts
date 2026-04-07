/**
 * Gmail OAuth API Route Tests
 *
 * Tests the /auth/gmail/authorize and /auth/gmail/callback endpoints
 * using Fastify's inject() pattern. GmailManager is mocked to avoid
 * real Google API calls and native-dependency issues.
 *
 * Follows the pattern from tests/dm-security-routes.test.ts and
 * tests/api-routes.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Mock GmailManager before importing anything that touches it
// ---------------------------------------------------------------------------

const mockGetAuthUrl = vi.fn<(state?: string) => string>();
const mockExchangeCode = vi.fn<(userId: string, code: string) => Promise<string>>();
const mockHasTokens = vi.fn<(userId: string) => boolean>();

const mockGmailManager = {
  getAuthUrl: mockGetAuthUrl,
  exchangeCode: mockExchangeCode,
  hasTokens: mockHasTokens,
  createOAuth2Client: vi.fn(),
};

vi.mock('../inference/gmail-manager.js', () => ({
  getGmailManager: vi.fn(() => mockGmailManager),
  resetGmailManager: vi.fn(),
  GMAIL_SCOPES: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
  GmailManager: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

let server: FastifyInstance | null = null;
let authToken = '';
let userId = '';
let skipReason = '';

beforeAll(async () => {
  // Set env vars required by the authorize route
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GMAIL_CALLBACK_URL = 'http://localhost:3001/auth/gmail/callback';

  try {
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-gmail-auth',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();

    // Get a dev JWT
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/dev-login',
      payload: { telegramId: 88888, firstName: 'GmailTestUser' },
    });
    const loginBody = loginRes.json();
    authToken = loginBody.token;
    userId = loginBody.user.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('dockerode') ||
      msg.includes('ERR_DLOPEN_FAILED')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
});

afterAll(async () => {
  if (server) await server.close();
  // Clean env
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GMAIL_CALLBACK_URL;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

function headers() {
  return { authorization: `Bearer ${authToken}` };
}

// ===========================================================================
// GET /auth/gmail/authorize
// ===========================================================================

describe('GET /auth/gmail/authorize', () => {
  it('returns a Google OAuth consent URL', async () => {
    if (skip()) return;

    const expectedUrl = 'https://accounts.google.com/o/oauth2/v2/auth?scope=gmail.readonly&state=user-123';
    mockGetAuthUrl.mockReturnValue(expectedUrl);

    const res = await server!.inject({
      method: 'GET',
      url: '/auth/gmail/authorize',
      headers: headers(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toBe(expectedUrl);
    // Verify state was passed (userId from JWT)
    expect(mockGetAuthUrl).toHaveBeenCalledWith(userId);
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'GET',
      url: '/auth/gmail/authorize',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 500 when GOOGLE_CLIENT_ID is missing', async () => {
    if (skip()) return;

    const savedClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    const res = await server!.inject({
      method: 'GET',
      url: '/auth/gmail/authorize',
      headers: headers(),
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toContain('GOOGLE_CLIENT_ID');

    process.env.GOOGLE_CLIENT_ID = savedClientId;
  });

  it('returns 500 when GOOGLE_CLIENT_SECRET is missing', async () => {
    if (skip()) return;

    const savedSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const res = await server!.inject({
      method: 'GET',
      url: '/auth/gmail/authorize',
      headers: headers(),
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toContain('GOOGLE_CLIENT_SECRET');

    process.env.GOOGLE_CLIENT_SECRET = savedSecret;
  });
});

// ===========================================================================
// POST /auth/gmail/callback
// ===========================================================================

describe('POST /auth/gmail/callback', () => {
  it('exchanges code and returns success with email', async () => {
    if (skip()) return;

    mockExchangeCode.mockResolvedValue('test@gmail.com');

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'auth-code-123', state: userId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.email).toBe('test@gmail.com');
    expect(mockExchangeCode).toHaveBeenCalledWith(userId, 'auth-code-123');
  });

  it('returns 401 when state does not match userId (CSRF protection)', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'auth-code-123', state: 'wrong-user-id' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toContain('state');
    // exchangeCode should NOT be called
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('returns 401 without JWT', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      payload: { code: 'auth-code-123', state: 'some-user' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no refresh token is received', async () => {
    if (skip()) return;

    mockExchangeCode.mockRejectedValue(
      new Error('No refresh token received — user may need to re-authorize with prompt=consent'),
    );

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'bad-code', state: userId },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain('refresh token');
  });

  it('returns 500 when token exchange fails for other reasons', async () => {
    if (skip()) return;

    mockExchangeCode.mockRejectedValue(new Error('Network error'));

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'error-code', state: userId },
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toContain('Failed to complete');
  });

  it('returns 400 when body is missing required fields', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'auth-code-123' }, // missing state
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is empty string', async () => {
    if (skip()) return;

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: '', state: userId },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when GOOGLE_CLIENT_ID is missing', async () => {
    if (skip()) return;

    const savedClientId = process.env.GOOGLE_CLIENT_ID;
    const savedSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const res = await server!.inject({
      method: 'POST',
      url: '/auth/gmail/callback',
      headers: headers(),
      payload: { code: 'auth-code-123', state: userId },
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toContain('not configured');

    process.env.GOOGLE_CLIENT_ID = savedClientId;
    process.env.GOOGLE_CLIENT_SECRET = savedSecret;
  });
});
