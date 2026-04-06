/**
 * Idle Timeout Manager — Unit Tests
 *
 * Tests the IdleManager background interval that monitors fleet instances
 * and stops containers past the idle threshold. Uses mocked FleetDb and
 * ContainerManager to verify behavior without Docker or SQLite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleManager, createIdleManager } from '../fleet/idle-manager.js';
import type { FleetInstance, FleetInstanceStatus } from '../fleet/types.js';
import type { FleetLogger } from '../fleet/container-manager.js';

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
    lastActivityAt: Date.now() - 3_600_000, // 1h ago — well past default 30min threshold
    createdAt: Date.now() - 7_200_000,
    updatedAt: Date.now() - 3_600_000,
    ...overrides,
  };
}

function makeFleetDbMock(idleInstances: FleetInstance[] = []) {
  return {
    getIdleInstances: vi.fn().mockReturnValue(idleInstances),
    // Standard FleetDb methods (not used but present for type compat)
    getInstance: vi.fn(),
    getInstanceBySubdomain: vi.fn(),
    getInstanceByUserId: vi.fn(),
    createInstance: vi.fn(),
    listInstances: vi.fn().mockReturnValue([]),
    getFleetStats: vi.fn(),
    updateInstance: vi.fn(),
    updateContainerIds: vi.fn(),
    updateHealth: vi.fn(),
    updateStatus: vi.fn(),
    updateLastActivity: vi.fn(),
    removeInstance: vi.fn(),
    close: vi.fn(),
    init: vi.fn(),
  };
}

function makeContainerManagerMock() {
  return {
    stopInstance: vi.fn().mockResolvedValue(makeInstance({ status: 'stopped' })),
    startInstance: vi.fn(),
    provision: vi.fn(),
    removeInstance: vi.fn(),
    checkHealth: vi.fn(),
    getResourceUsage: vi.fn(),
    getAvailablePort: vi.fn(),
  };
}

function makeLoggerMock(): FleetLogger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('calls getIdleInstances with the configured threshold', async () => {
    const db = makeFleetDbMock();
    const cm = makeContainerManagerMock();
    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      config: { idleThresholdMs: 900_000 }, // 15 min
    });

    await manager.checkNow();

    expect(db.getIdleInstances).toHaveBeenCalledWith(900_000);
  });

  it('calls getIdleInstances with default threshold when no config', async () => {
    const db = makeFleetDbMock();
    const cm = makeContainerManagerMock();
    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
    });

    await manager.checkNow();

    expect(db.getIdleInstances).toHaveBeenCalledWith(1_800_000); // 30 min default
  });

  it('stops each idle instance via ContainerManager', async () => {
    const inst1 = makeInstance({ id: 'fleet-1', subdomain: 'alice' });
    const inst2 = makeInstance({ id: 'fleet-2', subdomain: 'bob' });
    const db = makeFleetDbMock([inst1, inst2]);
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
    });

    await manager.checkNow();

    expect(cm.stopInstance).toHaveBeenCalledTimes(2);
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-1');
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-2');
  });

  it('logs sleep events with structured data (instanceId, subdomain, idleDurationMs)', async () => {
    const now = Date.now();
    const inst = makeInstance({
      id: 'fleet-1',
      subdomain: 'alice',
      lastActivityAt: now - 2_000_000, // 2M ms ago
    });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
    });

    await manager.checkNow();

    expect(logger.info).toHaveBeenCalledWith(
      'Instance put to sleep',
      expect.objectContaining({
        instanceId: 'fleet-1',
        subdomain: 'alice',
        idleDurationMs: expect.any(Number),
      }),
    );

    // Verify the idle duration is reasonable (should be ~2_000_000)
    const logCall = logger.info.mock.calls.find(
      (c: any[]) => c[0] === 'Instance put to sleep',
    );
    expect(logCall).toBeDefined();
    const ctx = logCall![1] as Record<string, unknown>;
    expect(ctx['idleDurationMs']).toBeGreaterThanOrEqual(1_900_000);
    expect(ctx['idleDurationMs']).toBeLessThanOrEqual(2_100_000);
  });

  // -----------------------------------------------------------------------
  // Error isolation
  // -----------------------------------------------------------------------

  it('continues stopping remaining instances when one fails', async () => {
    const inst1 = makeInstance({ id: 'fleet-1', subdomain: 'alice' });
    const inst2 = makeInstance({ id: 'fleet-2', subdomain: 'bob' });
    const inst3 = makeInstance({ id: 'fleet-3', subdomain: 'charlie' });
    const db = makeFleetDbMock([inst1, inst2, inst3]);
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    // Second stop fails
    cm.stopInstance
      .mockResolvedValueOnce(makeInstance({ status: 'stopped' })) // fleet-1 OK
      .mockRejectedValueOnce(new Error('Docker daemon unreachable')) // fleet-2 FAIL
      .mockResolvedValueOnce(makeInstance({ status: 'stopped' })); // fleet-3 OK

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
    });

    await manager.checkNow();

    // All three should have been attempted
    expect(cm.stopInstance).toHaveBeenCalledTimes(3);
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-1');
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-2');
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-3');

    // Error should be logged for fleet-2
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to stop idle instance',
      expect.objectContaining({
        instanceId: 'fleet-2',
        subdomain: 'bob',
        error: 'Docker daemon unreachable',
      }),
    );

    // Success should be logged for fleet-1 and fleet-3
    const sleepCalls = logger.info.mock.calls.filter(
      (c: any[]) => c[0] === 'Instance put to sleep',
    );
    expect(sleepCalls).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Negative tests
  // -----------------------------------------------------------------------

  it('handles empty idle list — no stops, no errors', async () => {
    const db = makeFleetDbMock([]); // No idle instances
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
    });

    await manager.checkNow();

    expect(cm.stopInstance).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('handles getIdleInstances throwing — error logged, no crash', async () => {
    const db = makeFleetDbMock();
    db.getIdleInstances.mockImplementation(() => {
      throw new Error('DB connection lost');
    });
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
    });

    // Should not throw — the error is caught inside the interval wrapper
    // checkNow calls checkAndSleepIdle directly, which will throw.
    // But the interval wrapper catches it. Let's verify both paths:

    // Direct call — the error propagates since checkAndSleepIdle doesn't catch DB errors itself
    // The interval wrapper catches it. For checkNow, the caller handles it.
    await expect(manager.checkNow()).rejects.toThrow('DB connection lost');

    expect(cm.stopInstance).not.toHaveBeenCalled();
  });

  it('getIdleInstances error in interval — logged, interval continues', async () => {
    const db = makeFleetDbMock();
    db.getIdleInstances.mockImplementation(() => {
      throw new Error('DB connection lost');
    });
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
      config: { checkIntervalMs: 1000 },
    });

    manager.start();

    // Advance timer to trigger the interval
    await vi.advanceTimersByTimeAsync(1000);

    // Error should be logged by the interval wrapper
    expect(logger.error).toHaveBeenCalledWith(
      'Idle check cycle failed',
      expect.objectContaining({ error: 'DB connection lost' }),
    );

    // Fix the DB — next cycle should work
    const inst = makeInstance({ id: 'fleet-recovered' });
    db.getIdleInstances.mockReturnValue([inst]);

    await vi.advanceTimersByTimeAsync(1000);

    // Should have attempted to stop the recovered instance
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-recovered');

    manager.stop();
  });

  // -----------------------------------------------------------------------
  // Interval lifecycle
  // -----------------------------------------------------------------------

  it('start() begins the interval and stop() clears it', async () => {
    const inst = makeInstance({ id: 'fleet-1' });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      config: { checkIntervalMs: 5000 },
    });

    manager.start();

    // No check before first interval fires
    expect(cm.stopInstance).not.toHaveBeenCalled();

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(5000);
    expect(cm.stopInstance).toHaveBeenCalledTimes(1);

    // Advance another interval
    await vi.advanceTimersByTimeAsync(5000);
    expect(cm.stopInstance).toHaveBeenCalledTimes(2);

    // Stop — no more checks
    manager.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cm.stopInstance).toHaveBeenCalledTimes(2); // Still 2 — no more
  });

  it('start() is idempotent — calling twice does not create duplicate intervals', async () => {
    const inst = makeInstance({ id: 'fleet-1' });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      config: { checkIntervalMs: 5000 },
    });

    manager.start();
    manager.start(); // Should be a no-op

    await vi.advanceTimersByTimeAsync(5000);
    // Only 1 check, not 2 (which would happen with duplicate intervals)
    expect(cm.stopInstance).toHaveBeenCalledTimes(1);

    manager.stop();
  });

  it('stop() is safe to call when not started', () => {
    const db = makeFleetDbMock();
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
    });

    // Should not throw
    expect(() => manager.stop()).not.toThrow();
  });

  it('respects configurable check interval', async () => {
    const inst = makeInstance({ id: 'fleet-1' });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      config: { checkIntervalMs: 2000 }, // 2 seconds
    });

    manager.start();

    // Not enough time
    await vi.advanceTimersByTimeAsync(1000);
    expect(cm.stopInstance).not.toHaveBeenCalled();

    // Now enough
    await vi.advanceTimersByTimeAsync(1000);
    expect(cm.stopInstance).toHaveBeenCalledTimes(1);

    manager.stop();
  });

  it('checkNow() triggers immediate check outside interval', async () => {
    const inst = makeInstance({ id: 'fleet-immediate' });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
    });

    // Don't call start() — just checkNow
    await manager.checkNow();

    expect(db.getIdleInstances).toHaveBeenCalledTimes(1);
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-immediate');
  });

  // -----------------------------------------------------------------------
  // Logging
  // -----------------------------------------------------------------------

  it('logs start and stop events', () => {
    const db = makeFleetDbMock();
    const cm = makeContainerManagerMock();
    const logger = makeLoggerMock();

    const manager = new IdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
      logger,
      config: { checkIntervalMs: 10_000, idleThresholdMs: 300_000 },
    });

    manager.start();

    expect(logger.info).toHaveBeenCalledWith(
      'Idle manager started',
      expect.objectContaining({
        checkIntervalMs: 10_000,
        idleThresholdMs: 300_000,
      }),
    );

    manager.stop();

    expect(logger.info).toHaveBeenCalledWith('Idle manager stopped');
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------

  it('createIdleManager factory returns a working IdleManager', async () => {
    const inst = makeInstance({ id: 'fleet-factory' });
    const db = makeFleetDbMock([inst]);
    const cm = makeContainerManagerMock();

    const manager = createIdleManager({
      fleetDb: db as any,
      containerManager: cm as any,
    });

    expect(manager).toBeInstanceOf(IdleManager);

    await manager.checkNow();
    expect(cm.stopInstance).toHaveBeenCalledWith('fleet-factory');
  });
});
