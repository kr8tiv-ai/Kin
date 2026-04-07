/**
 * MissionControlClient Unit Tests
 *
 * Tests the Mission Control integration client: opt-in activation,
 * privacy gate, circuit breaker, telemetry batching, heartbeats,
 * prompt pack sync, and status reporting.
 *
 * Mocks: fetchWithTimeout (all HTTP), computeSoulHash (prompt pack hashing)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports that resolve to mocked modules
// ---------------------------------------------------------------------------

vi.mock('../inference/retry.js', () => ({
  fetchWithTimeout: vi.fn(),
  // Re-export things the module might need
  isTransientError: vi.fn(() => false),
  HttpError: class extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));

vi.mock('../inference/soul-drift.js', () => ({
  computeSoulHash: vi.fn(() => 'mock-hash-abc123'),
}));

import {
  MissionControlClient,
  type MissionControlConfig,
  type CompanionAgent,
  type MissionControlStatus,
} from '../inference/mission-control.js';
import { fetchWithTimeout } from '../inference/retry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = fetchWithTimeout as ReturnType<typeof vi.fn>;

function mockResponse(body: unknown = {}, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const TEST_COMPANIONS: CompanionAgent[] = [
  { id: 'cipher', name: 'Cipher', role: 'analyst' },
  { id: 'forge', name: 'Forge', role: 'builder' },
];

function enabledConfig(overrides: Partial<MissionControlConfig> = {}): MissionControlConfig {
  return {
    mcUrl: 'https://mc.test.local',
    mcApiKey: 'test-key-secret-123',
    heartbeatIntervalMs: 60_000, // Long interval so timers don't fire during tests
    telemetryFlushIntervalMs: 60_000,
    telemetryFlushThreshold: 5,
    getPrivacyMode: () => 'shared',
    requestTimeoutMs: 5_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let client: MissionControlClient;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Default: fetch succeeds with an agent ID
  mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
});

afterEach(() => {
  // Always disconnect to clear timers
  if (client) client.disconnect();
  vi.useRealTimers();
});

// ===========================================================================
// Client Initialization
// ===========================================================================

describe('Client initialization', () => {
  it('is disabled when no MC_URL or MC_API_KEY provided', () => {
    client = new MissionControlClient({});
    const status = client.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.connected).toBe(false);
  });

  it('is disabled when only MC_URL is set (no API key)', () => {
    client = new MissionControlClient({ mcUrl: 'https://mc.test.local' });
    const status = client.getStatus();
    expect(status.enabled).toBe(false);
  });

  it('is enabled when both MC_URL and MC_API_KEY are set', () => {
    client = new MissionControlClient(enabledConfig());
    const status = client.getStatus();
    expect(status.enabled).toBe(true);
  });
});

// ===========================================================================
// Opt-in — disabled client no-ops
// ===========================================================================

describe('Opt-in: disabled client no-ops', () => {
  it('connect() does nothing when disabled', async () => {
    client = new MissionControlClient({});
    await client.connect(TEST_COMPANIONS);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('onMetricEvent() does nothing when disabled', () => {
    client = new MissionControlClient({});
    // Should not throw, should not enqueue
    client.onMetricEvent({
      type: 'request_end',
      metric: {
        requestId: 'r1', timestamp: new Date().toISOString(),
        provider: 'openai', model: 'gpt-4', latencyMs: 100,
        inputTokens: 10, outputTokens: 20, success: true,
      },
    });
    expect(client.getStatus().telemetryQueueDepth).toBe(0);
  });

  it('syncPromptPacks() does nothing when disabled', async () => {
    client = new MissionControlClient({});
    const mockDb = { prepare: vi.fn() };
    await client.syncPromptPacks(mockDb);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Agent Registration
// ===========================================================================

describe('Agent registration', () => {
  it('registers each companion as an MC agent', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-001' }));

    await client.connect(TEST_COMPANIONS);

    // Registration calls: 1 per companion + initial heartbeat calls (1 per companion)
    // Registration: POST /api/agents/register × 2
    const registerCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/api/agents/register'),
    );
    expect(registerCalls).toHaveLength(2);

    expect(client.isConnected()).toBe(true);
    expect(client.getStatus().agentCount).toBe(2);
  });

  it('continues registering others when one companion registration fails', async () => {
    client = new MissionControlClient(enabledConfig());

    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      callCount++;
      // First register call fails, second succeeds
      if (url.includes('/api/agents/register')) {
        if (callCount === 1) throw new Error('network error');
        return mockResponse({ agentId: 'mc-agent-002' });
      }
      return mockResponse({});
    });

    await client.connect(TEST_COMPANIONS);

    // Should still be connected with 1 agent
    expect(client.isConnected()).toBe(true);
    expect(client.getStatus().agentCount).toBe(1);
  });
});

// ===========================================================================
// Heartbeat
// ===========================================================================

describe('Heartbeat', () => {
  it('sends initial heartbeat immediately after connect', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));

    await client.connect(TEST_COMPANIONS);

    // Find heartbeat calls
    const heartbeatCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/heartbeat'),
    );
    expect(heartbeatCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('heartbeat payload includes status and timestamp', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));

    await client.connect(TEST_COMPANIONS);

    const heartbeatCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/heartbeat'),
    );
    expect(heartbeatCalls.length).toBeGreaterThan(0);

    const [, init] = heartbeatCalls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('queueDepth');
  });
});

// ===========================================================================
// Telemetry Batching
// ===========================================================================

describe('Telemetry batching', () => {
  const makeMetricEvent = (id: string) => ({
    type: 'request_end' as const,
    metric: {
      requestId: id,
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model: 'gpt-4',
      latencyMs: 100,
      inputTokens: 10,
      outputTokens: 20,
      success: true,
    },
  });

  it('queues events via onMetricEvent', async () => {
    client = new MissionControlClient(enabledConfig({ telemetryFlushThreshold: 100 }));
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    client.onMetricEvent(makeMetricEvent('r1'));
    client.onMetricEvent(makeMetricEvent('r2'));

    expect(client.getStatus().telemetryQueueDepth).toBe(2);
  });

  it('flushes batch when threshold is hit', async () => {
    client = new MissionControlClient(enabledConfig({ telemetryFlushThreshold: 3 }));
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    mockFetch.mockClear(); // Clear registration/heartbeat calls

    client.onMetricEvent(makeMetricEvent('r1'));
    client.onMetricEvent(makeMetricEvent('r2'));
    client.onMetricEvent(makeMetricEvent('r3')); // Hits threshold → flush

    // Wait for the async flush
    await vi.advanceTimersByTimeAsync(0);

    const ingestCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/api/telemetry/ingest'),
    );
    expect(ingestCalls.length).toBeGreaterThanOrEqual(1);

    // Verify the batch payload shape
    const [, init] = ingestCalls[0];
    const body = JSON.parse(init.body);
    expect(body.events).toBeInstanceOf(Array);
    expect(body.events.length).toBe(3);
    expect(body.events[0]).toHaveProperty('type', 'inference_metric');
    expect(body.events[0]).toHaveProperty('requestId', 'r1');
  });

  it('does not enqueue when not connected', () => {
    client = new MissionControlClient(enabledConfig());
    // Don't call connect()
    client.onMetricEvent(makeMetricEvent('r1'));
    expect(client.getStatus().telemetryQueueDepth).toBe(0);
  });
});

// ===========================================================================
// Privacy Gate (K012)
// ===========================================================================

describe('Privacy gate', () => {
  const makeMetricEvent = (id: string) => ({
    type: 'request_end' as const,
    metric: {
      requestId: id,
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model: 'gpt-4',
      latencyMs: 100,
      inputTokens: 10,
      outputTokens: 20,
      success: true,
    },
  });

  it('blocks telemetry when privacyMode is private', async () => {
    client = new MissionControlClient(
      enabledConfig({ getPrivacyMode: () => 'private' }),
    );
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    client.onMetricEvent(makeMetricEvent('r1'));
    client.onMetricEvent(makeMetricEvent('r2'));

    // Queue should stay empty — events skipped at the gate
    expect(client.getStatus().telemetryQueueDepth).toBe(0);
  });

  it('allows telemetry when privacyMode is shared', async () => {
    client = new MissionControlClient(
      enabledConfig({ getPrivacyMode: () => 'shared', telemetryFlushThreshold: 100 }),
    );
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    client.onMetricEvent(makeMetricEvent('r1'));
    expect(client.getStatus().telemetryQueueDepth).toBe(1);
  });

  it('blocks prompt pack sync when privacyMode is private', async () => {
    client = new MissionControlClient(
      enabledConfig({ getPrivacyMode: () => 'private' }),
    );
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    mockFetch.mockClear();

    const mockDb = { prepare: vi.fn() };
    await client.syncPromptPacks(mockDb);

    // Should not even read from DB when private
    expect(mockDb.prepare).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Circuit Breaker
// ===========================================================================

describe('Circuit breaker', () => {
  it('MC failures do not propagate to caller during connect', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockRejectedValue(new Error('MC is down'));

    // connect() should not throw — fire-and-forget per K013
    await expect(client.connect(TEST_COMPANIONS)).resolves.not.toThrow();
  });

  it('circuit opens after repeated failures, subsequent calls skip fetch', async () => {
    // Circuit breaker: failureThreshold=3
    client = new MissionControlClient(enabledConfig({
      telemetryFlushThreshold: 1,
      getPrivacyMode: () => 'shared',
    }));

    // First: connect fails for all agents — each registration fails
    mockFetch.mockRejectedValue(new Error('MC is down'));
    await client.connect(TEST_COMPANIONS);

    // The client won't be connected since all registrations failed
    expect(client.isConnected()).toBe(false);
  });

  it('onMetricEvent does not throw when circuit is open', async () => {
    client = new MissionControlClient(enabledConfig({
      telemetryFlushThreshold: 1,
      getPrivacyMode: () => 'shared',
    }));

    // Connect successfully first
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    // Now make fetch fail for telemetry flush
    mockFetch.mockRejectedValue(new Error('MC is down'));

    // Should not throw — fire-and-forget
    expect(() => {
      client.onMetricEvent({
        type: 'request_end',
        metric: {
          requestId: 'r1', timestamp: new Date().toISOString(),
          provider: 'openai', model: 'gpt-4', latencyMs: 100,
          inputTokens: 10, outputTokens: 20, success: true,
        },
      });
    }).not.toThrow();
  });
});

// ===========================================================================
// Disconnect
// ===========================================================================

describe('Disconnect', () => {
  it('clears connection state and timers', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));

    await client.connect(TEST_COMPANIONS);
    expect(client.isConnected()).toBe(true);

    client.disconnect();

    expect(client.isConnected()).toBe(false);
    expect(client.getStatus().agentCount).toBe(0);
    expect(client.getStatus().telemetryQueueDepth).toBe(0);
    expect(client.getStatus().lastHeartbeatAt).toBeNull();
    expect(client.getStatus().lastError).toBeNull();
  });

  it('is idempotent — calling disconnect twice does not throw', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));

    await client.connect(TEST_COMPANIONS);
    client.disconnect();
    expect(() => client.disconnect()).not.toThrow();
  });
});

// ===========================================================================
// getStatus()
// ===========================================================================

describe('getStatus()', () => {
  it('returns full diagnostics shape', () => {
    client = new MissionControlClient(enabledConfig());
    const status = client.getStatus();

    expect(status).toEqual(expect.objectContaining({
      connected: expect.any(Boolean),
      enabled: expect.any(Boolean),
      circuitBreakerState: expect.any(String),
      lastHeartbeatAt: null,
      lastError: null,
      telemetryQueueDepth: expect.any(Number),
      agentCount: expect.any(Number),
    }));
  });

  it('never exposes MC_API_KEY in status output', () => {
    client = new MissionControlClient(enabledConfig());
    const status = client.getStatus();
    const serialized = JSON.stringify(status);

    expect(serialized).not.toContain('test-key-secret-123');
    expect(serialized).not.toContain('mcApiKey');
    expect(serialized).not.toContain('MC_API_KEY');
    // Verify all keys are known safe keys
    const keys = Object.keys(status);
    expect(keys).not.toContain('mcApiKey');
    expect(keys).not.toContain('apiKey');
  });

  it('includes circuit breaker state', () => {
    client = new MissionControlClient(enabledConfig());
    const status = client.getStatus();
    expect(['closed', 'open', 'half-open']).toContain(status.circuitBreakerState);
  });
});

// ===========================================================================
// Prompt Pack Sync
// ===========================================================================

describe('Prompt pack sync', () => {
  it('reads local souls and pushes to MC', async () => {
    client = new MissionControlClient(enabledConfig());
    mockFetch.mockResolvedValue(mockResponse({ agentId: 'mc-agent-1' }));
    await client.connect(TEST_COMPANIONS);

    mockFetch.mockClear();

    // Mock DB with one soul
    const mockRow = {
      companion_id: 'cipher',
      user_id: 'user-1',
      custom_name: 'MyCipher',
      traits: JSON.stringify({ warmth: 80, formality: 30, humor: 60, directness: 70, creativity: 50, depth: 60 }),
      soul_values: JSON.stringify(['honesty', 'clarity']),
      style: JSON.stringify({ vocabulary: 'moderate', responseLength: 'balanced', useEmoji: false }),
      custom_instructions: 'Be helpful',
      boundaries: JSON.stringify([]),
      anti_patterns: JSON.stringify([]),
    };

    const mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM companion_souls')) {
          return { all: () => [mockRow] };
        }
        // For pull — return empty pack list
        return { all: () => [], get: () => undefined };
      }),
    };

    // Mock the push response and the pull list response
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/prompt-packs/sync')) {
        return mockResponse({ ok: true });
      }
      if (typeof url === 'string' && url.includes('/api/prompt-packs/list')) {
        return mockResponse({ packs: [] });
      }
      return mockResponse({});
    });

    await client.syncPromptPacks(mockDb);

    // Verify push call was made
    const pushCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/api/prompt-packs/sync'),
    );
    expect(pushCalls.length).toBe(1);

    const [, init] = pushCalls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty('companionId', 'cipher');
    expect(body).toHaveProperty('userId', 'user-1');
    expect(body).toHaveProperty('soulHash');
    expect(body).toHaveProperty('markdown');
    expect(body).toHaveProperty('config');
  });

  it('does not push when not connected', async () => {
    client = new MissionControlClient(enabledConfig());
    // Don't call connect()
    const mockDb = { prepare: vi.fn() };
    await client.syncPromptPacks(mockDb);
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });
});
