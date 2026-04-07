/**
 * ApprovalManager — User confirmation gate for external mutations.
 *
 * Manages the exec_approvals table: creating pending approvals, resolving
 * them (approve/reject), auto-expiring stale entries, and notifying users
 * via ChannelDelivery. Instantiated with a db handle (not singleton) to
 * match the PipelineManager pattern.
 *
 * @module inference/approval-manager
 */

import crypto from 'crypto';
import type { ChannelDelivery } from './channel-delivery.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database handle — matches better-sqlite3's Database interface. */
export interface ApprovalDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

/** Row shape from exec_approvals table. */
export interface ApprovalRow {
  id: string;
  user_id: string;
  skill_name: string;
  intent: string | null;
  payload: string;
  delivery_channel: string;
  delivery_recipient_id: string;
  status: string;
  created_at: number;
  expires_at: number;
  resolved_at: number | null;
  resolved_by: string | null;
}

/** Camel-cased approval returned to callers. */
export interface Approval {
  id: string;
  userId: string;
  skillName: string;
  intent: string | null;
  payload: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
}

/** Options for creating a new approval. */
export interface CreateApprovalOpts {
  userId: string;
  skillName: string;
  intent?: string;
  payload: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  /** Time-to-live in milliseconds. Default: 30 minutes. */
  ttlMs?: number;
}

/** Constructor options for ApprovalManager. */
export interface ApprovalManagerOpts {
  db: ApprovalDb;
  channelDelivery?: ChannelDelivery;
  onApproved?: (approval: Approval) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    userId: row.user_id,
    skillName: row.skill_name,
    intent: row.intent,
    payload: row.payload,
    deliveryChannel: row.delivery_channel,
    deliveryRecipientId: row.delivery_recipient_id,
    status: row.status as Approval['status'],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

// ---------------------------------------------------------------------------
// ApprovalManager
// ---------------------------------------------------------------------------

export class ApprovalManager {
  private db: ApprovalDb;
  private channelDelivery?: ChannelDelivery;
  public onApproved?: (approval: Approval) => Promise<void>;

  constructor(opts: ApprovalManagerOpts) {
    this.db = opts.db;
    this.channelDelivery = opts.channelDelivery;
    this.onApproved = opts.onApproved;
  }

  /**
   * Create a pending approval request.
   *
   * Inserts a row, sends a channel notification (fire-and-forget), and
   * returns the camelCase Approval object.
   */
  createApproval(opts: CreateApprovalOpts): Approval {
    const id = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + (opts.ttlMs ?? DEFAULT_TTL_MS);

    this.db.prepare(`
      INSERT INTO exec_approvals
        (id, user_id, skill_name, intent, payload, delivery_channel,
         delivery_recipient_id, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      id,
      opts.userId,
      opts.skillName,
      opts.intent ?? null,
      opts.payload,
      opts.deliveryChannel,
      opts.deliveryRecipientId,
      now,
      expiresAt,
    );

    const approval: Approval = {
      id,
      userId: opts.userId,
      skillName: opts.skillName,
      intent: opts.intent ?? null,
      payload: opts.payload,
      deliveryChannel: opts.deliveryChannel,
      deliveryRecipientId: opts.deliveryRecipientId,
      status: 'pending',
      createdAt: now,
      expiresAt,
      resolvedAt: null,
      resolvedBy: null,
    };

    // Fire-and-forget channel notification
    if (this.channelDelivery) {
      const intentLabel = opts.intent ? ` (${opts.intent})` : '';
      const message =
        `⚠️ Approval required: ${opts.skillName}${intentLabel}\n` +
        `Approval ID: ${id}\n` +
        `Expires: ${new Date(expiresAt).toISOString()}`;
      this.channelDelivery
        .send(opts.deliveryChannel, opts.deliveryRecipientId, message)
        .catch(() => { /* fire-and-forget — K013 */ });
    }

    return approval;
  }

  /**
   * Resolve a pending approval as approved or rejected.
   *
   * Uses an atomic UPDATE with status='pending' AND expires_at guard so
   * double-resolve and expired-resolve both return false.
   *
   * On 'approved', calls the onApproved callback (fire-and-forget).
   */
  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    resolvedBy?: string,
  ): Promise<boolean> {
    const now = Date.now();

    const result = this.db.prepare(`
      UPDATE exec_approvals
      SET status = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ? AND status = 'pending' AND expires_at > ?
    `).run(decision, now, resolvedBy ?? 'user', approvalId, now);

    if (result.changes === 0) return false;

    if (decision === 'approved' && this.onApproved) {
      const row = this.db.prepare(
        'SELECT * FROM exec_approvals WHERE id = ?',
      ).get(approvalId) as ApprovalRow | undefined;

      if (row) {
        // Fire-and-forget — caller doesn't wait for execution
        this.onApproved(rowToApproval(row)).catch(() => {});
      }
    }

    return true;
  }

  /**
   * Get a single approval by ID.
   *
   * Checks expiry at read time — auto-transitions to 'expired' if past
   * expires_at and still 'pending'.
   */
  getApproval(id: string): Approval | null {
    const row = this.db.prepare(
      'SELECT * FROM exec_approvals WHERE id = ?',
    ).get(id) as ApprovalRow | undefined;

    if (!row) return null;

    // Auto-expire at read time
    if (row.status === 'pending' && row.expires_at <= Date.now()) {
      this.db.prepare(`
        UPDATE exec_approvals
        SET status = 'expired', resolved_at = ?, resolved_by = 'system'
        WHERE id = ? AND status = 'pending'
      `).run(Date.now(), id);

      return {
        ...rowToApproval(row),
        status: 'expired',
        resolvedAt: Date.now(),
        resolvedBy: 'system',
      };
    }

    return rowToApproval(row);
  }

  /**
   * List pending approvals for a user.
   *
   * Auto-expires stale entries before returning results.
   */
  listPending(userId: string): Approval[] {
    // Bulk-expire stale entries first
    const now = Date.now();
    this.db.prepare(`
      UPDATE exec_approvals
      SET status = 'expired', resolved_at = ?, resolved_by = 'system'
      WHERE user_id = ? AND status = 'pending' AND expires_at <= ?
    `).run(now, userId, now);

    const rows = this.db.prepare(`
      SELECT * FROM exec_approvals
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(userId) as ApprovalRow[];

    return rows.map(rowToApproval);
  }

  /**
   * Bulk expire all past-due pending approvals across all users.
   *
   * @returns Number of approvals expired.
   */
  expireStale(): number {
    const now = Date.now();
    const result = this.db.prepare(`
      UPDATE exec_approvals
      SET status = 'expired', resolved_at = ?, resolved_by = 'system'
      WHERE status = 'pending' AND expires_at <= ?
    `).run(now, now);

    return result.changes;
  }
}
