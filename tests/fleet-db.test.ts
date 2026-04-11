/**
 * Fleet DB — Unit Tests
 *
 * Tests FleetDb CRUD operations against in-memory SQLite.
 * Guards against better-sqlite3 native load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// K001/K019 skip guard — better-sqlite3 may not load on Windows Node v24
// ---------------------------------------------------------------------------
let Database: typeof import('better-sqlite3').default;
let FleetDb: typeof import('../fleet/db.js').FleetDb;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ FleetDb } = await import('../fleet/db.js'));
  const probe = new Database(':memory:');
  probe.close();
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping fleet-db tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err; // Unexpected — propagate
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('FleetDb', () => {
  let db: InstanceType<typeof Database>;
  let fleetDb: InstanceType<typeof FleetDb>;

  beforeEach(() => {
    db = new Database(':memory:');
    fleetDb = new FleetDb(db);
    // Run schema inline since import.meta.url resolution won't find schema.sql
    // when the Database instance is in-memory.
    db.exec(`
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
        created_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_fleet_user_id   ON fleet_instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_fleet_subdomain ON fleet_instances(subdomain);
      CREATE INDEX IF NOT EXISTS idx_fleet_status    ON fleet_instances(status);
    `);
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // createInstance
  // -------------------------------------------------------------------------

  it('createInstance returns proper structure with camelCase keys', () => {
    const inst = fleetDb.createInstance('user-1', 'alpha');

    expect(inst.id).toMatch(/^fleet-user-1-/);
    expect(inst.userId).toBe('user-1');
    expect(inst.subdomain).toBe('alpha');
    expect(inst.status).toBe('provisioning');
    expect(inst.apiContainerId).toBeNull();
    expect(inst.webContainerId).toBeNull();
    expect(inst.apiPort).toBeNull();
    expect(inst.webPort).toBeNull();
    expect(inst.resourceLimits).toEqual({ cpuShares: 256, memoryMb: 256 });
    expect(inst.healthCheck).toEqual({
      lastCheckAt: null,
      status: 'unknown',
      lastError: null,
    });
    expect(inst.createdAt).toBeTypeOf('number');
    expect(inst.updatedAt).toBeTypeOf('number');
  });

  it('createInstance applies custom resource limits', () => {
    const inst = fleetDb.createInstance('user-custom', 'bravo', {
      cpuShares: 512,
      memoryMb: 1024,
    });

    expect(inst.resourceLimits.cpuShares).toBe(512);
    expect(inst.resourceLimits.memoryMb).toBe(1024);
  });

  // -------------------------------------------------------------------------
  // Read — single lookups
  // -------------------------------------------------------------------------

  it('getInstance returns instance by id', () => {
    const created = fleetDb.createInstance('user-get', 'charlie');
    const fetched = fleetDb.getInstance(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.userId).toBe('user-get');
  });

  it('getInstance returns null for missing id', () => {
    expect(fleetDb.getInstance('nonexistent')).toBeNull();
  });

  it('getInstanceByUserId returns instance by userId', () => {
    fleetDb.createInstance('user-lookup', 'delta');
    const found = fleetDb.getInstanceByUserId('user-lookup');

    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-lookup');
  });

  it('getInstanceBySubdomain returns instance by subdomain', () => {
    fleetDb.createInstance('user-sub', 'echo');
    const found = fleetDb.getInstanceBySubdomain('echo');

    expect(found).not.toBeNull();
    expect(found!.subdomain).toBe('echo');
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------

  it('updateStatus transitions status correctly', () => {
    const inst = fleetDb.createInstance('user-status', 'foxtrot');
    expect(inst.status).toBe('provisioning');

    const running = fleetDb.updateStatus(inst.id, 'running');
    expect(running!.status).toBe('running');

    const stopped = fleetDb.updateStatus(inst.id, 'stopped');
    expect(stopped!.status).toBe('stopped');

    const err = fleetDb.updateStatus(inst.id, 'error');
    expect(err!.status).toBe('error');
  });

  // -------------------------------------------------------------------------
  // updateHealth
  // -------------------------------------------------------------------------

  it('updateHealth persists status and error', () => {
    const inst = fleetDb.createInstance('user-health', 'golf');

    const healthy = fleetDb.updateHealth(inst.id, 'healthy');
    expect(healthy!.healthCheck.status).toBe('healthy');
    expect(healthy!.healthCheck.lastCheckAt).toBeTypeOf('number');
    expect(healthy!.healthCheck.lastError).toBeNull();

    const unhealthy = fleetDb.updateHealth(inst.id, 'unhealthy', 'Container crashed');
    expect(unhealthy!.healthCheck.status).toBe('unhealthy');
    expect(unhealthy!.healthCheck.lastError).toBe('Container crashed');
  });

  // -------------------------------------------------------------------------
  // updateContainerIds
  // -------------------------------------------------------------------------

  it('updateContainerIds sets container IDs and ports', () => {
    const inst = fleetDb.createInstance('user-cids', 'hotel');

    const updated = fleetDb.updateContainerIds(
      inst.id,
      'api-container-123',
      'web-container-456',
      4001,
      5001,
    );

    expect(updated!.apiContainerId).toBe('api-container-123');
    expect(updated!.webContainerId).toBe('web-container-456');
    expect(updated!.apiPort).toBe(4001);
    expect(updated!.webPort).toBe(5001);
  });

  // -------------------------------------------------------------------------
  // removeInstance
  // -------------------------------------------------------------------------

  it('removeInstance deletes row and returns true', () => {
    const inst = fleetDb.createInstance('user-rm', 'india');
    expect(fleetDb.removeInstance(inst.id)).toBe(true);
    expect(fleetDb.getInstance(inst.id)).toBeNull();
  });

  it('removeInstance returns false for nonexistent id', () => {
    expect(fleetDb.removeInstance('ghost')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // listInstances
  // -------------------------------------------------------------------------

  it('listInstances returns all and filters by status', () => {
    const a = fleetDb.createInstance('user-a', 'juliet');
    const b = fleetDb.createInstance('user-b', 'kilo');
    fleetDb.updateStatus(b.id, 'running');

    const all = fleetDb.listInstances();
    expect(all.length).toBe(2);

    const running = fleetDb.listInstances({ status: 'running' });
    expect(running.length).toBe(1);
    expect(running[0].userId).toBe('user-b');

    const provisioning = fleetDb.listInstances({ status: 'provisioning' });
    expect(provisioning.length).toBe(1);
    expect(provisioning[0].userId).toBe('user-a');
  });

  // -------------------------------------------------------------------------
  // getFleetStats
  // -------------------------------------------------------------------------

  it('getFleetStats returns correct counts', () => {
    const a = fleetDb.createInstance('user-s1', 'lima');
    const b = fleetDb.createInstance('user-s2', 'mike');
    const c = fleetDb.createInstance('user-s3', 'november');

    fleetDb.updateStatus(a.id, 'running');
    fleetDb.updateStatus(b.id, 'stopped');
    // c stays provisioning

    const stats = fleetDb.getFleetStats();
    expect(stats.total).toBe(3);
    expect(stats.running).toBe(1);
    expect(stats.stopped).toBe(1);
    expect(stats.provisioning).toBe(1);
    expect(stats.error).toBe(0);
    expect(stats.removing).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Uniqueness constraints
  // -------------------------------------------------------------------------

  it('duplicate userId rejects with unique constraint error', () => {
    fleetDb.createInstance('user-dup', 'oscar');

    expect(() => fleetDb.createInstance('user-dup', 'papa')).toThrow();
  });

  it('duplicate subdomain rejects with unique constraint error', () => {
    fleetDb.createInstance('user-x', 'quebec');

    expect(() => fleetDb.createInstance('user-y', 'quebec')).toThrow();
  });

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------

  it('close releases the database connection', () => {
    const tempDb = new Database(':memory:');
    const tempFleet = new FleetDb(tempDb);
    tempFleet.close();
    // After close, operations should throw
    expect(() => tempDb.prepare('SELECT 1')).toThrow();
  });
});
