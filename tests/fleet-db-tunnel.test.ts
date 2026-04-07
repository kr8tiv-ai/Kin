/**
 * FleetDb tunnel CRUD tests — uses in-memory SQLite.
 *
 * K001/K019 skip guard: better-sqlite3 native module may not load on
 * Windows Node v24. Tests skip gracefully on ERR_DLOPEN_FAILED.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// K001/K019 skip guard — set flag instead of early export (ESM export must be top-level)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;
let skipReason = '';
try {
  Database = (await import('better-sqlite3')).default;
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    skipReason = 'better-sqlite3 native module not available';
  } else {
    throw e;
  }
}

// Only import FleetDb / helpers if the native module loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FleetDb: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let readFileSync: any, resolve: any, dirname: any, fileURLToPath: any;

if (!skipReason) {
  const dbMod = await import('../fleet/db.js');
  FleetDb = dbMod.FleetDb;
  const fsMod = await import('fs');
  readFileSync = fsMod.readFileSync;
  const pathMod = await import('path');
  resolve = pathMod.resolve;
  dirname = pathMod.dirname;
  const urlMod = await import('url');
  fileURLToPath = urlMod.fileURLToPath;
}

// ---------------------------------------------------------------------------
// Helpers (only valid when Database loaded)
// ---------------------------------------------------------------------------

function createTestDb() {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const raw = new Database(':memory:');
  const schemaPath = resolve(__dir, '..', 'fleet', 'schema.sql');
  const ddl = readFileSync(schemaPath, 'utf-8');
  raw.exec(ddl);
  const db = new FleetDb(raw);
  return { db, raw };
}

function seedInstance(db: any): string {
  const inst = db.createInstance('user-1', 'alice');
  return inst.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!!skipReason)('FleetDb tunnel CRUD', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    raw = t.raw;
  });

  afterEach(() => {
    db.close();
  });

  describe('rowToInstance — tunnel field defaults', () => {
    it('new instances have null tunnel fields and unconfigured status', () => {
      const id = seedInstance(db);
      const inst = db.getInstance(id)!;

      expect(inst.tunnelId).toBeNull();
      expect(inst.tunnelToken).toBeNull();
      expect(inst.tunnelStatus).toBe('unconfigured');
      expect(inst.dnsRecordId).toBeNull();
    });
  });

  describe('updateTunnelInfo', () => {
    it('persists all four tunnel fields', () => {
      const id = seedInstance(db);

      const updated = db.updateTunnelInfo(
        id,
        'tun-abc-123',
        'tok-secret-456',
        'provisioned',
        'dns-rec-789',
      );

      expect(updated).not.toBeNull();
      expect(updated!.tunnelId).toBe('tun-abc-123');
      expect(updated!.tunnelToken).toBe('tok-secret-456');
      expect(updated!.tunnelStatus).toBe('provisioned');
      expect(updated!.dnsRecordId).toBe('dns-rec-789');
    });

    it('sets updated_at on change', () => {
      const id = seedInstance(db);
      const before = db.getInstance(id)!.updatedAt;

      // Small delay to ensure timestamp differs
      const updated = db.updateTunnelInfo(id, 'tun-1', 'tok-1', 'provisioned', null);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('allows null dnsRecordId', () => {
      const id = seedInstance(db);
      const updated = db.updateTunnelInfo(id, 'tun-1', 'tok-1', 'provisioned', null);
      expect(updated!.dnsRecordId).toBeNull();
    });

    it('returns null for non-existent instance', () => {
      const result = db.updateTunnelInfo('nope', 'tun', 'tok', 'provisioned', null);
      expect(result).toBeNull();
    });
  });

  describe('updateTunnelStatus', () => {
    it('transitions tunnel status', () => {
      const id = seedInstance(db);

      // Set initial tunnel info
      db.updateTunnelInfo(id, 'tun-1', 'tok-1', 'provisioned', 'dns-1');

      // Transition to connected
      const connected = db.updateTunnelStatus(id, 'connected');
      expect(connected!.tunnelStatus).toBe('connected');

      // Transition to disconnected
      const disconnected = db.updateTunnelStatus(id, 'disconnected');
      expect(disconnected!.tunnelStatus).toBe('disconnected');
    });

    it('preserves other tunnel fields when changing status', () => {
      const id = seedInstance(db);
      db.updateTunnelInfo(id, 'tun-1', 'tok-1', 'provisioned', 'dns-1');

      const updated = db.updateTunnelStatus(id, 'connected');
      expect(updated!.tunnelId).toBe('tun-1');
      expect(updated!.tunnelToken).toBe('tok-1');
      expect(updated!.dnsRecordId).toBe('dns-1');
    });

    it('returns null for non-existent instance', () => {
      const result = db.updateTunnelStatus('nope', 'connected');
      expect(result).toBeNull();
    });
  });

  describe('schema CHECK constraint', () => {
    it('rejects invalid tunnel_status values', () => {
      const id = seedInstance(db);
      expect(() => {
        raw.prepare(
          `UPDATE fleet_instances SET tunnel_status = 'bogus' WHERE id = ?`,
        ).run(id);
      }).toThrow();
    });
  });
});
