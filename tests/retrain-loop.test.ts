/**
 * Retrain Loop - Comprehensive Tests
 *
 * Tests the full retrain pipeline from readiness gating -> orchestration ->
 * history persistence -> scheduler delegation -> API routes.
 *
 * Structure:
 * 1. checkRetrainReadiness (4 tests)
 * 2. runRetrainLoop (6 tests)
 * 3. History persistence (3 tests)
 * 4. TrainingScheduler (4 tests)
 * 5. API route tests (5 tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import type { DistillRunSummary } from '../inference/distill/types.js';

// ============================================================================
// Helpers
// ============================================================================

/** Create a unique temp directory for each test needing real filesystem. */
function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `retrain-test-${prefix}-`));
}

/** Build a canned DistillRunSummary for mock returns. */
function makeDistillSummary(overrides: Partial<DistillRunSummary> = {}): DistillRunSummary {
  return {
    companionId: 'cipher',
    selectedCount: 3,
    skippedCount: 0,
    duplicateCount: 0,
    datasetSize: 8,
    warnings: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeLoopConfig(prefix: string) {
  return { historyBasePath: makeTmpDir(prefix) };
}

let isolatedTrainingBasePath = '';

beforeEach(() => {
  isolatedTrainingBasePath = makeTmpDir('isolated-training-root');
  process.env.KIN_TRAINING_DATA_DIR = isolatedTrainingBasePath;
});

afterEach(() => {
  delete process.env.KIN_TRAINING_DATA_DIR;
  if (isolatedTrainingBasePath) {
    fs.rmSync(isolatedTrainingBasePath, { recursive: true, force: true });
    isolatedTrainingBasePath = '';
  }
});

// ============================================================================
// 1. checkRetrainReadiness
// ============================================================================

describe('checkRetrainReadiness', () => {
  afterEach(() => {
    vi.doUnmock('../inference/distill/store.js');
    vi.doUnmock('../training/train-companion.js');
    vi.doUnmock('../inference/distill/runner.js');
    vi.doUnmock('../training/modelfile-generator.js');
    vi.resetModules();
  });

  it('returns ready:true when dataset has >=5 entries', async () => {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: vi.fn().mockResolvedValue(['l1', 'l2', 'l3', 'l4', 'l5']),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: vi.fn(),
      validateCompanionId: vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: vi.fn(),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));

    const { checkRetrainReadiness } = await import('../training/retrain-loop.js');
    const result = await checkRetrainReadiness('cipher');

    expect(result.ready).toBe(true);
    expect(result.datasetSize).toBe(5);
    expect(result.reason).toBeUndefined();
  });

  it('returns ready:false with reason when dataset has <5 entries', async () => {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: vi.fn().mockResolvedValue(['l1', 'l2']),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: vi.fn(),
      validateCompanionId: vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: vi.fn(),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));

    const { checkRetrainReadiness } = await import('../training/retrain-loop.js');
    const result = await checkRetrainReadiness('cipher');

    expect(result.ready).toBe(false);
    expect(result.datasetSize).toBe(2);
    expect(result.reason).toContain('need at least 5');
  });

  it('returns ready:false when distill file does not exist (0 entries)', async () => {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: vi.fn().mockResolvedValue([]),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: vi.fn(),
      validateCompanionId: vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: vi.fn(),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));

    const { checkRetrainReadiness } = await import('../training/retrain-loop.js');
    const result = await checkRetrainReadiness('cipher');

    expect(result.ready).toBe(false);
    expect(result.datasetSize).toBe(0);
    expect(result.reason).toBeTruthy();
  });

  it('returns correct dataPath pointing to distill JSONL', async () => {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: vi.fn().mockResolvedValue(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: vi.fn(),
      validateCompanionId: vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: vi.fn(),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));

    const { checkRetrainReadiness } = await import('../training/retrain-loop.js');
    const result = await checkRetrainReadiness('forge');

    // dataPath should point to distill JSONL, not training.jsonl
    expect(result.dataPath).toContain(path.join('distill', 'forge', 'distill.jsonl'));
    expect(result.dataPath).not.toContain('training.jsonl');
  });
});

