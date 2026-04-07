/**
 * Credit Metering — Persistence Layer
 *
 * CreditDb wraps better-sqlite3 to provide CRUD for credit balances,
 * usage logs, and internal proxy tokens. Follows the FleetDb pattern:
 * constructor accepts string | Database, all outputs use camelCase (K005).
 *
 * CLI tooling for credit management consumes this layer directly;
 * the frontier proxy uses it for balance checks during request routing.
 *
 * @module fleet/credit-db
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { FrontierProviderId } from '../inference/providers/types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreditBalance {
  userId: string;
  balanceUsd: number;
  tier: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreditUsageEntry {
  id: string;
  userId: string;
  instanceId: string | null;
  companionId: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  balanceAfter: number;
  createdAt: number;
}

export interface UsageSummary {
  totalCostUsd: number;
  totalRequests: number;
  byProvider: Record<string, { costUsd: number; requests: number }>;
}

export interface ProxyTokenInfo {
  userId: string;
  instanceId: string;
}

export interface LogUsageParams {
  userId: string;
  instanceId?: string | null;
  companionId: string;
  providerId: FrontierProviderId | string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  balanceAfter: number;
}

// ---------------------------------------------------------------------------
// Row → camelCase helpers
// ---------------------------------------------------------------------------

function rowToBalance(row: Record<string, unknown>): CreditBalance {
  return {
    userId: row['user_id'] as string,
    balanceUsd: row['balance_usd'] as number,
    tier: row['tier'] as string,
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

function rowToUsageEntry(row: Record<string, unknown>): CreditUsageEntry {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    instanceId: (row['instance_id'] as string) ?? null,
    companionId: row['companion_id'] as string,
    providerId: row['provider_id'] as string,
    modelId: row['model_id'] as string,
    inputTokens: row['input_tokens'] as number,
    outputTokens: row['output_tokens'] as number,
    costUsd: row['cost_usd'] as number,
    balanceAfter: row['balance_after'] as number,
    createdAt: row['created_at'] as number,
  };
}

// ---------------------------------------------------------------------------
// CreditDb
// ---------------------------------------------------------------------------

export class CreditDb {
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

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  /** Run the fleet schema DDL to ensure all tables exist. */
  init(): void {
    const schemaPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'schema.sql',
    );
    const ddl = readFileSync(schemaPath, 'utf-8');
    this.db.exec(ddl);
  }

  // -----------------------------------------------------------------------
  // Credit Balances
  // -----------------------------------------------------------------------

  /** Get balance for a user, or null if no record exists. */
  getBalance(userId: string): CreditBalance | null {
    const row = this.db
      .prepare('SELECT * FROM credit_balances WHERE user_id = ?')
      .get(userId) as Record<string, unknown> | undefined;
    return row ? rowToBalance(row) : null;
  }

  /**
   * Create a balance row if one doesn't exist, then return it.
   * If the row already exists, it's returned as-is (tier is NOT updated).
   */
  ensureBalance(userId: string, tier: string = 'free'): CreditBalance {
    const existing = this.getBalance(userId);
    if (existing) return existing;

    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO credit_balances (user_id, balance_usd, tier, created_at, updated_at)
         VALUES (@userId, 0.0, @tier, @now, @now)`,
      )
      .run({ userId, tier, now });

    return this.getBalance(userId)!;
  }

  /**
   * Atomically deduct credits. Returns the updated balance on success.
   * Returns `null` if the user has insufficient balance (row unchanged).
   */
  deductCredits(userId: string, costUsd: number): CreditBalance | null {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE credit_balances
            SET balance_usd = balance_usd - @costUsd,
                updated_at  = @now
          WHERE user_id = @userId
            AND balance_usd >= @costUsd`,
      )
      .run({ userId, costUsd, now });

    if (result.changes === 0) return null;
    return this.getBalance(userId)!;
  }

  /** Add credits to a user's balance. Creates the row if it doesn't exist. */
  addCredits(userId: string, amountUsd: number): CreditBalance {
    this.ensureBalance(userId);
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE credit_balances
            SET balance_usd = balance_usd + @amountUsd,
                updated_at  = @now
          WHERE user_id = @userId`,
      )
      .run({ userId, amountUsd, now });

    return this.getBalance(userId)!;
  }

  /** Update the tier for a user. Creates the balance row if needed. */
  setTier(userId: string, tier: string): CreditBalance {
    this.ensureBalance(userId);
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE credit_balances
            SET tier       = @tier,
                updated_at = @now
          WHERE user_id = @userId`,
      )
      .run({ userId, tier, now });

    return this.getBalance(userId)!;
  }

  // -----------------------------------------------------------------------
  // Usage Logging
  // -----------------------------------------------------------------------

  /** Record a frontier inference request in the usage log. */
  logUsage(entry: LogUsageParams): CreditUsageEntry {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO credit_usage_logs
           (id, user_id, instance_id, companion_id, provider_id, model_id,
            input_tokens, output_tokens, cost_usd, balance_after, created_at)
         VALUES
           (@id, @userId, @instanceId, @companionId, @providerId, @modelId,
            @inputTokens, @outputTokens, @costUsd, @balanceAfter, @now)`,
      )
      .run({
        id,
        userId: entry.userId,
        instanceId: entry.instanceId ?? null,
        companionId: entry.companionId,
        providerId: entry.providerId,
        modelId: entry.modelId,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
        balanceAfter: entry.balanceAfter,
        now,
      });

    // Return the just-inserted row
    const row = this.db
      .prepare('SELECT * FROM credit_usage_logs WHERE id = ?')
      .get(id) as Record<string, unknown>;
    return rowToUsageEntry(row);
  }

  /** Get recent usage entries for a user, newest first. */
  getUsageHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): CreditUsageEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM credit_usage_logs
          WHERE user_id = @userId
          ORDER BY created_at DESC
          LIMIT @limit OFFSET @offset`,
      )
      .all({ userId, limit, offset }) as Record<string, unknown>[];

    return rows.map(rowToUsageEntry);
  }

  /** Aggregate usage for a user: total cost, request count, and per-provider breakdown. */
  getUsageSummary(userId: string): UsageSummary {
    // Overall totals
    const totals = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS total_cost,
                COUNT(*)                    AS total_requests
           FROM credit_usage_logs
          WHERE user_id = @userId`,
      )
      .get({ userId }) as { total_cost: number; total_requests: number };

    // Per-provider breakdown
    const providerRows = this.db
      .prepare(
        `SELECT provider_id,
                SUM(cost_usd) AS cost,
                COUNT(*)      AS requests
           FROM credit_usage_logs
          WHERE user_id = @userId
          GROUP BY provider_id`,
      )
      .all({ userId }) as Array<{
      provider_id: string;
      cost: number;
      requests: number;
    }>;

    const byProvider: Record<string, { costUsd: number; requests: number }> = {};
    for (const row of providerRows) {
      byProvider[row.provider_id] = {
        costUsd: row.cost,
        requests: row.requests,
      };
    }

    return {
      totalCostUsd: totals.total_cost,
      totalRequests: totals.total_requests,
      byProvider,
    };
  }

  // -----------------------------------------------------------------------
  // Proxy Tokens
  // -----------------------------------------------------------------------

  /**
   * Generate an internal proxy token for a container instance.
   * Returns the token string (UUID). The container uses this to
   * authenticate against the frontier proxy without holding API keys.
   */
  createProxyToken(userId: string, instanceId: string): string {
    const token = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO proxy_tokens (token, user_id, instance_id, created_at)
         VALUES (@token, @userId, @instanceId, @now)`,
      )
      .run({ token, userId, instanceId, now });

    return token;
  }

  /** Validate a proxy token. Returns userId + instanceId, or null if invalid. */
  validateProxyToken(token: string): ProxyTokenInfo | null {
    const row = this.db
      .prepare('SELECT user_id, instance_id FROM proxy_tokens WHERE token = ?')
      .get(token) as { user_id: string; instance_id: string } | undefined;

    if (!row) return null;
    return { userId: row.user_id, instanceId: row.instance_id };
  }

  /** Revoke all proxy tokens for an instance. Returns number of tokens revoked. */
  revokeProxyTokens(instanceId: string): number {
    const result = this.db
      .prepare('DELETE FROM proxy_tokens WHERE instance_id = ?')
      .run(instanceId);
    return result.changes;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** List all credit balances, newest-updated first. */
  listAllBalances(): CreditBalance[] {
    const rows = this.db
      .prepare('SELECT * FROM credit_balances ORDER BY updated_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(rowToBalance);
  }

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }
}
