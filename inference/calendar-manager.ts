/**
 * CalendarManager — Google Calendar API integration via OAuth2.
 *
 * Follows the same pattern as GmailManager (K030): OAuth2 lifecycle,
 * AES-256-GCM token encryption via shared helpers, and per-user token
 * persistence in the `oauth_tokens` table (provider='google_calendar').
 *
 * Reuses encrypt/decrypt from gmail-manager.ts to avoid duplicating crypto.
 *
 * @module inference/calendar-manager
 */

import { google, type calendar_v3 } from 'googleapis';
import { type OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { encrypt, decrypt } from './gmail-manager.js';
import { getDb } from '../db/connection.js';
import type { CalendarEvent } from './proactive-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER = 'google_calendar';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
];

// ---------------------------------------------------------------------------
// CalendarManager
// ---------------------------------------------------------------------------

export class CalendarManager {
  private jwtSecret: string;
  private credentials: CalendarCredentials;

  constructor(credentials: CalendarCredentials, jwtSecret: string) {
    this.credentials = credentials;
    this.jwtSecret = jwtSecret;
  }

  // -----------------------------------------------------------------------
  // OAuth2 client
  // -----------------------------------------------------------------------

  /** Create a bare OAuth2 client (no tokens set). */
  private createOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
      this.credentials.redirectUri,
    );
  }

  /** Generate the Google OAuth2 consent URL for calendar scope. */
  getAuthUrl(state?: string): string {
    const client = this.createOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: CALENDAR_SCOPES,
      state,
    });
  }

  /**
   * Exchange an authorization code for tokens, encrypt and persist them.
   * Returns the user's Google account email address.
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

    // Encrypt tokens
    const encryptedRefresh = encrypt(tokens.refresh_token, this.jwtSecret);
    const encryptedAccess = tokens.access_token
      ? encrypt(tokens.access_token, this.jwtSecret)
      : null;

    const tokenExpiry = tokens.expiry_date ?? null;
    const scopes = CALENDAR_SCOPES.join(' ');

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
         updated_at = excluded.updated_at`,
    ).run(
      `oauth-${userId}-${PROVIDER}`,
      userId,
      PROVIDER,
      encryptedRefresh,
      encryptedAccess,
      tokenExpiry,
      scopes,
      null, // Calendar API doesn't have a profile email like Gmail
      now,
      now,
    );

    return userId;
  }

  // -----------------------------------------------------------------------
  // Token loading / refresh
  // -----------------------------------------------------------------------

  /**
   * Load stored tokens for a user and return an authenticated OAuth2 client.
   * Transparently refreshes expired access tokens.
   */
  private async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT encrypted_refresh_token, encrypted_access_token, token_expiry
         FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, PROVIDER) as {
        encrypted_refresh_token: string;
        encrypted_access_token: string | null;
        token_expiry: number | null;
      } | undefined;

    if (!row) {
      throw new Error(
        `No Calendar tokens found for user ${userId} — OAuth consent required`,
      );
    }

    const client = this.createOAuth2Client();
    const refreshToken = decrypt(row.encrypted_refresh_token, this.jwtSecret);

    const credentials: {
      refresh_token: string;
      access_token?: string;
      expiry_date?: number;
    } = { refresh_token: refreshToken };

    // Use stored access token if still valid (5-minute buffer)
    if (row.encrypted_access_token && row.token_expiry) {
      const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
      if (row.token_expiry > fiveMinFromNow) {
        credentials.access_token = decrypt(
          row.encrypted_access_token,
          this.jwtSecret,
        );
        credentials.expiry_date = row.token_expiry;
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

  // -----------------------------------------------------------------------
  // Calendar API operations
  // -----------------------------------------------------------------------

  /**
   * Check whether a user has stored Calendar tokens.
   */
  hasCalendarAccess(userId: string): boolean {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT 1 FROM oauth_tokens WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, PROVIDER);
    return !!row;
  }

  /**
   * List upcoming calendar events within the given time window.
   * Returns an empty array (not throw) if the user has no tokens or API fails.
   */
  async listUpcomingEvents(
    userId: string,
    hoursAhead: number = 24,
  ): Promise<CalendarEvent[]> {
    // Graceful: no tokens → empty array
    if (!this.hasCalendarAccess(userId)) {
      return [];
    }

    try {
      const client = await this.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth: client });

      const now = new Date();
      const timeMax = new Date(now.getTime() + hoursAhead * 3600 * 1000);

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const items = res.data.items ?? [];
      return items.map((item: calendar_v3.Schema$Event): CalendarEvent => ({
        title: item.summary ?? '(No title)',
        startTime: item.start?.dateTime
          ? new Date(item.start.dateTime).getTime()
          : item.start?.date
            ? new Date(item.start.date).getTime()
            : 0,
        endTime: item.end?.dateTime
          ? new Date(item.end.dateTime).getTime()
          : item.end?.date
            ? new Date(item.end.date).getTime()
            : 0,
        location: item.location ?? null,
      }));
    } catch (err) {
      // Graceful degradation: API errors → empty array with log
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[calendar] Failed to fetch events for user ${userId}: ${msg}`);
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: CalendarManager | null = null;

/**
 * Get or create the singleton CalendarManager instance.
 * Reuses the same Google OAuth credentials as GmailManager but with
 * a calendar-specific redirect URI (defaults to the same callback).
 */
export function getCalendarManager(): CalendarManager {
  if (!instance) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
      process.env.GOOGLE_REDIRECT_URI ??
      'http://localhost:3002/auth/google/callback';
    const jwtSecret = process.env.JWT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Calendar integration requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars',
      );
    }
    if (!jwtSecret) {
      throw new Error(
        'Calendar token encryption requires JWT_SECRET env var',
      );
    }

    instance = new CalendarManager(
      { clientId, clientSecret, redirectUri },
      jwtSecret,
    );
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetCalendarManager(): void {
  instance = null;
}
