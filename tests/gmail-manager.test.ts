/**
 * GmailManager test suite.
 *
 * Fully mocks `googleapis` and `better-sqlite3` so no real Google API calls
 * or database I/O occur.  Covers: encryption round-trip, OAuth2 client creation,
 * token exchange, token refresh, every Gmail API wrapper, empty-inbox edge case,
 * and error paths (expired token, API errors, missing credentials).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GmailManager,
  encrypt,
  decrypt,
  GMAIL_SCOPES,
  getGmailManager,
  resetGmailManager,
  type GmailCredentials,
} from '../inference/gmail-manager.js';

// ---------------------------------------------------------------------------
// Mock googleapis
// ---------------------------------------------------------------------------

// Gmail API method stubs
const mockMessagesList = vi.fn();
const mockMessagesGet = vi.fn();
const mockDraftsCreate = vi.fn();
const mockDraftsSend = vi.fn();
const mockUsersGetProfile = vi.fn();
const mockGetToken = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockGenerateAuthUrl = vi.fn();
const mockRevokeToken = vi.fn();

const mockOAuth2Instance = {
  getToken: mockGetToken,
  refreshAccessToken: mockRefreshAccessToken,
  setCredentials: mockSetCredentials,
  generateAuthUrl: mockGenerateAuthUrl,
  revokeToken: mockRevokeToken,
};

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => mockOAuth2Instance),
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: mockMessagesList,
          get: mockMessagesGet,
        },
        drafts: {
          create: mockDraftsCreate,
          send: mockDraftsSend,
        },
        getProfile: mockUsersGetProfile,
      },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Mock db/connection
// ---------------------------------------------------------------------------

const mockPrepare = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();

vi.mock('../db/connection.js', () => ({
  getDb: vi.fn(() => ({
    prepare: mockPrepare,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-jwt-secret-for-gmail-tests-abc123';

const TEST_CREDS: GmailCredentials = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3002/auth/google/callback',
};

function makeManager(): GmailManager {
  return new GmailManager(TEST_CREDS, TEST_SECRET);
}

/**
 * Wire up mockPrepare so .prepare(sql).get(...) and .prepare(sql).run(...)
 * delegate to mockGet / mockRun respectively.
 */
