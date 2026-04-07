/**
 * Revenue Engine Tests
 *
 * Covers: generateRevenueReport, getReport, listReports, getHolderDistributions,
 * idempotent generation, Genesis tier allocation math, edge cases, and negative tests.
 *
 * Uses in-memory better-sqlite3 with schema.sql seeding (same pattern as billing.test.ts).
 * Skips gracefully when native bindings are unavailable.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Setup — load better-sqlite3 or skip
// ---------------------------------------------------------------------------

let Database: any;
let skipReason = '';

try {
  Database = (await import('better-sqlite3')).default;
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('bindings') ||
    msg.includes('better_sqlite3') ||
    msg.includes('better-sqlite3') ||
    msg.includes('ERR_DLOPEN_FAILED')
  ) {
    skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
  } else {
    throw err;
  }
}

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Import engine (deferred to avoid import errors when better-sqlite3 missing)
// ---------------------------------------------------------------------------

let generateRevenueReport: typeof import('../api/lib/revenue-engine.js').generateRevenueReport;
let getReport: typeof import('../api/lib/revenue-engine.js').getReport;
let listReports: typeof import('../api/lib/revenue-engine.js').listReports;
let getHolderDistributions: typeof import('../api/lib/revenue-engine.js').getHolderDistributions;
let PLAN_PRICE_CENTS: typeof import('../api/lib/revenue-engine.js').PLAN_PRICE_CENTS;
let GENESIS_REWARD_PERCENT: typeof import('../api/lib/revenue-engine.js').GENESIS_REWARD_PERCENT;
let NFT_MINT_PRICE_CENTS: number;
let NFT_REBINDING_PRICE_CENTS: number;

beforeAll(async () => {
  if (skipReason) return;
  const engine = await import('../api/lib/revenue-engine.js');
  generateRevenueReport = engine.generateRevenueReport;
  getReport = engine.getReport;
  listReports = engine.listReports;
  getHolderDistributions = engine.getHolderDistributions;
  PLAN_PRICE_CENTS = engine.PLAN_PRICE_CENTS;
  GENESIS_REWARD_PERCENT = engine.GENESIS_REWARD_PERCENT;
  NFT_MINT_PRICE_CENTS = engine.NFT_MINT_PRICE_CENTS;
  NFT_REBINDING_PRICE_CENTS = engine.NFT_REBINDING_PRICE_CENTS;
});

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PERIOD_START = 1704067200000; // 2024-01-01T00:00:00Z
const PERIOD_END = 1706745600000;   // 2024-02-01T00:00:00Z

// ---------------------------------------------------------------------------
// DB factory — fresh in-memory DB per test
// ---------------------------------------------------------------------------

function createTestDb() {
  const db = new Database(':memory:');
  const schemaPath = path.resolve(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Execute schema statement by statement (better-sqlite3 exec handles it)
  db.exec(schema);
  return db;
}

function seedUser(
  db: any,
  id: string,
  opts: {
    genesisTier?: string;
    genesisDiscount?: number;
    tier?: string;
  } = {},
) {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, first_name, tier, genesis_tier, genesis_discount)
    VALUES (?, 'TestUser', ?, ?, ?)
  `).run(id, opts.tier ?? 'free', opts.genesisTier ?? null, opts.genesisDiscount ?? 0);
}

function seedSubscription(
  db: any,
  userId: string,
  plan: string,
  status: string,
  periodStart: number,
  periodEnd: number,
) {
  const id = `sub-${userId}-${plan}`;
  db.prepare(`
    INSERT OR IGNORE INTO subscriptions
      (id, user_id, plan, status, current_period_start, current_period_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, plan, status, periodStart, periodEnd);
}

function seedNftMint(db: any, userId: string, acquiredAt: number) {
  const id = `nft-${userId}-${acquiredAt}`;
  db.prepare(`
    INSERT OR IGNORE INTO nft_ownership
      (id, user_id, companion_id, mint_address, owner_wallet, acquired_at)
    VALUES (?, ?, 'cipher', ?, 'wallet-test', ?)
  `).run(id, userId, `mint-${id}`, acquiredAt);
}

function seedRebinding(db: any, completedAt: number, status = 'complete') {
  const id = `rebind-${completedAt}`;
  db.prepare(`
    INSERT OR IGNORE INTO nft_rebindings
      (id, nft_mint_address, companion_id, from_user_id, status, completed_at)
    VALUES (?, ?, 'cipher', 'user-seller', ?, ?)
  `).run(id, `mint-rebind-${id}`, status, completedAt);
}

// ============================================================================
// Tests
// ============================================================================

describe('Revenue Engine', () => {
  // ---------- Basic report generation ----------

  describe('generateRevenueReport', () => {
    it('generates a report with known subscription data', () => {
      if (skip()) return;
      const db = createTestDb();

      // 1 elder subscriber (no genesis discount), 1 hatchling subscriber (no discount)
      seedUser(db, 'u1');
      seedUser(db, 'u2');
      seedSubscription(db, 'u1', 'elder', 'active', PERIOD_START, PERIOD_END);
      seedSubscription(db, 'u2', 'hatchling', 'active', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      expect(report.subscriptionRevenue).toBe(
        PLAN_PRICE_CENTS.elder + PLAN_PRICE_CENTS.hatchling
      );
      expect(report.mintRevenue).toBe(0);
      expect(report.rebindingRevenue).toBe(0);
      expect(report.totalRevenue).toBe(report.subscriptionRevenue);
      expect(report.status).toBe('generated');
      expect(report.distributions).toEqual([]); // no genesis holders
    });

    it('allocates surplus by Genesis tier: egg=1%, hatchling=2%, elder=3%', () => {
      if (skip()) return;
      const db = createTestDb();

      // Create revenue source
      seedUser(db, 'u-sub');
      seedSubscription(db, 'u-sub', 'hero', 'active', PERIOD_START, PERIOD_END);

      // Create genesis holders (no subscriptions themselves)
      seedUser(db, 'g-egg', { genesisTier: 'egg', genesisDiscount: 25 });
      seedUser(db, 'g-hatch', { genesisTier: 'hatchling', genesisDiscount: 25 });
      seedUser(db, 'g-elder', { genesisTier: 'elder', genesisDiscount: 25 });

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      const surplus = report.totalRevenue;

      expect(surplus).toBe(PLAN_PRICE_CENTS.hero); // 32400 cents

      const eggDist = report.distributions!.find(d => d.genesisTier === 'egg')!;
      const hatchDist = report.distributions!.find(d => d.genesisTier === 'hatchling')!;
      const elderDist = report.distributions!.find(d => d.genesisTier === 'elder')!;

      expect(eggDist.amount).toBe(Math.floor(surplus * 1 / 100)); // 324
      expect(eggDist.rewardPercent).toBe(1);
      expect(hatchDist.amount).toBe(Math.floor(surplus * 2 / 100)); // 648
      expect(hatchDist.rewardPercent).toBe(2);
      expect(elderDist.amount).toBe(Math.floor(surplus * 3 / 100)); // 972
      expect(elderDist.rewardPercent).toBe(3);

      expect(report.surplusAllocated).toBe(eggDist.amount + hatchDist.amount + elderDist.amount);
    });

    it('is idempotent — same period returns same report without duplicating', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hatchling', 'active', PERIOD_START, PERIOD_END);

      const report1 = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      const report2 = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      expect(report1.id).toBe(report2.id);
      expect(report1.totalRevenue).toBe(report2.totalRevenue);

      // Only one report in DB
      const count = db.prepare(`SELECT COUNT(*) as cnt FROM revenue_reports`).get().cnt;
      expect(count).toBe(1);
    });

    it('handles empty period — zero amounts, no distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      expect(report.subscriptionRevenue).toBe(0);
      expect(report.mintRevenue).toBe(0);
      expect(report.rebindingRevenue).toBe(0);
      expect(report.totalRevenue).toBe(0);
      expect(report.surplusAllocated).toBe(0);
      expect(report.distributions).toEqual([]);
    });

    it('genesis holder with no subscription still gets allocation', () => {
      if (skip()) return;
      const db = createTestDb();

      // Revenue comes from a non-genesis user
      seedUser(db, 'u-paying');
      seedSubscription(db, 'u-paying', 'elder', 'active', PERIOD_START, PERIOD_END);

      // Genesis holder with no subscription
      seedUser(db, 'g-free', { genesisTier: 'elder', genesisDiscount: 25 });

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      expect(report.distributions!.length).toBe(1);
      expect(report.distributions![0].userId).toBe('g-free');
      expect(report.distributions![0].amount).toBe(
        Math.floor(PLAN_PRICE_CENTS.elder * 3 / 100)
      );
    });

    it('applies genesis discount — holder subscription at 75% of list price', () => {
      if (skip()) return;
      const db = createTestDb();

      // Genesis elder holder with an elder subscription
      seedUser(db, 'g1', { genesisTier: 'elder', genesisDiscount: 25, tier: 'elder' });
      seedSubscription(db, 'g1', 'elder', 'active', PERIOD_START, PERIOD_END);

      // Regular elder subscriber
      seedUser(db, 'u2', { tier: 'elder' });
      seedSubscription(db, 'u2', 'elder', 'active', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      const discountedPrice = Math.floor(PLAN_PRICE_CENTS.elder * 0.75);
      const expectedSubRevenue = discountedPrice + PLAN_PRICE_CENTS.elder;
      expect(report.subscriptionRevenue).toBe(expectedSubRevenue);
    });

    it('aggregates mixed revenue: subscriptions + mints + rebindings', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hatchling', 'active', PERIOD_START, PERIOD_END);

      // 2 mints in period
      seedNftMint(db, 'u1', PERIOD_START + 1000);
      seedNftMint(db, 'u1', PERIOD_START + 2000);

      // 1 rebinding in period
      seedRebinding(db, PERIOD_START + 3000);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);

      expect(report.subscriptionRevenue).toBe(PLAN_PRICE_CENTS.hatchling);
      expect(report.mintRevenue).toBe(2 * NFT_MINT_PRICE_CENTS);
      expect(report.rebindingRevenue).toBe(1 * NFT_REBINDING_PRICE_CENTS);
      expect(report.totalRevenue).toBe(
        PLAN_PRICE_CENTS.hatchling + 2 * NFT_MINT_PRICE_CENTS + NFT_REBINDING_PRICE_CENTS
      );
    });

    it('excludes canceled subscriptions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'elder', 'canceled', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.subscriptionRevenue).toBe(0);
    });

    it('includes trialing and past_due subscriptions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedUser(db, 'u2');
      seedSubscription(db, 'u1', 'hatchling', 'trialing', PERIOD_START, PERIOD_END);
      seedSubscription(db, 'u2', 'elder', 'past_due', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.subscriptionRevenue).toBe(
        PLAN_PRICE_CENTS.hatchling + PLAN_PRICE_CENTS.elder
      );
    });

    it('excludes mints outside the period', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      // Mint 1ms before period
      seedNftMint(db, 'u1', PERIOD_START - 1);
      // Mint exactly at period end (exclusive)
      seedNftMint(db, 'u1', PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.mintRevenue).toBe(0);
    });

    it('includes mint exactly at period start (inclusive)', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedNftMint(db, 'u1', PERIOD_START);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.mintRevenue).toBe(NFT_MINT_PRICE_CENTS);
    });

    it('excludes incomplete rebindings', () => {
      if (skip()) return;
      const db = createTestDb();

      seedRebinding(db, PERIOD_START + 1000, 'pending_payment');
      seedRebinding(db, PERIOD_START + 2000, 'failed');

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.rebindingRevenue).toBe(0);
    });

    it('generates report with no genesis holders → report but no distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hero', 'active', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.totalRevenue).toBe(PLAN_PRICE_CENTS.hero);
      expect(report.surplusAllocated).toBe(0);
      expect(report.distributions).toEqual([]);
    });
  });

  // ---------- Negative tests ----------

  describe('input validation', () => {
    it('throws when periodStart > periodEnd', () => {
      if (skip()) return;
      const db = createTestDb();

      expect(() => generateRevenueReport(db, PERIOD_END, PERIOD_START)).toThrow(
        'periodStart must be before periodEnd'
      );
    });

    it('throws when periodStart equals periodEnd', () => {
      if (skip()) return;
      const db = createTestDb();

      expect(() => generateRevenueReport(db, PERIOD_START, PERIOD_START)).toThrow(
        'periodStart must be before periodEnd'
      );
    });

    it('throws when periodStart is not an integer', () => {
      if (skip()) return;
      const db = createTestDb();

      expect(() => generateRevenueReport(db, 1.5, PERIOD_END)).toThrow(
        'must be integers'
      );
    });

    it('throws when periodEnd is not an integer', () => {
      if (skip()) return;
      const db = createTestDb();

      expect(() => generateRevenueReport(db, PERIOD_START, 1.5)).toThrow(
        'must be integers'
      );
    });
  });

  // ---------- Boundary conditions ----------

  describe('boundary conditions', () => {
    it('subscription exactly matching period dates is included', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      // Sub period exactly equals report period
      seedSubscription(db, 'u1', 'hatchling', 'active', PERIOD_START, PERIOD_END);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.subscriptionRevenue).toBe(PLAN_PRICE_CENTS.hatchling);
    });

    it('subscription ending at period start is excluded (no overlap)', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      // Sub ends exactly when period starts — current_period_end == periodStart
      // Overlap check: current_period_start < periodEnd AND current_period_end > periodStart
      // current_period_end (PERIOD_START) > periodStart (PERIOD_START) → false
      seedSubscription(db, 'u1', 'hatchling', 'active', PERIOD_START - 100000, PERIOD_START);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.subscriptionRevenue).toBe(0);
    });

    it('subscription starting at period end is excluded (no overlap)', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      // Sub starts at period end — current_period_start < periodEnd?
      // PERIOD_END < PERIOD_END → false
      seedSubscription(db, 'u1', 'hatchling', 'active', PERIOD_END, PERIOD_END + 100000);

      const report = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      expect(report.subscriptionRevenue).toBe(0);
    });
  });

  // ---------- getReport ----------

  describe('getReport', () => {
    it('returns report with distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hero', 'active', PERIOD_START, PERIOD_END);
      seedUser(db, 'g1', { genesisTier: 'egg', genesisDiscount: 25 });

      const created = generateRevenueReport(db, PERIOD_START, PERIOD_END);
      const fetched = getReport(db, created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.totalRevenue).toBe(created.totalRevenue);
      expect(fetched!.distributions!.length).toBe(1);
      expect(fetched!.distributions![0].genesisTier).toBe('egg');
    });

    it('returns null for non-existent report', () => {
      if (skip()) return;
      const db = createTestDb();

      expect(getReport(db, 'nonexistent-id')).toBeNull();
    });
  });

  // ---------- listReports ----------

  describe('listReports', () => {
    it('paginates reports correctly', () => {
      if (skip()) return;
      const db = createTestDb();

      // Generate 3 reports for different periods
      const p1s = PERIOD_START;
      const p1e = PERIOD_START + 1000000;
      const p2s = p1e;
      const p2e = p2s + 1000000;
      const p3s = p2e;
      const p3e = p3s + 1000000;

      generateRevenueReport(db, p1s, p1e);
      generateRevenueReport(db, p2s, p2e);
      generateRevenueReport(db, p3s, p3e);

      const page1 = listReports(db, 2, 0);
      expect(page1.total).toBe(3);
      expect(page1.reports.length).toBe(2);

      const page2 = listReports(db, 2, 2);
      expect(page2.total).toBe(3);
      expect(page2.reports.length).toBe(1);
    });

    it('returns empty list when no reports exist', () => {
      if (skip()) return;
      const db = createTestDb();

      const result = listReports(db);
      expect(result.total).toBe(0);
      expect(result.reports).toEqual([]);
    });
  });

  // ---------- getHolderDistributions ----------

  describe('getHolderDistributions', () => {
    it('returns only the specified user distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hero', 'active', PERIOD_START, PERIOD_END);

      seedUser(db, 'g1', { genesisTier: 'egg', genesisDiscount: 25 });
      seedUser(db, 'g2', { genesisTier: 'elder', genesisDiscount: 25 });

      generateRevenueReport(db, PERIOD_START, PERIOD_END);

      const g1Result = getHolderDistributions(db, 'g1');
      expect(g1Result.total).toBe(1);
      expect(g1Result.distributions[0].userId).toBe('g1');
      expect(g1Result.distributions[0].genesisTier).toBe('egg');

      const g2Result = getHolderDistributions(db, 'g2');
      expect(g2Result.total).toBe(1);
      expect(g2Result.distributions[0].userId).toBe('g2');
      expect(g2Result.distributions[0].genesisTier).toBe('elder');
    });

    it('returns empty for user with no distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      const result = getHolderDistributions(db, 'nobody');
      expect(result.total).toBe(0);
      expect(result.distributions).toEqual([]);
    });

    it('paginates holder distributions', () => {
      if (skip()) return;
      const db = createTestDb();

      seedUser(db, 'u1');
      seedSubscription(db, 'u1', 'hero', 'active', PERIOD_START, PERIOD_END);
      seedUser(db, 'g1', { genesisTier: 'elder', genesisDiscount: 25 });

      // Generate 3 reports (different periods) → 3 distributions for g1
      const p1e = PERIOD_START + 1000000;
      const p2s = p1e;
      const p2e = p2s + 1000000;
      const p3s = p2e;
      const p3e = p3s + 1000000;

      // Need subs overlapping each period
      seedSubscription(db, 'u1', 'hero', 'active', PERIOD_START, p3e);

      generateRevenueReport(db, PERIOD_START, p1e);
      generateRevenueReport(db, p2s, p2e);
      generateRevenueReport(db, p3s, p3e);

      const page1 = getHolderDistributions(db, 'g1', 2, 0);
      expect(page1.total).toBe(3);
      expect(page1.distributions.length).toBe(2);

      const page2 = getHolderDistributions(db, 'g1', 2, 2);
      expect(page2.distributions.length).toBe(1);
    });
  });
});

// ============================================================================
// Revenue Route Tests (Fastify inject)
// ============================================================================

const ROUTE_JWT_SECRET = 'revenue-route-test-secret';
const ADMIN_USER_ID = 'user-admin-rev';
const REGULAR_USER_ID = 'user-regular-rev';
const GENESIS_USER_ID = 'user-genesis-rev';

let routeServer: import('fastify').FastifyInstance | null = null;
let adminToken = '';
let regularToken = '';
let genesisToken = '';
let routeSkipReason = '';

// Mock external deps before importing server
vi.mock('../api/lib/solana-mint.js', () => ({
  mintCompanionNFT: vi.fn().mockResolvedValue({
    mintAddress: 'mock-mint-address-123',
    source: 'mock',
  }),
}));

vi.mock('dockerode', () => {
  return {
    default: class Docker {
      listContainers() { return Promise.resolve([]); }
      getContainer() { return { inspect: () => Promise.resolve({}) }; }
      createContainer() { return Promise.resolve({ start: () => Promise.resolve() }); }
    },
  };
});

describe('Revenue Routes', () => {
  beforeAll(async () => {
    if (skipReason) {
      routeSkipReason = skipReason;
      return;
    }

    try {
      const { createServer } = await import('../api/server.js');

      routeServer = await createServer({
        environment: 'development',
        jwtSecret: ROUTE_JWT_SECRET,
        databasePath: ':memory:',
        rateLimitMax: 100000,
      });
      await routeServer.ready();

      const db = routeServer.context.db;

      // Seed admin user (tier hero)
      db.prepare(`
        INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
        VALUES (?, 100001, 'AdminUser', 'hero')
      `).run(ADMIN_USER_ID);

      // Seed regular user (no genesis)
      db.prepare(`
        INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier)
        VALUES (?, 100002, 'RegularUser', 'free')
      `).run(REGULAR_USER_ID);

      // Seed genesis user (elder tier genesis)
      db.prepare(`
        INSERT OR IGNORE INTO users (id, telegram_id, first_name, tier, genesis_tier, genesis_discount)
        VALUES (?, 100003, 'GenesisUser', 'elder', 'elder', 25)
      `).run(GENESIS_USER_ID);

      adminToken = routeServer.jwt.sign({ userId: ADMIN_USER_ID, tier: 'hero' });
      regularToken = routeServer.jwt.sign({ userId: REGULAR_USER_ID, tier: 'free' });
      genesisToken = routeServer.jwt.sign({ userId: GENESIS_USER_ID, tier: 'elder' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('bindings') ||
        msg.includes('better_sqlite3') ||
        msg.includes('better-sqlite3') ||
        msg.includes('ERR_DLOPEN_FAILED') ||
        msg.includes('dockerode')
      ) {
        routeSkipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
      } else {
        throw err;
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (routeServer) await routeServer.close();
  });

  function routeSkip(): boolean {
    if (routeSkipReason) {
      console.log(`[SKIP] ${routeSkipReason}`);
      return true;
    }
    return false;
  }

  // ---------- POST /admin/revenue/generate ----------

  describe('POST /admin/revenue/generate', () => {
    it('generates a report (admin) → 201', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.periodStart).toBe(PERIOD_START);
      expect(body.periodEnd).toBe(PERIOD_END);
      expect(body.totalRevenue).toBeTypeOf('number');
      expect(body.status).toBe('generated');
    });

    it('duplicate period → 200 (idempotent)', async () => {
      if (routeSkip()) return;

      // First call to ensure report exists
      await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
      });

      // Second call — same period
      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.periodStart).toBe(PERIOD_START);
    });

    it('non-admin → 403', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${regularToken}` },
        payload: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
      });

      expect(res.statusCode).toBe(403);
    });

    it('invalid period (start >= end) → 400', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: PERIOD_END, periodEnd: PERIOD_START },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain('before');
    });

    it('missing fields → 400', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: PERIOD_START },
      });

      expect(res.statusCode).toBe(400);
    });

    it('non-integer period → 400', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { periodStart: 1.5, periodEnd: PERIOD_END },
      });

      expect(res.statusCode).toBe(400);
    });

    it('no auth → 401', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        payload: { periodStart: PERIOD_START, periodEnd: PERIOD_END },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ---------- GET /admin/revenue/reports ----------

  describe('GET /admin/revenue/reports', () => {
    it('returns paginated list (admin)', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/admin/revenue/reports',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.reports).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeTypeOf('number');
      expect(body.pagination.limit).toBeTypeOf('number');
      expect(body.pagination.offset).toBeTypeOf('number');
    });

    it('non-admin → 403', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/admin/revenue/reports',
        headers: { authorization: `Bearer ${regularToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ---------- GET /admin/revenue/reports/:reportId ----------

  describe('GET /admin/revenue/reports/:reportId', () => {
    it('returns report with distributions (admin)', async () => {
      if (routeSkip()) return;

      // Generate a report first
      const genRes = await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          periodStart: PERIOD_START + 10000000,
          periodEnd: PERIOD_END + 10000000,
        },
      });

      const genBody = JSON.parse(genRes.payload);
      const reportId = genBody.id;

      const res = await routeServer!.inject({
        method: 'GET',
        url: `/admin/revenue/reports/${reportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(reportId);
      expect(body.distributions).toBeInstanceOf(Array);
    });

    it('not found → 404', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/admin/revenue/reports/nonexistent-id',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('non-admin → 403', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/admin/revenue/reports/some-id',
        headers: { authorization: `Bearer ${regularToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ---------- GET /revenue/my-distributions ----------

  describe('GET /revenue/my-distributions', () => {
    it('Genesis holder sees own distributions', async () => {
      if (routeSkip()) return;

      // Generate a report that will produce distributions for genesis user
      const db = routeServer!.context.db;
      // Seed a subscription to generate revenue
      db.prepare(`
        INSERT OR IGNORE INTO subscriptions
          (id, user_id, plan, status, current_period_start, current_period_end)
        VALUES ('sub-rev-test', ?, 'hero', 'active', ?, ?)
      `).run(ADMIN_USER_ID, PERIOD_START + 20000000, PERIOD_END + 20000000);

      // Generate report for that period
      await routeServer!.inject({
        method: 'POST',
        url: '/admin/revenue/generate',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          periodStart: PERIOD_START + 20000000,
          periodEnd: PERIOD_END + 20000000,
        },
      });

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/revenue/my-distributions',
        headers: { authorization: `Bearer ${genesisToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.distributions).toBeInstanceOf(Array);
      expect(body.pagination).toBeDefined();
      // Genesis user should have at least one distribution
      expect(body.distributions.length).toBeGreaterThan(0);
      expect(body.distributions[0].userId).toBe(GENESIS_USER_ID);
    });

    it('non-Genesis user → empty array', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/revenue/my-distributions',
        headers: { authorization: `Bearer ${regularToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.distributions).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it('no auth → 401', async () => {
      if (routeSkip()) return;

      const res = await routeServer!.inject({
        method: 'GET',
        url: '/revenue/my-distributions',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
