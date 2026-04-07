/**
 * Revenue Engine — Pure calculation module for Genesis holder surplus sharing.
 *
 * Aggregates subscription, mint, and rebinding revenue for a given period,
 * allocates surplus percentages to Genesis NFT holders by tier, and persists
 * reports + distributions atomically.
 *
 * All amounts are stored in cents (INTEGER) to avoid floating-point errors.
 * All timestamps are epoch milliseconds (matching the rest of the schema).
 *
 * Takes a better-sqlite3 Database instance directly — no Fastify dependency.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueReport {
  id: string;
  periodStart: number;
  periodEnd: number;
  subscriptionRevenue: number;
  mintRevenue: number;
  rebindingRevenue: number;
  totalRevenue: number;
  surplusAllocated: number;
  status: string;
  createdAt: number;
  distributions?: RevenueDistribution[];
}

export interface RevenueDistribution {
  id: string;
  reportId: string;
  userId: string;
  genesisTier: string;
  rewardPercent: number;
  amount: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Constants — aligned with web/src/lib/constants.ts
// ---------------------------------------------------------------------------

/** Genesis tier → surplus reward percentage */
export const GENESIS_REWARD_PERCENT: Record<string, number> = {
  egg: 1,
  hatchling: 2,
  elder: 3,
};

/** Plan → monthly price in cents */
export const PLAN_PRICE_CENTS: Record<string, number> = {
  free: 0,
  hatchling: 11400,
  elder: 19400,
  hero: 32400,
};

/** One-time NFT mint price in cents ($9.99) */
export const NFT_MINT_PRICE_CENTS = 999;

/** NFT rebinding fee in cents ($149.00) */
export const NFT_REBINDING_PRICE_CENTS = 14900;

/** Genesis holders pay 75% of list price (25% discount) */
const GENESIS_DISCOUNT_MULTIPLIER = 0.75;

// ---------------------------------------------------------------------------
// Database row types (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface SubRow {
  plan: string;
  genesis_discount: number;
}

interface ReportRow {
  id: string;
  period_start: number;
  period_end: number;
  subscription_revenue: number;
  mint_revenue: number;
  rebinding_revenue: number;
  total_revenue: number;
  surplus_allocated: number;
  status: string;
  created_at: number;
}

interface DistributionRow {
  id: string;
  report_id: string;
  user_id: string;
  genesis_tier: string;
  reward_percent: number;
  amount: number;
  created_at: number;
}

interface GenesisHolderRow {
  id: string;
  genesis_tier: string;
}

interface CountRow {
  cnt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToReport(row: ReportRow): RevenueReport {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    subscriptionRevenue: row.subscription_revenue,
    mintRevenue: row.mint_revenue,
    rebindingRevenue: row.rebinding_revenue,
    totalRevenue: row.total_revenue,
    surplusAllocated: row.surplus_allocated,
    status: row.status,
    createdAt: row.created_at,
  };
}