// ============================================================================
// 2. runRetrainLoop
// ============================================================================

describe('runRetrainLoop', () => {
  afterEach(() => {
    vi.doUnmock('../inference/distill/store.js');
    vi.doUnmock('../training/train-companion.js');
    vi.doUnmock('../inference/distill/runner.js');
    vi.doUnmock('../training/modelfile-generator.js');
    vi.resetModules();
  });

  /** Standard mocks that satisfy all imports for retrain-loop.ts */
  function setupMocks(overrides: {
    loadDistillDataset?: (...args: unknown[]) => Promise<string[]>;
    runPipeline?: (...args: unknown[]) => Promise<void>;
    validateCompanionId?: (id: string) => void;
    runDistillation?: (...args: unknown[]) => Promise<DistillRunSummary>;
  } = {}) {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: overrides.loadDistillDataset ?? vi.fn().mockResolvedValue(['l1', 'l2', 'l3', 'l4', 'l5', 'l6']),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: overrides.runPipeline ?? vi.fn().mockResolvedValue(undefined),
      validateCompanionId: overrides.validateCompanionId ?? vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: overrides.runDistillation ?? vi.fn().mockResolvedValue(makeDistillSummary()),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));
  }

  it('runs distillation first when runDistillFirst is true', async () => {
    const mockDistill = vi.fn().mockResolvedValue(makeDistillSummary());
    setupMocks({ runDistillation: mockDistill });
    const config = makeLoopConfig('distill-first');

    const { runRetrainLoop } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', { ...config, runDistillFirst: true });

    expect(mockDistill).toHaveBeenCalledOnce();
    expect(result.distillSummary).toBeTruthy();
    expect(result.distillSummary?.companionId).toBe('cipher');

    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });

  it('skips distillation when runDistillFirst is false/unset', async () => {
    const mockDistill = vi.fn().mockResolvedValue(makeDistillSummary());
    setupMocks({ runDistillation: mockDistill });
    const config = makeLoopConfig('skip-distill');

    const { runRetrainLoop } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', config);

    expect(mockDistill).not.toHaveBeenCalled();
    expect(result.distillSummary).toBeUndefined();

    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });

  it('returns error result when readiness check fails (not enough data)', async () => {
    setupMocks({
      loadDistillDataset: vi.fn().mockResolvedValue(['l1', 'l2']), // only 2 < 5
    });
    const config = makeLoopConfig('not-ready');

    const { runRetrainLoop } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', config);

    expect(result.success).toBe(false);
    expect(result.trainingError).toContain('need at least');
    expect(result.datasetSize).toBe(2);

    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });

  it('calls runPipeline with distill JSONL dataPath (not training.jsonl)', async () => {
    const mockPipeline = vi.fn().mockResolvedValue(undefined);
    setupMocks({ runPipeline: mockPipeline });
    const config = makeLoopConfig('pipeline-args');

    const { runRetrainLoop } = await import('../training/retrain-loop.js');
    await runRetrainLoop('cipher', config);

    expect(mockPipeline).toHaveBeenCalledOnce();
    const args = mockPipeline.mock.calls[0][0];
    expect(args.dataPath).toContain(path.join('distill', 'cipher', 'distill.jsonl'));
    expect(args.dataPath).not.toContain('training.jsonl');
    expect(args.companionId).toBe('cipher');

    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });

  it('falls back to training.jsonl when distill data is unavailable but curated training data exists', async () => {
    const trainingBasePath = makeTmpDir('training-fallback');
    const historyBasePath = makeTmpDir('training-fallback-history');
    const companionDir = path.join(trainingBasePath, 'cipher');
    fs.mkdirSync(companionDir, { recursive: true });

    const trainingLines = Array.from({ length: 6 }, (_, index) =>
      JSON.stringify({
        messages: [
          { role: 'system', content: 'You are Cipher.' },
          { role: 'user', content: `Prompt ${index}` },
          { role: 'assistant', content: `Answer ${index}` },
        ],
      }),
    ).join('\n');
    fs.writeFileSync(path.join(companionDir, 'training.jsonl'), `${trainingLines}\n`, 'utf-8');

    const mockPipeline = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      loadDistillDataset: vi.fn().mockResolvedValue([]),
      runPipeline: mockPipeline,
    });

    const { runRetrainLoop } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', {
      historyBasePath,
      trainingBasePath,
    });

    expect(result.success).toBe(true);
    expect(result.datasetSize).toBe(6);
    expect(mockPipeline).toHaveBeenCalledOnce();
    const args = mockPipeline.mock.calls[0][0];
    expect(args.dataPath).toBe(path.join(trainingBasePath, 'cipher', 'training.jsonl'));

    fs.rmSync(trainingBasePath, { recursive: true, force: true });
    fs.rmSync(historyBasePath, { recursive: true, force: true });
  });
  it('saves history entry on success', async () => {
    const config = makeLoopConfig('success-hist');
    setupMocks();
    const { runRetrainLoop, loadRetrainHistory } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', config);

    expect(result.success).toBe(true);
    expect(result.companionId).toBe('cipher');
    expect(result.modelName).toBe('kin-cipher');
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
    const history = await loadRetrainHistory('cipher', config.historyBasePath);
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(true);

    // Clean up
    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });

  it('saves history entry on pipeline failure', async () => {
    setupMocks({
      runPipeline: vi.fn().mockRejectedValue(new Error('Python crash')),
    });
    const config = makeLoopConfig('pipeline-failure');

    const { runRetrainLoop, loadRetrainHistory } = await import('../training/retrain-loop.js');
    const result = await runRetrainLoop('cipher', config);

    expect(result.success).toBe(false);
    expect(result.trainingError).toBe('Python crash');
    expect(result.companionId).toBe('cipher');
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
    const history = await loadRetrainHistory('cipher', config.historyBasePath);
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(false);

    fs.rmSync(config.historyBasePath, { recursive: true, force: true });
  });
});

