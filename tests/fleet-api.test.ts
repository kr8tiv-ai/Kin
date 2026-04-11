/**
 * Fleet API Routes — Integration Tests
 *
 * Tests fleet HTTP endpoints using Fastify inject() with in-memory SQLite
 * and mocked Docker. Guards against better-sqlite3 load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';

// ---------------------------------------------------------------------------
// Mock dockerode before any fleet import
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

let mockApiContainer = createMockContainer('api-ctr-111');
let mockWebContainer = createMockContainer('web-ctr-222');

const mockCreateContainer = vi.fn();
const mockGetContainer = vi.fn();
const mockPull = vi.fn();
const mockFollowProgress = vi.fn();

vi.mock('dockerode', () => ({
  default: class MockDocker {
    modem = { followProgress: mockFollowProgress };
    createContainer = mockCreateContainer;
    getContainer = mockGetContainer;
    pull = mockPull;
  },
}));

// ---------------------------------------------------------------------------
// K001/K019 skip guard
// ---------------------------------------------------------------------------

let Database: typeof import('better-sqlite3').default;
let FleetDb: typeof import('../fleet/db.js').FleetDb;
let ContainerManager: typeof import('../fleet/container-manager.js').ContainerManager;
let fleetRoutesPlugin: typeof import('../fleet/routes.js').default;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ FleetDb } = await import('../fleet/db.js'));
  ({ ContainerManager } = await import('../fleet/container-manager.js'));
  fleetRoutesPlugin = (await import('../fleet/routes.js')).default;
  const probe = new Database(':memory:');
  probe.close();
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping fleet-api tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schema DDL (inline for in-memory DB)
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
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-for-fleet-api';

/** Build a minimal Fastify app with JWT + fleet routes on a given FleetDb. */
async function buildApp(fleetDb: InstanceType<typeof FleetDb>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(jwt, {
    secret: JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '1h' },
    verify: { algorithms: ['HS256'] },
  });

  const containerManager = new ContainerManager({ fleetDb });

  // Wrap in a protected scope (matching real server pattern)
  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    await protectedApp.register(fleetRoutesPlugin, {
      fleetDb,
      containerManager,
    });
  });

  return app;
}

/** Generate a valid JWT for test requests. */
function makeToken(app: FastifyInstance, payload = { sub: 'user-test' }): string {
  return app.jwt.sign(payload);
}

