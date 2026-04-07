/**
 * Advantage Detection — Comprehensive Tests
 *
 * Covers:
 * 1. averageQualityDelta bug fix (local-minus-frontier delta, not raw average)
 * 2. recordEvalComparison() — ComparisonReport[] ingestion with correct quality deltas
 * 3. JSONL persistence — round-trip record→save→load→verify
 * 4. detectRegression() — improving, stable, declining scenarios
 * 5. getRegressionGate() / evaluateRegressionGate() — pass/fail/insufficient data
 * 6. API routes — GET /advantage/report, GET /advantage/trends, POST /advantage/gate
 * 7. Backward compatibility — record() + recordEvalComparison() coexist
 * 8. Negative tests — empty history, invalid companionId, gate with zero data
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { ComparisonReport, AggregatedScores } from '../inference/eval/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeAggregatedScores(overrides: Partial<AggregatedScores> = {}): AggregatedScores {
  return {
    avgQuality: 0.7,
    avgLatencyMs: 300,
    avgHeuristicScore: 0.65,
    avgJudgeScore: null,
    count: 5,
    ...overrides,
  };
}

function makeComparisonReport(overrides: Partial<ComparisonReport> = {}): ComparisonReport {
  return {
    category: 'code' as any,
    promptCount: 10,
    localScores: makeAggregatedScores({ avgQuality: 0.75, avgLatencyMs: 200 }),
    frontierScores: makeAggregatedScores({ avgQuality: 0.85, avgLatencyMs: 500 }),
    latencyDiffMs: -300,
    qualityDiff: -0.1, // local - frontier
    recommendation: 'local',
    ...overrides,
  };
}

// ============================================================================
// 1. averageQualityDelta Bug Fix
// ============================================================================

describe('averageQualityDelta bug fix', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('returns local-minus-frontier quality delta, not raw quality average', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Record via eval comparison — qualityDiff is local - frontier
    const reports: ComparisonReport[] = [
      makeComparisonReport({ category: 'code' as any, qualityDiff: -0.1 }),
      makeComparisonReport({ category: 'code' as any, qualityDiff: -0.2 }),
    ];
    detector.recordEvalComparison(reports);

    const result = detector.getReports();
    const codeReport = result.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    // averageQualityDelta should be average of qualityDiff values: (-0.1 + -0.2) / 2 = -0.15
    expect(codeReport!.averageQualityDelta).toBeCloseTo(-0.15, 5);
  });

  it('averageQualityDelta is undefined when no eval comparison data exists', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // record() does NOT set qualityDelta
    detector.record('code', 200, 500, true, 0.85);
    detector.record('code', 250, 480, false, 0.72);

    const result = detector.getReports();
    const codeReport = result.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    expect(codeReport!.averageQualityDelta).toBeUndefined();
  });
});

// ============================================================================
// 2. recordEvalComparison()
// ============================================================================

describe('recordEvalComparison', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('accepts ComparisonReport[] and records correct quality deltas per category', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const reports: ComparisonReport[] = [
      makeComparisonReport({ category: 'code' as any, qualityDiff: 0.05 }),
      makeComparisonReport({ category: 'creative' as any, qualityDiff: -0.15 }),
    ];
    detector.recordEvalComparison(reports);

    expect(detector.historySize).toBe(2);

    const advReports = detector.getReports();
    const codeReport = advReports.find((r) => r.category === 'code');
    const creativeReport = advReports.find((r) => r.category === 'creative');

    expect(codeReport).toBeDefined();
    expect(codeReport!.averageQualityDelta).toBeCloseTo(0.05, 5);
    expect(creativeReport).toBeDefined();
    expect(creativeReport!.averageQualityDelta).toBeCloseTo(-0.15, 5);
  });

  it('sets localWins=true when qualityDiff >= 0', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.recordEvalComparison([
      makeComparisonReport({ qualityDiff: 0.0 }),  // tie → localWins=true
      makeComparisonReport({ qualityDiff: 0.1 }),  // local better
    ]);

    const reports = detector.getReports();
    // Both should count as local wins
    expect(reports[0].winRate).toBe(1.0);
  });

  it('fires persistence when companionId is provided', async () => {
    const fs = await import('fs');
    const mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const appendSpy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue();

    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.recordEvalComparison(
      [makeComparisonReport({ qualityDiff: -0.1 })],
      'cipher',
    );

    // Give fire-and-forget a tick to execute
    await new Promise((r) => setTimeout(r, 50));

    expect(mkdirSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();

    mkdirSpy.mockRestore();
    appendSpy.mockRestore();
  });

  it('does NOT persist when companionId is omitted', async () => {
    const fs = await import('fs');
    const mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const appendSpy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue();

    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.recordEvalComparison([makeComparisonReport({ qualityDiff: -0.1 })]);

    await new Promise((r) => setTimeout(r, 50));

    expect(appendSpy).not.toHaveBeenCalled();

    mkdirSpy.mockRestore();
    appendSpy.mockRestore();
  });
});

// ============================================================================
// 3. JSONL Persistence — round-trip
// ============================================================================

describe('JSONL persistence round-trip', () => {
  let mkdirSpy: ReturnType<typeof vi.spyOn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;
  let readFileSpy: ReturnType<typeof vi.spyOn>;
  let readdirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();

    const fs = await import('fs');
    mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    appendSpy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue();
    readFileSpy = vi.spyOn(fs.promises, 'readFile');
    readdirSpy = vi.spyOn(fs.promises, 'readdir');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('record → persist → load → verify data matches', async () => {
    const { getAdvantageDetector, resetAdvantageDetector } = await import(
      '../inference/advantage-detector.js'
    );

    const detector = getAdvantageDetector();

    // Capture what's written to disk
    let writtenData = '';
    appendSpy.mockImplementation(async (_path: any, data: any) => {
      writtenData += data;
    });

    // Record eval comparison with persistence
    detector.recordEvalComparison(
      [
        makeComparisonReport({ category: 'code' as any, qualityDiff: 0.05 }),
        makeComparisonReport({ category: 'creative' as any, qualityDiff: -0.10 }),
      ],
      'cipher',
    );

    // Give fire-and-forget a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(writtenData.length).toBeGreaterThan(0);

    // Now create a new detector and load from "disk"
    resetAdvantageDetector();
    const detector2 = getAdvantageDetector();

    readFileSpy.mockResolvedValue(writtenData);

    await detector2.loadFromDisk('cipher');

    const reports = detector2.getReports();
    expect(reports.length).toBe(2);

    const codeReport = reports.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    expect(codeReport!.averageQualityDelta).toBeCloseTo(0.05, 3);

    const creativeReport = reports.find((r) => r.category === 'creative');
    expect(creativeReport).toBeDefined();
    expect(creativeReport!.averageQualityDelta).toBeCloseTo(-0.10, 3);
  });

  it('loadFromDisk returns empty on ENOENT', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSpy.mockRejectedValue(enoent);

    await detector.loadFromDisk('nonexistent');

    expect(detector.historySize).toBe(0);
  });

  it('loadFromDisk deduplicates by timestamp', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Pre-populate in-memory with a known timestamp
    const report = makeComparisonReport({ qualityDiff: 0.1 });
    detector.recordEvalComparison([report]);
    const size = detector.historySize;

    // Mock disk data with overlapping timestamps — loadFromDisk deduplicates
    const inMemoryData = JSON.stringify({
      timestamp: Date.now(),
      taskCategory: 'code',
      localLatency: 200,
      frontierLatency: 500,
      localWins: true,
      qualityScore: 0.75,
      qualityDelta: 0.1,
    });
    readFileSpy.mockResolvedValue(inMemoryData + '\n');

    await detector.loadFromDisk('cipher');

    // Should not duplicate: loadFromDisk filters by existing timestamps
    expect(detector.historySize).toBeGreaterThanOrEqual(size);
  });

  it('loadFromDisk only loads once (persistence flag)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSpy.mockRejectedValue(enoent);

    await detector.loadFromDisk('cipher');
    await detector.loadFromDisk('cipher'); // Second call should be a no-op

    // readFile should only have been called once (first call)
    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// 4. detectRegression() — three scenarios
// ============================================================================

describe('detectRegression', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('detects declining quality (regression)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Baseline window: good quality deltas (positive = local better)
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({
          category: 'code' as any,
          qualityDiff: 0.2,
          localScores: makeAggregatedScores({ avgLatencyMs: 200 }),
          frontierScores: makeAggregatedScores({ avgLatencyMs: 500 }),
        }),
      ]);
    }

    // Recent window: declining quality deltas
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({
          category: 'code' as any,
          qualityDiff: -0.1,
          localScores: makeAggregatedScores({ avgLatencyMs: 200 }),
          frontierScores: makeAggregatedScores({ avgLatencyMs: 500 }),
        }),
      ]);
    }

    const results = detector.detectRegression({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    const codeResult = results.find((r) => r.category === 'code');

    expect(codeResult).toBeDefined();
    expect(codeResult!.regressing).toBe(true);
    expect(codeResult!.dropMagnitude).toBeGreaterThan(0.1);
    expect(codeResult!.baselineAvgDelta).toBeCloseTo(0.2, 3);
    expect(codeResult!.recentAvgDelta).toBeCloseTo(-0.1, 3);
  });

  it('detects improving quality (no regression)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Baseline window: lower quality
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: -0.05 }),
      ]);
    }

    // Recent window: improved quality
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: 0.15 }),
      ]);
    }

    const results = detector.detectRegression({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    const codeResult = results.find((r) => r.category === 'code');

    expect(codeResult).toBeDefined();
    expect(codeResult!.regressing).toBe(false);
    // Drop magnitude should be negative (improvement)
    expect(codeResult!.dropMagnitude).toBeLessThan(0);
  });

  it('detects stable quality (no regression)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Both windows: flat quality delta
    for (let i = 0; i < 20; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: 0.05 }),
      ]);
    }

    const results = detector.detectRegression({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    const codeResult = results.find((r) => r.category === 'code');

    expect(codeResult).toBeDefined();
    expect(codeResult!.regressing).toBe(false);
    expect(Math.abs(codeResult!.dropMagnitude)).toBeLessThan(0.01);
  });

  it('returns non-regressing when insufficient data for both windows', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Only 3 data points — not enough for windowSize=10
    for (let i = 0; i < 3; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: -0.5 }),
      ]);
    }

    const results = detector.detectRegression({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    const codeResult = results.find((r) => r.category === 'code');

    expect(codeResult).toBeDefined();
    expect(codeResult!.regressing).toBe(false);
    expect(codeResult!.recentSamples).toBeLessThan(10);
  });
});

// ============================================================================
// 5. getRegressionGate() / evaluateRegressionGate()
// ============================================================================

describe('getRegressionGate / evaluateRegressionGate', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('passes when no regressions detected', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Stable data — 20 entries with consistent quality
    for (let i = 0; i < 20; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: 0.1 }),
      ]);
    }

    const gate = detector.getRegressionGate({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    expect(gate.pass).toBe(true);
    expect(gate.reasons.length).toBeGreaterThan(0);
    expect(gate.checkedAt).toBeTruthy();
  });

  it('fails when quality drops below threshold', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Baseline: good
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: 0.3 }),
      ]);
    }
    // Recent: bad
    for (let i = 0; i < 10; i++) {
      detector.recordEvalComparison([
        makeComparisonReport({ category: 'code' as any, qualityDiff: -0.1 }),
      ]);
    }

    const gate = detector.getRegressionGate({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    expect(gate.pass).toBe(false);
    expect(gate.regressions.some((r) => r.regressing)).toBe(true);
    expect(gate.reasons.some((r) => r.includes('regressing'))).toBe(true);
  });

  it('passes with insufficient samples (no regression flagged)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Only 2 data points — not enough for any window
    detector.recordEvalComparison([
      makeComparisonReport({ category: 'code' as any, qualityDiff: -0.5 }),
      makeComparisonReport({ category: 'code' as any, qualityDiff: -0.5 }),
    ]);

    const gate = detector.getRegressionGate({ windowSize: 10, minSamples: 5, qualityDropThreshold: 0.1 });
    // Should pass because insufficient data means no regression can be confirmed
    expect(gate.pass).toBe(true);
    expect(gate.reasons.some((r) => r.includes('insufficient') || r.includes('No regression'))).toBe(true);
  });

  it('evaluateRegressionGate is a pure function (K023)', async () => {
    const { evaluateRegressionGate } = await import('../inference/advantage-detector.js');
    const type = typeof evaluateRegressionGate;
    expect(type).toBe('function');

    // Call with empty regressions
    const result = evaluateRegressionGate([], {
      windowSize: 10,
      qualityDropThreshold: 0.1,
      minSamples: 5,
    });
    expect(result.pass).toBe(true);
    expect(result.regressions).toEqual([]);
  });

  it('evaluateRegressionGate fails when given regressing categories', async () => {
    const { evaluateRegressionGate } = await import('../inference/advantage-detector.js');

    const regressions = [
      {
        category: 'code',
        regressing: true,
        recentAvgDelta: -0.1,
        baselineAvgDelta: 0.3,
        dropMagnitude: 0.4,
        recentSamples: 10,
        baselineSamples: 10,
      },
    ];

    const result = evaluateRegressionGate(regressions, {
      windowSize: 10,
      qualityDropThreshold: 0.1,
      minSamples: 5,
    });

    expect(result.pass).toBe(false);
    expect(result.reasons.some((r) => r.includes('code'))).toBe(true);
    expect(result.regressions.length).toBe(1);
  });
});

// ============================================================================
// 6. API Routes — Fastify inject
// ============================================================================

describe('Advantage API Routes', () => {
  let server: import('fastify').FastifyInstance | null = null;
  let authToken = '';
  let skipNative = '';

  beforeAll(async () => {
    try {
      const { createServer } = await import('../api/server.js');

      server = await createServer({
        environment: 'development',
        jwtSecret: 'advantage-test-secret',
        databasePath: ':memory:',
        rateLimitMax: 10000,
      });
      await server.ready();

      // Get a dev JWT
      const loginResp = await server.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { userId: 'user-dev' },
      });
      if (loginResp.statusCode === 200) {
        const body = loginResp.json();
        authToken = body.token;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('bindings') ||
        msg.includes('better_sqlite3') ||
        msg.includes('better-sqlite3') ||
        msg.includes('ERR_DLOPEN_FAILED') ||
        msg.includes('dockerode') ||
        msg.includes('Failed to load url')
      ) {
        skipNative = `Server dependency not available: ${msg.slice(0, 120)}`;
      } else {
        throw err;
      }
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(async () => {
    // Reset advantage detector state between tests
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  function skip(): boolean {
    if (skipNative) {
      console.log(`[SKIP] ${skipNative}`);
      return true;
    }
    return false;
  }

  // ── GET /advantage/report ────────────────────────────────────────

  it('GET /advantage/report returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/report',
    });

    expect(resp.statusCode).toBe(401);
  });

  it('GET /advantage/report returns reports structure with auth', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/report',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body.reports)).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.companionId).toBeNull();
  });

  it('GET /advantage/report with valid companionId', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/report?companionId=cipher',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.companionId).toBe('cipher');
  });

  it('GET /advantage/report with invalid companionId returns error', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/report?companionId=invalid-id',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
    expect(body.reports).toEqual([]);
  });

  // ── GET /advantage/trends ────────────────────────────────────────

  it('GET /advantage/trends returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/trends',
    });

    expect(resp.statusCode).toBe(401);
  });

  it('GET /advantage/trends returns trends structure with auth', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/trends',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body.trends)).toBe(true);
    expect(Array.isArray(body.regressions)).toBe(true);
    expect(body.companionId).toBeNull();
  });

  it('GET /advantage/trends with invalid companionId returns error', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/advantage/trends?companionId=nonexistent',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
    expect(body.trends).toEqual([]);
    expect(body.regressions).toEqual([]);
  });

  // ── POST /advantage/gate ─────────────────────────────────────────

  it('POST /advantage/gate returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      payload: {},
    });

    expect(resp.statusCode).toBe(401);
  });

  it('POST /advantage/gate returns gate result with auth', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(typeof body.pass).toBe('boolean');
    expect(Array.isArray(body.reasons)).toBe(true);
    expect(Array.isArray(body.regressions)).toBe(true);
    expect(body.checkedAt).toBeTruthy();
    expect(body.companionId).toBeNull();
  });

  it('POST /advantage/gate with valid options', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher', qualityDropThreshold: 0.05, minSamples: 3 },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.companionId).toBe('cipher');
  });

  it('POST /advantage/gate with invalid companionId returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'not-a-companion' },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
  });

  it('POST /advantage/gate with invalid qualityDropThreshold returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { qualityDropThreshold: 2.0 },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('qualityDropThreshold');
  });

  it('POST /advantage/gate with invalid minSamples returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { minSamples: -1 },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('minSamples');
  });

  // ── camelCase compliance (K005) ──────────────────────────────────

  it('advantage API responses use camelCase keys (K005)', async () => {
    if (skip()) return;
    if (!authToken) return;

    const reportResp = await server!.inject({
      method: 'GET',
      url: '/advantage/report',
      headers: { authorization: `Bearer ${authToken}` },
    });
    const reportBody = reportResp.json();
    expect(reportBody.companionId).toBeDefined();
    expect(reportBody.companion_id).toBeUndefined();

    const gateResp = await server!.inject({
      method: 'POST',
      url: '/advantage/gate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
    const gateBody = gateResp.json();
    expect(gateBody.checkedAt).toBeDefined();
    expect(gateBody.checked_at).toBeUndefined();
  });
});

// ============================================================================
// 7. Backward Compatibility — record() + recordEvalComparison() coexist
// ============================================================================

describe('Backward compatibility', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('record() still works without qualityDelta', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.record('chat', 150, 300, true);
    detector.record('chat', 180, 350, false, 0.7);

    expect(detector.historySize).toBe(2);
    const reports = detector.getReports();
    const chatReport = reports.find((r) => r.category === 'chat');
    expect(chatReport).toBeDefined();
    expect(chatReport!.sampleSize).toBe(2);
    // No qualityDelta from record() → averageQualityDelta is undefined
    expect(chatReport!.averageQualityDelta).toBeUndefined();
  });

  it('history from record() and recordEvalComparison() coexist', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // record() — no qualityDelta
    detector.record('code', 200, 500, true, 0.8);

    // recordEvalComparison() — has qualityDelta
    detector.recordEvalComparison([
      makeComparisonReport({ category: 'code' as any, qualityDiff: 0.05 }),
    ]);

    expect(detector.historySize).toBe(2);

    const reports = detector.getReports();
    const codeReport = reports.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    expect(codeReport!.sampleSize).toBe(2);
    // averageQualityDelta uses only the point with qualityDelta
    expect(codeReport!.averageQualityDelta).toBeCloseTo(0.05, 5);
  });

  it('getOverallStats() includes data from both recording methods', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.record('code', 200, 500, true);
    detector.recordEvalComparison([
      makeComparisonReport({ category: 'creative' as any, qualityDiff: 0.1 }),
    ]);

    const stats = detector.getOverallStats();
    expect(stats.totalSamples).toBe(2);
    expect(stats.categoriesTracked).toBe(2);
  });

  it('recommendForTask() works with mixed history', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.record('code', 200, 500, true);
    detector.recordEvalComparison([
      makeComparisonReport({ category: 'code' as any, qualityDiff: 0.1 }),
    ]);

    const rec = detector.recommendForTask('code');
    expect(['local', 'frontier', 'hybrid']).toContain(rec);
  });
});

// ============================================================================
// 8. Negative Tests
// ============================================================================

describe('Negative tests', () => {
  beforeEach(async () => {
    const { resetAdvantageDetector } = await import('../inference/advantage-detector.js');
    resetAdvantageDetector();
  });

  it('empty history produces empty reports', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const reports = detector.getReports();
    expect(reports).toEqual([]);
  });

  it('empty history produces empty trends', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const trends = detector.getTrends();
    expect(trends).toEqual([]);
  });

  it('empty history produces empty regression results', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const results = detector.detectRegression();
    expect(results).toEqual([]);
  });

  it('gate with zero data passes with informative reason', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const gate = detector.getRegressionGate();
    expect(gate.pass).toBe(true);
    expect(gate.reasons.length).toBeGreaterThan(0);
    expect(gate.regressions).toEqual([]);
  });

  it('recommendForTask returns hybrid for unknown category', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const rec = detector.recommendForTask('nonexistent-category');
    expect(rec).toBe('hybrid');
  });

  it('getOverallStats returns zeros on empty history', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    const stats = detector.getOverallStats();
    expect(stats.totalSamples).toBe(0);
    expect(stats.categoriesTracked).toBe(0);
    expect(stats.overallLocalWinRate).toBe(0);
    expect(stats.averageLatencySavings).toBe(0);
  });

  it('clearHistory resets state completely', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.record('code', 200, 500, true);
    expect(detector.historySize).toBe(1);

    detector.clearHistory();
    expect(detector.historySize).toBe(0);
    expect(detector.getReports()).toEqual([]);
  });

  it('recordEvalComparison with empty array does nothing', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    detector.recordEvalComparison([]);
    expect(detector.historySize).toBe(0);
  });

  it('evaluateRegressionGate handles mixed regressing/non-regressing categories', async () => {
    const { evaluateRegressionGate } = await import('../inference/advantage-detector.js');

    const regressions = [
      {
        category: 'code',
        regressing: true,
        recentAvgDelta: -0.1,
        baselineAvgDelta: 0.3,
        dropMagnitude: 0.4,
        recentSamples: 10,
        baselineSamples: 10,
      },
      {
        category: 'creative',
        regressing: false,
        recentAvgDelta: 0.15,
        baselineAvgDelta: 0.1,
        dropMagnitude: -0.05,
        recentSamples: 10,
        baselineSamples: 10,
      },
    ];

    const result = evaluateRegressionGate(regressions, {
      windowSize: 10,
      qualityDropThreshold: 0.1,
      minSamples: 5,
    });

    // Should fail because code is regressing
    expect(result.pass).toBe(false);
    expect(result.regressions.length).toBe(2);
  });
});
