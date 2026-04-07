/**
 * Distillation Pipeline — Comprehensive Tests
 *
 * Tests the full distill pipeline from candidate selection → SFT conversion →
 * store persistence → orchestrated runner → API routes.
 *
 * Structure:
 * 1. Selector tests (selectDistillCandidates)
 * 2. Converter tests (convertToSFT)
 * 3. Store tests (saveDistillDataset, loadDistillDataset, loadExistingHashes)
 * 4. Runner tests (runDistillation)
 * 5. API route tests (POST /distill/run, GET /distill/datasets, GET /distill/datasets/:companionId/export)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import type { EvalResult } from '../inference/eval/types.js';
import type { DistillCandidate } from '../inference/distill/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeEvalResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    promptId: 'code-01',
    model: 'gpt-5.4',
    provider: 'openai',
    response: 'A detailed frontier response with code examples.',
    latencyMs: 450,
    tokenCount: 200,
    heuristicScore: 0.8,
    judgeScore: null,
    qualityScore: 0.85,
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<DistillCandidate> = {}): DistillCandidate {
  return {
    promptId: 'code-01',
    companionId: 'cipher',
    systemPrompt: 'You are Cipher, a coding companion.',
    userMessage: 'Write a function that reverses a string.',
    frontierResponse: 'Here is a TypeScript function...',
    qualityScore: 0.85,
    model: 'gpt-5.4',
    provider: 'openai',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function computeHash(line: string): string {
  return createHash('sha256').update(line).digest('hex');
}

// ============================================================================
// 1. Selector Tests
// ============================================================================

describe('selectDistillCandidates', () => {
  beforeEach(() => {
    vi.doMock('../inference/eval/store.js', () => ({
      loadEvalResults: vi.fn().mockResolvedValue([]),
      saveEvalResults: vi.fn(),
      getEvalHistory: vi.fn(),
    }));
    vi.doMock('../inference/eval/benchmarks.js', () => ({
      getBenchmarkSuite: vi.fn().mockReturnValue([
        {
          id: 'code-01',
          taskCategory: 'code',
          companionId: 'cipher',
          systemPrompt: 'You are Cipher, a coding companion.',
          userMessage: 'Write a function that reverses a string.',
          rubric: { idealResponse: 'A clean reverse function', criteria: [] },
        },
        {
          id: 'creative-01',
          taskCategory: 'creative',
          companionId: 'mischief',
          systemPrompt: 'You are Mischief, a creative companion.',
          userMessage: 'Write a short poem about the sea.',
          rubric: { idealResponse: 'A vivid poem', criteria: [] },
        },
      ]),
    }));
  });

  afterEach(() => {
    vi.doUnmock('../inference/eval/store.js');
    vi.doUnmock('../inference/eval/benchmarks.js');
    vi.resetModules();
  });

  it('filters out local provider results (only frontier passes)', async () => {
    const mockStore = await import('../inference/eval/store.js');
    (mockStore.loadEvalResults as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeEvalResult({ promptId: 'code-01', provider: 'local', model: 'kin-cipher', qualityScore: 0.9 }),
      makeEvalResult({ promptId: 'code-01', provider: 'openai', model: 'gpt-5.4', qualityScore: 0.85 }),
    ]);

    const { selectDistillCandidates } = await import('../inference/distill/selector.js');
    const candidates = await selectDistillCandidates('cipher');

    expect(candidates.length).toBe(1);
    expect(candidates[0].provider).toBe('openai');
  });

  it('filters out results below quality threshold (default 0.7)', async () => {
    const mockStore = await import('../inference/eval/store.js');
    (mockStore.loadEvalResults as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeEvalResult({ promptId: 'code-01', provider: 'openai', qualityScore: 0.85 }),
      makeEvalResult({ promptId: 'creative-01', provider: 'openai', qualityScore: 0.5 }),
    ]);

    const { selectDistillCandidates } = await import('../inference/distill/selector.js');
    const candidates = await selectDistillCandidates('cipher');

    expect(candidates.length).toBe(1);
    expect(candidates[0].qualityScore).toBe(0.85);
  });

  it('skips results with unresolvable promptId (logs warning, does not crash)', async () => {
    const mockStore = await import('../inference/eval/store.js');
    (mockStore.loadEvalResults as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeEvalResult({ promptId: 'nonexistent-prompt', provider: 'openai', qualityScore: 0.9 }),
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { selectDistillCandidates } = await import('../inference/distill/selector.js');
    const candidates = await selectDistillCandidates('cipher');

    expect(candidates.length).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-prompt'),
    );

    warnSpy.mockRestore();
  });

  it('returns empty array when no eval results exist', async () => {
    const mockStore = await import('../inference/eval/store.js');
    (mockStore.loadEvalResults as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { selectDistillCandidates } = await import('../inference/distill/selector.js');
    const candidates = await selectDistillCandidates('cipher');

    expect(candidates).toEqual([]);
  });

  it('respects custom qualityThreshold in config', async () => {
    const mockStore = await import('../inference/eval/store.js');
    (mockStore.loadEvalResults as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeEvalResult({ promptId: 'code-01', provider: 'openai', qualityScore: 0.85 }),
      makeEvalResult({ promptId: 'creative-01', provider: 'openai', qualityScore: 0.75 }),
    ]);

    const { selectDistillCandidates } = await import('../inference/distill/selector.js');

    // High threshold — only the 0.85 result passes
    const highThreshold = await selectDistillCandidates('cipher', { qualityThreshold: 0.8 });
    expect(highThreshold.length).toBe(1);
    expect(highThreshold[0].qualityScore).toBe(0.85);

    // Low threshold — both pass
    vi.resetModules();
    // Re-mock after reset
    vi.doMock('../inference/eval/store.js', () => ({
      loadEvalResults: vi.fn().mockResolvedValue([
        makeEvalResult({ promptId: 'code-01', provider: 'openai', qualityScore: 0.85 }),
        makeEvalResult({ promptId: 'creative-01', provider: 'openai', qualityScore: 0.75 }),
      ]),
    }));
    vi.doMock('../inference/eval/benchmarks.js', () => ({
      getBenchmarkSuite: vi.fn().mockReturnValue([
        {
          id: 'code-01',
          taskCategory: 'code',
          companionId: 'cipher',
          systemPrompt: 'You are Cipher.',
          userMessage: 'Write a function.',
          rubric: { idealResponse: 'A function', criteria: [] },
        },
        {
          id: 'creative-01',
          taskCategory: 'creative',
          companionId: 'mischief',
          systemPrompt: 'You are Mischief.',
          userMessage: 'Write a poem.',
          rubric: { idealResponse: 'A poem', criteria: [] },
        },
      ]),
    }));
    const { selectDistillCandidates: select2 } = await import('../inference/distill/selector.js');
    const lowThreshold = await select2('cipher', { qualityThreshold: 0.5 });
    expect(lowThreshold.length).toBe(2);
  });
});

// ============================================================================
// 2. Converter Tests
// ============================================================================

describe('convertToSFT', () => {
  it('output has exactly 3 messages with roles system, user, assistant', async () => {
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const candidate = makeCandidate();
    const sft = convertToSFT(candidate);

    expect(sft.messages.length).toBe(3);
    expect(sft.messages[0].role).toBe('system');
    expect(sft.messages[1].role).toBe('user');
    expect(sft.messages[2].role).toBe('assistant');
  });

  it('system message content matches candidate.systemPrompt', async () => {
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const candidate = makeCandidate({ systemPrompt: 'Custom system prompt here.' });
    const sft = convertToSFT(candidate);

    expect(sft.messages[0].content).toBe('Custom system prompt here.');
  });

  it('user message content matches candidate.userMessage', async () => {
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const candidate = makeCandidate({ userMessage: 'How do I sort an array?' });
    const sft = convertToSFT(candidate);

    expect(sft.messages[1].content).toBe('How do I sort an array?');
  });

  it('assistant message content matches candidate.frontierResponse', async () => {
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const candidate = makeCandidate({ frontierResponse: 'Use Array.prototype.sort()...' });
    const sft = convertToSFT(candidate);

    expect(sft.messages[2].content).toBe('Use Array.prototype.sort()...');
  });

  it('metadata includes companionId, provider, model, source=distillation, qualityScore', async () => {
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const candidate = makeCandidate({
      companionId: 'forge',
      provider: 'google',
      model: 'gemini-3.1',
      qualityScore: 0.92,
    });
    const sft = convertToSFT(candidate);

    expect(sft.metadata.companionId).toBe('forge');
    expect(sft.metadata.provider).toBe('google');
    expect(sft.metadata.model).toBe('gemini-3.1');
    expect(sft.metadata.source).toBe('distillation');
    expect(sft.metadata.qualityScore).toBe(0.92);
  });
});

// ============================================================================
// 3. Store Tests (real filesystem with temp directory)
// ============================================================================

describe('distill store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `distill-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  });

  afterEach(async () => {
    // Cleanup temp dir
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('saveDistillDataset creates directory and file, writes JSONL lines', async () => {
    const { saveDistillDataset } = await import('../inference/distill/store.js');

    const lines = [
      JSON.stringify({ messages: [{ role: 'system', content: 'test' }], metadata: {} }),
      JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], metadata: {} }),
    ];

    const filePath = await saveDistillDataset(lines, 'cipher', tmpDir);

    // File should exist
    const stat = await fs.promises.stat(filePath);
    expect(stat.isFile()).toBe(true);

    // Content should contain both lines
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const writtenLines = content.trim().split('\n').filter(Boolean);
    expect(writtenLines.length).toBe(2);

    // Path should be in the expected location
    expect(filePath).toContain('cipher');
    expect(filePath).toContain('distill.jsonl');
  });

  it('loadDistillDataset reads back written lines', async () => {
    const { saveDistillDataset, loadDistillDataset } = await import('../inference/distill/store.js');

    const lines = [
      JSON.stringify({ messages: [{ role: 'system', content: 'one' }] }),
      JSON.stringify({ messages: [{ role: 'system', content: 'two' }] }),
      JSON.stringify({ messages: [{ role: 'system', content: 'three' }] }),
    ];

    await saveDistillDataset(lines, 'forge', tmpDir);
    const loaded = await loadDistillDataset('forge', tmpDir);

    expect(loaded.length).toBe(3);
    // Round-trip — parse the loaded lines and verify content
    const parsed = loaded.map((l) => JSON.parse(l));
    expect(parsed[0].messages[0].content).toBe('one');
    expect(parsed[2].messages[0].content).toBe('three');
  });

  it('loadExistingHashes returns SHA-256 hashes of existing lines', async () => {
    const { saveDistillDataset, loadExistingHashes } = await import('../inference/distill/store.js');

    const line1 = JSON.stringify({ messages: [{ role: 'system', content: 'hash-test-1' }] });
    const line2 = JSON.stringify({ messages: [{ role: 'system', content: 'hash-test-2' }] });

    await saveDistillDataset([line1, line2], 'aether', tmpDir);
    const hashes = await loadExistingHashes('aether', tmpDir);

    expect(hashes.size).toBe(2);
    // Verify hash values match manual computation
    expect(hashes.has(computeHash(line1))).toBe(true);
    expect(hashes.has(computeHash(line2))).toBe(true);
  });

  it('loadDistillDataset returns empty array for missing file', async () => {
    const { loadDistillDataset } = await import('../inference/distill/store.js');

    const loaded = await loadDistillDataset('nonexistent-companion', tmpDir);
    expect(loaded).toEqual([]);
  });
});

// ============================================================================
// 4. Runner Tests (mocked dependencies)
// ============================================================================

describe('runDistillation', () => {
  afterEach(() => {
    vi.doUnmock('../inference/distill/selector.js');
    vi.doUnmock('../inference/distill/converter.js');
    vi.doUnmock('../inference/distill/store.js');
    vi.doUnmock('../inference/training-curation.js');
    vi.resetModules();
  });

  function setupRunnerMocks(options: {
    candidates?: DistillCandidate[];
    existingHashes?: Set<string>;
    existingLines?: string[];
    savedLines?: string[][];
  } = {}) {
    const {
      candidates = [],
      existingHashes = new Set<string>(),
      existingLines = [],
      savedLines = [],
    } = options;

    vi.doMock('../inference/distill/selector.js', () => ({
      selectDistillCandidates: vi.fn().mockResolvedValue(candidates),
    }));

    vi.doMock('../inference/distill/store.js', () => ({
      loadExistingHashes: vi.fn().mockResolvedValue(existingHashes),
      loadDistillDataset: vi.fn().mockResolvedValue(existingLines),
      saveDistillDataset: vi.fn().mockImplementation(async (lines: string[]) => {
        savedLines.push(lines);
        return '/tmp/distill/cipher/distill.jsonl';
      }),
    }));

    // Keep the real converter — test through the public API
    // But we do need to mock training-curation for computeEntryHash
    vi.doMock('../inference/training-curation.js', () => ({
      computeEntryHash: (line: string) => computeHash(line),
    }));
  }

  it('orchestrates select → convert → dedup → save correctly', async () => {
    const candidates = [
      makeCandidate({ promptId: 'code-01', qualityScore: 0.9 }),
      makeCandidate({ promptId: 'code-02', qualityScore: 0.85 }),
    ];
    const savedLines: string[][] = [];

    setupRunnerMocks({ candidates, savedLines });

    const { runDistillation } = await import('../inference/distill/runner.js');
    const summary = await runDistillation('cipher');

    expect(summary.companionId).toBe('cipher');
    expect(summary.selectedCount).toBe(2);
    expect(summary.duplicateCount).toBe(0);
    // save should have been called with 2 lines
    expect(savedLines.length).toBe(1);
    expect(savedLines[0].length).toBe(2);
    // Each saved line should be valid JSON
    for (const line of savedLines[0]) {
      const parsed = JSON.parse(line);
      expect(parsed.messages).toBeDefined();
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.source).toBe('distillation');
    }
  });

  it('skips duplicates (same content hash already in dataset)', async () => {
    const candidate = makeCandidate({ promptId: 'code-01' });

    // Import converter to pre-compute the hash
    const { convertToSFT } = await import('../inference/distill/converter.js');
    const sftLine = convertToSFT(candidate);
    const jsonLine = JSON.stringify(sftLine);
    const existingHash = computeHash(jsonLine);

    vi.resetModules();

    const savedLines: string[][] = [];
    setupRunnerMocks({
      candidates: [candidate],
      existingHashes: new Set([existingHash]),
      savedLines,
    });

    const { runDistillation } = await import('../inference/distill/runner.js');
    const summary = await runDistillation('cipher');

    expect(summary.duplicateCount).toBe(1);
    expect(summary.selectedCount).toBe(0);
    // saveDistillDataset should not be called since no new lines
    expect(savedLines.length).toBe(0);
  });

  it('summary includes correct counts (selectedCount, duplicateCount, datasetSize)', async () => {
    const candidates = [
      makeCandidate({ promptId: 'code-01', frontierResponse: 'Response one about arrays.' }),
      makeCandidate({ promptId: 'code-02', frontierResponse: 'Response two about maps.' }),
      makeCandidate({ promptId: 'code-03', frontierResponse: 'Response three about sets.' }),
    ];

    vi.doMock('../inference/distill/selector.js', () => ({
      selectDistillCandidates: vi.fn().mockResolvedValue(candidates),
    }));

    // loadExistingHashes calls loadDistillDataset internally in the real code,
    // but since we mock loadExistingHashes directly, loadDistillDataset is only
    // called once at the end by the runner to get datasetSize.
    vi.doMock('../inference/distill/store.js', () => ({
      loadExistingHashes: vi.fn().mockResolvedValue(new Set<string>()),
      loadDistillDataset: vi.fn().mockResolvedValue(['old1', 'new1', 'new2', 'new3']),
      saveDistillDataset: vi.fn().mockResolvedValue('/tmp/distill.jsonl'),
    }));

    vi.doMock('../inference/training-curation.js', () => ({
      computeEntryHash: (line: string) => computeHash(line),
    }));

    const { runDistillation } = await import('../inference/distill/runner.js');
    const summary = await runDistillation('cipher');

    expect(summary.selectedCount).toBe(3);
    expect(summary.duplicateCount).toBe(0);
    expect(summary.datasetSize).toBe(4); // 1 existing + 3 new
    expect(summary.timestamp).toBeTruthy();
  });

  it('warns when dataset size < 5 (below fine-tune.py minimum)', async () => {
    const candidates = [makeCandidate({ promptId: 'code-01' })];

    vi.doMock('../inference/distill/selector.js', () => ({
      selectDistillCandidates: vi.fn().mockResolvedValue(candidates),
    }));

    vi.doMock('../inference/distill/store.js', () => ({
      loadExistingHashes: vi.fn().mockResolvedValue(new Set<string>()),
      loadDistillDataset: vi.fn().mockResolvedValue(['line1']), // 1 line total after save
      saveDistillDataset: vi.fn().mockResolvedValue('/tmp/distill.jsonl'),
    }));

    vi.doMock('../inference/training-curation.js', () => ({
      computeEntryHash: (line: string) => computeHash(line),
    }));

    const { runDistillation } = await import('../inference/distill/runner.js');
    const summary = await runDistillation('cipher');

    expect(summary.warnings.some((w) => w.includes('below minimum'))).toBe(true);
  });

  it('returns empty summary when no candidates selected', async () => {
    setupRunnerMocks({ candidates: [] });

    const { runDistillation } = await import('../inference/distill/runner.js');
    const summary = await runDistillation('cipher');

    expect(summary.selectedCount).toBe(0);
    expect(summary.duplicateCount).toBe(0);
    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(summary.warnings.some((w) => w.includes('No candidates'))).toBe(true);
  });
});

// ============================================================================
// 5. API Route Tests (Fastify inject)
// ============================================================================

describe('distill API routes', () => {
  let server: import('fastify').FastifyInstance | null = null;
  let authToken = '';
  let skipNative = '';

  beforeAll(async () => {
    try {
      const { createServer } = await import('../api/server.js');

      server = await createServer({
        environment: 'development',
        jwtSecret: 'distill-test-secret',
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

  it('POST /distill/run returns summary array', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/distill/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(Array.isArray(body)).toBe(true);
    // Should contain at least one summary for cipher
    if (body.length > 0) {
      expect(body[0].companionId).toBe('cipher');
      expect(typeof body[0].selectedCount).toBe('number');
      expect(typeof body[0].duplicateCount).toBe('number');
      expect(typeof body[0].datasetSize).toBe('number');
      expect(Array.isArray(body[0].warnings)).toBe(true);
      expect(body[0].timestamp).toBeTruthy();
    }
  });

  it('POST /distill/run validates companionId', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/distill/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'nonexistent-companion' },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
  });

  it('POST /distill/run validates qualityThreshold range', async () => {
    if (skip()) return;
    if (!authToken) return;

    // Over 1
    const respHigh = await server!.inject({
      method: 'POST',
      url: '/distill/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { qualityThreshold: 1.5 },
    });
    expect(respHigh.statusCode).toBe(400);
    expect(respHigh.json().error).toContain('qualityThreshold');

    // Under 0
    const respLow = await server!.inject({
      method: 'POST',
      url: '/distill/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { qualityThreshold: -0.1 },
    });
    expect(respLow.statusCode).toBe(400);
    expect(respLow.json().error).toContain('qualityThreshold');
  });

  it('GET /distill/datasets returns dataset list', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/distill/datasets',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.datasets).toBeDefined();
    expect(Array.isArray(body.datasets)).toBe(true);
  });

  it('GET /distill/datasets/:companionId/export returns JSONL', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/distill/datasets/cipher/export',
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Should succeed — returns JSONL (or empty string if no data yet)
    expect(resp.statusCode).toBe(200);
    expect(resp.headers['content-type']).toContain('text/jsonl');
  });

  it('GET /distill/datasets/:companionId/export returns empty for missing companion data', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/distill/datasets/aether/export',
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Valid companion, but no data — should return 200 with empty body
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBe('');
  });
});
