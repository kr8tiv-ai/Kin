/**
 * Wake-on-Demand Proxy — Unit Tests
 *
 * Tests subdomain extraction, path routing, wake logic with Docker/FleetDb
 * mocks, concurrent wake deduplication, loading page, and error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// Mock dockerode before importing WakeProxy — not installed locally
vi.mock('dockerode', () => {
  const DockerMock = vi.fn().mockImplementation(() => ({
    getContainer: vi.fn().mockReturnValue({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      inspect: vi.fn().mockResolvedValue({ State: { Running: true, Status: 'running' } }),
    }),
    createContainer: vi.fn().mockResolvedValue({ id: 'mock-container', start: vi.fn() }),
    ping: vi.fn().mockResolvedValue('OK'),
  }));
  return { default: DockerMock };
});

// Mock http-proxy-3 before importing WakeProxy — not installed locally
vi.mock('http-proxy-3', () => ({
  createProxyServer: vi.fn().mockReturnValue({
    web: vi.fn((req: any, res: any, opts: any) => {
      // Forward to the real target so integration tests work
      const url = new URL(opts.target);
      const proxyReq = http.request(
        { hostname: url.hostname, port: url.port, path: req.url, method: req.method, headers: req.headers },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy error' }));
        }
      });
      req.pipe(proxyReq);
    }),
    ws: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  }),
}));

import { WakeProxy } from '../fleet/wake-proxy.js';
import type { FleetInstance, FleetInstanceStatus } from '../fleet/types.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeInstance(overrides: Partial<FleetInstance> = {}): FleetInstance {
  return {
    id: 'fleet-user1-abc',
    userId: 'user1',
    subdomain: 'alice',
    status: 'running' as FleetInstanceStatus,
    apiContainerId: 'api-container-1',
    webContainerId: 'web-container-1',
    apiPort: 4001,
    webPort: 5001,
    resourceLimits: { cpuShares: 256, memoryMb: 256 },
    healthCheck: { lastCheckAt: null, status: 'unknown', lastError: null },
    lastError: null,
    lastActivityAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeFleetDbMock(instance: FleetInstance | null = null) {
  return {
    getInstanceBySubdomain: vi.fn().mockReturnValue(instance),
    updateLastActivity: vi.fn(),
    updateInstance: vi.fn(),
    getInstance: vi.fn().mockReturnValue(instance),
    // Not used by proxy but needed for type compat
    createInstance: vi.fn(),
    getInstanceByUserId: vi.fn(),
    listInstances: vi.fn().mockReturnValue([]),
    getFleetStats: vi.fn(),
    updateContainerIds: vi.fn(),
    updateHealth: vi.fn(),
    updateStatus: vi.fn(),
    getIdleInstances: vi.fn().mockReturnValue([]),
    removeInstance: vi.fn(),
    close: vi.fn(),
    init: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Subdomain extraction tests (no server needed)
// ---------------------------------------------------------------------------

describe('WakeProxy.extractSubdomain', () => {
  let proxy: WakeProxy;

  beforeEach(() => {
    const db = makeFleetDbMock() as any;
    proxy = new WakeProxy({ fleetDb: db, port: 0 });
  });

  it('extracts subdomain from standard host header', () => {
    expect(proxy.extractSubdomain('alice.kin.kr8tiv.ai')).toBe('alice');
  });

  it('extracts subdomain with port', () => {
    expect(proxy.extractSubdomain('alice.kin.kr8tiv.ai:443')).toBe('alice');
  });

  it('extracts longer subdomain', () => {
    expect(proxy.extractSubdomain('my-test-instance.kin.kr8tiv.ai')).toBe('my-test-instance');
  });

  it('returns null for no subdomain (bare domain)', () => {
    // Single-label host has no dot
    expect(proxy.extractSubdomain('localhost')).toBeNull();
  });

  it('returns null for undefined host', () => {
    expect(proxy.extractSubdomain(undefined)).toBeNull();
  });

  it('returns null for empty host', () => {
    expect(proxy.extractSubdomain('')).toBeNull();
  });

  it('returns null for numeric subdomain (invalid)', () => {
    expect(proxy.extractSubdomain('123.kin.kr8tiv.ai')).toBeNull();
  });

  it('returns null for too-short subdomain (2 chars)', () => {
    // regex requires 3-32 total (1 letter + 2-31 more)
    expect(proxy.extractSubdomain('ab.kin.kr8tiv.ai')).toBeNull();
  });

  it('returns null for uppercase subdomain', () => {
    expect(proxy.extractSubdomain('Alice.kin.kr8tiv.ai')).toBeNull();
  });

  it('accepts minimum valid length (3 chars)', () => {
    expect(proxy.extractSubdomain('abc.kin.kr8tiv.ai')).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
// Route resolution tests
// ---------------------------------------------------------------------------

describe('WakeProxy.resolveTarget', () => {
  let proxy: WakeProxy;
  const instance = makeInstance({ apiPort: 4001, webPort: 5001 });

  beforeEach(() => {
    const db = makeFleetDbMock() as any;
    proxy = new WakeProxy({ fleetDb: db, port: 0 });
  });

  it('routes /api/* to API port', () => {
    expect(proxy.resolveTarget(instance, '/api/health')).toBe('http://localhost:4001');
    expect(proxy.resolveTarget(instance, '/api/chat')).toBe('http://localhost:4001');
    expect(proxy.resolveTarget(instance, '/api')).toBe('http://localhost:4001');
  });

  it('routes /* to web port', () => {
    expect(proxy.resolveTarget(instance, '/')).toBe('http://localhost:5001');
    expect(proxy.resolveTarget(instance, '/dashboard')).toBe('http://localhost:5001');
    expect(proxy.resolveTarget(instance, '/settings')).toBe('http://localhost:5001');
  });
});

// ---------------------------------------------------------------------------
// HTTP server integration tests
// ---------------------------------------------------------------------------

describe('WakeProxy HTTP handling', () => {
  let proxy: WakeProxy;
  let mockDb: ReturnType<typeof makeFleetDbMock>;
  let upstream: http.Server;
  let upstreamPort: number;

  // Create a simple upstream server that echoes requests
  beforeEach(async () => {
    upstream = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });

    await new Promise<void>((resolve) => {
      upstream.listen(0, () => resolve());
    });

    const addr = upstream.address();
    upstreamPort = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    await new Promise<void>((resolve) => {
      upstream.close(() => resolve());
    });
  });

  async function makeRequest(
    port: number,
    path: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        { hostname: '127.0.0.1', port, path, headers },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
          );
        },
      );
      req.on('error', reject);
    });
  }

  it('returns 400 for request with no subdomain', async () => {
    mockDb = makeFleetDbMock();
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/', { host: 'localhost' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Invalid');
  });

  it('returns 404 for unknown subdomain', async () => {
    mockDb = makeFleetDbMock(null);
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/', { host: 'unknown.kin.kr8tiv.ai' });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error).toContain('No instance found');
  });

  it('returns 503 for instance in removing state', async () => {
    const instance = makeInstance({ status: 'removing' });
    mockDb = makeFleetDbMock(instance);
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/', { host: 'alice.kin.kr8tiv.ai' });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toContain('removing');
  });

  it('returns 503 for instance in error state', async () => {
    const instance = makeInstance({ status: 'error' });
    mockDb = makeFleetDbMock(instance);
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/', { host: 'alice.kin.kr8tiv.ai' });
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toContain('error');
  });

  it('proxies immediately for running instance and updates lastActivityAt', async () => {
    const instance = makeInstance({
      apiPort: upstreamPort,
      webPort: upstreamPort,
    });
    mockDb = makeFleetDbMock(instance);
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/dashboard', { host: 'alice.kin.kr8tiv.ai' });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.path).toBe('/dashboard');
    expect(body.method).toBe('GET');

    // Verify lastActivityAt was updated
    expect(mockDb.updateLastActivity).toHaveBeenCalledWith('alice');
  });

  it('routes /api/* to api port for running instance', async () => {
    const instance = makeInstance({
      apiPort: upstreamPort,
      webPort: upstreamPort + 9999, // Different port — would fail if misrouted
    });
    mockDb = makeFleetDbMock(instance);
    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/api/health', { host: 'alice.kin.kr8tiv.ai' });
    // Since our upstream serves /api/health (it would fall through to the echo handler)
    // and it uses upstreamPort for apiPort, this should succeed
    expect(res.status).toBe(200);
  });

  it('serves loading page for browser request to stopped instance', async () => {
    const instance = makeInstance({ status: 'stopped' });
    mockDb = makeFleetDbMock(instance);

    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/', {
      host: 'alice.kin.kr8tiv.ai',
      accept: 'text/html,application/xhtml+xml',
    });

    expect(res.status).toBe(503);
    expect(res.body).toContain('Starting your KIN');
    expect(res.body).toContain('meta http-equiv="refresh"');
    expect(res.body).toContain('alice.kin.kr8tiv.ai');
  });

  it('returns 503 on wake timeout for API request to stopped instance', async () => {
    const instance = makeInstance({
      status: 'stopped',
      apiPort: 59999, // No server listening — health checks will fail
    });
    mockDb = makeFleetDbMock(instance);

    // Mock docker start to succeed but health will fail
    const mockContainer = {
      start: vi.fn().mockResolvedValue(undefined),
    };
    const mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
    };

    proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    // Inject mock docker
    (proxy as any).docker = mockDocker;

    await proxy.start();
    const addr = (proxy as any).server?.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await makeRequest(port, '/api/data', {
      host: 'alice.kin.kr8tiv.ai',
      accept: 'application/json',
    });

    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toContain('Failed to wake');
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Wake deduplication tests
// ---------------------------------------------------------------------------

describe('WakeProxy concurrent wake deduplication', () => {
  it('concurrent wakes share single Docker start call', async () => {
    let resolveWake: () => void;
    const wakePromise = new Promise<void>((r) => {
      resolveWake = r;
    });

    const instance = makeInstance({ status: 'stopped', apiPort: 59998 });

    const mockContainer = {
      start: vi.fn().mockImplementation(() => wakePromise),
    };
    const mockDocker = {
      getContainer: vi.fn().mockReturnValue(mockContainer),
    };

    const mockDb = makeFleetDbMock(instance);
    const proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });
    (proxy as any).docker = mockDocker;

    // Override health check to succeed immediately after containers start
    (proxy as any).checkHealth = vi.fn().mockResolvedValue(true);

    // Launch two concurrent wakes
    const wake1 = proxy.wakeInstance(instance);
    const wake2 = proxy.wakeInstance(instance);

    // Both should be the same promise via deduplication
    // The waking map should have exactly one entry
    expect((proxy as any).waking.size).toBe(1);

    // Resolve the Docker start
    resolveWake!();

    await Promise.all([wake1, wake2]);

    // Docker start should have been called once per container, not twice per container
    // (2 containers × 1 wake = 2 start calls, not 2 containers × 2 wakes = 4)
    expect(mockContainer.start).toHaveBeenCalledTimes(2);

    // Waking map should be clear after completion
    expect((proxy as any).waking.size).toBe(0);

    await proxy.stop();
  });
});

// ---------------------------------------------------------------------------
// WebSocket upgrade subdomain extraction
// ---------------------------------------------------------------------------

describe('WakeProxy WebSocket upgrade', () => {
  it('extracts subdomain from upgrade request and destroys socket for unknown subdomain', () => {
    const mockDb = makeFleetDbMock(null); // No instance found
    const proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });

    const mockSocket = {
      destroy: vi.fn(),
    };

    // Call handleUpgrade directly
    (proxy as any).proxy = {
      ws: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };
    (proxy as any).handleUpgrade(
      { headers: { host: 'unknown.kin.kr8tiv.ai' }, url: '/' } as any,
      mockSocket as any,
      Buffer.alloc(0),
    );

    expect(mockSocket.destroy).toHaveBeenCalled();
    expect(mockDb.getInstanceBySubdomain).toHaveBeenCalledWith('unknown');
  });

  it('proxies WebSocket for running instance and updates lastActivityAt', () => {
    const instance = makeInstance({ apiPort: 4001, webPort: 5001 });
    const mockDb = makeFleetDbMock(instance);
    const proxy = new WakeProxy({ fleetDb: mockDb as any, port: 0 });

    const mockWs = vi.fn();
    (proxy as any).proxy = {
      ws: mockWs,
      close: vi.fn(),
      on: vi.fn(),
    };

    const mockSocket = { destroy: vi.fn() };
    const head = Buffer.alloc(0);

    (proxy as any).handleUpgrade(
      { headers: { host: 'alice.kin.kr8tiv.ai' }, url: '/ws' } as any,
      mockSocket as any,
      head,
    );

    expect(mockWs).toHaveBeenCalledWith(
      expect.anything(),
      mockSocket,
      head,
      { target: 'http://localhost:5001' }, // /ws goes to web port
    );
    expect(mockDb.updateLastActivity).toHaveBeenCalledWith('alice');
  });
});
