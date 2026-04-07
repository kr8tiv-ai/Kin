/**
 * Tests for inference/approval-manager.ts
 *
 * Uses in-memory SQLite for isolation. Covers CRUD, resolution, expiry,
 * auto-expiry on read, channel notifications, and fire-and-forget error
 * handling for the ChannelDelivery integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { ApprovalManager, type Approval } from '../inference/approval-manager.js';
import { ChannelDelivery } from '../inference/channel-delivery.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(
    path.join(process.cwd(), 'db', 'schema.sql'),
    'utf-8',
  );
  db.exec(schema);

  // Seed minimal referenced rows
  db.prepare(
    "INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-1', 'Test')",
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, first_name) VALUES ('user-2', 'Other')",
  ).run();

  return db;
}

const DEFAULT_OPTS = {
  userId: 'user-1',
  skillName: 'email',
  intent: 'send',
  payload: JSON.stringify({ to: 'alice@example.com', subject: 'Hello' }),
  deliveryChannel: 'telegram',
  deliveryRecipientId: 'tg-123',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApprovalManager', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
  });

  // -------------------------------------------------------------------------
  // createApproval
  // -------------------------------------------------------------------------

  describe('createApproval', () => {
    it('creates an approval with all fields set correctly', () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval(DEFAULT_OPTS);

      expect(approval.id).toBeTruthy();
      expect(approval.userId).toBe('user-1');
      expect(approval.skillName).toBe('email');
      expect(approval.intent).toBe('send');
      expect(approval.payload).toBe(DEFAULT_OPTS.payload);
      expect(approval.deliveryChannel).toBe('telegram');
      expect(approval.deliveryRecipientId).toBe('tg-123');
      expect(approval.status).toBe('pending');
      expect(approval.createdAt).toBeGreaterThan(0);
      expect(approval.expiresAt).toBeGreaterThan(approval.createdAt);
      expect(approval.resolvedAt).toBeNull();
      expect(approval.resolvedBy).toBeNull();
    });

    it('uses default TTL of 30 minutes', () => {
      const manager = new ApprovalManager({ db });
      const before = Date.now();
      const approval = manager.createApproval(DEFAULT_OPTS);
      const after = Date.now();

      const expectedTtl = 30 * 60 * 1000;
      expect(approval.expiresAt).toBeGreaterThanOrEqual(before + expectedTtl);
      expect(approval.expiresAt).toBeLessThanOrEqual(after + expectedTtl);
    });

    it('accepts a custom ttlMs', () => {
      const manager = new ApprovalManager({ db });
      const before = Date.now();
      const approval = manager.createApproval({
        ...DEFAULT_OPTS,
        ttlMs: 5000,
      });

      expect(approval.expiresAt).toBeGreaterThanOrEqual(before + 5000);
      expect(approval.expiresAt).toBeLessThanOrEqual(before + 6000);
    });

    it('handles null intent', () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval({
        ...DEFAULT_OPTS,
        intent: undefined,
      });

      expect(approval.intent).toBeNull();
    });

    it('sends channel notification when channelDelivery is provided', async () => {
      const delivery = new ChannelDelivery();
      const sendSpy = vi.fn().mockResolvedValue(undefined);
      delivery.register('telegram', sendSpy);

      const manager = new ApprovalManager({ db, channelDelivery: delivery });
      const approval = manager.createApproval(DEFAULT_OPTS);

      // Give fire-and-forget time to complete
      await vi.waitFor(() => {
        expect(sendSpy).toHaveBeenCalledOnce();
      });

      expect(sendSpy).toHaveBeenCalledWith(
        'tg-123',
        expect.stringContaining('Approval required'),
      );
      expect(sendSpy).toHaveBeenCalledWith(
        'tg-123',
        expect.stringContaining(approval.id),
      );
    });

    it('channel notification failure does not block approval creation', async () => {
      const delivery = new ChannelDelivery();
      delivery.register('telegram', vi.fn().mockRejectedValue(new Error('Network error')));

      const manager = new ApprovalManager({ db, channelDelivery: delivery });
      const approval = manager.createApproval(DEFAULT_OPTS);

      // Approval still created successfully despite notification failure
      expect(approval.id).toBeTruthy();
      expect(approval.status).toBe('pending');

      // Let the rejected promise settle
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  // -------------------------------------------------------------------------
  // resolveApproval
  // -------------------------------------------------------------------------

  describe('resolveApproval', () => {
    it('resolves as approved — status changes, resolved_at set, onApproved called', async () => {
      const onApproved = vi.fn().mockResolvedValue(undefined);
      const manager = new ApprovalManager({ db, onApproved });

      const approval = manager.createApproval(DEFAULT_OPTS);
      const result = await manager.resolveApproval(approval.id, 'approved', 'user');

      expect(result).toBe(true);

      // Give onApproved fire-and-forget time
      await vi.waitFor(() => {
        expect(onApproved).toHaveBeenCalledOnce();
      });

      const resolved = manager.getApproval(approval.id);
      expect(resolved?.status).toBe('approved');
      expect(resolved?.resolvedAt).toBeGreaterThan(0);
      expect(resolved?.resolvedBy).toBe('user');

      // Verify callback received correct approval with payload
      const callArg = onApproved.mock.calls[0][0] as Approval;
      expect(callArg.id).toBe(approval.id);
      expect(callArg.payload).toBe(DEFAULT_OPTS.payload);
    });

    it('resolves as rejected — status changes, onApproved NOT called', async () => {
      const onApproved = vi.fn().mockResolvedValue(undefined);
      const manager = new ApprovalManager({ db, onApproved });

      const approval = manager.createApproval(DEFAULT_OPTS);
      const result = await manager.resolveApproval(approval.id, 'rejected', 'user');

      expect(result).toBe(true);

      const resolved = manager.getApproval(approval.id);
      expect(resolved?.status).toBe('rejected');
      expect(resolved?.resolvedAt).toBeGreaterThan(0);

      // Wait a tick and confirm onApproved was NOT called
      await new Promise((r) => setTimeout(r, 10));
      expect(onApproved).not.toHaveBeenCalled();
    });

    it('double-resolve returns false', async () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval(DEFAULT_OPTS);

      const first = await manager.resolveApproval(approval.id, 'approved');
      const second = await manager.resolveApproval(approval.id, 'rejected');

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('expired approval cannot be resolved', async () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval({
        ...DEFAULT_OPTS,
        ttlMs: 1, // 1ms TTL — expires immediately
      });

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 10));

      const result = await manager.resolveApproval(approval.id, 'approved');
      expect(result).toBe(false);
    });

    it('returns false for non-existent approval ID', async () => {
      const manager = new ApprovalManager({ db });
      const result = await manager.resolveApproval('nonexistent-id', 'approved');
      expect(result).toBe(false);
    });

    it('defaults resolvedBy to "user" when not provided', async () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval(DEFAULT_OPTS);

      await manager.resolveApproval(approval.id, 'approved');
      const resolved = manager.getApproval(approval.id);

      expect(resolved?.resolvedBy).toBe('user');
    });
  });

  // -------------------------------------------------------------------------
  // getApproval
  // -------------------------------------------------------------------------

  describe('getApproval', () => {
    it('returns null for non-existent ID', () => {
      const manager = new ApprovalManager({ db });
      expect(manager.getApproval('nonexistent')).toBeNull();
    });

    it('returns the approval with camelCase fields', () => {
      const manager = new ApprovalManager({ db });
      const created = manager.createApproval(DEFAULT_OPTS);
      const fetched = manager.getApproval(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.userId).toBe('user-1');
      expect(fetched?.skillName).toBe('email');
    });

    it('auto-transitions expired approvals to expired status', async () => {
      const manager = new ApprovalManager({ db });
      const approval = manager.createApproval({
        ...DEFAULT_OPTS,
        ttlMs: 1,
      });

      await new Promise((r) => setTimeout(r, 10));

      const fetched = manager.getApproval(approval.id);
      expect(fetched?.status).toBe('expired');
      expect(fetched?.resolvedBy).toBe('system');
    });
  });

  // -------------------------------------------------------------------------
  // listPending
  // -------------------------------------------------------------------------

  describe('listPending', () => {
    it('returns only non-expired pending approvals', async () => {
      const manager = new ApprovalManager({ db });

      // Create one valid, one expired
      manager.createApproval(DEFAULT_OPTS);
      manager.createApproval({
        ...DEFAULT_OPTS,
        ttlMs: 1,
        skillName: 'email',
        intent: 'draft',
      });

      await new Promise((r) => setTimeout(r, 10));

      const pending = manager.listPending('user-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].intent).toBe('send');
    });

    it('returns empty array when no pending approvals', () => {
      const manager = new ApprovalManager({ db });
      const pending = manager.listPending('user-1');
      expect(pending).toHaveLength(0);
    });

    it('filters by userId — does not return other users approvals', () => {
      const manager = new ApprovalManager({ db });
      manager.createApproval(DEFAULT_OPTS); // user-1
      manager.createApproval({ ...DEFAULT_OPTS, userId: 'user-2' });

      const user1Pending = manager.listPending('user-1');
      const user2Pending = manager.listPending('user-2');

      expect(user1Pending).toHaveLength(1);
      expect(user2Pending).toHaveLength(1);
      expect(user1Pending[0].userId).toBe('user-1');
      expect(user2Pending[0].userId).toBe('user-2');
    });

    it('does not return approved or rejected approvals', async () => {
      const manager = new ApprovalManager({ db });
      const a1 = manager.createApproval(DEFAULT_OPTS);
      const a2 = manager.createApproval({ ...DEFAULT_OPTS, intent: 'draft' });
      manager.createApproval({ ...DEFAULT_OPTS, intent: undefined });

      await manager.resolveApproval(a1.id, 'approved');
      await manager.resolveApproval(a2.id, 'rejected');

      const pending = manager.listPending('user-1');
      expect(pending).toHaveLength(1);
      expect(pending[0].intent).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // expireStale
  // -------------------------------------------------------------------------

  describe('expireStale', () => {
    it('bulk expires all past-due pending approvals', async () => {
      const manager = new ApprovalManager({ db });
      manager.createApproval({ ...DEFAULT_OPTS, ttlMs: 1 });
      manager.createApproval({ ...DEFAULT_OPTS, ttlMs: 1, userId: 'user-2' });
      manager.createApproval(DEFAULT_OPTS); // still valid

      await new Promise((r) => setTimeout(r, 10));

      const expired = manager.expireStale();
      expect(expired).toBe(2);

      // The valid one is still pending
      const pending = manager.listPending('user-1');
      expect(pending).toHaveLength(1);
    });

    it('returns 0 when nothing to expire', () => {
      const manager = new ApprovalManager({ db });
      expect(manager.expireStale()).toBe(0);
    });
  });
});
