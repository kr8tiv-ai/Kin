/**
 * GmailManager — OAuth2 lifecycle, token encryption, and Gmail API operations.
 *
 * Singleton that owns the entire Gmail integration surface:
 * - OAuth2 client creation via `googleapis`
 * - AES-256-GCM token encryption/decryption (key derived from JWT_SECRET)
 * - Per-user token persistence in the `oauth_tokens` SQLite table
 * - Gmail API wrappers: listMessages, getMessage, createDraft, sendDraft, getProfile
 *
 * Pattern: follows `inference/browser-manager.ts` singleton export.
 *
 * @module inference/gmail-manager
 */

import { google, type gmail_v1 } from 'googleapis';
import { type OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenRecord {
  id: string;
  userId: string;
  provider: string;
  encryptedRefreshToken: string;
  encryptedAccessToken: string | null;
  tokenExpiry: number | null;
  scopes: string;
  email: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

export interface MessageDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  snippet: string;
}

export interface InboxSummary {
  unreadCount: number;
  messages: MessageSummary[];
}

export interface DraftResult {
  draftId: string;
  messageId: string;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'gmail';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256-bit key

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
];

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit key from JWT_SECRET via SHA-256.
 * Deterministic — same secret always produces the same key.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a colon-separated string: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM ciphertext.
 * Expects the `iv:authTag:ciphertext` format from encrypt().
 */
export function decrypt(ciphertext: string, secret: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format — expected iv:authTag:data');
  }
  const [ivHex, authTagHex, encryptedHex] = parts as [string, string, string];
  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ---------------------------------------------------------------------------
// GmailManager
// ---------------------------------------------------------------------------

export class GmailManager {
  private jwtSecret: string;
  private credentials: GmailCredentials;

  constructor(credentials: GmailCredentials, jwtSecret: string) {
    this.credentials = credentials;
    this.jwtSecret = jwtSecret;
  }

  // -----------------------------------------------------------------------
  // OAuth2 client
  // -----------------------------------------------------------------------

  /**
   * Create a bare OAuth2 client (no tokens set).
   * Use for generating auth URLs and exchanging codes.
   */
  createOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
      this.credentials.redirectUri,
    );
  }

  /**
   * Generate the Google OAuth2 consent URL.
   */
  getAuthUrl(state?: string): string {
    const client = this.createOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
      state,
    });
  }

  /**
   * Exchange an authorization code for tokens, encrypt and persist them.
   * Returns the user's Gmail email address.
   */
  async exchangeCode(userId: string, code: string): Promise<string> {
    const client = this.createOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token received — user may need to re-authorize with prompt=consent',
      );
    }

    client.setCredentials(tokens);

    // Fetch profile email
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress ?? null;

    // Encrypt tokens
    const encryptedRefresh = encrypt(tokens.refresh_token, this.jwtSecret);
    const encryptedAccess = tokens.access_token
      ? encrypt(tokens.access_token, this.jwtSecret)
      : null;

    const tokenExpiry = tokens.expiry_date ?? null;
    const scopes = GMAIL_SCOPES.join(' ');

    // Upsert into oauth_tokens
    const db = getDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO oauth_tokens (id, user_id, provider, encrypted_refresh_token, encrypted_access_token, token_expiry, scopes, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         encrypted_access_token = excluded.encrypted_access_token,
         token_expiry = excluded.token_expiry,
         scopes = excluded.scopes,
         email = excluded.email,
         updated_at = excluded.updated_at`,
    ).run(
      `oauth-${userId}-${PROVIDER}`,
      userId,
      PROVIDER,
      encryptedRefresh,
      encryptedAccess,
      tokenExpiry,
      scopes,
      email,
      now,
      now,
    );

    return email ?? '';
  }

  // -----------------------------------------------------------------------
  // Token loading / refresh
  // -----------------------------------------------------------------------

  /**
   * Load stored tokens for a user and return an authenticated OAuth2 client.
   * Transparently refreshes expired access tokens and persists the new ones.
   */
  async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, user_id, provider, encrypted_refresh_token, encrypted_access_token,
                token_expiry, scopes, email, created_at, updated_at
         FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, PROVIDER) as TokenRecord | undefined;

    if (!row) {
      throw new Error(
        `No Gmail tokens found for user ${userId} — OAuth consent required`,
      );
    }

    const client = this.createOAuth2Client();
    const refreshToken = decrypt(row.encryptedRefreshToken, this.jwtSecret);

    const credentials: {
      refresh_token: string;
      access_token?: string;
      expiry_date?: number;
    } = { refresh_token: refreshToken };

    // Use stored access token if still valid (5-minute buffer)
    if (row.encryptedAccessToken && row.tokenExpiry) {
      const expiresAt = row.tokenExpiry;
      const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
      if (expiresAt > fiveMinFromNow) {
        credentials.access_token = decrypt(
          row.encryptedAccessToken,
          this.jwtSecret,
        );
        credentials.expiry_date = expiresAt;
      }
    }

    client.setCredentials(credentials);

    // If no valid access token, force a refresh
    if (!credentials.access_token) {
      const { credentials: refreshed } = await client.refreshAccessToken();
      client.setCredentials(refreshed);

      // Persist refreshed tokens
      if (refreshed.access_token) {
        const encryptedAccess = encrypt(
          refreshed.access_token,
          this.jwtSecret,
        );
        db.prepare(
          `UPDATE oauth_tokens
           SET encrypted_access_token = ?, token_expiry = ?, updated_at = ?
           WHERE user_id = ? AND provider = ?`,
        ).run(
          encryptedAccess,
          refreshed.expiry_date ?? null,
          Date.now(),
          userId,
          PROVIDER,
        );
      }
    }

    return client;
  }

  /**
   * Check whether a user has stored Gmail tokens.
   */
  hasTokens(userId: string): boolean {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT 1 FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, PROVIDER);
    return !!row;
  }

  /**
   * Revoke and delete stored tokens for a user.
   */
  async revokeTokens(userId: string): Promise<void> {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT encrypted_refresh_token FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, PROVIDER) as { encrypted_refresh_token: string } | undefined;

    if (row) {
      try {
        const client = this.createOAuth2Client();
        const refreshToken = decrypt(
          row.encrypted_refresh_token,
          this.jwtSecret,
        );
        await client.revokeToken(refreshToken);
      } catch {
        // Best-effort revocation — token may already be invalid
      }
    }

    db.prepare(
      `DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
    ).run(userId, PROVIDER);
  }

  // -----------------------------------------------------------------------
  // Gmail API operations
  // -----------------------------------------------------------------------

  /**
   * Get a Gmail API client for a user.
   */
  private async getGmailClient(
    userId: string,
  ): Promise<gmail_v1.Gmail> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.gmail({ version: 'v1', auth });
  }

  /**
   * List unread messages (default) or messages matching a query.
   * Returns count + message summaries.
   */
  async listMessages(
    userId: string,
    options?: { query?: string; maxResults?: number },
  ): Promise<InboxSummary> {
    const gmail = await this.getGmailClient(userId);
    const query = options?.query ?? 'is:unread';
    const maxResults = options?.maxResults ?? 10;

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    // Empty inbox
    if (!res.data.messages || res.data.messages.length === 0) {
      return { unreadCount: 0, messages: [] };
    }

    const totalEstimate = res.data.resultSizeEstimate ?? res.data.messages.length;

    // Fetch summaries for each message
    const summaries: MessageSummary[] = await Promise.all(
      res.data.messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers = detail.data.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
            ?.value ?? '';

        return {
          id: msg.id!,
          threadId: msg.threadId ?? '',
          subject: getHeader('Subject'),
          from: getHeader('From'),
          snippet: detail.data.snippet ?? '',
          date: getHeader('Date'),
        };
      }),
    );

    return { unreadCount: totalEstimate, messages: summaries };
  }

  /**
   * Fetch a full message by ID — headers + decoded body.
   */
  async getMessage(userId: string, messageId: string): Promise<MessageDetail> {
    const gmail = await this.getGmailClient(userId);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = res.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    // Decode body — try plain text first, then HTML
    let body = '';
    const payload = res.data.payload;
    if (payload) {
      body = this.extractBody(payload);
    }

    return {
      id: res.data.id ?? messageId,
      threadId: res.data.threadId ?? '',
      subject: getHeader('Subject'),
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      body,
      snippet: res.data.snippet ?? '',
    };
  }

  /**
   * Recursively extract plain-text body from a Gmail message payload.
   * Falls back to HTML if no plain text part is found.
   */
  private extractBody(
    payload: gmail_v1.Schema$MessagePart,
  ): string {
    // Direct body data on the payload
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return this.decodeBase64Url(payload.body.data);
    }

    // Multipart — search parts recursively
    if (payload.parts && payload.parts.length > 0) {
      // Prefer text/plain
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return this.decodeBase64Url(part.body.data);
        }
      }
      // Fall back to text/html
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return this.decodeBase64Url(part.body.data);
        }
      }
      // Recurse into nested multipart
      for (const part of payload.parts) {
        if (part.parts) {
          const nested = this.extractBody(part);
          if (nested) return nested;
        }
      }
    }

    // Last resort: any body data on the payload itself
    if (payload.body?.data) {
      return this.decodeBase64Url(payload.body.data);
    }

    return '';
  }

  /**
   * Decode base64url-encoded string (Gmail's encoding).
   */
  private decodeBase64Url(data: string): string {
    // Replace URL-safe chars and decode
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  /**
   * Create a draft email.
   */
  async createDraft(
    userId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<DraftResult> {
    const gmail = await this.getGmailClient(userId);

    // Build RFC 2822 message
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      body,
    ];
    const rawMessage = messageParts.join('\r\n');
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded },
      },
    });

    return {
      draftId: res.data.id ?? '',
      messageId: res.data.message?.id ?? '',
    };
  }

  /**
   * Send a previously created draft.
   */
  async sendDraft(userId: string, draftId: string): Promise<string> {
    const gmail = await this.getGmailClient(userId);
    const res = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });

    return res.data.id ?? '';
  }

  /**
   * Fetch the user's Gmail profile (email, message/thread counts).
   */
  async getProfile(userId: string): Promise<GmailProfile> {
    const gmail = await this.getGmailClient(userId);
    const res = await gmail.users.getProfile({ userId: 'me' });

    return {
      emailAddress: res.data.emailAddress ?? '',
      messagesTotal: res.data.messagesTotal ?? 0,
      threadsTotal: res.data.threadsTotal ?? 0,
      historyId: res.data.historyId ?? '',
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: GmailManager | null = null;

/**
 * Get or create the singleton GmailManager instance.
 * Reads credentials from environment variables.
 * Throws if required env vars are missing.
 */
export function getGmailManager(): GmailManager {
  if (!instance) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3002/auth/google/callback';
    const jwtSecret = process.env.JWT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Gmail integration requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars',
      );
    }
    if (!jwtSecret) {
      throw new Error(
        'Gmail token encryption requires JWT_SECRET env var',
      );
    }

    instance = new GmailManager(
      { clientId, clientSecret, redirectUri },
      jwtSecret,
    );
  }
  return instance;
}

/**
 * Reset the singleton (for tests).
 */
export function resetGmailManager(): void {
  instance = null;
}
