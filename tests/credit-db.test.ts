/**
 * Credit DB — Unit Tests
 *
 * Tests CreditDb CRUD operations against in-memory SQLite.
 * Guards against better-sqlite3 native load failure (K001, K019).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// K001/K019 skip guard — better-sqlite3 may not load on Windows Node v24
// ---------------------------------------------------------------------------
let Database: typeof import('better-sqlite3').default;
let CreditDb: typeof import('../fleet/credit-db.js').CreditDb;
let canRun = false;

try {
  Database = (await import('better-sqlite3')).default;
  ({ CreditDb } = await import('../fleet/credit-db.js'));
  canRun = true;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ERR_DLOPEN_FAILED') || msg.includes('better-sqlite3')) {
    console.warn(
      `⚠ Skipping credit-db tests — better-sqlite3 failed to load: ${msg}\n` +
        '  Remediation: use Linux/WSL Node v20 or run npm rebuild better-sqlite3',
    );
  } else {
    throw err; // Unexpected — propagate
  }
}

// ---------------------------------------------------------------------------
// Schema DDL for in-memory DB (avoids import.meta.url path issues)
// ---------------------------------------------------------------------------
const CREDIT_DDL = `
CREATE TABLE IF NOT EXISTS credit_balances (
  user_id     TEXT    PRIMARY KEY,
  balance_usd REAL    NOT NULL DEFAULT 0.0,
  tier        TEXT    NOT NULL DEFAULT 'free',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_usage_logs (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL,
  instance_id   TEXT,
  companion_id  TEXT    NOT NULL,
  provider_id   TEXT    NOT NULL,
  model_id      TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL    NOT NULL,
  balance_after REAL    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user_id    ON credit_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON credit_usage_logs(created_at);

CREATE TABLE IF NOT EXISTS proxy_tokens (
  token       TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  instance_id TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proxy_tokens_user     ON proxy_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_proxy_tokens_instance ON proxy_tokens(instance_id);
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!canRun)('CreditDb', () => {
  let db: InstanceType<typeof Database>;
  let creditDb: InstanceType<typeof CreditDb>;

  beforeEach(() => {
    db = new Database(':memory:');
    creditDb = new CreditDb(db);
    db.exec(CREDIT_DDL);
  });

  afterEach(() => {
    creditDb.close();
  });

  // -----------------------------------------------------------------------
  // getBalance
  // -----------------------------------------------------------------------

  it('getBalance returns null for unknown user', () => {
    expect(creditDb.getBalance('nonexistent')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // ensureBalance
  // -----------------------------------------------------------------------

  it('ensureBalance creates and returns balance with defaults', () => {
    const bal = creditDb.ensureBalance('user-1');

    expect(bal.userId).toBe('user-1');
    expect(bal.balanceUsd).toBe(0.0);
    expect(bal.tier).toBe('free');
    expect(bal.createdAt).toBeTypeOf('number');
    expect(bal.updatedAt).toBeTypeOf('number');
  });

  it('ensureBalance returns existing balance without overwriting', () => {
    creditDb.ensureBalance('user-2', 'pro');
    creditDb.addCredits('user-2', 50.0);

    const bal = creditDb.ensureBalance('user-2', 'free');
    expect(bal.tier).toBe('pro'); // tier NOT overwritten
    expect(bal.balanceUsd).toBe(50.0); // balance preserved
  });

  it('ensureBalance accepts custom tier', () => {
    const bal = creditDb.ensureBalance('user-tier', 'enterprise');
    expect(bal.tier).toBe('enterprise');
  });

  // -----------------------------------------------------------------------
  // addCredits
  // -----------------------------------------------------------------------

  it('addCredits increments balance', () => {
    creditDb.ensureBalance('user-add');

    const b1 = creditDb.addCredits('user-add', 10.0);
    expect(b1.balanceUsd).toBe(10.0);

    const b2 = creditDb.addCredits('user-add', 5.50);
    expect(b2.balanceUsd).toBeCloseTo(15.50);
  });

  it('addCredits creates balance if not exists', () => {
    const bal = creditDb.addCredits('user-new', 25.0);
    expect(bal.userId).toBe('user-new');
    expect(bal.balanceUsd).toBe(25.0);
  });

  // -----------------------------------------------------------------------
  // deductCredits
  // -----------------------------------------------------------------------

  it('deductCredits reduces balance and returns updated record', () => {
    creditDb.addCredits('user-deduct', 100.0);

    const result = creditDb.deductCredits('user-deduct', 30.0);
    expect(result).not.toBeNull();
    expect(result!.balanceUsd).toBeCloseTo(70.0);
  });

  it('deductCredits rejects when insufficient balance', () => {
    creditDb.addCredits('user-broke', 5.0);

    const result = creditDb.deductCredits('user-broke', 10.0);
    expect(result).toBeNull();

    // Balance unchanged
    const bal = creditDb.getBalance('user-broke');
    expect(bal!.balanceUsd).toBe(5.0);
  });

  it('deductCredits rejects deduction from zero balance', () => {
    creditDb.ensureBalance('user-zero');

    const result = creditDb.deductCredits('user-zero', 0.01);
    expect(result).toBeNull();

    const bal = creditDb.getBalance('user-zero');
    expect(bal!.balanceUsd).toBe(0.0);
  });

  it('deductCredits allows exact balance deduction', () => {
    creditDb.addCredits('user-exact', 10.0);

    const result = creditDb.deductCredits('user-exact', 10.0);
    expect(result).not.toBeNull();
    expect(result!.balanceUsd).toBe(0.0);
  });

  // -----------------------------------------------------------------------
  // setTier
  // -----------------------------------------------------------------------

  it('setTier updates tier field', () => {
    creditDb.ensureBalance('user-tier-up');

    const result = creditDb.setTier('user-tier-up', 'pro');
    expect(result.tier).toBe('pro');

    const fetched = creditDb.getBalance('user-tier-up');
    expect(fetched!.tier).toBe('pro');
  });

  // -----------------------------------------------------------------------
  // logUsage + getUsageHistory
  // -----------------------------------------------------------------------

  it('logUsage writes and getUsageHistory retrieves entries', () => {
    creditDb.ensureBalance('user-usage');

    const entry = creditDb.logUsage({
      userId: 'user-usage',
      instanceId: 'inst-1',
      companionId: 'cipher',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.005,
      balanceAfter: 9.995,
    });

    expect(entry.id).toBeTypeOf('string');
    expect(entry.userId).toBe('user-usage');
    expect(entry.companionId).toBe('cipher');
    expect(entry.providerId).toBe('openai');
    expect(entry.modelId).toBe('gpt-5.4');
    expect(entry.inputTokens).toBe(100);
    expect(entry.outputTokens).toBe(200);
    expect(entry.costUsd).toBeCloseTo(0.005);
    expect(entry.balanceAfter).toBeCloseTo(9.995);
    expect(entry.createdAt).toBeTypeOf('number');

    // camelCase keys (K005)
    expect('userId' in entry).toBe(true);
    expect('instanceId' in entry).toBe(true);
    expect('companionId' in entry).toBe(true);
    expect('providerId' in entry).toBe(true);
    expect('inputTokens' in entry).toBe(true);
    expect('outputTokens' in entry).toBe(true);
    expect('costUsd' in entry).toBe(true);
    expect('balanceAfter' in entry).toBe(true);

    const history = creditDb.getUsageHistory('user-usage');
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(entry.id);
  });

  it('logUsage with null instanceId', () => {
    creditDb.ensureBalance('user-null-inst');

    const entry = creditDb.logUsage({
      userId: 'user-null-inst',
      instanceId: null,
      companionId: 'forge',
      providerId: 'xai',
      modelId: 'grok-4.20',
      inputTokens: 50,
      outputTokens: 100,
      costUsd: 0.003,
      balanceAfter: 4.997,
    });

    expect(entry.instanceId).toBeNull();
  });

  it('getUsageHistory respects limit and offset', () => {
    creditDb.ensureBalance('user-paged');

    // Insert 5 entries
    for (let i = 0; i < 5; i++) {
      creditDb.logUsage({
        userId: 'user-paged',
        companionId: 'cipher',
        providerId: 'openai',
        modelId: 'gpt-5.4',
        inputTokens: 10 * (i + 1),
        outputTokens: 20 * (i + 1),
        costUsd: 0.001 * (i + 1),
        balanceAfter: 10.0 - 0.001 * (i + 1),
      });
    }

    const page1 = creditDb.getUsageHistory('user-paged', 2, 0);
    expect(page1.length).toBe(2);

    const page2 = creditDb.getUsageHistory('user-paged', 2, 2);
    expect(page2.length).toBe(2);

    const page3 = creditDb.getUsageHistory('user-paged', 2, 4);
    expect(page3.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // getUsageSummary
  // -----------------------------------------------------------------------

  it('getUsageSummary returns correct aggregates', () => {
    creditDb.ensureBalance('user-summary');

    creditDb.logUsage({
      userId: 'user-summary',
      companionId: 'cipher',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
      balanceAfter: 9.99,
    });

    creditDb.logUsage({
      userId: 'user-summary',
      companionId: 'vortex',
      providerId: 'anthropic',
      modelId: 'claude-opus-4.6',
      inputTokens: 500,
      outputTokens: 1000,
      costUsd: 0.05,
      balanceAfter: 9.94,
    });

    creditDb.logUsage({
      userId: 'user-summary',
      companionId: 'cipher',
      providerId: 'openai',
      modelId: 'gpt-5.4',
      inputTokens: 200,
      outputTokens: 400,
      costUsd: 0.02,
      balanceAfter: 9.92,
    });

    const summary = creditDb.getUsageSummary('user-summary');

    expect(summary.totalRequests).toBe(3);
    expect(summary.totalCostUsd).toBeCloseTo(0.08);
    expect(Object.keys(summary.byProvider).sort()).toEqual(['anthropic', 'openai']);
    expect(summary.byProvider['openai'].requests).toBe(2);
    expect(summary.byProvider['openai'].costUsd).toBeCloseTo(0.03);
    expect(summary.byProvider['anthropic'].requests).toBe(1);
    expect(summary.byProvider['anthropic'].costUsd).toBeCloseTo(0.05);
  });

  it('getUsageSummary returns zeros for user with no usage', () => {
    creditDb.ensureBalance('user-empty');
    const summary = creditDb.getUsageSummary('user-empty');

    expect(summary.totalRequests).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(Object.keys(summary.byProvider)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Proxy Tokens
  // -----------------------------------------------------------------------

  it('createProxyToken generates valid token', () => {
    const token = creditDb.createProxyToken('user-proxy', 'inst-1');

    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(0);
    // UUID format: 8-4-4-4-12
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('validateProxyToken returns userId/instanceId for valid token', () => {
    const token = creditDb.createProxyToken('user-validate', 'inst-v');

    const info = creditDb.validateProxyToken(token);
    expect(info).not.toBeNull();
    expect(info!.userId).toBe('user-validate');
    expect(info!.instanceId).toBe('inst-v');
  });

  it('validateProxyToken returns null for nonexistent token', () => {
    expect(creditDb.validateProxyToken('fake-token-123')).toBeNull();
  });

  it('revokeProxyTokens removes all tokens for an instance', () => {
    creditDb.createProxyToken('user-revoke', 'inst-r');
    creditDb.createProxyToken('user-revoke', 'inst-r');
    const keepToken = creditDb.createProxyToken('user-revoke', 'inst-keep');

    const removed = creditDb.revokeProxyTokens('inst-r');
    expect(removed).toBe(2);

    // Tokens for inst-r are gone
    // (can't check individual tokens since we don't have their values,
    //  but the keep token should still work)
    expect(creditDb.validateProxyToken(keepToken)).not.toBeNull();
  });

  it('revokeProxyTokens returns 0 for instance with no tokens', () => {
    const removed = creditDb.revokeProxyTokens('inst-ghost');
    expect(removed).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Negative / edge cases
  // -----------------------------------------------------------------------

  it('duplicate user_id in credit_balances throws constraint error', () => {
    creditDb.ensureBalance('user-dup');

    // Direct INSERT should fail on PRIMARY KEY constraint
    expect(() => {
      db.prepare(
        `INSERT INTO credit_balances (user_id, balance_usd, tier, created_at, updated_at)
         VALUES ('user-dup', 0.0, 'free', ${Date.now()}, ${Date.now()})`,
      ).run();
    }).toThrow();
  });

  it('all balance outputs use camelCase keys (K005)', () => {
    const bal = creditDb.ensureBalance('user-k005');
    const keys = Object.keys(bal);

    expect(keys).toContain('userId');
    expect(keys).toContain('balanceUsd');
    expect(keys).toContain('createdAt');
    expect(keys).toContain('updatedAt');

    // Should NOT contain snake_case
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('balance_usd');
    expect(keys).not.toContain('created_at');
    expect(keys).not.toContain('updated_at');
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------

  it('close releases the database connection', () => {
    const tempDb = new Database(':memory:');
    const tempCredit = new CreditDb(tempDb);
    tempCredit.close();
    expect(() => tempDb.prepare('SELECT 1')).toThrow();
  });
});
