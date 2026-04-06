/**
 * Fleet Control Plane — Persistence Layer
 *
 * FleetDb wraps better-sqlite3 to provide CRUD operations on fleet_instances.
 * Accepts either a file path or an injected Database instance (for tests).
 * All public methods return camelCase objects (K005).
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import type {
  FleetInstance,
  FleetInstanceStatus,
  FleetResourceLimits,
  FleetListFilters,
  FleetStats,
  FleetHealthCheck,
} from './types.js';

import {
  DEFAULT_CPU_SHARES,
  DEFAULT_MEMORY_MB,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a DB row (snake_case) → FleetInstance (camelCase). */
function rowToInstance(row: Record<string, unknown>): FleetInstance {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    subdomain: row['subdomain'] as string,
    status: row['status'] as FleetInstanceStatus,
    apiContainerId: (row['api_container_id'] as string) ?? null,
    webContainerId: (row['web_container_id'] as string) ?? null,
    apiPort: (row['api_port'] as number) ?? null,
    webPort: (row['web_port'] as number) ?? null,
    resourceLimits: {
      cpuShares: row['cpu_shares'] as number,
      memoryMb: row['memory_limit_mb'] as number,
    },
    healthCheck: {
      lastCheckAt: (row['last_health_check'] as number) ?? null,
      status: (row['last_health_status'] as FleetHealthCheck['status']) ?? 'unknown',
      lastError: (row['last_error'] as string) ?? null,
    },
    lastError: (row['last_error'] as string) ?? null,
    lastActivityAt: (row['last_activity_at'] as number) ?? null,
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

// ---------------------------------------------------------------------------
// FleetDb
// ---------------------------------------------------------------------------

export class FleetDb {
  private db: Database.Database;

  /**
   * @param pathOrDb  Either a file path (string) to open/create a SQLite DB,
   *                  or an existing better-sqlite3 Database instance.
   */
  constructor(pathOrDb: string | Database.Database) {
    if (typeof pathOrDb === 'string') {
      this.db = new Database(pathOrDb);
      this.db.pragma('journal_mode = WAL');
    } else {
      this.db = pathOrDb;
    }
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /** Run the fleet schema DDL to ensure the table exists. */
  init(): void {
    const schemaPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'schema.sql',
    );
    const ddl = readFileSync(schemaPath, 'utf-8');
    this.db.exec(ddl);
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Insert a new fleet instance row and return the hydrated object.
   * Generates a deterministic-ish ID from the userId to keep things simple.
   */
  createInstance(
    userId: string,
    subdomain: string,
    resourceLimits?: Partial<FleetResourceLimits>,
  ): FleetInstance {
    const id = `fleet-${userId}-${Date.now().toString(36)}`;
    const now = Date.now();
    const cpuShares = resourceLimits?.cpuShares ?? DEFAULT_CPU_SHARES;
    const memoryMb = resourceLimits?.memoryMb ?? DEFAULT_MEMORY_MB;

    this.db.prepare(`
      INSERT INTO fleet_instances
        (id, user_id, subdomain, status, cpu_shares, memory_limit_mb, created_at, updated_at)
      VALUES
        (@id, @userId, @subdomain, 'provisioning', @cpuShares, @memoryMb, @now, @now)
    `).run({ id, userId, subdomain, cpuShares, memoryMb, now });

    return this.getInstance(id)!;
  }

  // -------------------------------------------------------------------------
  // Read — single lookups
  // -------------------------------------------------------------------------

  getInstance(id: string): FleetInstance | null {
    const row = this.db
      .prepare('SELECT * FROM fleet_instances WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToInstance(row) : null;
  }

  getInstanceByUserId(userId: string): FleetInstance | null {
    const row = this.db
      .prepare('SELECT * FROM fleet_instances WHERE user_id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    return row ? rowToInstance(row) : null;
  }

  getInstanceBySubdomain(subdomain: string): FleetInstance | null {
    const row = this.db
      .prepare('SELECT * FROM fleet_instances WHERE subdomain = ?')
      .get(subdomain) as Record<string, unknown> | undefined;
    return row ? rowToInstance(row) : null;
  }

  // -------------------------------------------------------------------------
  // Read — list & stats
  // -------------------------------------------------------------------------

  listInstances(filters?: FleetListFilters): FleetInstance[] {
    let sql = 'SELECT * FROM fleet_instances';
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.status) {
      conditions.push('status = @status');
      params['status'] = filters.status;
    }
    if (filters?.userId) {
      conditions.push('user_id = @userId');
      params['userId'] = filters.userId;
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(sql).all(params) as Record<string, unknown>[];
    return rows.map(rowToInstance);
  }

  getFleetStats(): FleetStats {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as cnt FROM fleet_instances GROUP BY status`,
      )
      .all() as Array<{ status: string; cnt: number }>;

    const stats: FleetStats = {
      total: 0,
      provisioning: 0,
      running: 0,
      stopped: 0,
      error: 0,
      removing: 0,
    };

    for (const row of rows) {
      const key = row.status as keyof Omit<FleetStats, 'total'>;
      if (key in stats) {
        stats[key] = row.cnt;
      }
      stats.total += row.cnt;
    }

    return stats;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /** Generic partial update — caller passes only the fields to change. */
  updateInstance(
    id: string,
    fields: Partial<
      Pick<
        FleetInstance,
        'status' | 'apiContainerId' | 'webContainerId' | 'apiPort' | 'webPort' | 'lastError'
      > &
        FleetResourceLimits
    >,
  ): FleetInstance | null {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (fields.status !== undefined) {
      sets.push('status = @status');
      params['status'] = fields.status;
    }
    if (fields.apiContainerId !== undefined) {
      sets.push('api_container_id = @apiContainerId');
      params['apiContainerId'] = fields.apiContainerId;
    }
    if (fields.webContainerId !== undefined) {
      sets.push('web_container_id = @webContainerId');
      params['webContainerId'] = fields.webContainerId;
    }
    if (fields.apiPort !== undefined) {
      sets.push('api_port = @apiPort');
      params['apiPort'] = fields.apiPort;
    }
    if (fields.webPort !== undefined) {
      sets.push('web_port = @webPort');
      params['webPort'] = fields.webPort;
    }
    if (fields.lastError !== undefined) {
      sets.push('last_error = @lastError');
      params['lastError'] = fields.lastError;
    }
    if (fields.cpuShares !== undefined) {
      sets.push('cpu_shares = @cpuShares');
      params['cpuShares'] = fields.cpuShares;
    }
    if (fields.memoryMb !== undefined) {
      sets.push('memory_limit_mb = @memoryMb');
      params['memoryMb'] = fields.memoryMb;
    }

    if (sets.length === 0) return this.getInstance(id);

    sets.push('updated_at = @now');
    params['now'] = Date.now();

    this.db
      .prepare(`UPDATE fleet_instances SET ${sets.join(', ')} WHERE id = @id`)
      .run(params);

    return this.getInstance(id);
  }

  /** Convenience: set both container IDs and their ports in one call. */
  updateContainerIds(
    id: string,
    apiContainerId: string,
    webContainerId: string,
    apiPort: number,
    webPort: number,
  ): FleetInstance | null {
    return this.updateInstance(id, {
      apiContainerId,
      webContainerId,
      apiPort,
      webPort,
    });
  }

  /** Update health-check result. Optionally record an error string. */
  updateHealth(
    id: string,
    status: 'healthy' | 'unhealthy' | 'unknown',
    error?: string,
  ): FleetInstance | null {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE fleet_instances
            SET last_health_check  = @now,
                last_health_status = @status,
                last_error         = @error,
                updated_at         = @now
          WHERE id = @id`,
      )
      .run({ id, now, status, error: error ?? null });

    return this.getInstance(id);
  }

  /** Update lifecycle status. */
  updateStatus(id: string, status: FleetInstanceStatus): FleetInstance | null {
    return this.updateInstance(id, { status });
  }

  // -------------------------------------------------------------------------
  // Activity tracking (wake-on-demand / idle timeout)
  // -------------------------------------------------------------------------

  /** Record a request hitting a subdomain — updates last_activity_at. */
  updateLastActivity(subdomain: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE fleet_instances
            SET last_activity_at = @now,
                updated_at       = @now
          WHERE subdomain = @subdomain`,
      )
      .run({ subdomain, now });
  }

  /**
   * Return running instances that have been idle longer than `thresholdMs`.
   * An instance is idle when:
   *   - last_activity_at exists and is older than the threshold, OR
   *   - last_activity_at is NULL and updated_at is older than the threshold.
   */
  getIdleInstances(thresholdMs: number): FleetInstance[] {
    const cutoff = Date.now() - thresholdMs;
    const rows = this.db
      .prepare(
        `SELECT * FROM fleet_instances
          WHERE status = 'running'
            AND (
              (last_activity_at IS NOT NULL AND last_activity_at < @cutoff)
              OR
              (last_activity_at IS NULL AND updated_at < @cutoff)
            )
          ORDER BY updated_at ASC`,
      )
      .all({ cutoff }) as Record<string, unknown>[];
    return rows.map(rowToInstance);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /** Permanently remove the instance row. */
  removeInstance(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM fleet_instances WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }
}
