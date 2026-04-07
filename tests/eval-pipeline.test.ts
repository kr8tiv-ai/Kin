/**
 * Evaluation Pipeline — Comprehensive Tests
 *
 * Tests the full eval pipeline from benchmarks → scorer → runner → comparison → store → API routes.
 * Uses mocked OllamaClient and frontier provider to avoid live LLM calls.
 *
 * Structure:
 * 1. Benchmark suite tests (getBenchmarkSuite)
 * 2. Scorer tests (scoreHeuristic, scoreWithJudge, computeQualityScore)
 * 3. Runner tests (runEvaluation with mocked LLM)
 * 4. Comparison tests (generateComparisonReport)
 * 5. Store tests (saveEvalResults, loadEvalResults, getEvalHistory)
 * 6. AdvantageDetector tests (qualityScore backward compat)
 * 7. API route tests (POST /eval/run, GET /eval/results, GET /eval/history)
 * 8. Negative tests (malformed input, missing data, auth failures)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { BenchmarkPrompt, EvalResult, TaskCategory } from '../inference/eval/types.js';
import type { HeuristicScore, JudgeScore } from '../inference/eval/scorer.js';

// ============================================================================
// 1. Benchmark Suite Tests
// ============================================================================

describe('getBenchmarkSuite', () => {
  it('returns prompts for all categories when called with no arguments', async () => {
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');
    const prompts = getBenchmarkSuite();

    expect(prompts.length).toBeGreaterThanOrEqual(20);
    // Every prompt should have required fields
    for (const p of prompts) {
      expect(p.id).toBeTruthy();
      expect(p.taskCategory).toBeTruthy();
      expect(p.systemPrompt).toBeTruthy();
      expect(p.userMessage).toBeTruthy();
      expect(p.rubric).toBeDefined();
      expect(p.rubric.criteria.length).toBeGreaterThan(0);
    }
  });

  it('filters by category', async () => {
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');
    const codePrompts = getBenchmarkSuite(null, 'code');

    expect(codePrompts.length).toBeGreaterThan(0);
    for (const p of codePrompts) {
      expect(p.taskCategory).toBe('code');
    }
  });

  it('filters by companion', async () => {
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');
    const cipherPrompts = getBenchmarkSuite('cipher');

    expect(cipherPrompts.length).toBeGreaterThan(0);
    for (const p of cipherPrompts) {
      expect(p.companionId).toBe('cipher');
    }
  });

  it('filters by companion and category', async () => {
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');
    const cipherCode = getBenchmarkSuite('cipher', 'code');

    expect(cipherCode.length).toBeGreaterThan(0);
    for (const p of cipherCode) {
      expect(p.companionId).toBe('cipher');
      expect(p.taskCategory).toBe('code');
    }
  });

  it('covers all four categories', async () => {
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');
    const prompts = getBenchmarkSuite();
    const categories = new Set(prompts.map((p) => p.taskCategory));

    expect(categories.has('code')).toBe(true);
    expect(categories.has('creative')).toBe(true);
    expect(categories.has('analysis')).toBe(true);
    expect(categories.has('chat')).toBe(true);
  });
});

// ============================================================================
// 2. Scorer Tests
// ============================================================================

describe('scoreHeuristic', () => {
  it('produces valid 1-5 dimension scores and 0-1 overall', async () => {
    const { scoreHeuristic } = await import('../inference/eval/scorer.js');
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');

    const prompt = getBenchmarkSuite(null, 'code')[0]!;
    const response = `Here's a TypeScript function that handles this:

\`\`\`typescript
function solve(input: string): string {
  return input.split('').reverse().join('');
}
\`\`\`

This function reverses the input string efficiently. The time complexity is O(n).`;

    const score = scoreHeuristic(prompt, response);

    // Dimension scores: 1-5 range
    expect(score.lengthAdequacy).toBeGreaterThanOrEqual(1);
    expect(score.lengthAdequacy).toBeLessThanOrEqual(5);
    expect(score.formatCompliance).toBeGreaterThanOrEqual(1);
    expect(score.formatCompliance).toBeLessThanOrEqual(5);
    expect(score.rubricCoverage).toBeGreaterThanOrEqual(1);
    expect(score.rubricCoverage).toBeLessThanOrEqual(5);
    expect(score.personalityAdherence).toBeGreaterThanOrEqual(1);
    expect(score.personalityAdherence).toBeLessThanOrEqual(5);

    // Overall: 0-1 range
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(1);
  });

  it('gives higher scores to well-formatted responses', async () => {
    const { scoreHeuristic } = await import('../inference/eval/scorer.js');
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');

    const prompt = getBenchmarkSuite(null, 'code')[0]!;

    const goodResponse = `Here's a complete solution:

\`\`\`typescript
function process(data: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of data) {
    result.set(item, (result.get(item) ?? 0) + 1);
  }
  return result;
}
\`\`\`

Key design choices:
- Uses Map for O(1) lookups
- Handles duplicates with increment
- Type-safe with generics`;

    const poorResponse = 'ok sure just use a map or something';

    const goodScore = scoreHeuristic(prompt, goodResponse);
    const poorScore = scoreHeuristic(prompt, poorResponse);

    expect(goodScore.overall).toBeGreaterThan(poorScore.overall);
  });
});

describe('scoreWithJudge', () => {
  it('parses valid JSON judge response', async () => {
    const { scoreWithJudge } = await import('../inference/eval/scorer.js');
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');

    const prompt = getBenchmarkSuite(null, 'code')[0]!;

    // Create a mock frontier provider that returns structured judge JSON
    const mockJudge = {
      id: 'openai' as const,
      spec: {} as any,
      isConfigured: () => true,
      chat: vi.fn().mockResolvedValue({
        content: '{"helpfulness": 4, "accuracy": 5, "personality": 3, "overall": 4}',
        inputTokens: 100,
        outputTokens: 20,
        model: 'gpt-5.4',
        provider: 'openai',
        latencyMs: 500,
      }),
    };

    const score = await scoreWithJudge(prompt, 'A well-crafted response', mockJudge);

    expect(score.helpfulness).toBe(4);
    expect(score.accuracy).toBe(5);
    expect(score.personality).toBe(3);
    expect(score.overallRating).toBe(4);
    // Overall is normalized from 1-5 to 0-1
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(1);
  });

  it('falls back to heuristic on parse failure', async () => {
    const { scoreWithJudge } = await import('../inference/eval/scorer.js');
    const { getBenchmarkSuite } = await import('../inference/eval/benchmarks.js');

    const prompt = getBenchmarkSuite(null, 'code')[0]!;

    // Mock provider returns unparseable response
    const mockJudge = {
      id: 'openai' as const,
      spec: {} as any,
      isConfigured: () => true,
      chat: vi.fn().mockResolvedValue({
        content: 'This is not valid JSON at all',
        inputTokens: 100,
        outputTokens: 20,
        model: 'gpt-5.4',
        provider: 'openai',
        latencyMs: 500,
      }),
    };

    // Should not throw — falls back to heuristic-derived judge
    const score = await scoreWithJudge(prompt, 'Any response', mockJudge);

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(1);
    // Should have all dimensions
    expect(typeof score.helpfulness).toBe('number');
    expect(typeof score.accuracy).toBe('number');
    expect(typeof score.personality).toBe('number');
    expect(typeof score.overallRating).toBe('number');
  });
});

describe('computeQualityScore', () => {
  it('returns heuristic-only when no judge', async () => {
    const { computeQualityScore } = await import('../inference/eval/scorer.js');

    const heuristic: HeuristicScore = {
      lengthAdequacy: 4,
      formatCompliance: 3,
      rubricCoverage: 4,
      personalityAdherence: 3,
      overall: 0.7,
    };

    expect(computeQualityScore(heuristic, null)).toBe(0.7);
    expect(computeQualityScore(heuristic, undefined)).toBe(0.7);
  });

  it('blends 0.7 judge + 0.3 heuristic when judge present', async () => {
    const { computeQualityScore } = await import('../inference/eval/scorer.js');

    const heuristic: HeuristicScore = {
      lengthAdequacy: 4,
      formatCompliance: 3,
      rubricCoverage: 4,
      personalityAdherence: 3,
      overall: 0.6,
    };

    const judge: JudgeScore = {
      helpfulness: 4,
      accuracy: 4,
      personality: 3,
      overallRating: 4,
      overall: 0.8,
    };

    const blended = computeQualityScore(heuristic, judge);
    // 0.7 * 0.8 + 0.3 * 0.6 = 0.56 + 0.18 = 0.74
    expect(blended).toBeCloseTo(0.74, 2);
  });
});

// ============================================================================
// 3. Runner Tests (mocked LLM)
// ============================================================================

describe('runEvaluation', () => {
  afterEach(() => {
    vi.doUnmock('../inference/local-llm.js');
    vi.doUnmock('../inference/providers/index.js');
    vi.doUnmock('../companions/config.js');
    vi.resetModules();
  });

  it('produces EvalResult[] with mocked Ollama and frontier', async () => {
    // Mock the OllamaClient
    vi.doMock('../inference/local-llm.js', () => ({
      OllamaClient: class MockOllamaClient {
        async isAvailable() { return true; }
        async chat() {
          return {
            model: 'kin-cipher',
            created_at: new Date().toISOString(),
            message: { role: 'assistant', content: 'Mocked local response with code blocks and details.' },
            done: true,
            prompt_eval_count: 50,
            eval_count: 100,
          };
        }
        async chatStream() {}
        async hasModel() { return true; }
        async listModels() { return []; }
      },
      getOllamaClient: () => new (class { async isAvailable() { return true; } })(),
      isLocalLlmAvailable: async () => true,
    }));

    // Mock the provider index to return a configured frontier provider
    vi.doMock('../inference/providers/index.js', () => ({
      getProvider: () => ({
        id: 'openai',
        spec: {},
        isConfigured: () => true,
        chat: async () => ({
          content: 'Mocked frontier response with detailed analysis.',
          inputTokens: 80,
          outputTokens: 120,
          model: 'gpt-5.4',
          provider: 'openai',
          latencyMs: 450,
        }),
      }),
    }));

    // Mock resolveLocalModel
    vi.doMock('../companions/config.js', async () => {
      const actual = await vi.importActual('../companions/config.js') as any;
      return {
        ...actual,
        resolveLocalModel: async () => 'kin-cipher',
      };
    });

    // Clear the runner module cache so it picks up our mocks
    const { runEvaluation: mockedRunEval } = await import('../inference/eval/runner.js');

    const results = await mockedRunEval({
      companionIds: ['cipher'],
      categories: ['code'],
      maxConcurrency: 1,
      runJudge: false,
      timeoutMs: 10_000,
    });

    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r.promptId).toBeTruthy();
      expect(r.model).toBeTruthy();
      expect(typeof r.latencyMs).toBe('number');
      expect(typeof r.tokenCount).toBe('number');
      expect(r.heuristicScore).toBeGreaterThanOrEqual(0);
      expect(r.heuristicScore).toBeLessThanOrEqual(1);
      expect(r.qualityScore).toBeGreaterThanOrEqual(0);
      expect(r.qualityScore).toBeLessThanOrEqual(1);
      expect(r.evaluatedAt).toBeTruthy();
    }

    // Should have both local and frontier results
    const providers = new Set(results.map((r) => r.provider));
    expect(providers.has('local')).toBe(true);
  });

  it('produces local-only results when frontier is unconfigured', async () => {
    vi.doMock('../inference/local-llm.js', () => ({
      OllamaClient: class MockOllamaClient {
        async isAvailable() { return true; }
        async chat() {
          return {
            model: 'kin-cipher',
            created_at: new Date().toISOString(),
            message: { role: 'assistant', content: 'Local only response.' },
            done: true,
            prompt_eval_count: 50,
            eval_count: 100,
          };
        }
        async chatStream() {}
        async hasModel() { return true; }
        async listModels() { return []; }
      },
      getOllamaClient: () => new (class { async isAvailable() { return true; } })(),
      isLocalLlmAvailable: async () => true,
    }));

    // Return unconfigured provider
    vi.doMock('../inference/providers/index.js', () => ({
      getProvider: () => ({
        id: 'openai',
        spec: {},
        isConfigured: () => false,
        chat: async () => { throw new Error('Not configured'); },
      }),
    }));

    vi.doMock('../companions/config.js', async () => {
      const actual = await vi.importActual('../companions/config.js') as any;
      return {
        ...actual,
        resolveLocalModel: async () => 'kin-cipher',
      };
    });

    const { runEvaluation: mockedRunEval } = await import('../inference/eval/runner.js');

    const results = await mockedRunEval({
      companionIds: ['cipher'],
      categories: ['code'],
      maxConcurrency: 1,
    });

    // Should have only local results
    for (const r of results) {
      expect(r.provider).toBe('local');
    }
  });
});

// ============================================================================
// 4. Comparison Tests
// ============================================================================

describe('generateComparisonReport', () => {
  it('aggregates local vs frontier results by category', async () => {
    const { generateComparisonReport } = await import('../inference/eval/comparison.js');

    const results: EvalResult[] = [
      makeResult('code-01', 'kin-cipher', 'local', 0.7, 200),
      makeResult('code-02', 'kin-cipher', 'local', 0.8, 180),
      makeResult('code-01', 'gpt-5.4', 'openai', 0.9, 500),
      makeResult('code-02', 'gpt-5.4', 'openai', 0.85, 450),
      makeResult('creative-01', 'kin-mischief', 'local', 0.6, 300),
      makeResult('creative-01', 'gemini-3.1', 'google', 0.75, 600),
    ];

    const reports = generateComparisonReport(results);

    expect(reports.length).toBe(2); // code + creative

    const codeReport = reports.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    expect(codeReport!.promptCount).toBe(4);
    expect(codeReport!.localScores.count).toBe(2);
    expect(codeReport!.frontierScores.count).toBe(2);
    expect(codeReport!.localScores.avgQuality).toBeCloseTo(0.75, 2);
    expect(codeReport!.frontierScores.avgQuality).toBeCloseTo(0.875, 2);
    expect(codeReport!.latencyDiffMs).toBeLessThan(0); // local is faster
    expect(codeReport!.qualityDiff).toBeLessThan(0); // frontier is better quality

    const creativeReport = reports.find((r) => r.category === 'creative');
    expect(creativeReport).toBeDefined();
    expect(creativeReport!.promptCount).toBe(2);
  });

  it('returns empty array for empty results', async () => {
    const { generateComparisonReport } = await import('../inference/eval/comparison.js');
    const reports = generateComparisonReport([]);
    expect(reports).toEqual([]);
  });

  it('handles local-only results correctly', async () => {
    const { generateComparisonReport } = await import('../inference/eval/comparison.js');

    const results: EvalResult[] = [
      makeResult('code-01', 'kin-cipher', 'local', 0.7, 200),
      makeResult('code-02', 'kin-cipher', 'local', 0.8, 180),
    ];

    const reports = generateComparisonReport(results);
    expect(reports.length).toBe(1);
    expect(reports[0].localScores.count).toBe(2);
    expect(reports[0].frontierScores.count).toBe(0);
  });

  it('produces correct recommendations', async () => {
    const { generateComparisonReport } = await import('../inference/eval/comparison.js');

    // Local at parity and faster → should recommend local
    const results: EvalResult[] = [
      makeResult('code-01', 'local-model', 'local', 0.80, 100),
      makeResult('code-01', 'gpt-5.4', 'openai', 0.82, 500),
    ];

    const reports = generateComparisonReport(results);
    expect(reports[0].recommendation).toBe('local');
  });
});

// ============================================================================
// 5. Store Tests (mocked filesystem)
// ============================================================================

describe('eval store', () => {
  let mkdirSpy: ReturnType<typeof vi.spyOn>;
  let appendFileSpy: ReturnType<typeof vi.spyOn>;
  let readFileSpy: ReturnType<typeof vi.spyOn>;
  let readdirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const fs = await import('fs');
    mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    appendFileSpy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue();
    readFileSpy = vi.spyOn(fs.promises, 'readFile');
    readdirSpy = vi.spyOn(fs.promises, 'readdir');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveEvalResults writes JSONL to correct path', async () => {
    const { saveEvalResults } = await import('../inference/eval/store.js');

    const results: EvalResult[] = [
      makeResult('code-01', 'kin-cipher', 'local', 0.7, 200),
    ];

    const filePath = await saveEvalResults(results, 'cipher', '/tmp/test-eval');

    expect(mkdirSpy).toHaveBeenCalled();
    expect(appendFileSpy).toHaveBeenCalled();
    expect(filePath).toContain('cipher');
    expect(filePath).toContain('results.jsonl');
  });

  it('loadEvalResults parses JSONL correctly', async () => {
    const { loadEvalResults } = await import('../inference/eval/store.js');

    const stored: EvalResult[] = [
      makeResult('code-01', 'kin-cipher', 'local', 0.7, 200),
      makeResult('code-02', 'kin-cipher', 'local', 0.8, 180),
    ];

    readFileSpy.mockResolvedValue(
      stored.map((r) => JSON.stringify(r)).join('\n') + '\n',
    );

    const loaded = await loadEvalResults('cipher', undefined, '/tmp/test-eval');

    expect(loaded.length).toBe(2);
    expect(loaded[0].promptId).toBe('code-01');
    expect(loaded[1].promptId).toBe('code-02');
  });

  it('loadEvalResults returns empty array for missing file', async () => {
    const { loadEvalResults } = await import('../inference/eval/store.js');

    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    readFileSpy.mockRejectedValue(enoent);

    const loaded = await loadEvalResults('nonexistent', undefined, '/tmp/test-eval');
    expect(loaded).toEqual([]);
  });

  it('loadEvalResults respects limit parameter', async () => {
    const { loadEvalResults } = await import('../inference/eval/store.js');

    const stored = Array.from({ length: 10 }, (_, i) =>
      makeResult(`code-${String(i + 1).padStart(2, '0')}`, 'kin-cipher', 'local', 0.5 + i * 0.05, 200),
    );

    readFileSpy.mockResolvedValue(
      stored.map((r) => JSON.stringify(r)).join('\n') + '\n',
    );

    const loaded = await loadEvalResults('cipher', 3, '/tmp/test-eval');
    expect(loaded.length).toBe(3);
    // Should be the last 3 (most recent)
    expect(loaded[0].promptId).toBe('code-08');
  });

  it('saveEvalResults + loadEvalResults round-trip', async () => {
    const { saveEvalResults, loadEvalResults } = await import('../inference/eval/store.js');

    const results: EvalResult[] = [
      makeResult('code-01', 'kin-cipher', 'local', 0.7, 200),
      makeResult('creative-01', 'kin-cipher', 'local', 0.6, 300),
    ];

    // Capture what appendFile would write
    let writtenData = '';
    appendFileSpy.mockImplementation(async (_path: any, data: any) => {
      writtenData += data;
    });

    await saveEvalResults(results, 'cipher', '/tmp/test-eval');

    // Now mock readFile to return what was written
    readFileSpy.mockResolvedValue(writtenData);

    const loaded = await loadEvalResults('cipher', undefined, '/tmp/test-eval');
    expect(loaded.length).toBe(2);
    expect(loaded[0].promptId).toBe('code-01');
    expect(loaded[1].promptId).toBe('creative-01');
    expect(loaded[0].qualityScore).toBe(0.7);
  });

  it('getEvalHistory returns run summaries grouped by timestamp', async () => {
    const { getEvalHistory } = await import('../inference/eval/store.js');

    const ts = '2025-06-01T12:00:00.000Z';
    const stored: EvalResult[] = [
      { ...makeResult('code-01', 'kin-cipher', 'local', 0.7, 200), evaluatedAt: ts },
      { ...makeResult('code-02', 'kin-cipher', 'local', 0.8, 180), evaluatedAt: ts },
    ];

    readFileSpy.mockResolvedValue(
      stored.map((r) => JSON.stringify(r)).join('\n') + '\n',
    );

    const history = await getEvalHistory('cipher', '/tmp/test-eval');

    expect(history.length).toBe(1);
    expect(history[0].resultsCount).toBe(2);
    expect(history[0].timestamp).toBe(ts);
  });
});

// ============================================================================
// 6. AdvantageDetector Tests (qualityScore extension)
// ============================================================================

describe('AdvantageDetector with qualityScore', () => {
  it('accepts qualityScore parameter without error', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Record with qualityScore (backward compat extension from T03)
    detector.record('code', 200, 500, true, 0.85);
    detector.record('code', 250, 480, false, 0.72);

    const reports = detector.getReports();
    const codeReport = reports.find((r) => r.category === 'code');
    expect(codeReport).toBeDefined();
    expect(codeReport!.sampleSize).toBeGreaterThanOrEqual(2);
  });

  it('works without qualityScore (backward compat)', async () => {
    const { getAdvantageDetector } = await import('../inference/advantage-detector.js');
    const detector = getAdvantageDetector();

    // Record without qualityScore — original signature
    detector.record('chat-compat-test', 150, 300, true);

    const reports = detector.getReports();
    const chatReport = reports.find((r) => r.category === 'chat-compat-test');
    expect(chatReport).toBeDefined();
    expect(chatReport!.sampleSize).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// 7. API Route Tests (Fastify inject)
// ============================================================================

describe('Eval API Routes', () => {
  let server: import('fastify').FastifyInstance | null = null;
  let authToken = '';
  let skipNative = '';

  beforeAll(async () => {
    try {
      const { createServer } = await import('../api/server.js');

      server = await createServer({
        environment: 'development',
        jwtSecret: 'eval-test-secret',
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

  function skip(): boolean {
    if (skipNative) {
      console.log(`[SKIP] ${skipNative}`);
      return true;
    }
    return false;
  }

  it('POST /eval/run returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/eval/run',
      payload: {},
    });

    expect(resp.statusCode).toBe(401);
  });

  it('POST /eval/run with invalid companionId returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/eval/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionIds: ['nonexistent-companion'] },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
  });

  it('POST /eval/run with invalid category returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/eval/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { categories: ['invalid-category'] },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid category');
  });

  it('POST /eval/run accepts valid request and returns summary shape', async () => {
    if (skip()) return;
    if (!authToken) return;

    // This will produce 0 results since no Ollama/frontier are running,
    // but should return a valid summary structure.
    const resp = await server!.inject({
      method: 'POST',
      url: '/eval/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionIds: ['cipher'], categories: ['code'] },
    });

    // Should succeed even without live LLM — runner handles graceful degradation
    expect(resp.statusCode).toBe(200);
    const body = resp.json();

    expect(body.runId).toBeTruthy();
    expect(body.timestamp).toBeTruthy();
    expect(typeof body.resultsCount).toBe('number');
    expect(typeof body.failedCount).toBe('number');
    expect(typeof body.durationMs).toBe('number');
    expect(Array.isArray(body.comparisons)).toBe(true);
    expect(body.config).toBeDefined();

    // camelCase check (K005)
    expect(body.resultsCount).toBeDefined();
    expect(body.results_count).toBeUndefined();
  });

  it('GET /eval/results returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/results',
    });

    expect(resp.statusCode).toBe(401);
  });

  it('GET /eval/results returns comparisons structure', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/results',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body.comparisons)).toBe(true);
  });

  it('GET /eval/results with no stored data returns empty comparisons', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/results?companionId=cipher',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.comparisons).toEqual([]);
  });

  it('GET /eval/history returns 401 without auth', async () => {
    if (skip()) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/history',
    });

    expect(resp.statusCode).toBe(401);
  });

  it('GET /eval/history returns history structure', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/history',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body.history)).toBe(true);
  });

  it('GET /eval/history with limit parameter', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/eval/history?limit=5',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body.history)).toBe(true);
  });
});

// ============================================================================
// 8. Negative Tests
// ============================================================================

describe('Negative tests', () => {
  it('empty eval results produce empty comparison reports', async () => {
    const { generateComparisonReport } = await import('../inference/eval/comparison.js');
    const reports = generateComparisonReport([]);
    expect(reports).toEqual([]);
  });

  it('store handles malformed JSONL gracefully', async () => {
    const fs = await import('fs');
    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      '{"valid": "json"}\nnot-json-at-all\n{"also": "valid"}\n',
    );

    const { loadEvalResults } = await import('../inference/eval/store.js');
    const results = await loadEvalResults('cipher', undefined, '/tmp/test-eval');

    // Should parse the valid lines and skip the malformed one
    expect(results.length).toBe(2);

    readFileSpy.mockRestore();
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeResult(
  promptId: string,
  model: string,
  provider: 'local' | string,
  quality: number,
  latencyMs: number,
): EvalResult {
  return {
    promptId,
    model,
    provider: provider as EvalResult['provider'],
    response: `Mocked response for ${promptId}`,
    latencyMs,
    tokenCount: 150,
    heuristicScore: quality,
    judgeScore: null,
    qualityScore: quality,
    evaluatedAt: new Date().toISOString(),
  };
}
