/**
 * Fleet ContainerManager — Unit Tests
 *
 * Tests ContainerManager with vi.mock('dockerode') and real in-memory SQLite.
 * Guards against better-sqlite3 native load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dockerode before any import that touches it
// ---------------------------------------------------------------------------

function createMockContainer(id: string) {
  return {
    id,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      State: { Running: true, Status: 'running' },
    }),
    stats: vi.fn().mockResolvedValue({
      cpu_stats: {
        cpu_usage: { total_usage: 50000 },
        system_cpu_usage: 1000000,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 40000 },
        system_cpu_usage: 900000,
      },
      memory_stats: { usage: 128 * 1024 * 1024, limit: 256 * 1024 * 1024 },
    }),
  };
}

let mockApiContainer = createMockContainer('api-container-abc');
let mockWebContainer = createMockContainer('web-container-def');

const mockCreateContainer = vi.fn();
const mockGetContainer = vi.fn();
const mockPull = vi.fn();
const mockFollowProgress = vi.fn();

vi.mock('dockerode', () => {
  return {
    default: class MockDocker {
      modem = { followProgress: mockFollowProgress };
      createContainer = mockCreateContainer;
      getContainer = mockGetContainer;
      pull = mockPull;
    },
  };
});

// ---------------------------------------------------------------------------
// K001/K019 skip guard
// ---------------------------------------------------------------------------
let Database: typeof import('better-sqlite3').default;
let FleetDb: typeof import('../fleet/db.js').FleetDb;
let ContainerManager: typeof import('../fleet/container-manager.js').ContainerManager;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ FleetDb } = await import('../fleet/db.js'));
  ({ ContainerManager } = await import('../fleet/container-manager.js'));
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping fleet-manager tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schema DDL (same as fleet/schema.sql, inline for in-memory DB)
// ---------------------------------------------------------------------------
const SCHEMA_DDL = `
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
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('ContainerManager', () => {
  let db: InstanceType<typeof Database>;
  let fleetDb: InstanceType<typeof FleetDb>;
  let manager: InstanceType<typeof ContainerManager>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_DDL);
    fleetDb = new FleetDb(db);

    // Reset mock containers
    mockApiContainer = createMockContainer('api-container-abc');
    mockWebContainer = createMockContainer('web-container-def');

    // Default: createContainer returns api first, web second
    let createCallCount = 0;
    mockCreateContainer.mockImplementation(() => {
      createCallCount++;
      return Promise.resolve(
        createCallCount % 2 === 1 ? mockApiContainer : mockWebContainer,
      );
    });

    mockGetContainer.mockImplementation((id: string) => {
      if (id === 'api-container-abc') return mockApiContainer;
      if (id === 'web-container-def') return mockWebContainer;
      throw new Error(`Container not found: ${id}`);
    });

    // Image pull: immediately invoke followProgress callback with success
    mockPull.mockResolvedValue('mock-stream');
    mockFollowProgress.mockImplementation(
      (_stream: unknown, cb: (err: Error | null) => void) => {
        cb(null);
      },
    );

    vi.clearAllMocks();

    // Re-assign after clearAllMocks
    let createCallCount2 = 0;
    mockCreateContainer.mockImplementation(() => {
      createCallCount2++;
      return Promise.resolve(
        createCallCount2 % 2 === 1 ? mockApiContainer : mockWebContainer,
      );
    });
    mockGetContainer.mockImplementation((id: string) => {
      if (id === 'api-container-abc') return mockApiContainer;
      if (id === 'web-container-def') return mockWebContainer;
      throw new Error(`Container not found: ${id}`);
    });
    mockPull.mockResolvedValue('mock-stream');
    mockFollowProgress.mockImplementation(
      (_stream: unknown, cb: (err: Error | null) => void) => {
        cb(null);
      },
    );

    manager = new ContainerManager({ fleetDb });
  });

  afterEach(() => {
    db.close();
  });

  // -------------------------------------------------------------------------
  // provision
  // -------------------------------------------------------------------------

  it('provision creates 2 containers with correct resource limits', async () => {
    const result = await manager.provision('user-prov', 'test-app', {
      cpuShares: 512,
      memoryMb: 512,
    });

    // 2 createContainer calls (api + web)
    expect(mockCreateContainer).toHaveBeenCalledTimes(2);

    // Verify resource limits on the api container
    const apiCall = mockCreateContainer.mock.calls[0][0];
    expect(apiCall.HostConfig.CpuShares).toBe(512);
    expect(apiCall.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(apiCall.name).toBe('kin-test-app-api');

    // Verify resource limits on the web container
    const webCall = mockCreateContainer.mock.calls[1][0];
    expect(webCall.HostConfig.CpuShares).toBe(512);
    expect(webCall.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(webCall.name).toBe('kin-test-app-web');

    // Both containers started
    expect(mockApiContainer.start).toHaveBeenCalledTimes(1);
    expect(mockWebContainer.start).toHaveBeenCalledTimes(1);

    // Final status is running
    expect(result.status).toBe('running');
  });

  it('provision persists container IDs and ports to DB', async () => {
    const result = await manager.provision('user-persist', 'persist-app');

    expect(result.apiContainerId).toBe('api-container-abc');
    expect(result.webContainerId).toBe('web-container-def');
    expect(result.apiPort).toBeTypeOf('number');
    expect(result.webPort).toBeTypeOf('number');

    // Verify via DB lookup
    const fromDb = fleetDb.getInstance(result.id);
    expect(fromDb!.apiContainerId).toBe('api-container-abc');
    expect(fromDb!.webContainerId).toBe('web-container-def');
  });

  it('provision allocates distinct ports for api and web', async () => {
    const result = await manager.provision('user-ports', 'port-test');

    expect(result.apiPort).toBeGreaterThanOrEqual(4000);
    expect(result.webPort).toBeGreaterThanOrEqual(5000);
    expect(result.apiPort).not.toBe(result.webPort);
  });

  // -------------------------------------------------------------------------
  // startInstance
  // -------------------------------------------------------------------------

  it('startInstance starts both containers and updates status', async () => {
    const inst = await manager.provision('user-start', 'start-app');

    // Reset start call counts from provision
    mockApiContainer.start.mockClear();
    mockWebContainer.start.mockClear();

    // Stop first, then start
    fleetDb.updateStatus(inst.id, 'stopped');
    const started = await manager.startInstance(inst.id);

    expect(mockApiContainer.start).toHaveBeenCalledTimes(1);
    expect(mockWebContainer.start).toHaveBeenCalledTimes(1);
    expect(started.status).toBe('running');
  });

  it('startInstance throws for nonexistent instance', async () => {
    await expect(manager.startInstance('nonexistent')).rejects.toThrow(
      'Fleet instance not found',
    );
  });

  // -------------------------------------------------------------------------
  // stopInstance
  // -------------------------------------------------------------------------

  it('stopInstance stops both containers and updates status', async () => {
    const inst = await manager.provision('user-stop', 'stop-app');
    const stopped = await manager.stopInstance(inst.id);

    expect(mockApiContainer.stop).toHaveBeenCalled();
    expect(mockWebContainer.stop).toHaveBeenCalled();
    expect(stopped.status).toBe('stopped');
  });

  it('stopInstance throws for nonexistent instance', async () => {
    await expect(manager.stopInstance('nonexistent')).rejects.toThrow(
      'Fleet instance not found',
    );
  });

  // -------------------------------------------------------------------------
  // removeInstance
  // -------------------------------------------------------------------------

  it('removeInstance removes containers and DB row', async () => {
    const inst = await manager.provision('user-remove', 'remove-app');
    await manager.removeInstance(inst.id);

    expect(mockApiContainer.remove).toHaveBeenCalledWith({ force: true });
    expect(mockWebContainer.remove).toHaveBeenCalledWith({ force: true });

    // DB row is gone
    expect(fleetDb.getInstance(inst.id)).toBeNull();
  });

  it('removeInstance throws for nonexistent instance', async () => {
    await expect(manager.removeInstance('nonexistent')).rejects.toThrow(
      'Fleet instance not found',
    );
  });

  // -------------------------------------------------------------------------
  // checkHealth
  // -------------------------------------------------------------------------

  it('checkHealth updates DB health status to healthy', async () => {
    const inst = await manager.provision('user-health', 'health-app');

    mockApiContainer.inspect.mockResolvedValue({
      State: { Running: true, Status: 'running' },
    });

    const checked = await manager.checkHealth(inst.id);
    expect(checked.healthCheck.status).toBe('healthy');
    expect(checked.healthCheck.lastCheckAt).toBeTypeOf('number');
  });

  it('checkHealth marks unhealthy when container is not running', async () => {
    const inst = await manager.provision('user-unhealthy', 'unhealthy-app');

    mockApiContainer.inspect.mockResolvedValue({
      State: { Running: false, Status: 'exited' },
    });

    const checked = await manager.checkHealth(inst.id);
    expect(checked.healthCheck.status).toBe('unhealthy');
    expect(checked.healthCheck.lastError).toContain('not running');
  });

  it('checkHealth marks unhealthy when Docker API throws', async () => {
    const inst = await manager.provision('user-err-health', 'err-health');

    mockApiContainer.inspect.mockRejectedValue(
      new Error('Docker daemon unreachable'),
    );

    const checked = await manager.checkHealth(inst.id);
    expect(checked.healthCheck.status).toBe('unhealthy');
    expect(checked.healthCheck.lastError).toContain('Health check failed');
  });

  // -------------------------------------------------------------------------
  // Port allocation avoids conflicts
  // -------------------------------------------------------------------------

  it('port allocation avoids conflicts across multiple instances', async () => {
    const inst1 = await manager.provision('user-port1', 'port-one');
    // Need a different user for second instance (unique constraint)
    const inst2 = await manager.provision('user-port2', 'port-two');

    expect(inst1.apiPort).not.toBe(inst2.apiPort);
    expect(inst1.webPort).not.toBe(inst2.webPort);
  });

  // -------------------------------------------------------------------------
  // Error paths — Docker API failures
  // -------------------------------------------------------------------------

  it('provision enters error state when Docker createContainer throws', async () => {
    mockCreateContainer.mockRejectedValue(
      new Error('Docker: no space left on device'),
    );

    const result = await manager.provision('user-fail', 'fail-app');
    expect(result.status).toBe('error');
    expect(result.lastError).toContain('Provision failed');
    expect(result.lastError).toContain('no space left');
  });

  it('stopInstance enters error state when Docker stop throws', async () => {
    const inst = await manager.provision('user-stop-err', 'stop-err-app');

    mockApiContainer.stop.mockRejectedValue(
      new Error('Container not found'),
    );

    const result = await manager.stopInstance(inst.id);
    expect(result.status).toBe('error');
    expect(result.lastError).toContain('Stop failed');
  });

  // -------------------------------------------------------------------------
  // getAvailablePort
  // -------------------------------------------------------------------------

  it('getAvailablePort skips used ports', () => {
    const port = manager.getAvailablePort(4000, [4000, 4001, 4002]);
    expect(port).toBe(4003);
  });

  it('getAvailablePort returns base when no conflicts', () => {
    const port = manager.getAvailablePort(4000, []);
    expect(port).toBe(4000);
  });
});
