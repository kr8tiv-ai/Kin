/**
 * PinkBrain / KIN Credits — Unit Tests
 *
 * Tests CredentialManager CRUD, AES-256-GCM encryption, CLI-preferred resolution,
 * auto-revoke on expiry, and status aggregation. Uses a minimal in-memory DB
 * interface (K034 pattern — no Fastify, no better-sqlite3 required).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CredentialManager,
  encryptCredential,
  decryptCredential,
  type KinCreditsDb,
  type KinCredentialRow,
} from '../inference/kin-credits.js';

// ---------------------------------------------------------------------------
// Env setup — CredentialManager needs an encryption secret
// ---------------------------------------------------------------------------
const TEST_SECRET = 'test-encryption-secret-32chars!!';

beforeEach(() => {
  vi.stubEnv('KIN_CREDITS_SECRET', TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Encryption unit tests
// ---------------------------------------------------------------------------

describe('encryptCredential / decryptCredential', () => {
  it('round-trips a plaintext credential', () => {
    const plaintext = 'sk-test-key-abc123';
    const encrypted = encryptCredential(plaintext, TEST_SECRET);
    const decrypted = decryptCredential(encrypted, TEST_SECRET);
    expect(decrypted).toBe(plaintext);
  });

  it('produces iv:authTag:ciphertext format', () => {
    const encrypted = encryptCredential('my-key', TEST_SECRET);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // AuthTag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it('different encryptions of the same text produce different ciphertext (random IV)', () => {
    const a = encryptCredential('same-key', TEST_SECRET);
    const b = encryptCredential('same-key', TEST_SECRET);
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decryptCredential(a, TEST_SECRET)).toBe('same-key');
    expect(decryptCredential(b, TEST_SECRET)).toBe('same-key');
  });

  it('decryption with wrong secret throws', () => {
    const encrypted = encryptCredential('secret-key', TEST_SECRET);
    expect(() => decryptCredential(encrypted, 'wrong-secret-key-1234567890!!')).toThrow();
  });

  it('invalid ciphertext format throws', () => {
    expect(() => decryptCredential('not-valid-format', TEST_SECRET)).toThrow(
      'Invalid ciphertext format',
    );
  });
});

// ---------------------------------------------------------------------------
// In-memory mock DB (implements KinCreditsDb interface)
// ---------------------------------------------------------------------------

interface MockRow {
  [key: string]: unknown;
}

function createMockDb(): KinCreditsDb & { _rows: MockRow[] } {
  const rows: MockRow[] = [];

  return {
    _rows: rows,
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          if (sql.includes('INSERT')) {
            // Parse upsert — check for existing row to update
            const userId = params[1] as string;
            const providerId = params[2] as string;
            const credentialType = params[3] as string;

            const existingIdx = rows.findIndex(
              (r) =>
                r.user_id === userId &&
                r.provider_id === providerId &&
                r.credential_type === credentialType,
            );

            if (existingIdx >= 0 && sql.includes('ON CONFLICT')) {
              // Upsert — update existing
              rows[existingIdx] = {
                ...rows[existingIdx],
                encrypted_credential: params[4],
                plan_tier: params[5],
                status: 'active',
                provisioned_at: params[6],
                expires_at: null,
              };
              return { changes: 1 };
            }

            rows.push({
              id: params[0],
              user_id: params[1],
              provider_id: params[2],
              credential_type: params[3],
              encrypted_credential: params[4],
              plan_tier: params[5],
              status: 'active',
              provisioned_at: params[6],
              expires_at: null,
              last_used_at: null,
              usage_count: 0,
            });
            return { changes: 1 };
          }

          if (sql.includes('UPDATE') && sql.includes("status = 'revoked'") && sql.includes('WHERE id')) {
            // Auto-revoke by id
            const id = params[0] as string;
            const row = rows.find((r) => r.id === id);
            if (row) {
              row.status = 'revoked';
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          if (sql.includes('UPDATE') && sql.includes("status = 'revoked'")) {
            // Revoke by user/provider/type
            const userId = params[0] as string;
            const providerId = params[1] as string;
            const credType = params[2] as string;
            const row = rows.find(
              (r) =>
                r.user_id === userId &&
                r.provider_id === providerId &&
                r.credential_type === credType,
            );
            if (row) {
              row.status = 'revoked';
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          if (sql.includes('UPDATE') && sql.includes('last_used_at')) {
            // Touch usage stats
            const id = params[1] as string;
            const row = rows.find((r) => r.id === id);
            if (row) {
              row.last_used_at = params[0];
              row.usage_count = (row.usage_count as number) + 1;
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          return { changes: 0 };
        },
        get(...params: unknown[]) {
          if (sql.includes('WHERE user_id') && sql.includes('provider_id') && sql.includes("status = 'active'")) {
            const userId = params[0] as string;
            const providerId = params[1] as string;
            const active = rows.filter(
              (r) =>
                r.user_id === userId &&
                r.provider_id === providerId &&
                r.status === 'active',
            );
            // Sort CLI first
            active.sort((a, b) => {
              if (a.credential_type === 'cli' && b.credential_type !== 'cli') return -1;
              if (a.credential_type !== 'cli' && b.credential_type === 'cli') return 1;
              return 0;
            });
            return active[0] ?? undefined;
          }
          return undefined;
        },
        all(..._params: unknown[]) {
          if (sql.includes('WHERE user_id') && sql.includes('ORDER BY provider_id')) {
            const userId = _params[0] as string;
            return rows
              .filter((r) => r.user_id === userId)
              .sort((a, b) => {
                const pa = a.provider_id as string;
                const pb = b.provider_id as string;
                if (pa !== pb) return pa.localeCompare(pb);
                return (a.credential_type as string).localeCompare(b.credential_type as string);
              });
          }
          if (sql.includes('SELECT provider_id, credential_type, status')) {
            return rows.map((r) => ({
              provider_id: r.provider_id,
              credential_type: r.credential_type,
              status: r.status,
            }));
          }
          return [];
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// CredentialManager tests
// ---------------------------------------------------------------------------

describe('CredentialManager', () => {
  let db: ReturnType<typeof createMockDb>;
  let manager: CredentialManager;

  beforeEach(() => {
    db = createMockDb();
    manager = new CredentialManager(db);
  });

  // ── provisionCredential ─────────────────────────────────────────────────

  describe('provisionCredential', () => {
    it('returns a credential ID starting with kc-', () => {
      const id = manager.provisionCredential('user-1', 'openai', 'cli', 'sk-test-key');
      expect(id).toMatch(/^kc-/);
    });

    it('stores an encrypted credential in the DB', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'sk-test-key');
      expect(db._rows).toHaveLength(1);
      const row = db._rows[0]!;
      expect(row.user_id).toBe('user-1');
      expect(row.provider_id).toBe('openai');
      expect(row.credential_type).toBe('cli');
      expect(row.status).toBe('active');
      // Stored value is encrypted, not plaintext
      expect(row.encrypted_credential).not.toBe('sk-test-key');
      expect((row.encrypted_credential as string).split(':')).toHaveLength(3);
    });

    it('upserts on same user/provider/type', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'old-key');
      manager.provisionCredential('user-1', 'openai', 'cli', 'new-key');
      expect(db._rows).toHaveLength(1);
      // The encrypted value should have changed
      const decrypted = decryptCredential(db._rows[0]!.encrypted_credential as string, TEST_SECRET);
      expect(decrypted).toBe('new-key');
    });

    it('stores plan tier when provided', () => {
      manager.provisionCredential('user-1', 'anthropic', 'api', 'ak-test', 'pro');
      expect(db._rows[0]!.plan_tier).toBe('pro');
    });

    it('stores null plan tier when not provided', () => {
      manager.provisionCredential('user-1', 'anthropic', 'api', 'ak-test');
      expect(db._rows[0]!.plan_tier).toBeNull();
    });
  });

  // ── getCredential ───────────────────────────────────────────────────────

  describe('getCredential', () => {
    it('returns null when no credential exists', () => {
      expect(manager.getCredential('user-1', 'openai')).toBeNull();
    });

    it('returns decrypted credential for active entry', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'sk-my-key');
      const result = manager.getCredential('user-1', 'openai');
      expect(result).not.toBeNull();
      expect(result!.credential).toBe('sk-my-key');
      expect(result!.providerId).toBe('openai');
      expect(result!.credentialType).toBe('cli');
      expect(result!.status).toBe('active');
    });

    it('prefers CLI over API credential', () => {
      manager.provisionCredential('user-1', 'openai', 'api', 'api-key');
      manager.provisionCredential('user-1', 'openai', 'cli', 'cli-key');
      const result = manager.getCredential('user-1', 'openai');
      expect(result!.credential).toBe('cli-key');
      expect(result!.credentialType).toBe('cli');
    });

    it('increments usage_count on retrieval', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'sk-key');
      manager.getCredential('user-1', 'openai');
      expect(db._rows[0]!.usage_count).toBe(1);
      manager.getCredential('user-1', 'openai');
      expect(db._rows[0]!.usage_count).toBe(2);
    });

    it('auto-revokes expired credential and returns null', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'expired-key');
      // Simulate expiry
      db._rows[0]!.expires_at = Date.now() - 1000;
      const result = manager.getCredential('user-1', 'openai');
      expect(result).toBeNull();
      expect(db._rows[0]!.status).toBe('revoked');
    });
  });

  // ── revokeCredential ────────────────────────────────────────────────────

  describe('revokeCredential', () => {
    it('revokes an existing credential and returns true', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'sk-key');
      const result = manager.revokeCredential('user-1', 'openai', 'cli');
      expect(result).toBe(true);
      expect(db._rows[0]!.status).toBe('revoked');
    });

    it('returns false when no matching credential found', () => {
      const result = manager.revokeCredential('user-1', 'openai', 'cli');
      expect(result).toBe(false);
    });
  });

  // ── getUserCredentials ──────────────────────────────────────────────────

  describe('getUserCredentials', () => {
    it('returns empty array for user with no credentials', () => {
      const creds = manager.getUserCredentials('user-1');
      expect(creds).toEqual([]);
    });

    it('returns redacted credential info (no decrypted secret)', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'sk-secret-key');
      const creds = manager.getUserCredentials('user-1');
      expect(creds).toHaveLength(1);
      const cred = creds[0]!;
      // Verify camelCase keys (K005)
      expect(cred.userId).toBe('user-1');
      expect(cred.providerId).toBe('openai');
      expect(cred.credentialType).toBe('cli');
      expect(cred.status).toBe('active');
      expect(cred.provisionedAt).toBeTypeOf('number');
      // No raw credential field
      expect('credential' in cred).toBe(false);
      expect('encrypted_credential' in cred).toBe(false);
    });

    it('returns multiple credentials sorted by provider then type', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'k1');
      manager.provisionCredential('user-1', 'anthropic', 'api', 'k2');
      const creds = manager.getUserCredentials('user-1');
      expect(creds).toHaveLength(2);
      expect(creds[0]!.providerId).toBe('anthropic');
      expect(creds[1]!.providerId).toBe('openai');
    });
  });

  // ── getStatus ───────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns zeros for empty DB', () => {
      const status = manager.getStatus();
      expect(status.totalCredentials).toBe(0);
      expect(status.activeCredentials).toBe(0);
      expect(Object.keys(status.providerBreakdown)).toHaveLength(0);
    });

    it('counts total and active credentials correctly', () => {
      manager.provisionCredential('user-1', 'openai', 'cli', 'k1');
      manager.provisionCredential('user-1', 'anthropic', 'api', 'k2');
      manager.revokeCredential('user-1', 'anthropic', 'api');

      const status = manager.getStatus();
      expect(status.totalCredentials).toBe(2);
      expect(status.activeCredentials).toBe(1);
      expect(status.providerBreakdown['openai']).toEqual({ cli: true, api: false });
      expect(status.providerBreakdown['anthropic']).toEqual({ cli: false, api: false });
    });
  });
});

// ---------------------------------------------------------------------------
// Encryption secret resolution
// ---------------------------------------------------------------------------

describe('Encryption secret resolution', () => {
  it('falls back to JWT_SECRET when KIN_CREDITS_SECRET is not set', () => {
    vi.stubEnv('KIN_CREDITS_SECRET', '');
    vi.stubEnv('JWT_SECRET', 'fallback-jwt-secret-for-dev');

    const db = createMockDb();
    const manager = new CredentialManager(db);

    // Should not throw — uses JWT_SECRET
    const id = manager.provisionCredential('user-1', 'openai', 'cli', 'test-key');
    expect(id).toMatch(/^kc-/);

    // Verify decryption with the same fallback
    const cred = manager.getCredential('user-1', 'openai');
    expect(cred!.credential).toBe('test-key');
  });

  it('throws when neither KIN_CREDITS_SECRET nor JWT_SECRET is set', () => {
    vi.stubEnv('KIN_CREDITS_SECRET', '');
    vi.stubEnv('JWT_SECRET', '');

    const db = createMockDb();
    const manager = new CredentialManager(db);

    expect(() => manager.provisionCredential('user-1', 'openai', 'cli', 'k')).toThrow(
      'No encryption secret',
    );
  });
});