// ============================================================================
// 3. History Persistence
// ============================================================================

describe('history persistence', () => {
  afterEach(() => {
    vi.doUnmock('../inference/distill/store.js');
    vi.doUnmock('../training/train-companion.js');
    vi.doUnmock('../inference/distill/runner.js');
    vi.doUnmock('../training/modelfile-generator.js');
    vi.resetModules();
  });

  function setupBasicMocks() {
    vi.doMock('../inference/distill/store.js', () => ({
      loadDistillDataset: vi.fn().mockResolvedValue([]),
      saveDistillDataset: vi.fn(),
      loadExistingHashes: vi.fn(),
    }));
    vi.doMock('../training/train-companion.js', () => ({
      runPipeline: vi.fn(),
      validateCompanionId: vi.fn(),
    }));
    vi.doMock('../inference/distill/runner.js', () => ({
      runDistillation: vi.fn(),
    }));
    vi.doMock('../training/modelfile-generator.js', () => ({
      getModelName: vi.fn().mockReturnValue('kin-cipher'),
    }));
  }

  it('loadRetrainHistory returns empty array when no history file', async () => {
    setupBasicMocks();
    const { loadRetrainHistory } = await import('../training/retrain-loop.js');
    const tmpDir = makeTmpDir('no-history');

    const entries = await loadRetrainHistory('cipher', tmpDir);
    expect(entries).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveRetrainHistory + loadRetrainHistory round-trip', async () => {
    setupBasicMocks();
    const { saveRetrainHistory, loadRetrainHistory } = await import('../training/retrain-loop.js');
    const tmpDir = makeTmpDir('roundtrip');

    const result = {
      success: true,
      companionId: 'cipher',
      datasetSize: 10,
      startedAt: '2025-01-01T00:00:00Z',
      completedAt: '2025-01-01T00:05:00Z',
      modelName: 'kin-cipher',
    };

    await saveRetrainHistory(result, 'cipher', tmpDir);
    const entries = await loadRetrainHistory('cipher', tmpDir);

    expect(entries).toHaveLength(1);
    expect(entries[0].success).toBe(true);
    expect(entries[0].companionId).toBe('cipher');
    expect(entries[0].datasetSize).toBe(10);
    expect(entries[0].id).toBeTruthy(); // content-hash ID
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id.length).toBe(64); // SHA-256 hex

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveRetrainHistory honors KIN_RETRAIN_HISTORY_DIR when no explicit basePath is provided', async () => {
    setupBasicMocks();
    const { saveRetrainHistory, loadRetrainHistory } = await import('../training/retrain-loop.js');
    const tmpDir = makeTmpDir('env-history');
    const previousHistoryDir = process.env.KIN_RETRAIN_HISTORY_DIR;

    process.env.KIN_RETRAIN_HISTORY_DIR = tmpDir;

    const result = {
      success: true,
      companionId: 'cipher',
      datasetSize: 7,
      startedAt: '2025-01-04T00:00:00Z',
      completedAt: '2025-01-04T00:01:00Z',
      modelName: 'kin-cipher',
    };

    try {
      await saveRetrainHistory(result, 'cipher');
      const entries = await loadRetrainHistory('cipher');

      expect(entries).toHaveLength(1);
      expect(entries[0].datasetSize).toBe(7);
      expect(fs.existsSync(path.join(tmpDir, 'cipher', 'history.jsonl'))).toBe(true);
    } finally {
      if (previousHistoryDir === undefined) {
        delete process.env.KIN_RETRAIN_HISTORY_DIR;
      } else {
        process.env.KIN_RETRAIN_HISTORY_DIR = previousHistoryDir;
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('multiple saves append correctly', async () => {
    setupBasicMocks();
    const { saveRetrainHistory, loadRetrainHistory } = await import('../training/retrain-loop.js');
    const tmpDir = makeTmpDir('multi-append');

    const result1 = {
      success: true,
      companionId: 'cipher',
      datasetSize: 10,
      startedAt: '2025-01-01T00:00:00Z',
      completedAt: '2025-01-01T00:05:00Z',
    };
    const result2 = {
      success: false,
      companionId: 'cipher',
      datasetSize: 3,
      trainingError: 'Out of memory',
      startedAt: '2025-01-02T00:00:00Z',
      completedAt: '2025-01-02T00:01:00Z',
    };
    const result3 = {
      success: true,
      companionId: 'cipher',
      datasetSize: 15,
      startedAt: '2025-01-03T00:00:00Z',
      completedAt: '2025-01-03T00:10:00Z',
      modelName: 'kin-cipher',
    };

    await saveRetrainHistory(result1, 'cipher', tmpDir);
    await saveRetrainHistory(result2, 'cipher', tmpDir);
    await saveRetrainHistory(result3, 'cipher', tmpDir);

    const entries = await loadRetrainHistory('cipher', tmpDir);

    expect(entries).toHaveLength(3);
    expect(entries[0].success).toBe(true);
    expect(entries[0].datasetSize).toBe(10);
    expect(entries[1].success).toBe(false);
    expect(entries[1].trainingError).toBe('Out of memory');
    expect(entries[2].success).toBe(true);
    expect(entries[2].datasetSize).toBe(15);

    // Each entry should have a unique content-hash ID
    const ids = entries.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ============================================================================
// 4. TrainingScheduler
// ============================================================================

describe('TrainingScheduler', () => {
  afterEach(() => {
    vi.doUnmock('../inference/distill/store.js');
    vi.doUnmock('../training/train-companion.js');
    vi.doUnmock('../inference/distill/runner.js');
    vi.doUnmock('../training/modelfile-generator.js');
    vi.doUnmock('../training/retrain-loop.js');
    vi.resetModules();
  });

  function setupSchedulerMocks(overrides: {
    runRetrainLoop?: (...args: unknown[]) => Promise<unknown>;
    checkRetrainReadiness?: (...args: unknown[]) => Promise<unknown>;
    loadRetrainHistory?: (...args: unknown[]) => Promise<unknown>;
  } = {}) {
    vi.doMock('../training/retrain-loop.js', () => ({
      runRetrainLoop: overrides.runRetrainLoop ?? vi.fn().mockResolvedValue({
        success: true,
        companionId: 'cipher',
        datasetSize: 10,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        modelName: 'kin-cipher',
      }),
      checkRetrainReadiness: overrides.checkRetrainReadiness ?? vi.fn().mockResolvedValue({
        ready: true,
        datasetSize: 10,
        dataPath: 'data/distill/cipher/distill.jsonl',
      }),
      loadRetrainHistory: overrides.loadRetrainHistory ?? vi.fn().mockResolvedValue([]),
    }));
  }

  it('scheduleJob creates a job and calls runRetrainLoop', async () => {
    const mockRetrain = vi.fn().mockResolvedValue({
      success: true,
      companionId: 'cipher',
      datasetSize: 10,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modelName: 'kin-cipher',
    });
    setupSchedulerMocks({ runRetrainLoop: mockRetrain });

    const { getTrainingScheduler, resetTrainingScheduler } = await import('../training/scheduler.js');
    const scheduler = getTrainingScheduler();

    const jobId = await scheduler.scheduleJob('cipher');
    expect(jobId).toBeTruthy();
    expect(typeof jobId).toBe('string');
    expect(jobId).toContain('cipher');

    // Wait a tick for the async fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRetrain).toHaveBeenCalledWith('cipher', expect.objectContaining({
      baseModel: expect.any(String),
    }));

    resetTrainingScheduler();
  });

  it('triggerRetrain with companionId retrains single companion', async () => {
    const mockRetrain = vi.fn().mockResolvedValue({
      success: true,
      companionId: 'forge',
      datasetSize: 7,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modelName: 'kin-forge',
    });
    setupSchedulerMocks({ runRetrainLoop: mockRetrain });

    const { getTrainingScheduler, resetTrainingScheduler } = await import('../training/scheduler.js');
    const scheduler = getTrainingScheduler();

    const jobIds = await scheduler.triggerRetrain('forge');
    expect(jobIds).toHaveLength(1);

    // Wait for async execution
    await new Promise((r) => setTimeout(r, 50));

    // Should have been called once for 'forge'
    expect(mockRetrain).toHaveBeenCalledWith('forge', expect.any(Object));

    resetTrainingScheduler();
  });

  it('triggerRetrain without companionId retrains all 6 companions', async () => {
    const mockRetrain = vi.fn().mockResolvedValue({
      success: true,
      companionId: 'any',
      datasetSize: 10,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modelName: 'kin-any',
    });
    setupSchedulerMocks({ runRetrainLoop: mockRetrain });

    const { getTrainingScheduler, resetTrainingScheduler } = await import('../training/scheduler.js');
    const scheduler = getTrainingScheduler();

    const jobIds = await scheduler.triggerRetrain();
    expect(jobIds).toHaveLength(6);

    // Wait for async execution
    await new Promise((r) => setTimeout(r, 200));

    // Should have been called once per companion
    expect(mockRetrain).toHaveBeenCalledTimes(6);

    const calledCompanions = mockRetrain.mock.calls.map((c: unknown[]) => c[0]);
    expect(calledCompanions).toContain('cipher');
    expect(calledCompanions).toContain('mischief');
    expect(calledCompanions).toContain('vortex');
    expect(calledCompanions).toContain('forge');
    expect(calledCompanions).toContain('aether');
    expect(calledCompanions).toContain('catalyst');

    resetTrainingScheduler();
  });

  it('destroy clears all intervals', async () => {
    setupSchedulerMocks();

    const { getTrainingScheduler, resetTrainingScheduler } = await import('../training/scheduler.js');
    const scheduler = getTrainingScheduler();

    let callCount = 0;
    scheduler.scheduleInterval('test-interval', 50, () => { callCount++; });

    // Let the interval fire once
    await new Promise((r) => setTimeout(r, 80));
    const countAfterInterval = callCount;
    expect(countAfterInterval).toBeGreaterThan(0);

    scheduler.destroy();

    // After destroy, interval should stop
    await new Promise((r) => setTimeout(r, 100));
    expect(callCount).toBe(countAfterInterval);

    expect(scheduler.getSchedules()).toEqual([]);

    resetTrainingScheduler();
  });
});

// ============================================================================
// 5. API Route Tests (Fastify inject)
// ============================================================================

describe('retrain API routes', () => {
  let server: import('fastify').FastifyInstance | null = null;
  let authToken = '';
  let skipNative = '';
  let retrainHistoryDir = '';
  let previousHistoryDir: string | undefined;

  async function waitForRetrainJobsToSettle(timeoutMs = 5000): Promise<void> {
    const { getTrainingScheduler } = await import('../training/scheduler.js');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const activeJobs = getTrainingScheduler()
        .listJobs()
        .filter((job) => job.status === 'pending' || job.status === 'running');

      if (activeJobs.length === 0) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Timed out waiting for retrain jobs to settle');
  }

  beforeAll(async () => {
    retrainHistoryDir = makeTmpDir('api-history');
    previousHistoryDir = process.env.KIN_RETRAIN_HISTORY_DIR;
    process.env.KIN_RETRAIN_HISTORY_DIR = retrainHistoryDir;

    try {
      const { createServer } = await import('../api/server.js');

      server = await createServer({
        environment: 'development',
        jwtSecret: 'retrain-test-secret',
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
    await waitForRetrainJobsToSettle();
    if (previousHistoryDir === undefined) {
      delete process.env.KIN_RETRAIN_HISTORY_DIR;
    } else {
      process.env.KIN_RETRAIN_HISTORY_DIR = previousHistoryDir;
    }
    if (retrainHistoryDir) {
      fs.rmSync(retrainHistoryDir, { recursive: true, force: true });
    }
  });

  function skip(): boolean {
    if (skipNative) {
      console.log(`[SKIP] ${skipNative}`);
      return true;
    }
    return false;
  }

  it('POST /retrain/run validates companionId (400 for invalid)', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/retrain/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'invalid-companion-xyz' },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
  });

  it('POST /retrain/run returns results for valid companion', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'POST',
      url: '/retrain/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { companionId: 'cipher' },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.jobIds).toBeTruthy();
    expect(Array.isArray(body.jobIds)).toBe(true);
    expect(body.jobIds.length).toBeGreaterThan(0);
    expect(body.jobs).toBeTruthy();
    expect(body.jobs[0].companionId).toBe('cipher');

    await waitForRetrainJobsToSettle();
  });

  it('GET /retrain/status/:companionId returns readiness and lastRun', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/retrain/status/cipher',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.readiness).toBeTruthy();
    expect(typeof body.readiness.ready).toBe('boolean');
    expect(typeof body.readiness.datasetSize).toBe('number');
    expect(body.readiness.dataPath).toBeTruthy();
    // lastRun may be null if no history yet
    expect(body).toHaveProperty('lastRun');
  });

  it('GET /retrain/history/:companionId returns history array', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/retrain/history/cipher',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(200);
    const body = resp.json();
    expect(body.history).toBeTruthy();
    expect(Array.isArray(body.history)).toBe(true);
  });

  it('GET /retrain/history/:companionId with invalid ID returns 400', async () => {
    if (skip()) return;
    if (!authToken) return;

    const resp = await server!.inject({
      method: 'GET',
      url: '/retrain/history/not-a-real-companion',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(resp.statusCode).toBe(400);
    const body = resp.json();
    expect(body.error).toContain('Invalid companionId');
  });
});
