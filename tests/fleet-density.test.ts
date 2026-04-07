/**
 * Fleet Density Proof — 60-Instance Fixture Test
 *
 * Structural proof that the data model supports 60 concurrent instances:
 * stats aggregation at scale, idle sweep correctness, and resource math
 * that fits a 32–64 GB VPS.
 *
 * Guards against better-sqlite3 native load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// K001/K019 skip guard — better-sqlite3 may not load on Windows Node v24
// ---------------------------------------------------------------------------
let Database: typeof import('better-sqlite3').default;
let FleetDb: typeof import('../fleet/db.js').FleetDb;
let DEFAULT_MEMORY_MB: number;
let MAX_INSTANCES: number;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ FleetDb } = await import('../fleet/db.js'));
  ({ DEFAULT_MEMORY_MB, MAX_INSTANCES } = await import('../fleet/types.js'));
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping fleet-density tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err; // Unexpected — propagate
  }
}

// ---------------------------------------------------------------------------
// Full fleet_instances DDL (must include tunnel + activity columns for idle
// sweep tests). Mirrors fleet/schema.sql but omits credit tables.
// ---------------------------------------------------------------------------
const FLEET_DDL = `
  CREATE TABLE IF NOT EXISTS fleet_instances (
    id                TEXT    PRIMARY KEY,
    user_id           TEXT    NOT NULL UNIQUE,
    subdomain         TEXT    NOT NULL UNIQUE,
    status            TEXT    NOT NULL DEFAULT 'provisioning'
      CHECK (status IN ('provisioning', 'running', 'stopped', 'error', 'removing')),
    api_container_id  TEXT,
    web_container_id  TEXT,
    api_port          INTEGER,
    web_port          INTEGER,
    cpu_shares        INTEGER NOT NULL DEFAULT 256,
    memory_limit_mb   INTEGER NOT NULL DEFAULT 256,
    last_health_check INTEGER,
    last_health_status TEXT   NOT NULL DEFAULT 'unknown'
      CHECK (last_health_status IN ('healthy', 'unhealthy', 'unknown')),
    last_error        TEXT,
    tunnel_id         TEXT,
    tunnel_token      TEXT,
    tunnel_status     TEXT    NOT NULL DEFAULT 'unconfigured'
      CHECK (tunnel_status IN ('unconfigured', 'provisioned', 'connected', 'disconnected')),
    dns_record_id     TEXT,
    last_activity_at  INTEGER,
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_fleet_user_id   ON fleet_instances(user_id);
  CREATE INDEX IF NOT EXISTS idx_fleet_subdomain ON fleet_instances(subdomain);
  CREATE INDEX IF NOT EXISTS idx_fleet_status    ON fleet_instances(status);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-padded number: pad(3, 2) → "03" */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('Fleet Density — 60-instance fixture', () => {
  let db: InstanceType<typeof Database>;
  let fleetDb: InstanceType<typeof FleetDb>;

  /** Instance IDs captured during seeding, indexed 0–59. */
  let instanceIds: string[];

  beforeEach(() => {
    db = new Database(':memory:');
    fleetDb = new FleetDb(db);
    db.exec(FLEET_DDL);

    instanceIds = [];
    for (let i = 1; i <= 60; i++) {
      const userId = `user-${pad(i, 2)}`;
      const subdomain = `kin-${pad(i, 2)}`;
      const inst = fleetDb.createInstance(userId, subdomain);
      instanceIds.push(inst.id);
    }
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // 1. Stats aggregation at scale
  // -----------------------------------------------------------------------

  it('getFleetStats returns correct counts for 60 instances', () => {
    // All 60 start as 'provisioning'. Transition them:
    //   40 → running, 15 → stopped, 5 → error
    for (let i = 0; i < 40; i++) {
      fleetDb.updateStatus(instanceIds[i], 'running');
    }
    for (let i = 40; i < 55; i++) {
      fleetDb.updateStatus(instanceIds[i], 'stopped');
    }
    for (let i = 55; i < 60; i++) {
      fleetDb.updateStatus(instanceIds[i], 'error');
    }

    const stats = fleetDb.getFleetStats();

    expect(stats.total).toBe(60);
    expect(stats.running).toBe(40);
    expect(stats.stopped).toBe(15);
    expect(stats.error).toBe(5);
    expect(stats.provisioning).toBe(0);
    expect(stats.removing).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 2. listInstances returns all 60 rows
  // -----------------------------------------------------------------------

  it('listInstances returns all 60 rows with correct subdomains', () => {
    const all = fleetDb.listInstances();

    expect(all).toHaveLength(60);

    // listInstances orders by created_at DESC, so first entry is the last
    // created and last entry is the first created.
    const subdomains = all.map((inst) => inst.subdomain);
    expect(subdomains).toContain('kin-01');
    expect(subdomains).toContain('kin-60');
  });

  // -----------------------------------------------------------------------
  // 3. Resource math fits VPS bounds
  // -----------------------------------------------------------------------

  it('resource math fits 64 GB VPS with 60 instances', () => {
    const CONTAINERS_PER_INSTANCE = 2; // kin-api + kin-web
    const VPS_64GB_MB = 64_000;
    const VPS_32GB_MB = 32_000;

    // Worst-case: all 60 instances awake
    const worstCaseMb =
      60 * DEFAULT_MEMORY_MB * CONTAINERS_PER_INSTANCE; // 60 × 256 × 2 = 30,720
    expect(worstCaseMb).toBe(30_720);
    expect(worstCaseMb).toBeLessThan(VPS_64GB_MB);

    // Peak awake scenario from stats test: 40 running
    const peakAwakeMb =
      40 * DEFAULT_MEMORY_MB * CONTAINERS_PER_INSTANCE; // 40 × 256 × 2 = 20,480
    expect(peakAwakeMb).toBe(20_480);
    expect(peakAwakeMb).toBeLessThan(VPS_32GB_MB);
  });

  // -----------------------------------------------------------------------
  // 4. Idle sweep works correctly with 60 instances
  // -----------------------------------------------------------------------

  it('getIdleInstances correctly identifies idle instances from 60', () => {
    const now = Date.now();
    const thirtyMinMs = 30 * 60 * 1000;
    const oldTimestamp = now - thirtyMinMs - 60_000; // 31 min ago

    // Set first 40 to running (the rest stay provisioning — idle sweep
    // only considers status='running').
    for (let i = 0; i < 40; i++) {
      fleetDb.updateStatus(instanceIds[i], 'running');
    }

    // Among the 40 running instances:
    //   - First 10 (index 0–9):  old last_activity_at → should be idle
    //   - Next 30  (index 10–39): recent last_activity_at → not idle
    //
    // updateLastActivity uses Date.now() internally, so we write timestamps
    // directly to get deterministic results.
    for (let i = 0; i < 10; i++) {
      db.prepare(
        `UPDATE fleet_instances SET last_activity_at = @ts, updated_at = @ts WHERE id = @id`,
      ).run({ ts: oldTimestamp, id: instanceIds[i] });
    }
    for (let i = 10; i < 40; i++) {
      db.prepare(
        `UPDATE fleet_instances SET last_activity_at = @ts, updated_at = @ts WHERE id = @id`,
      ).run({ ts: now, id: instanceIds[i] });
    }

    const idle = fleetDb.getIdleInstances(thirtyMinMs);

    expect(idle).toHaveLength(10);

    // All idle instances should be from the first 10
    const idleIds = new Set(idle.map((inst) => inst.id));
    for (let i = 0; i < 10; i++) {
      expect(idleIds.has(instanceIds[i])).toBe(true);
    }
    // None of the recent ones should appear
    for (let i = 10; i < 40; i++) {
      expect(idleIds.has(instanceIds[i])).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // 5. MAX_INSTANCES constant is at least 60
  // -----------------------------------------------------------------------

  it('MAX_INSTANCES constant is at least 60', () => {
    expect(MAX_INSTANCES).toBeGreaterThanOrEqual(60);
  });
});