function rowToDistribution(row: DistributionRow): RevenueDistribution {
  return {
    id: row.id,
    reportId: row.report_id,
    userId: row.user_id,
    genesisTier: row.genesis_tier,
    rewardPercent: row.reward_percent,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Generate a revenue report for the given period. Idempotent — returns the
 * existing report if one already exists for the same period window.
 *
 * On error, the transaction rolls back and the error is re-thrown with context.
 */
export function generateRevenueReport(
  db: any,
  periodStart: number,
  periodEnd: number,
): RevenueReport {
  // --- Input validation ---
  if (!Number.isInteger(periodStart) || !Number.isInteger(periodEnd)) {
    throw new Error('periodStart and periodEnd must be integers (epoch ms)');
  }
  if (periodStart >= periodEnd) {
    throw new Error('periodStart must be before periodEnd');
  }

  // --- Idempotency check ---
  const existing = db.prepare(
    `SELECT * FROM revenue_reports WHERE period_start = ? AND period_end = ?`
  ).get(periodStart, periodEnd) as ReportRow | undefined;

  if (existing) {
    const report = rowToReport(existing);
    report.distributions = db.prepare(
      `SELECT * FROM revenue_distributions WHERE report_id = ?`
    ).all(existing.id).map((r: DistributionRow) => rowToDistribution(r));
    return report;
  }

  // --- Calculate subscription revenue ---
  // Active/trialing/past_due subscriptions that overlap the period window
  const subs = db.prepare(`
    SELECT s.plan, u.genesis_discount
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE s.status IN ('active', 'past_due', 'trialing')
      AND s.current_period_start < ?
      AND s.current_period_end > ?
  `).all(periodEnd, periodStart) as SubRow[];

  let subscriptionRevenue = 0;
  for (const sub of subs) {
    const basePrice = PLAN_PRICE_CENTS[sub.plan] ?? 0;
    if (sub.genesis_discount > 0) {
      subscriptionRevenue += Math.floor(basePrice * GENESIS_DISCOUNT_MULTIPLIER);
    } else {
      subscriptionRevenue += basePrice;
    }
  }

  // --- Calculate mint revenue ---
  const mintCount = (db.prepare(`
    SELECT COUNT(*) as cnt FROM nft_ownership
    WHERE acquired_at >= ? AND acquired_at < ?
  `).get(periodStart, periodEnd) as CountRow).cnt;

  const mintRevenue = mintCount * NFT_MINT_PRICE_CENTS;

  // --- Calculate rebinding revenue ---
  const rebindCount = (db.prepare(`
    SELECT COUNT(*) as cnt FROM nft_rebindings
    WHERE completed_at >= ? AND completed_at < ?
      AND status = 'complete'
  `).get(periodStart, periodEnd) as CountRow).cnt;

  const rebindingRevenue = rebindCount * NFT_REBINDING_PRICE_CENTS;

  // --- Total and surplus ---
  const totalRevenue = subscriptionRevenue + mintRevenue + rebindingRevenue;
  // In a real system, operating costs would be deducted here.
  // We don't have cost data, so surplus = total revenue.
  const surplus = totalRevenue;

  // --- Genesis holder allocations ---
  const holders = db.prepare(
    `SELECT id, genesis_tier FROM users WHERE genesis_tier IS NOT NULL`
  ).all() as GenesisHolderRow[];

  const reportId = generateId('rev');
  const now = Date.now();
  const distributions: RevenueDistribution[] = [];

  let surplusAllocated = 0;
  for (const holder of holders) {
    const percent = GENESIS_REWARD_PERCENT[holder.genesis_tier] ?? 0;
    if (percent <= 0) continue;
    const amount = Math.floor(surplus * percent / 100);
    surplusAllocated += amount;
    distributions.push({
      id: generateId('dist'),
      reportId,
      userId: holder.id,
      genesisTier: holder.genesis_tier,
      rewardPercent: percent,
      amount,
      createdAt: now,
    });
  }

  // --- Atomic insert ---
  const insertReport = db.prepare(`
    INSERT INTO revenue_reports
      (id, period_start, period_end, subscription_revenue, mint_revenue,
       rebinding_revenue, total_revenue, surplus_allocated, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?)
  `);

  const insertDistribution = db.prepare(`
    INSERT INTO revenue_distributions
      (id, report_id, user_id, genesis_tier, reward_percent, amount, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    insertReport.run(
      reportId, periodStart, periodEnd,
      subscriptionRevenue, mintRevenue, rebindingRevenue,
      totalRevenue, surplusAllocated, now,
    );
    for (const dist of distributions) {
      insertDistribution.run(
        dist.id, dist.reportId, dist.userId,
        dist.genesisTier, dist.rewardPercent, dist.amount, dist.createdAt,
      );
    }
  });

  try {
    txn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Revenue report generation failed (period ${periodStart}-${periodEnd}): ${msg}`);
  }

  return {
    id: reportId,
    periodStart,
    periodEnd,
    subscriptionRevenue,
    mintRevenue,
    rebindingRevenue,
    totalRevenue,
    surplusAllocated,
    status: 'generated',
    createdAt: now,
    distributions,
  };
}

/**
 * Fetch a single report with its distributions.
 */
export function getReport(db: any, reportId: string): RevenueReport | null {
  const row = db.prepare(
    `SELECT * FROM revenue_reports WHERE id = ?`
  ).get(reportId) as ReportRow | undefined;

  if (!row) return null;

  const report = rowToReport(row);
  report.distributions = db.prepare(
    `SELECT * FROM revenue_distributions WHERE report_id = ?`
  ).all(reportId).map((r: DistributionRow) => rowToDistribution(r));

  return report;
}

/**
 * List reports with pagination. Most recent first.
 */
export function listReports(
  db: any,
  limit = 20,
  offset = 0,
): { reports: RevenueReport[]; total: number } {
  const total = (db.prepare(
    `SELECT COUNT(*) as cnt FROM revenue_reports`
  ).get() as CountRow).cnt;

  const rows = db.prepare(
    `SELECT * FROM revenue_reports ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as ReportRow[];

  return {
    reports: rows.map(rowToReport),
    total,
  };
}

/**
 * Get distributions for a specific Genesis holder with pagination.
 */
export function getHolderDistributions(
  db: any,
  userId: string,
  limit = 20,
  offset = 0,
): { distributions: RevenueDistribution[]; total: number } {
  const total = (db.prepare(
    `SELECT COUNT(*) as cnt FROM revenue_distributions WHERE user_id = ?`
  ).get(userId) as CountRow).cnt;

  const rows = db.prepare(
    `SELECT * FROM revenue_distributions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(userId, limit, offset) as DistributionRow[];

  return {
    distributions: rows.map(rowToDistribution),
    total,
  };
}
