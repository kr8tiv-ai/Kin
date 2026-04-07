/**
 * DM Security — Channel-Agnostic Pairing Codes & Allowlists
 *
 * Pure functions for managing who can DM the bot across all channels.
 * Unknown senders receive a pairing code; the owner approves or denies.
 * A master toggle (DM_SECURITY_ENABLED) allows disabling entirely.
 *
 * All functions are synchronous (better-sqlite3) and take a db instance
 * as the first parameter for testability (K023).
 *
 * Two-gate authorization pattern per K012:
 *   Gate 1: DM_SECURITY_ENABLED !== 'false'
 *   Gate 2: sender is owner OR sender is on allowlist
 *
 * @module bot/utils/dm-security
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Channels supported by DM security */
export type DmChannel = 'telegram' | 'whatsapp' | 'discord';

export interface AllowlistEntry {
  id: string;
  channel: string;
  senderId: string;
  displayName: string | null;
  approvedBy: string;
  approvedAt: number;
}

export interface PairingCodeEntry {
  id: string;
  channel: string;
  senderId: string;
  displayName: string | null;
  code: string;
  status: string;
  createdAt: number;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Env-var channel map
// ---------------------------------------------------------------------------

const OWNER_ENV_KEYS: Record<DmChannel, string> = {
  whatsapp: 'BOT_OWNER_WHATSAPP',
  discord: 'BOT_OWNER_DISCORD',
  telegram: 'BOT_OWNER_TELEGRAM',
};

// ---------------------------------------------------------------------------
// Owner detection
// ---------------------------------------------------------------------------

/**
 * Read the owner ID for a given channel from process.env.
 * Returns undefined if the env var is missing or the channel is unknown.
 */
export function getOwnerIdForChannel(channel: string): string | undefined {
  const key = OWNER_ENV_KEYS[channel as DmChannel];
  if (!key) return undefined;
  return process.env[key] || undefined;
}

/**
 * Check whether a sender is the bot owner for the given channel.
 */
export function isOwner(channel: string, senderId: string): boolean {
  const ownerId = getOwnerIdForChannel(channel);
  if (!ownerId) return false;
  return ownerId === senderId;
}

// ---------------------------------------------------------------------------
// Authorization (two-gate pattern — K012)
// ---------------------------------------------------------------------------

/**
 * Determine if a sender is authorized to chat with the bot.
 *
 * Gate 1: If DM_SECURITY_ENABLED is explicitly 'false', everyone passes.
 * Gate 2: Sender is the owner OR is on the allowlist.
 */
export function isAuthorized(
  db: any,
  channel: string,
  senderId: string,
): boolean {
  // Gate 1 — master toggle
  if (process.env['DM_SECURITY_ENABLED'] === 'false') return true;

  // Gate 2a — owner is always authorized
  if (isOwner(channel, senderId)) return true;

  // Gate 2b — check allowlist
  const row = db
    .prepare(
      'SELECT 1 FROM dm_allowlist WHERE channel = ? AND sender_id = ?',
    )
    .get(channel, senderId);

  return !!row;
}

// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a 6-digit pairing code for a sender.
 * Replaces any existing pending code for the same (channel, sender_id).
 * Returns the 6-digit code string.
 */
export function generatePairingCode(
  db: any,
  channel: string,
  senderId: string,
  displayName?: string,
): string {
  const code = String(crypto.randomInt(100000, 999999));
  const now = Date.now();
  const expiresAt = now + PAIRING_TTL_MS;
  const id = crypto.randomUUID();

  // Expire any existing pending code for this sender+channel
  db.prepare(
    `UPDATE pairing_codes SET status = 'expired'
     WHERE channel = ? AND sender_id = ? AND status = 'pending'`,
  ).run(channel, senderId);

  // Insert new code
  db.prepare(
    `INSERT INTO pairing_codes (id, channel, sender_id, display_name, code, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, channel, senderId, displayName ?? null, code, now, expiresAt);

  return code;
}

/**
 * Validate a pairing code. Returns true if the code matches, is pending,
 * and has not expired.
 */
export function validatePairingCode(
  db: any,
  channel: string,
  senderId: string,
  code: string,
): boolean {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT 1 FROM pairing_codes
       WHERE channel = ? AND sender_id = ? AND code = ?
         AND status = 'pending' AND expires_at > ?`,
    )
    .get(channel, senderId, code, now);

  return !!row;
}

// ---------------------------------------------------------------------------
// Approval / denial / revocation
// ---------------------------------------------------------------------------

/**
 * Approve a sender: add to allowlist and update the pairing code status.
 * Uses INSERT OR IGNORE on allowlist for idempotency.
 */
export function approveSender(
  db: any,
  channel: string,
  senderId: string,
  approvedBy: string,
  displayName?: string,
): void {
  const id = crypto.randomUUID();
  const now = Date.now();

  // Add to allowlist (idempotent — IGNORE if already present)
  db.prepare(
    `INSERT OR IGNORE INTO dm_allowlist (id, channel, sender_id, display_name, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, channel, senderId, displayName ?? null, approvedBy, now);

  // Mark all pending codes for this sender as approved
  db.prepare(
    `UPDATE pairing_codes SET status = 'approved'
     WHERE channel = ? AND sender_id = ? AND status = 'pending'`,
  ).run(channel, senderId);
}

/**
 * Deny a sender: update pending pairing codes to 'denied'.
 */
export function denySender(
  db: any,
  channel: string,
  senderId: string,
): void {
  db.prepare(
    `UPDATE pairing_codes SET status = 'denied'
     WHERE channel = ? AND sender_id = ? AND status = 'pending'`,
  ).run(channel, senderId);
}

/**
 * Revoke a previously-approved sender from the allowlist.
 * Returns true if a row was actually deleted.
 */
export function revokeSender(
  db: any,
  channel: string,
  senderId: string,
): boolean {
  const result = db
    .prepare(
      'DELETE FROM dm_allowlist WHERE channel = ? AND sender_id = ?',
    )
    .run(channel, senderId);

  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get all pending pairing codes, filtering out expired ones on read.
 * Optionally filter by channel.
 */
export function getPendingCodes(
  db: any,
  channel?: string,
): PairingCodeEntry[] {
  const now = Date.now();

  // Mark expired codes first
  db.prepare(
    `UPDATE pairing_codes SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= ?`,
  ).run(now);

  const sql = channel
    ? `SELECT id, channel, sender_id, display_name, code, status, created_at, expires_at
       FROM pairing_codes WHERE status = 'pending' AND channel = ?`
    : `SELECT id, channel, sender_id, display_name, code, status, created_at, expires_at
       FROM pairing_codes WHERE status = 'pending'`;

  const rows: any[] = channel
    ? db.prepare(sql).all(channel)
    : db.prepare(sql).all();

  return rows.map((r: any) => ({
    id: r.id as string,
    channel: r.channel as string,
    senderId: r.sender_id as string,
    displayName: r.display_name as string | null,
    code: r.code as string,
    status: r.status as string,
    createdAt: r.created_at as number,
    expiresAt: r.expires_at as number,
  }));
}

/**
 * Get the allowlist, optionally filtered by channel.
 */
export function getAllowlist(
  db: any,
  channel?: string,
): AllowlistEntry[] {
  const sql = channel
    ? `SELECT id, channel, sender_id, display_name, approved_by, approved_at
       FROM dm_allowlist WHERE channel = ?`
    : `SELECT id, channel, sender_id, display_name, approved_by, approved_at
       FROM dm_allowlist`;

  const rows: any[] = channel
    ? db.prepare(sql).all(channel)
    : db.prepare(sql).all();

  return rows.map((r: any) => ({
    id: r.id as string,
    channel: r.channel as string,
    senderId: r.sender_id as string,
    displayName: r.display_name as string | null,
    approvedBy: r.approved_by as string,
    approvedAt: r.approved_at as number,
  }));
}

/**
 * Mark all expired pending codes. Returns the count of codes marked.
 */
export function cleanExpiredCodes(db: any): number {
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE pairing_codes SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= ?`,
    )
    .run(now);

  return result.changes as number;
}