/** Reset docker mocks for a clean state. */
function resetDockerMocks() {
  mockApiContainer = createMockContainer('api-ctr-111');
  mockWebContainer = createMockContainer('web-ctr-222');

  let createCount = 0;
  mockCreateContainer.mockReset();
  mockCreateContainer.mockImplementation(() => {
    createCount++;
    return Promise.resolve(
      createCount % 2 === 1 ? mockApiContainer : mockWebContainer,
    );
  });

  mockGetContainer.mockReset();
  mockGetContainer.mockImplementation((id: string) => {
    if (id === 'api-ctr-111') return mockApiContainer;
    if (id === 'web-ctr-222') return mockWebContainer;
    throw new Error(`Container not found: ${id}`);
  });

  mockPull.mockReset();
  mockPull.mockResolvedValue('mock-stream');

  mockFollowProgress.mockReset();
  mockFollowProgress.mockImplementation(
    (_stream: unknown, cb: (err: Error | null) => void) => {
      cb(null);
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('Fleet API Routes', () => {
  let db: InstanceType<typeof Database>;
  let fleetDb: InstanceType<typeof FleetDb>;
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    resetDockerMocks();

    db = new Database(':memory:');
    db.exec(SCHEMA_DDL);
    fleetDb = new FleetDb(db);

    app = await buildApp(fleetDb);
    token = makeToken(app);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  // -------------------------------------------------------------------------
  // POST /fleet/provision — 201
  // -------------------------------------------------------------------------

  it('POST /fleet/provision creates instance (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-1', subdomain: 'my-kin' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBe('user-1');
    expect(body.subdomain).toBe('my-kin');
    expect(body.status).toBe('running');
    expect(body.apiContainerId).toBeTruthy();
    expect(body.webContainerId).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // GET /fleet/status
  // -------------------------------------------------------------------------

  it('GET /fleet/status returns fleet overview', async () => {
    // Provision one instance first
    await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-status', subdomain: 'status-test' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/fleet/status',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalInstances).toBe(1);
    expect(body.running).toBe(1);
    expect(body.instances).toHaveLength(1);
    expect(body.instances[0].subdomain).toBe('status-test');
  });

  // -------------------------------------------------------------------------
  // GET /fleet/instances/:id — 200 and 404
  // -------------------------------------------------------------------------

  it('GET /fleet/instances/:id returns detail', async () => {
    const provRes = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-detail', subdomain: 'detail-app' },
    });
    const instanceId = provRes.json().id;

    const res = await app.inject({
      method: 'GET',
      url: `/fleet/instances/${instanceId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(instanceId);
    expect(res.json().userId).toBe('user-detail');
  });

  it('GET /fleet/instances/:id returns 404 for missing instance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/fleet/instances/nonexistent',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('not found');
  });

  // -------------------------------------------------------------------------
  // POST /fleet/instances/:id/stop — status change
  // -------------------------------------------------------------------------

  it('POST /fleet/instances/:id/stop changes status', async () => {
    const provRes = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-stop', subdomain: 'stop-app' },
    });
    const instanceId = provRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: `/fleet/instances/${instanceId}/stop`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('stopped');
  });

  // -------------------------------------------------------------------------
  // POST /fleet/instances/:id/start — restart
  // -------------------------------------------------------------------------

  it('POST /fleet/instances/:id/start restarts stopped instance', async () => {
    const provRes = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-restart', subdomain: 'restart-app' },
    });
    const instanceId = provRes.json().id;

    // Stop first
    await app.inject({
      method: 'POST',
      url: `/fleet/instances/${instanceId}/stop`,
      headers: { authorization: `Bearer ${token}` },
    });

    // Start
    const res = await app.inject({
      method: 'POST',
      url: `/fleet/instances/${instanceId}/start`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('running');
  });

  // -------------------------------------------------------------------------
  // DELETE /fleet/instances/:id — removes
  // -------------------------------------------------------------------------

  it('DELETE /fleet/instances/:id removes instance', async () => {
    const provRes = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-del', subdomain: 'del-app' },
    });
    const instanceId = provRes.json().id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/fleet/instances/${instanceId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Confirm gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/fleet/instances/${instanceId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Subdomain validation — 400
  // -------------------------------------------------------------------------

  it('rejects empty subdomain (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-empty', subdomain: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid subdomain');
  });

  it('rejects subdomain with spaces (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-space', subdomain: 'has space' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects subdomain with uppercase (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-upper', subdomain: 'MyApp' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects subdomain with special chars (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-special', subdomain: 'app@test!' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects missing userId (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { subdomain: 'no-user' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('userId is required');
  });

  // -------------------------------------------------------------------------
  // Duplicate subdomain — 409
  // -------------------------------------------------------------------------

  it('rejects duplicate subdomain (409)', async () => {
    await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-dup1', subdomain: 'taken-sub' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-dup2', subdomain: 'taken-sub' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('already in use');
  });

  // -------------------------------------------------------------------------
  // Capacity limit — 503
  // -------------------------------------------------------------------------

  it('returns 503 when capacity is reached', async () => {
    // Manually insert MAX_INSTANCES rows to fill capacity
    const { MAX_INSTANCES } = await import('../fleet/types.js');
    for (let i = 0; i < MAX_INSTANCES; i++) {
      fleetDb.createInstance(`user-cap-${i}`, `cap-sub-${i}`);
    }

    const res = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-overflow', subdomain: 'overflow-app' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toContain('capacity');
  });

  // -------------------------------------------------------------------------
  // 404 on stop/start/delete/health for missing instance
  // -------------------------------------------------------------------------

  it('POST /fleet/instances/:id/stop returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/instances/nonexistent/stop',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /fleet/instances/:id/start returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fleet/instances/nonexistent/start',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /fleet/instances/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/fleet/instances/nonexistent',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // State persistence: provision → new server → state visible
  // -------------------------------------------------------------------------

  it('state survives: provision → close → new app with same DB → GET shows instance', async () => {
    // Provision an instance
    const provRes = await app.inject({
      method: 'POST',
      url: '/fleet/provision',
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: 'user-persist', subdomain: 'persist-test' },
    });
    const instanceId = provRes.json().id;
    expect(provRes.statusCode).toBe(201);

    // Close the first app
    await app.close();

    // Build a new app against the same DB (simulating restart)
    resetDockerMocks();
    const app2 = await buildApp(fleetDb);
    const token2 = makeToken(app2);

    const statusRes = await app2.inject({
      method: 'GET',
      url: '/fleet/status',
      headers: { authorization: `Bearer ${token2}` },
    });

    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    expect(body.totalInstances).toBe(1);
    expect(body.instances[0].id).toBe(instanceId);
    expect(body.instances[0].subdomain).toBe('persist-test');

    await app2.close();
  });

  // -------------------------------------------------------------------------
  // Auth — 401 without token
  // -------------------------------------------------------------------------

  it('returns 401 without JWT token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/fleet/status',
    });

    expect(res.statusCode).toBe(401);
  });
});
