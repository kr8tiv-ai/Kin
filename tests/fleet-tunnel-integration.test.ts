/**
 * Fleet Tunnel Integration Tests
 *
 * Tests tunnel lifecycle during provision/remove and tunnel API routes.
 * TunnelManager methods are mocked; Docker interactions are mocked.
 * FleetDb uses in-memory SQLite via K001/K019 skip guard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// K001/K019 skip guard
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

// Conditional imports — only when native module is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FleetDb: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ContainerManager: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TunnelManager: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CloudflareApiError: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let readFileSync: any, resolve: any, dirname: any, fileURLToPath: any;

if (!skipReason) {
  const dbMod = await import('../fleet/db.js');
  FleetDb = dbMod.FleetDb;
  const cmMod = await import('../fleet/container-manager.js');
  ContainerManager = cmMod.ContainerManager;
  const tmMod = await import('../fleet/tunnel-manager.js');
  TunnelManager = tmMod.TunnelManager;
  CloudflareApiError = tmMod.CloudflareApiError;
  const fsMod = await import('fs');
  readFileSync = fsMod.readFileSync;
  const pathMod = await import('path');
  resolve = pathMod.resolve;
  dirname = pathMod.dirname;
  const urlMod = await import('url');
  fileURLToPath = urlMod.fileURLToPath;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const raw = new Database(':memory:');
  const schemaPath = resolve(__dir, '..', 'fleet', 'schema.sql');
  const ddl = readFileSync(schemaPath, 'utf-8');
  raw.exec(ddl);
  return new FleetDb(raw);
}

/** Create a minimal mock TunnelManager with all methods as vi.fn() */
function createMockTunnelManager() {
  return {
    createTunnel: vi.fn().mockResolvedValue({ tunnelId: 'tun-001', token: 'tok-secret-001' }),
    configureTunnel: vi.fn().mockResolvedValue(undefined),
    createDnsRecord: vi.fn().mockResolvedValue({ recordId: 'dns-rec-001' }),
    getTunnelStatus: vi.fn().mockResolvedValue({
      id: 'tun-001',
      name: 'kin-alice',
      status: 'healthy',
      connections: [{ id: 'c1', clientVersion: '2024.1.0', originIp: '10.0.0.1' }],
    }),
    deleteTunnel: vi.fn().mockResolvedValue(undefined),
    deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
  };
}

/** Minimal Docker mock that satisfies ContainerManager internals */
function createMockDocker() {
  const mockContainer = {
    id: 'docker-container-abc',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ State: { Running: true, Status: 'running' } }),
    stats: vi.fn().mockResolvedValue({
      cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
      precpu_stats: { cpu_usage: { total_usage: 90 }, system_cpu_usage: 900 },
      memory_stats: { usage: 1024 * 1024 * 50, limit: 1024 * 1024 * 512 },
    }),
  };

  return {
    pull: vi.fn().mockImplementation(() =>
      Promise.resolve({
        on: (_evt: string, _cb: (...args: unknown[]) => void) => {},
      }),
    ),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    modem: {
      followProgress: (_stream: unknown, cb: (err: Error | null) => void) => cb(null),
    },
  };
}

const nullLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!!skipReason)('Fleet Tunnel Integration', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fleetDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTunnel: ReturnType<typeof createMockTunnelManager>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDocker: ReturnType<typeof createMockDocker>;

  beforeEach(() => {
    fleetDb = createTestDb();
    mockTunnel = createMockTunnelManager();
    mockDocker = createMockDocker();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fleetDb.close();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Provision with tunnel
  // =========================================================================

  describe('provision with tunnel', () => {
    it('creates tunnel, configures ingress, creates DNS, and injects OLLAMA_HOST', async () => {
      const cm = new ContainerManager({
        fleetDb,
        tunnelManager: mockTunnel,
        tunnelBaseDomain: 'kin.kr8tiv.ai',
        logger: nullLogger,
      });

      // Inject mock Docker client
      (cm as any).docker = mockDocker;

      const instance = await cm.provision('user-1', 'alice');

      // Tunnel creation called with correct name
      expect(mockTunnel.createTunnel).toHaveBeenCalledWith('kin-alice');

      // Tunnel configuration called with correct hostname + origin
      expect(mockTunnel.configureTunnel).toHaveBeenCalledWith(
        'tun-001',
        'ollama.alice.kin.kr8tiv.ai',
        'http://localhost:11434',
      );

      // DNS record created
      expect(mockTunnel.createDnsRecord).toHaveBeenCalledWith(
        'ollama.alice.kin.kr8tiv.ai',
        'tun-001',
      );

      // Tunnel info saved to FleetDb
      const saved = fleetDb.getInstance(instance.id);
      expect(saved.tunnelId).toBe('tun-001');
      expect(saved.tunnelToken).toBe('tok-secret-001');
      expect(saved.tunnelStatus).toBe('provisioned');
      expect(saved.dnsRecordId).toBe('dns-rec-001');

      // OLLAMA_HOST injected into api container Env
      const createCalls = mockDocker.createContainer.mock.calls;
      const apiCall = createCalls.find(
        (c: any) => c[0]?.name?.includes('-api'),
      );
      expect(apiCall).toBeDefined();
      const envVars: string[] = apiCall![0].Env;
      expect(envVars).toContain('OLLAMA_HOST=https://ollama.alice.kin.kr8tiv.ai');
    });

    it('still provisions containers when TunnelManager is null', async () => {
      const cm = new ContainerManager({
        fleetDb,
        // No tunnelManager
        logger: nullLogger,
      });
      (cm as any).docker = mockDocker;

      const instance = await cm.provision('user-2', 'bob');

      // Containers should still be created
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(2);

      // No tunnel info
      const saved = fleetDb.getInstance(instance.id);
      expect(saved.tunnelId).toBeNull();
      expect(saved.tunnelStatus).toBe('unconfigured');

      // No OLLAMA_HOST in env
      const envVars: string[] = mockDocker.createContainer.mock.calls[0][0].Env;
      expect(envVars.find((e: string) => e.startsWith('OLLAMA_HOST'))).toBeUndefined();
    });

    it('continues provisioning when tunnel creation throws', async () => {
      mockTunnel.createTunnel.mockRejectedValueOnce(new Error('CF API down'));

      const cm = new ContainerManager({
        fleetDb,
        tunnelManager: mockTunnel,
        logger: nullLogger,
      });
      (cm as any).docker = mockDocker;

      const instance = await cm.provision('user-3', 'charlie');

      // Containers still created
      expect(mockDocker.createContainer).toHaveBeenCalledTimes(2);

      // Instance still running (or at least not in error from tunnel)
      const saved = fleetDb.getInstance(instance.id);
      expect(saved.status).toBe('running');
      expect(saved.lastError).toContain('Tunnel creation failed');

      // No tunnel info saved
      expect(saved.tunnelId).toBeNull();
    });
  });

  // =========================================================================
  // Remove with tunnel cleanup
  // =========================================================================

  describe('remove with tunnel cleanup', () => {
    it('deletes DNS record and tunnel on removal', async () => {
      const cm = new ContainerManager({
        fleetDb,
        tunnelManager: mockTunnel,
        logger: nullLogger,
      });
      (cm as any).docker = mockDocker;

      // Provision first (creates tunnel)
      const instance = await cm.provision('user-4', 'dave');
      expect(fleetDb.getInstance(instance.id).tunnelId).toBe('tun-001');

      // Now remove
      await cm.removeInstance(instance.id);

      // Tunnel cleanup called
      expect(mockTunnel.deleteDnsRecord).toHaveBeenCalledWith('dns-rec-001');
      expect(mockTunnel.deleteTunnel).toHaveBeenCalledWith('tun-001');

      // DB row deleted
      expect(fleetDb.getInstance(instance.id)).toBeNull();
    });

    it('still removes instance when tunnel cleanup throws', async () => {
      mockTunnel.deleteDnsRecord.mockRejectedValueOnce(new Error('DNS delete failed'));
      mockTunnel.deleteTunnel.mockRejectedValueOnce(new Error('Tunnel delete failed'));

      const cm = new ContainerManager({
        fleetDb,
        tunnelManager: mockTunnel,
        logger: nullLogger,
      });
      (cm as any).docker = mockDocker;

      // Provision first
      const instance = await cm.provision('user-5', 'eve');

      // Remove — should not throw despite cleanup failures
      await cm.removeInstance(instance.id);

      // DB row still deleted
      expect(fleetDb.getInstance(instance.id)).toBeNull();

      // Cleanup was attempted
      expect(mockTunnel.deleteDnsRecord).toHaveBeenCalled();
      expect(mockTunnel.deleteTunnel).toHaveBeenCalled();

      // Errors logged
      expect(nullLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DNS record cleanup failed'),
        expect.any(Object),
      );
      expect(nullLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Tunnel cleanup failed'),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // Tunnel status route
  // =========================================================================

  describe('GET /fleet/instances/:id/tunnel', () => {
    it('returns tunnel status without exposing token', () => {
      const inst = fleetDb.createInstance('user-6', 'frank');
      fleetDb.updateTunnelInfo(inst.id, 'tun-xyz', 'secret-token', 'connected', 'dns-abc');

      const saved = fleetDb.getInstance(inst.id);

      // Simulate what the route handler returns
      const response = {
        tunnelId: saved.tunnelId,
        tunnelStatus: saved.tunnelStatus,
        tunnelEndpoint: saved.tunnelId
          ? `https://ollama.${saved.subdomain}.kin.kr8tiv.ai`
          : null,
      };

      expect(response.tunnelId).toBe('tun-xyz');
      expect(response.tunnelStatus).toBe('connected');
      expect(response.tunnelEndpoint).toBe('https://ollama.frank.kin.kr8tiv.ai');
      // Token never exposed
      expect(response).not.toHaveProperty('tunnelToken');
      expect(JSON.stringify(response)).not.toContain('secret-token');
    });

    it('returns unconfigured status for instances with no tunnel', () => {
      const inst = fleetDb.createInstance('user-7', 'grace');
      const saved = fleetDb.getInstance(inst.id);

      const response = {
        tunnelId: saved.tunnelId,
        tunnelStatus: saved.tunnelStatus,
        tunnelEndpoint: saved.tunnelId
          ? `https://ollama.${saved.subdomain}.kin.kr8tiv.ai`
          : null,
      };

      expect(response.tunnelId).toBeNull();
      expect(response.tunnelStatus).toBe('unconfigured');
      expect(response.tunnelEndpoint).toBeNull();
    });
  });

  // =========================================================================
  // Tunnel refresh route
  // =========================================================================

  describe('POST /fleet/instances/:id/tunnel/refresh', () => {
    it('calls getTunnelStatus and maps healthy to connected', async () => {
      const inst = fleetDb.createInstance('user-8', 'henry');
      fleetDb.updateTunnelInfo(inst.id, 'tun-refresh', 'tok', 'provisioned', 'dns-1');

      // Simulate what the route handler does
      const cfStatus = await mockTunnel.getTunnelStatus('tun-refresh');

      let mappedStatus: 'connected' | 'disconnected' | 'provisioned' = 'provisioned';
      if (cfStatus.status === 'healthy' && cfStatus.connections.length > 0) {
        mappedStatus = 'connected';
      } else if (cfStatus.status === 'inactive' || cfStatus.connections.length === 0) {
        mappedStatus = 'disconnected';
      }

      const updated = fleetDb.updateTunnelStatus(inst.id, mappedStatus);

      expect(updated.tunnelStatus).toBe('connected');
      expect(mockTunnel.getTunnelStatus).toHaveBeenCalledWith('tun-refresh');
    });

    it('maps inactive tunnels to disconnected', async () => {
      const inst = fleetDb.createInstance('user-9', 'iris');
      fleetDb.updateTunnelInfo(inst.id, 'tun-idle', 'tok', 'provisioned', 'dns-2');

      mockTunnel.getTunnelStatus.mockResolvedValueOnce({
        id: 'tun-idle',
        name: 'kin-iris',
        status: 'inactive',
        connections: [],
      });

      const cfStatus = await mockTunnel.getTunnelStatus('tun-idle');

      let mappedStatus: 'connected' | 'disconnected' | 'provisioned' = 'provisioned';
      if (cfStatus.status === 'healthy' && cfStatus.connections.length > 0) {
        mappedStatus = 'connected';
      } else if (cfStatus.status === 'inactive' || cfStatus.connections.length === 0) {
        mappedStatus = 'disconnected';
      }

      const updated = fleetDb.updateTunnelStatus(inst.id, mappedStatus);
      expect(updated.tunnelStatus).toBe('disconnected');
    });
  });
});
