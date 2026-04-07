/**
 * DM Security — Unit Tests
 *
 * Tests the channel-agnostic DM security module using in-memory SQLite.
 * Covers authorization, pairing codes, approval/denial, revocation,
 * channel isolation, owner detection, and negative/edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  getOwnerIdForChannel,
  isOwner,
  isAuthorized,
  generatePairingCode,
  validatePairingCode,
  approveSender,
  denySender,
  revokeSender,
  getPendingCodes,
  getAllowlist,
  cleanExpiredCodes,
} from '../bot/utils/dm-security.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DM_SCHEMA = `
CREATE TABLE IF NOT EXISTS dm_allowlist (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'discord')),
  sender_id TEXT NOT NULL,
  display_name TEXT,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(channel, sender_id)
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'discord')),
  sender_id TEXT NOT NULL,
  display_name TEXT,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  expires_at INTEGER NOT NULL
);
`;

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(DM_SCHEMA);
  return db;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('DM Security', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    // Clear env vars
    delete process.env['BOT_OWNER_TELEGRAM'];
    delete process.env['BOT_OWNER_WHATSAPP'];
    delete process.env['BOT_OWNER_DISCORD'];
    delete process.env['DM_SECURITY_ENABLED'];
  });

  afterEach(() => {
    db.close();
    delete process.env['BOT_OWNER_TELEGRAM'];
    delete process.env['BOT_OWNER_WHATSAPP'];
    delete process.env['BOT_OWNER_DISCORD'];
    delete process.env['DM_SECURITY_ENABLED'];
  });

  // =========================================================================
  // Owner detection
  // =========================================================================

  describe('getOwnerIdForChannel', () => {
    it('reads correct env var for each channel', () => {
      process.env['BOT_OWNER_TELEGRAM'] = '12345';
      process.env['BOT_OWNER_WHATSAPP'] = '5551234';
      process.env['BOT_OWNER_DISCORD'] = 'disc999';

      expect(getOwnerIdForChannel('telegram')).toBe('12345');
      expect(getOwnerIdForChannel('whatsapp')).toBe('5551234');
      expect(getOwnerIdForChannel('discord')).toBe('disc999');
    });

    it('returns undefined for missing env var', () => {
      expect(getOwnerIdForChannel('telegram')).toBeUndefined();
    });

    it('returns undefined for unknown channel', () => {
      expect(getOwnerIdForChannel('slack')).toBeUndefined();
    });

    it('returns undefined for empty string env var', () => {
      process.env['BOT_OWNER_TELEGRAM'] = '';
      expect(getOwnerIdForChannel('telegram')).toBeUndefined();
    });
  });

  describe('isOwner', () => {
    it('returns true when senderId matches owner', () => {
      process.env['BOT_OWNER_TELEGRAM'] = '12345';
      expect(isOwner('telegram', '12345')).toBe(true);
    });

    it('returns false when senderId does not match', () => {
      process.env['BOT_OWNER_TELEGRAM'] = '12345';
      expect(isOwner('telegram', '99999')).toBe(false);
    });

    it('returns false when no owner configured', () => {
      expect(isOwner('telegram', '12345')).toBe(false);
    });

    it('returns false for unknown channel', () => {
      expect(isOwner('slack', '12345')).toBe(false);
    });
  });

  // =========================================================================
  // Authorization (two-gate)
  // =========================================================================

  describe('isAuthorized', () => {
    it('owner is auto-approved', () => {
      process.env['BOT_OWNER_WHATSAPP'] = 'owner1';
      expect(isAuthorized(db, 'whatsapp', 'owner1')).toBe(true);
    });

    it('allowlisted sender passes', () => {
      db.prepare(
        `INSERT INTO dm_allowlist (id, channel, sender_id, approved_by) VALUES ('a1', 'telegram', 'user1', 'owner')`,
      ).run();

      expect(isAuthorized(db, 'telegram', 'user1')).toBe(true);
    });

    it('unknown sender is rejected', () => {
      process.env['BOT_OWNER_TELEGRAM'] = 'owner1';
      expect(isAuthorized(db, 'telegram', 'stranger')).toBe(false);
    });

    it('disabled security passes everyone', () => {
      process.env['DM_SECURITY_ENABLED'] = 'false';
      expect(isAuthorized(db, 'telegram', 'anyone')).toBe(true);
    });

    it('enabled security rejects unknown senders', () => {
      process.env['DM_SECURITY_ENABLED'] = 'true';
      expect(isAuthorized(db, 'telegram', 'stranger')).toBe(false);
    });

    it('unset DM_SECURITY_ENABLED means security is ON', () => {
      // Default behavior: no env var = security enabled
      expect(isAuthorized(db, 'telegram', 'stranger')).toBe(false);
    });
  });

  // =========================================================================
  // Pairing codes
  // =========================================================================

  describe('generatePairingCode', () => {
    it('returns a 6-digit string', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('stores the code in the database', () => {
      const code = generatePairingCode(db, 'telegram', 'user1', 'Alice');
      const row = db
        .prepare(
          `SELECT * FROM pairing_codes WHERE channel = 'telegram' AND sender_id = 'user1' AND status = 'pending'`,
        )
        .get() as any;

      expect(row).toBeDefined();
      expect(row.code).toBe(code);
      expect(row.display_name).toBe('Alice');
      expect(row.status).toBe('pending');
    });

    it('replaces previous pending code for same sender+channel', () => {
      const code1 = generatePairingCode(db, 'telegram', 'user1');
      const code2 = generatePairingCode(db, 'telegram', 'user1');

      // Only one pending code should exist
      const rows = db
        .prepare(
          `SELECT * FROM pairing_codes WHERE channel = 'telegram' AND sender_id = 'user1' AND status = 'pending'`,
        )
        .all() as any[];

      expect(rows).toHaveLength(1);
      expect(rows[0].code).toBe(code2);

      // Old code should be expired
      const expired = db
        .prepare(
          `SELECT * FROM pairing_codes WHERE channel = 'telegram' AND sender_id = 'user1' AND status = 'expired'`,
        )
        .all();
      expect(expired).toHaveLength(1);
    });

    it('sets 15-minute expiry', () => {
      const before = Date.now();
      generatePairingCode(db, 'telegram', 'user1');
      const after = Date.now();

      const row = db
        .prepare(
          `SELECT expires_at, created_at FROM pairing_codes WHERE sender_id = 'user1' AND status = 'pending'`,
        )
        .get() as any;

      const ttl = row.expires_at - row.created_at;
      expect(ttl).toBe(15 * 60 * 1000);
    });

    it('allows different codes for different channels', () => {
      const codeTg = generatePairingCode(db, 'telegram', 'user1');
      const codeWa = generatePairingCode(db, 'whatsapp', 'user1');

      expect(codeTg).toBeDefined();
      expect(codeWa).toBeDefined();

      const pending = db
        .prepare(
          `SELECT * FROM pairing_codes WHERE sender_id = 'user1' AND status = 'pending'`,
        )
        .all();
      expect(pending).toHaveLength(2);
    });
  });

  describe('validatePairingCode', () => {
    it('returns true for valid pending code', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      expect(validatePairingCode(db, 'telegram', 'user1', code)).toBe(true);
    });

    it('returns false for wrong code', () => {
      generatePairingCode(db, 'telegram', 'user1');
      expect(validatePairingCode(db, 'telegram', 'user1', '000000')).toBe(
        false,
      );
    });

    it('returns false for expired code', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');

      // Manually expire the code
      db.prepare(
        `UPDATE pairing_codes SET expires_at = ? WHERE sender_id = 'user1' AND status = 'pending'`,
      ).run(Date.now() - 1000);

      expect(validatePairingCode(db, 'telegram', 'user1', code)).toBe(false);
    });

    it('returns false for already-approved code', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      approveSender(db, 'telegram', 'user1', 'owner1');

      expect(validatePairingCode(db, 'telegram', 'user1', code)).toBe(false);
    });

    it('returns false for code from wrong channel', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      expect(validatePairingCode(db, 'whatsapp', 'user1', code)).toBe(false);
    });

    it('returns false for code from wrong sender', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      expect(validatePairingCode(db, 'telegram', 'user2', code)).toBe(false);
    });
  });

  // =========================================================================
  // Approval flow
  // =========================================================================

  describe('approveSender', () => {
    it('adds sender to allowlist', () => {
      approveSender(db, 'telegram', 'user1', 'owner1', 'Alice');

      const list = getAllowlist(db, 'telegram');
      expect(list).toHaveLength(1);
      expect(list[0]!.senderId).toBe('user1');
      expect(list[0]!.displayName).toBe('Alice');
      expect(list[0]!.approvedBy).toBe('owner1');
    });

    it('updates pending code status to approved', () => {
      generatePairingCode(db, 'telegram', 'user1');
      approveSender(db, 'telegram', 'user1', 'owner1');

      const codes = db
        .prepare(
          `SELECT status FROM pairing_codes WHERE channel = 'telegram' AND sender_id = 'user1'`,
        )
        .all() as any[];
      expect(codes.every((c: any) => c.status === 'approved')).toBe(true);
    });

    it('approved sender passes authorization', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      expect(isAuthorized(db, 'telegram', 'user1')).toBe(true);
    });

    it('is idempotent — duplicate approve does not crash', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      // Second approve should not throw (INSERT OR IGNORE)
      expect(() =>
        approveSender(db, 'telegram', 'user1', 'owner1'),
      ).not.toThrow();

      const list = getAllowlist(db, 'telegram');
      expect(list).toHaveLength(1);
    });
  });

  describe('denySender', () => {
    it('updates pending code status to denied', () => {
      generatePairingCode(db, 'telegram', 'user1');
      denySender(db, 'telegram', 'user1');

      const row = db
        .prepare(
          `SELECT status FROM pairing_codes WHERE channel = 'telegram' AND sender_id = 'user1'`,
        )
        .get() as any;

      expect(row.status).toBe('denied');
    });

    it('denied sender is not authorized', () => {
      generatePairingCode(db, 'telegram', 'user1');
      denySender(db, 'telegram', 'user1');

      expect(isAuthorized(db, 'telegram', 'user1')).toBe(false);
    });
  });

  // =========================================================================
  // Revocation
  // =========================================================================

  describe('revokeSender', () => {
    it('removes sender from allowlist', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      const removed = revokeSender(db, 'telegram', 'user1');

      expect(removed).toBe(true);
      expect(getAllowlist(db, 'telegram')).toHaveLength(0);
    });

    it('revoked sender is no longer authorized', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      revokeSender(db, 'telegram', 'user1');

      expect(isAuthorized(db, 'telegram', 'user1')).toBe(false);
    });

    it('returns false for non-existent sender', () => {
      expect(revokeSender(db, 'telegram', 'ghost')).toBe(false);
    });
  });

  // =========================================================================
  // Channel isolation
  // =========================================================================

  describe('channel isolation', () => {
    it('WhatsApp approval does not authorize Discord', () => {
      approveSender(db, 'whatsapp', 'user1', 'owner1');
      expect(isAuthorized(db, 'whatsapp', 'user1')).toBe(true);
      expect(isAuthorized(db, 'discord', 'user1')).toBe(false);
    });

    it('Telegram code cannot validate on WhatsApp', () => {
      const code = generatePairingCode(db, 'telegram', 'user1');
      expect(validatePairingCode(db, 'whatsapp', 'user1', code)).toBe(false);
    });

    it('allowlist entries are channel-scoped', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      approveSender(db, 'discord', 'user1', 'owner1');

      expect(getAllowlist(db, 'telegram')).toHaveLength(1);
      expect(getAllowlist(db, 'discord')).toHaveLength(1);
      expect(getAllowlist(db)).toHaveLength(2);
    });
  });

  // =========================================================================
  // Query functions
  // =========================================================================

  describe('getPendingCodes', () => {
    it('returns pending codes', () => {
      generatePairingCode(db, 'telegram', 'user1', 'Alice');
      generatePairingCode(db, 'whatsapp', 'user2', 'Bob');

      const pending = getPendingCodes(db);
      expect(pending).toHaveLength(2);
      expect(pending[0]!.senderId).toBeDefined();
    });

    it('filters by channel', () => {
      generatePairingCode(db, 'telegram', 'user1');
      generatePairingCode(db, 'whatsapp', 'user2');

      expect(getPendingCodes(db, 'telegram')).toHaveLength(1);
      expect(getPendingCodes(db, 'whatsapp')).toHaveLength(1);
    });

    it('excludes expired codes on read', () => {
      generatePairingCode(db, 'telegram', 'user1');

      // Manually expire
      db.prepare(
        `UPDATE pairing_codes SET expires_at = ? WHERE status = 'pending'`,
      ).run(Date.now() - 1000);

      expect(getPendingCodes(db)).toHaveLength(0);
    });

    it('returns camelCase fields', () => {
      generatePairingCode(db, 'telegram', 'user1', 'Alice');
      const pending = getPendingCodes(db);
      const entry = pending[0]!;

      expect(entry).toHaveProperty('senderId');
      expect(entry).toHaveProperty('displayName');
      expect(entry).toHaveProperty('createdAt');
      expect(entry).toHaveProperty('expiresAt');
    });
  });

  describe('getAllowlist', () => {
    it('returns empty array initially', () => {
      expect(getAllowlist(db)).toHaveLength(0);
    });

    it('returns entries after approval', () => {
      approveSender(db, 'telegram', 'user1', 'owner1', 'Alice');
      const list = getAllowlist(db);
      expect(list).toHaveLength(1);
      expect(list[0]!.senderId).toBe('user1');
    });

    it('filters by channel', () => {
      approveSender(db, 'telegram', 'user1', 'owner1');
      approveSender(db, 'discord', 'user2', 'owner1');

      expect(getAllowlist(db, 'telegram')).toHaveLength(1);
      expect(getAllowlist(db, 'discord')).toHaveLength(1);
    });
  });

  describe('cleanExpiredCodes', () => {
    it('marks expired codes and returns count', () => {
      generatePairingCode(db, 'telegram', 'user1');
      generatePairingCode(db, 'telegram', 'user2');

      // Expire one code
      db.prepare(
        `UPDATE pairing_codes SET expires_at = ?
         WHERE sender_id = 'user1' AND status = 'pending'`,
      ).run(Date.now() - 1000);

      const cleaned = cleanExpiredCodes(db);
      expect(cleaned).toBe(1);

      // user2's code should still be pending
      const pending = getPendingCodes(db);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.senderId).toBe('user2');
    });

    it('returns 0 when nothing expired', () => {
      generatePairingCode(db, 'telegram', 'user1');
      expect(cleanExpiredCodes(db)).toBe(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('empty sender ID does not crash isAuthorized', () => {
      expect(isAuthorized(db, 'telegram', '')).toBe(false);
    });

    it('empty sender ID does not crash isOwner', () => {
      process.env['BOT_OWNER_TELEGRAM'] = '12345';
      expect(isOwner('telegram', '')).toBe(false);
    });

    it('generatePairingCode with no displayName stores null', () => {
      generatePairingCode(db, 'telegram', 'user1');
      const row = db
        .prepare(
          `SELECT display_name FROM pairing_codes WHERE sender_id = 'user1'`,
        )
        .get() as any;
      expect(row.display_name).toBeNull();
    });

    it('full approval flow: generate → validate → approve → authorized', () => {
      process.env['BOT_OWNER_TELEGRAM'] = 'owner1';

      // Unknown sender is rejected
      expect(isAuthorized(db, 'telegram', 'newuser')).toBe(false);

      // Generate code
      const code = generatePairingCode(db, 'telegram', 'newuser', 'NewUser');

      // Validate code
      expect(validatePairingCode(db, 'telegram', 'newuser', code)).toBe(true);

      // Owner approves
      approveSender(db, 'telegram', 'newuser', 'owner1', 'NewUser');

      // Now authorized
      expect(isAuthorized(db, 'telegram', 'newuser')).toBe(true);

      // Code is no longer valid (approved)
      expect(validatePairingCode(db, 'telegram', 'newuser', code)).toBe(false);
    });
  });
});
