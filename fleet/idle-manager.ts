/**
 * Fleet Control Plane — Idle Timeout Manager
 *
 * Background interval that monitors fleet instances and stops containers
 * that have been inactive past a configurable threshold. Queries FleetDb
 * for idle instances and uses ContainerManager to stop them.
 *
 * Error isolation: one failed stop never prevents others from being checked.
 */

import type { FleetDb } from './db.js';
import type { ContainerManager, FleetLogger } from './container-manager.js';
import type { IdleConfig } from './types.js';
import { DEFAULT_IDLE_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Internal no-op logger
// ---------------------------------------------------------------------------

const nullLogger: FleetLogger = {
  info() {},
  warn() {},
  error() {},
};

// ---------------------------------------------------------------------------
// IdleManager
// ---------------------------------------------------------------------------

export interface IdleManagerOptions {
  fleetDb: FleetDb;
  containerManager: ContainerManager;
  config?: Partial<IdleConfig>;
  logger?: FleetLogger;
}

export class IdleManager {
  private readonly fleetDb: FleetDb;
  private readonly containerManager: ContainerManager;
  private readonly config: IdleConfig;
  private readonly logger: FleetLogger;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(opts: IdleManagerOptions) {
    this.fleetDb = opts.fleetDb;
    this.containerManager = opts.containerManager;
    this.config = { ...DEFAULT_IDLE_CONFIG, ...opts.config };
    this.logger = opts.logger ?? nullLogger;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start the background check interval. */
  start(): void {
    if (this.intervalHandle !== null) {
      return; // Already running
    }

    this.logger.info('Idle manager started', {
      checkIntervalMs: this.config.checkIntervalMs,
      idleThresholdMs: this.config.idleThresholdMs,
    });

    this.intervalHandle = setInterval(() => {
      this.checkAndSleepIdle().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Idle check cycle failed', { error: msg });
      });
    }, this.config.checkIntervalMs);
  }

  /** Stop the background check interval. */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('Idle manager stopped');
    }
  }

  // -----------------------------------------------------------------------
  // Check cycle
  // -----------------------------------------------------------------------

  /** Trigger an immediate idle check cycle (useful for tests). */
  async checkNow(): Promise<void> {
    await this.checkAndSleepIdle();
  }

  /**
   * Query FleetDb for running instances past the idle threshold,
   * then stop each one via ContainerManager. Errors are isolated
   * per-instance so one failure doesn't block the rest.
   */
  async checkAndSleepIdle(): Promise<void> {
    const idleInstances = this.fleetDb.getIdleInstances(this.config.idleThresholdMs);

    for (const instance of idleInstances) {
      const now = Date.now();
      const lastActivity = instance.lastActivityAt ?? instance.updatedAt;
      const idleDurationMs = now - lastActivity;

      try {
        await this.containerManager.stopInstance(instance.id);

        this.logger.info('Instance put to sleep', {
          instanceId: instance.id,
          subdomain: instance.subdomain,
          idleDurationMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('Failed to stop idle instance', {
          instanceId: instance.id,
          subdomain: instance.subdomain,
          error: msg,
        });
        // Continue processing remaining instances
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createIdleManager(opts: IdleManagerOptions): IdleManager {
  return new IdleManager(opts);
}
