/**
 * KIN Credits — Credential Manager
 *
 * Manages provider CLI/API credentials per user. A user subscribes to a
 * provider plan → KIN provisions encrypted credentials → supervisor routes
 * CLI-first, API-second.
 *
 * Design:
 *   - Pure DB operations, no external API calls.
 *   - AES-256-GCM encryption (same pattern as gmail-manager.ts).
 *   - Accepts a Database instance for testability (K034).
 *   - CLI credentials preferred over API when both exist.
 *
 * @module inference/kin-credits
 */

import crypto from 'node:crypto';
import type { FrontierProviderId } from './providers/types.js';

// ============================================================================
// Types
// ============================================================================

export type CredentialType = 'cli' | 'api';
export type CredentialStatus = 'active' | 'suspended' | 'revoked';

export interface KinCredentialRow {
  id: string;
  user_id: string;
  provider_id: string;
  credential_type: CredentialType;
  encrypted_credential: string;
  plan_tier: string | null;
  status: CredentialStatus;
  provisioned_at: number;
  expires_at: number | null;
  last_used_at: number | null;
  usage_count: number;
}

/** Redacted credential info for listings (no decrypted secret). */
export interface KinCredentialInfo {
  id: string;
  userId: string;
  providerId: string;
  credentialType: CredentialType;
  planTier: string | null;
  status: CredentialStatus;
  provisionedAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  usageCount: number;
}

/** Decrypted credential for supervisor routing. */
export interface DecryptedCredential {
  providerId: string;
  credentialType: CredentialType;
  credential: string;
  planTier: string | null;
  status: CredentialStatus;
}

export interface KinCreditsStatus {
  totalCredentials: number;
  activeCredentials: number;
  providerBreakdown: Record<string, { cli: boolean; api: boolean }>;
}

// ============================================================================
// Encryption (AES-256-GCM, matches gmail-manager.ts pattern)
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt plaintext → `iv:authTag:ciphertext` (hex-encoded). */
export function encryptCredential(plaintext: string, secret: string): string {
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

/** Decrypt `iv:authTag:ciphertext` → plaintext. */
export function decryptCredential(ciphertext: string, secret: string): string {
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

// ============================================================================
// Secret Resolution
// ============================================================================

/**
 * Resolve the encryption secret.
 * Prefers KIN_CREDITS_SECRET; falls back to JWT_SECRET-derived key for dev.
 */
function getEncryptionSecret(): string {
  const secret = process.env.KIN_CREDITS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[kin-credits] No encryption secret — set KIN_CREDITS_SECRET or JWT_SECRET',
    );
  }
  return secret;
}

// ============================================================================
// Minimal DB interface (for testability — avoids coupling to better-sqlite3)
// ============================================================================

export interface KinCreditsDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

// ============================================================================
// CredentialManager — Pure DB operations (K034 pattern)
// ============================================================================

export class CredentialManager {
  private db: KinCreditsDb;

  constructor(db: KinCreditsDb) {
    this.db = db;
  }

  /**
   * Provision (upsert) a credential for a user+provider+type combo.
   * Encrypts the raw credential before storage.
   */
  provisionCredential(
    userId: string,
    providerId: FrontierProviderId,
    credentialType: CredentialType,
    credential: string,
    planTier?: string,
  ): string {
    const secret = getEncryptionSecret();
    const encrypted = encryptCredential(credential, secret);
    const id = `kc-${crypto.randomUUID()}`;
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO kin_credits (id, user_id, provider_id, credential_type, encrypted_credential, plan_tier, status, provisioned_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      ON CONFLICT(user_id, provider_id, credential_type) DO UPDATE SET
        encrypted_credential = excluded.encrypted_credential,
        plan_tier = excluded.plan_tier,
        status = 'active',
        provisioned_at = excluded.provisioned_at,
        expires_at = NULL
    `).run(id, userId, providerId, credentialType, encrypted, planTier ?? null, now);

    return id;
  }

  /**
   * Get the best available credential for a user+provider.
   * Prefers CLI over API. Returns null if none found or all revoked/suspended.
   */
  getCredential(
    userId: string,
    providerId: FrontierProviderId,
  ): DecryptedCredential | null {
    const row = this.db.prepare(`
      SELECT * FROM kin_credits
      WHERE user_id = ? AND provider_id = ? AND status = 'active'
      ORDER BY CASE credential_type WHEN 'cli' THEN 0 ELSE 1 END
      LIMIT 1
    `).get(userId, providerId) as KinCredentialRow | undefined;

    if (!row) return null;

    // Check expiry
    if (row.expires_at && row.expires_at < Date.now()) {
      this.db.prepare(`UPDATE kin_credits SET status = 'revoked' WHERE id = ?`).run(row.id);
      return null;
    }

    const secret = getEncryptionSecret();
    const credential = decryptCredential(row.encrypted_credential, secret);

    // Touch usage stats
    this.db.prepare(`
      UPDATE kin_credits SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?
    `).run(Date.now(), row.id);

    return {
      providerId: row.provider_id,
      credentialType: row.credential_type as CredentialType,
      credential,
      planTier: row.plan_tier,
      status: row.status as CredentialStatus,
    };
  }

  /**
   * Revoke a specific credential.
   */
  revokeCredential(
    userId: string,
    providerId: FrontierProviderId,
    credentialType: CredentialType,
  ): boolean {
    const result = this.db.prepare(`
      UPDATE kin_credits SET status = 'revoked'
      WHERE user_id = ? AND provider_id = ? AND credential_type = ?
    `).run(userId, providerId, credentialType);

    return result.changes > 0;
  }

  /**
   * List all credentials for a user (redacted — no decrypted secrets).
   */
  getUserCredentials(userId: string): KinCredentialInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM kin_credits WHERE user_id = ? ORDER BY provider_id, credential_type
    `).all(userId) as KinCredentialRow[];

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      credentialType: row.credential_type as CredentialType,
      planTier: row.plan_tier,
      status: row.status as CredentialStatus,
      provisionedAt: row.provisioned_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      usageCount: row.usage_count,
    }));
  }

  /**
   * Aggregate status for health/admin dashboards.
   */
  getStatus(): KinCreditsStatus {
    const rows = this.db.prepare(`
      SELECT provider_id, credential_type, status FROM kin_credits
    `).all() as Pick<KinCredentialRow, 'provider_id' | 'credential_type' | 'status'>[];

    const breakdown: Record<string, { cli: boolean; api: boolean }> = {};
    let total = 0;
    let active = 0;

    for (const row of rows) {
      total++;
      if (row.status === 'active') active++;
      let entry = breakdown[row.provider_id];
      if (!entry) {
        entry = { cli: false, api: false };
        breakdown[row.provider_id] = entry;
      }
      if (row.status === 'active') {
        entry[row.credential_type as CredentialType] = true;
      }
    }

    return {
      totalCredentials: total,
      activeCredentials: active,
      providerBreakdown: breakdown,
    };
  }
}