function setupDbMock(): void {
  mockPrepare.mockReturnValue({
    get: mockGet,
    run: mockRun,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GmailManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDbMock();
  });

  afterEach(() => {
    resetGmailManager();
  });

  // =========================================================================
  // Encryption / Decryption
  // =========================================================================

  describe('encrypt / decrypt', () => {
    it('round-trips plaintext correctly', () => {
      const plaintext = 'my-secret-refresh-token-1234567890';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-token';
      const a = encrypt(plaintext, TEST_SECRET);
      const b = encrypt(plaintext, TEST_SECRET);
      expect(a).not.toBe(b);
      // But both decrypt to the same value
      expect(decrypt(a, TEST_SECRET)).toBe(plaintext);
      expect(decrypt(b, TEST_SECRET)).toBe(plaintext);
    });

    it('fails with wrong secret', () => {
      const encrypted = encrypt('secret-data', TEST_SECRET);
      expect(() => decrypt(encrypted, 'wrong-secret')).toThrow();
    });

    it('fails with malformed ciphertext', () => {
      expect(() => decrypt('not-valid', TEST_SECRET)).toThrow(
        'Invalid ciphertext format',
      );
    });

    it('handles empty string', () => {
      const encrypted = encrypt('', TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe('');
    });

    it('handles unicode characters', () => {
      const plaintext = 'トークン🔑密码';
      const encrypted = encrypt(plaintext, TEST_SECRET);
      const decrypted = decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });
  });

  // =========================================================================
  // OAuth2 client creation
  // =========================================================================

  describe('createOAuth2Client', () => {
    it('creates an OAuth2 client that has expected methods', () => {
      const manager = makeManager();
      const client = manager.createOAuth2Client();

      // The mock returns our mockOAuth2Instance which has all the
      // OAuth2 methods we need
      expect(client).toBe(mockOAuth2Instance);
      expect(client.getToken).toBeDefined();
      expect(client.setCredentials).toBeDefined();
      expect(client.generateAuthUrl).toBeDefined();
      expect(client.refreshAccessToken).toBeDefined();
    });
  });

  // =========================================================================
  // Auth URL generation
  // =========================================================================

  describe('getAuthUrl', () => {
    it('generates auth URL with correct scopes and offline access', () => {
      mockGenerateAuthUrl.mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?...',
      );
      const manager = makeManager();
      const url = manager.getAuthUrl('some-state');

      expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        prompt: 'consent',
        scope: GMAIL_SCOPES,
        state: 'some-state',
      });
      expect(url).toContain('accounts.google.com');
    });
  });

  // =========================================================================
  // Token exchange
  // =========================================================================

  describe('exchangeCode', () => {
    it('exchanges code, encrypts tokens, and persists to DB', async () => {
      mockGetToken.mockResolvedValue({
        tokens: {
          refresh_token: 'rt-123',
          access_token: 'at-456',
          expiry_date: Date.now() + 3600_000,
        },
      });
      mockUsersGetProfile.mockResolvedValue({
        data: { emailAddress: 'user@gmail.com' },
      });

      const manager = makeManager();
      const email = await manager.exchangeCode('user-1', 'auth-code-xyz');

      expect(email).toBe('user@gmail.com');
      expect(mockGetToken).toHaveBeenCalledWith('auth-code-xyz');
      expect(mockSetCredentials).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledTimes(1);

      // Verify the DB insert args
      const insertArgs = mockRun.mock.calls[0]!;
      expect(insertArgs[0]).toBe('oauth-user-1-gmail'); // id
      expect(insertArgs[1]).toBe('user-1'); // user_id
      expect(insertArgs[2]).toBe('gmail'); // provider
      // encrypted tokens should be colon-separated hex strings
      expect((insertArgs[3] as string).split(':').length).toBe(3);
    });

    it('throws when no refresh token received', async () => {
      mockGetToken.mockResolvedValue({
        tokens: { access_token: 'at-only', refresh_token: null },
      });

      const manager = makeManager();
      await expect(
        manager.exchangeCode('user-1', 'code'),
      ).rejects.toThrow('No refresh token received');
    });
  });

  // =========================================================================
  // Authenticated client / token refresh
  // =========================================================================

  describe('getAuthenticatedClient', () => {
    it('loads tokens from DB and returns client with valid access token', async () => {
      const encryptedRefresh = encrypt('rt-stored', TEST_SECRET);
      const encryptedAccess = encrypt('at-stored', TEST_SECRET);
      const futureExpiry = Date.now() + 60 * 60 * 1000; // 1 hour from now

      mockGet.mockReturnValue({
        id: 'oauth-u1-gmail',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: futureExpiry,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const manager = makeManager();
      const client = await manager.getAuthenticatedClient('u1');

      expect(client).toBe(mockOAuth2Instance);
      expect(mockSetCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          refresh_token: 'rt-stored',
          access_token: 'at-stored',
        }),
      );
      // Should not refresh since token is valid
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes expired access token and persists new one', async () => {
      const encryptedRefresh = encrypt('rt-stored', TEST_SECRET);
      const pastExpiry = Date.now() - 60_000; // expired 1 minute ago

      mockGet.mockReturnValue({
        id: 'oauth-u1-gmail',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encrypt('at-expired', TEST_SECRET),
        tokenExpiry: pastExpiry,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'at-refreshed',
          expiry_date: Date.now() + 3600_000,
        },
      });

      const manager = makeManager();
      await manager.getAuthenticatedClient('u1');

      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
      // Should persist the refreshed token
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('refreshes when no access token stored', async () => {
      const encryptedRefresh = encrypt('rt-only', TEST_SECRET);

      mockGet.mockReturnValue({
        id: 'oauth-u1-gmail',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: null,
        tokenExpiry: null,
        scopes: GMAIL_SCOPES.join(' '),
        email: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'at-new',
          expiry_date: Date.now() + 3600_000,
        },
      });

      const manager = makeManager();
      await manager.getAuthenticatedClient('u1');

      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('throws when no tokens found for user', async () => {
      mockGet.mockReturnValue(undefined);

      const manager = makeManager();
      await expect(
        manager.getAuthenticatedClient('unknown-user'),
      ).rejects.toThrow('No Gmail tokens found');
    });
  });

  // =========================================================================
  // hasTokens
  // =========================================================================

  describe('hasTokens', () => {
    it('returns true when tokens exist', () => {
      mockGet.mockReturnValue({ 1: 1 });
      const manager = makeManager();
      expect(manager.hasTokens('u1')).toBe(true);
    });

    it('returns false when no tokens', () => {
      mockGet.mockReturnValue(undefined);
      const manager = makeManager();
      expect(manager.hasTokens('u1')).toBe(false);
    });
  });

  // =========================================================================
  // revokeTokens
  // =========================================================================

  describe('revokeTokens', () => {
    it('revokes token and deletes from DB', async () => {
      const encryptedRefresh = encrypt('rt-to-revoke', TEST_SECRET);
      mockGet.mockReturnValue({
        encrypted_refresh_token: encryptedRefresh,
      });

      const manager = makeManager();
      await manager.revokeTokens('u1');

      expect(mockRevokeToken).toHaveBeenCalledWith('rt-to-revoke');
      expect(mockRun).toHaveBeenCalledWith('u1', 'gmail');
    });

    it('deletes from DB even if revoke fails', async () => {
      const encryptedRefresh = encrypt('rt-bad', TEST_SECRET);
      mockGet.mockReturnValue({
        encrypted_refresh_token: encryptedRefresh,
      });
      mockRevokeToken.mockRejectedValue(new Error('revoke failed'));

      const manager = makeManager();
      await manager.revokeTokens('u1');

      // Should still delete
      expect(mockRun).toHaveBeenCalledWith('u1', 'gmail');
    });

    it('handles no tokens gracefully', async () => {
      mockGet.mockReturnValue(undefined);

      const manager = makeManager();
      await manager.revokeTokens('u1');

      // Should still attempt delete (idempotent)
      expect(mockRun).toHaveBeenCalled();
      expect(mockRevokeToken).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // listMessages
  // =========================================================================

  describe('listMessages', () => {
    function setupAuthenticatedClient(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('returns unread messages with summaries', async () => {
      setupAuthenticatedClient();

      mockMessagesList.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-1', threadId: 'thr-1' }],
          resultSizeEstimate: 5,
        },
      });

      mockMessagesGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: 'From', value: 'alice@example.com' },
              { name: 'Subject', value: 'Hello!' },
              { name: 'Date', value: 'Mon, 1 Jan 2025 12:00:00 GMT' },
            ],
          },
          snippet: 'Hey there...',
        },
      });

      const manager = makeManager();
      const result = await manager.listMessages('u1');

      expect(result.unreadCount).toBe(5);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.subject).toBe('Hello!');
      expect(result.messages[0]!.from).toBe('alice@example.com');
      expect(result.messages[0]!.snippet).toBe('Hey there...');
    });

    it('handles empty inbox', async () => {
      setupAuthenticatedClient();

      mockMessagesList.mockResolvedValue({
        data: { messages: null, resultSizeEstimate: 0 },
      });

      const manager = makeManager();
      const result = await manager.listMessages('u1');

      expect(result.unreadCount).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it('passes custom query and maxResults', async () => {
      setupAuthenticatedClient();

      mockMessagesList.mockResolvedValue({
        data: { messages: [], resultSizeEstimate: 0 },
      });

      const manager = makeManager();
      await manager.listMessages('u1', {
        query: 'from:bob@example.com',
        maxResults: 5,
      });

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'from:bob@example.com',
          maxResults: 5,
        }),
      );
    });
  });

  // =========================================================================
  // getMessage
  // =========================================================================

  describe('getMessage', () => {
    function setupAuth(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('fetches and decodes a full message', async () => {
      setupAuth();

      const bodyText = 'Hello World';
      const encoded = Buffer.from(bodyText)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      mockMessagesGet.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thr-1',
          snippet: 'Hello...',
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'From', value: 'alice@example.com' },
              { name: 'To', value: 'bob@example.com' },
              { name: 'Subject', value: 'Test' },
              { name: 'Date', value: 'Mon, 1 Jan 2025 12:00:00 GMT' },
            ],
            body: { data: encoded },
          },
        },
      });

      const manager = makeManager();
      const msg = await manager.getMessage('u1', 'msg-1');

      expect(msg.subject).toBe('Test');
      expect(msg.from).toBe('alice@example.com');
      expect(msg.to).toBe('bob@example.com');
      expect(msg.body).toBe('Hello World');
    });

    it('extracts body from multipart message', async () => {
      setupAuth();

      const bodyText = 'Plain text body';
      const encoded = Buffer.from(bodyText)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      mockMessagesGet.mockResolvedValue({
        data: {
          id: 'msg-2',
          threadId: 'thr-2',
          snippet: 'Plain...',
          payload: {
            mimeType: 'multipart/alternative',
            headers: [
              { name: 'From', value: 'carol@example.com' },
              { name: 'To', value: 'dave@example.com' },
              { name: 'Subject', value: 'Multi' },
              { name: 'Date', value: 'Tue, 2 Jan 2025 12:00:00 GMT' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: encoded },
              },
              {
                mimeType: 'text/html',
                body: { data: Buffer.from('<b>HTML</b>').toString('base64') },
              },
            ],
          },
        },
      });

      const manager = makeManager();
      const msg = await manager.getMessage('u1', 'msg-2');

      // Should prefer text/plain over text/html
      expect(msg.body).toBe('Plain text body');
    });
  });

  // =========================================================================
  // createDraft
  // =========================================================================

  describe('createDraft', () => {
    function setupAuth(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('creates a draft with RFC 2822 encoded message', async () => {
      setupAuth();

      mockDraftsCreate.mockResolvedValue({
        data: {
          id: 'draft-1',
          message: { id: 'msg-draft-1' },
        },
      });

      const manager = makeManager();
      const result = await manager.createDraft(
        'u1',
        'recipient@example.com',
        'Test Subject',
        'Draft body text',
      );

      expect(result.draftId).toBe('draft-1');
      expect(result.messageId).toBe('msg-draft-1');
      expect(mockDraftsCreate).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: expect.any(String),
          },
        },
      });

      // Verify the raw message can be decoded
      const raw = mockDraftsCreate.mock.calls[0]![0].requestBody.message.raw;
      const decoded = Buffer.from(
        raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf-8');
      expect(decoded).toContain('To: recipient@example.com');
      expect(decoded).toContain('Subject: Test Subject');
      expect(decoded).toContain('Draft body text');
    });
  });

  // =========================================================================
  // sendDraft
  // =========================================================================

  describe('sendDraft', () => {
    function setupAuth(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('sends a draft by ID', async () => {
      setupAuth();

      mockDraftsSend.mockResolvedValue({
        data: { id: 'sent-msg-1' },
      });

      const manager = makeManager();
      const result = await manager.sendDraft('u1', 'draft-1');

      expect(result).toBe('sent-msg-1');
      expect(mockDraftsSend).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: { id: 'draft-1' },
      });
    });
  });

  // =========================================================================
  // getProfile
  // =========================================================================

  describe('getProfile', () => {
    function setupAuth(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('returns profile data', async () => {
      setupAuth();

      mockUsersGetProfile.mockResolvedValue({
        data: {
          emailAddress: 'user@gmail.com',
          messagesTotal: 1500,
          threadsTotal: 800,
          historyId: '12345',
        },
      });

      const manager = makeManager();
      const profile = await manager.getProfile('u1');

      expect(profile.emailAddress).toBe('user@gmail.com');
      expect(profile.messagesTotal).toBe(1500);
      expect(profile.threadsTotal).toBe(800);
      expect(profile.historyId).toBe('12345');
    });
  });

  // =========================================================================
  // Error paths
  // =========================================================================

  describe('error paths', () => {
    function setupAuth(): void {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      const encryptedAccess = encrypt('at', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: encryptedAccess,
        tokenExpiry: Date.now() + 3600_000,
        scopes: GMAIL_SCOPES.join(' '),
        email: 'u1@gmail.com',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    it('propagates Gmail API errors from listMessages', async () => {
      setupAuth();
      mockMessagesList.mockRejectedValue(
        new Error('403: Rate limit exceeded'),
      );

      const manager = makeManager();
      await expect(manager.listMessages('u1')).rejects.toThrow(
        '403: Rate limit exceeded',
      );
    });

    it('propagates Gmail API errors from getMessage', async () => {
      setupAuth();
      mockMessagesGet.mockRejectedValue(new Error('404: Message not found'));

      const manager = makeManager();
      await expect(manager.getMessage('u1', 'bad-id')).rejects.toThrow(
        '404: Message not found',
      );
    });

    it('propagates Gmail API errors from createDraft', async () => {
      setupAuth();
      mockDraftsCreate.mockRejectedValue(
        new Error('400: Invalid recipient'),
      );

      const manager = makeManager();
      await expect(
        manager.createDraft('u1', 'bad', 'Sub', 'Body'),
      ).rejects.toThrow('400: Invalid recipient');
    });

    it('propagates errors from token refresh', async () => {
      const encryptedRefresh = encrypt('rt', TEST_SECRET);
      mockGet.mockReturnValue({
        id: 'id',
        userId: 'u1',
        provider: 'gmail',
        encryptedRefreshToken: encryptedRefresh,
        encryptedAccessToken: null,
        tokenExpiry: null,
        scopes: GMAIL_SCOPES.join(' '),
        email: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      mockRefreshAccessToken.mockRejectedValue(
        new Error('invalid_grant: Token has been revoked'),
      );

      const manager = makeManager();
      await expect(
        manager.getAuthenticatedClient('u1'),
      ).rejects.toThrow('invalid_grant');
    });
  });

  // =========================================================================
  // Singleton factory
  // =========================================================================

  describe('getGmailManager', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      resetGmailManager();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('throws when GOOGLE_CLIENT_ID is missing', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() => getGmailManager()).toThrow('GOOGLE_CLIENT_ID');
    });

    it('throws when JWT_SECRET is missing', () => {
      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      delete process.env.JWT_SECRET;
      expect(() => getGmailManager()).toThrow('JWT_SECRET');
    });

    it('creates singleton when all env vars present', () => {
      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.JWT_SECRET = 'jwt-secret';
      const mgr1 = getGmailManager();
      const mgr2 = getGmailManager();
      expect(mgr1).toBe(mgr2);
    });
  });
});
