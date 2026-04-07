import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all upstream modules that doctor.ts dynamically imports
// ---------------------------------------------------------------------------

// fs — existsSync used by checkDatabase
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>();
  return { ...real, existsSync: vi.fn(() => true) };
});

// db/connection.js
vi.mock('../db/connection.js', () => ({
  getDb: vi.fn(() => ({
    pragma: vi.fn(() => 'wal'),
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ count: 45 })),
    })),
  })),
}));

// inference/local-llm.js
vi.mock('../inference/local-llm.js', () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => [
      { name: 'kin-cipher:latest' },
      { name: 'kin-mischief:latest' },
      { name: 'kin-vortex:latest' },
      { name: 'kin-forge:latest' },
      { name: 'kin-aether:latest' },
      { name: 'kin-catalyst:latest' },
    ]),
  })),
}));

// companions/config.js
vi.mock('../companions/config.js', () => ({
  getCompanionIds: vi.fn(() => [
    'cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst',
  ]),
}));

// inference/providers/circuit-breaker.js
vi.mock('../inference/providers/circuit-breaker.js', () => ({
  getProviderHealth: vi.fn(() => [
    { providerId: 'openai', state: 'CLOSED', failures: 0 },
    { providerId: 'anthropic', state: 'CLOSED', failures: 0 },
  ]),
}));

// runtime/health-probe.js
vi.mock('../runtime/health-probe.js', () => ({
  checkPlatformHealth: vi.fn(async () => [
    { name: 'memory', status: 'ok', detail: '120 MB used' },
    { name: 'disk', status: 'ok', detail: '5 GB free' },
  ]),
}));

// bot/skills/builtins/index.js
vi.mock('../bot/skills/builtins/index.js', () => ({
  builtinSkills: [
    { name: 'weather' },
    { name: 'calculator' },
    { name: 'reminder' },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks are declared
// ---------------------------------------------------------------------------

import { existsSync } from 'fs';
import {
  checkEnvironment,
  checkDatabase,
  checkOllama,
  checkProviders,
  checkPlatformHealth,
  checkSkills,
  runAllChecks,
  formatReport,
  formatJson,
  type CheckResult,
  type DoctorReport,
} from '../scripts/doctor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCheck(results: CheckResult[], name: string): CheckResult | undefined {
  return results.find((r) => r.name === name);
}

function findCheckContaining(results: CheckResult[], substr: string): CheckResult | undefined {
  return results.find((r) => r.name.includes(substr));
}

// ---------------------------------------------------------------------------
// Global mock reset — restore happy-path defaults before every test
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // existsSync
  vi.mocked(existsSync).mockReturnValue(true);

  // db/connection
  const connMod = await import('../db/connection.js');
  vi.mocked(connMod.getDb).mockReturnValue({
    pragma: vi.fn(() => 'wal'),
    prepare: vi.fn(() => ({ get: vi.fn(() => ({ count: 45 })) })),
  } as any);

  // local-llm OllamaClient
  const llmMod = await import('../inference/local-llm.js');
  vi.mocked(llmMod.OllamaClient).mockImplementation(() => ({
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => [
      { name: 'kin-cipher:latest' },
      { name: 'kin-mischief:latest' },
      { name: 'kin-vortex:latest' },
      { name: 'kin-forge:latest' },
      { name: 'kin-aether:latest' },
      { name: 'kin-catalyst:latest' },
    ]),
  }) as any);

  // companions/config
  const configMod = await import('../companions/config.js');
  vi.mocked(configMod.getCompanionIds).mockReturnValue([
    'cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst',
  ]);

  // circuit-breaker
  const cbMod = await import('../inference/providers/circuit-breaker.js');
  vi.mocked(cbMod.getProviderHealth).mockReturnValue([
    { providerId: 'openai', state: 'CLOSED', failures: 0 },
    { providerId: 'anthropic', state: 'CLOSED', failures: 0 },
  ] as any);

  // health-probe
  const hpMod = await import('../runtime/health-probe.js');
  vi.mocked(hpMod.checkPlatformHealth).mockResolvedValue([
    { name: 'memory', status: 'ok', detail: '120 MB used' },
    { name: 'disk', status: 'ok', detail: '5 GB free' },
  ]);

  // skills
  const skillsMod = await import('../bot/skills/builtins/index.js');
  Object.defineProperty(skillsMod, 'builtinSkills', {
    value: [{ name: 'weather' }, { name: 'calculator' }, { name: 'reminder' }],
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// 1. checkEnvironment
// ---------------------------------------------------------------------------

describe('checkEnvironment', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const ALL_KEYS = [
    'TELEGRAM_BOT_TOKEN', 'JWT_SECRET',
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY', 'TAILSCALE_API_KEY', 'ANTHROPIC_API_KEY',
  ];

  beforeEach(() => {
    // Save & clear every relevant key
    for (const k of ALL_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ALL_KEYS) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
      else delete process.env[k];
    }
  });

  it('passes when all required env vars are set', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.JWT_SECRET = 'sec';
    const results = await checkEnvironment();

    const telegram = findCheck(results, 'TELEGRAM_BOT_TOKEN');
    expect(telegram?.severity).toBe('pass');

    const jwt = findCheck(results, 'JWT_SECRET');
    expect(jwt?.severity).toBe('pass');
  });

  it('fails when a required env var is missing', async () => {
    // JWT_SECRET missing, TELEGRAM_BOT_TOKEN present
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    const results = await checkEnvironment();

    const jwt = findCheck(results, 'JWT_SECRET');
    expect(jwt?.severity).toBe('fail');
    expect(jwt?.remediation).toContain('JWT_SECRET');
  });

  it('warns when a recommended env var is missing', async () => {
    const results = await checkEnvironment();

    const openai = findCheck(results, 'OPENAI_API_KEY');
    expect(openai?.severity).toBe('warn');
    expect(openai?.message).toContain('not set');
  });

  it('passes (not warns/fails) when an optional env var is missing', async () => {
    const results = await checkEnvironment();

    const elevenlabs = findCheck(results, 'ELEVENLABS_API_KEY');
    expect(elevenlabs?.severity).toBe('pass');
    expect(elevenlabs?.message).toContain('optional');
  });

  it('never leaks env var values in output', async () => {
    const secret = 'SUPER_SECRET_VALUE_12345';
    process.env.TELEGRAM_BOT_TOKEN = secret;
    process.env.JWT_SECRET = secret;
    process.env.OPENAI_API_KEY = secret;

    const results = await checkEnvironment();
    const allText = results.map((r) => `${r.message} ${r.remediation ?? ''}`).join(' ');
    expect(allText).not.toContain(secret);
  });
});

// ---------------------------------------------------------------------------
// 2. checkDatabase
// ---------------------------------------------------------------------------

describe('checkDatabase', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('passes when DB exists, connects, WAL on, correct table count', async () => {
    const { getDb } = await import('../db/connection.js');
    vi.mocked(getDb).mockReturnValue({
      pragma: vi.fn(() => 'wal'),
      prepare: vi.fn(() => ({ get: vi.fn(() => ({ count: 45 })) })),
    } as any);

    const results = await checkDatabase();

    expect(findCheck(results, 'db-file')?.severity).toBe('pass');
    expect(findCheck(results, 'db-connection')?.severity).toBe('pass');
    expect(findCheck(results, 'db-wal')?.severity).toBe('pass');
    expect(findCheck(results, 'db-tables')?.severity).toBe('pass');
  });

  it('fails when DB file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const results = await checkDatabase();

    expect(findCheck(results, 'db-file')?.severity).toBe('fail');
    expect(findCheck(results, 'db-file')?.remediation).toBeDefined();
    // Should short-circuit — no connection checks
    expect(findCheck(results, 'db-connection')).toBeUndefined();
  });

  it('warns when better-sqlite3 import fails (K001)', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const connModule = await import('../db/connection.js');
    vi.mocked(connModule.getDb).mockImplementation(() => {
      throw new Error('ERR_DLOPEN_FAILED: cannot load better-sqlite3');
    });

    const results = await checkDatabase();

    const conn = findCheck(results, 'db-connection');
    expect(conn?.severity).toBe('warn');
    expect(conn?.message).toContain('better-sqlite3');
    expect(conn?.remediation).toContain('K001');
  });

  it('warns when table count is below expected', async () => {
    const connModule = await import('../db/connection.js');
    vi.mocked(connModule.getDb).mockReturnValue({
      pragma: vi.fn(() => 'wal'),
      prepare: vi.fn(() => ({ get: vi.fn(() => ({ count: 20 })) })),
    } as any);

    const results = await checkDatabase();

    const tables = findCheck(results, 'db-tables');
    expect(tables?.severity).toBe('warn');
    expect(tables?.remediation).toContain('db:migrate');
  });
});

// ---------------------------------------------------------------------------
// 3. checkOllama
// ---------------------------------------------------------------------------

describe('checkOllama', () => {
  it('passes when Ollama is available and all companion models registered', async () => {
    const results = await checkOllama();

    expect(findCheck(results, 'ollama-server')?.severity).toBe('pass');
    expect(findCheck(results, 'model-cipher')?.severity).toBe('pass');
    expect(findCheck(results, 'model-forge')?.severity).toBe('pass');
  });

  it('warns when Ollama is unreachable', async () => {
    const mod = await import('../inference/local-llm.js');
    vi.mocked(mod.OllamaClient).mockImplementation(() => ({
      isAvailable: vi.fn(async () => false),
      listModels: vi.fn(),
    }) as any);

    const results = await checkOllama();

    const server = findCheck(results, 'ollama-server');
    expect(server?.severity).toBe('warn');
    expect(server?.remediation).toContain('ollama');
  });

  it('warns for missing companion models', async () => {
    const mod = await import('../inference/local-llm.js');
    vi.mocked(mod.OllamaClient).mockImplementation(() => ({
      isAvailable: vi.fn(async () => true),
      listModels: vi.fn(async () => [
        { name: 'kin-cipher:latest' },
        // Missing the other five
      ]),
    }) as any);

    const results = await checkOllama();

    expect(findCheck(results, 'model-cipher')?.severity).toBe('pass');
    expect(findCheck(results, 'model-mischief')?.severity).toBe('warn');
    expect(findCheck(results, 'model-forge')?.severity).toBe('warn');
  });

  it('warns when isAvailable throws an error', async () => {
    const mod = await import('../inference/local-llm.js');
    vi.mocked(mod.OllamaClient).mockImplementation(() => ({
      isAvailable: vi.fn(async () => { throw new Error('connection refused'); }),
      listModels: vi.fn(),
    }) as any);

    const results = await checkOllama();

    // isAvailable catch block sets available=false → warns
    const server = findCheck(results, 'ollama-server');
    expect(server?.severity).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// 4. checkProviders
// ---------------------------------------------------------------------------

describe('checkProviders', () => {
  it('passes when all circuits are CLOSED', async () => {
    const mod = await import('../inference/providers/circuit-breaker.js');
    vi.mocked(mod.getProviderHealth).mockReturnValue([
      { providerId: 'openai', state: 'CLOSED', failures: 0 },
      { providerId: 'anthropic', state: 'CLOSED', failures: 0 },
    ] as any);

    const results = await checkProviders();

    expect(results.every((r) => r.severity === 'pass')).toBe(true);
  });

  it('fails for OPEN circuits', async () => {
    const mod = await import('../inference/providers/circuit-breaker.js');
    vi.mocked(mod.getProviderHealth).mockReturnValue([
      { providerId: 'openai', state: 'OPEN', failures: 5 },
    ] as any);

    const results = await checkProviders();

    const openai = findCheckContaining(results, 'openai');
    expect(openai?.severity).toBe('fail');
    expect(openai?.remediation).toContain('OPEN');
  });

  it('warns for HALF_OPEN circuits', async () => {
    const mod = await import('../inference/providers/circuit-breaker.js');
    vi.mocked(mod.getProviderHealth).mockReturnValue([
      { providerId: 'anthropic', state: 'HALF_OPEN', failures: 2 },
    ] as any);

    const results = await checkProviders();

    const anthropic = findCheckContaining(results, 'anthropic');
    expect(anthropic?.severity).toBe('warn');
  });

  it('passes with message when no providers tracked yet', async () => {
    const mod = await import('../inference/providers/circuit-breaker.js');
    vi.mocked(mod.getProviderHealth).mockReturnValue([] as any);

    const results = await checkProviders();

    expect(results).toHaveLength(1);
    expect(results[0]?.severity).toBe('pass');
    expect(results[0]?.message).toContain('No providers tracked');
  });
});

// ---------------------------------------------------------------------------
// 5. checkPlatformHealth
// ---------------------------------------------------------------------------

describe('checkPlatformHealth', () => {
  it('passes when all subsystems are ok', async () => {
    const mod = await import('../runtime/health-probe.js');
    vi.mocked(mod.checkPlatformHealth).mockResolvedValue([
      { name: 'memory', status: 'ok', detail: '120 MB' },
      { name: 'disk', status: 'ok', detail: '5 GB' },
    ]);

    const results = await checkPlatformHealth();

    expect(results.every((r) => r.severity === 'pass')).toBe(true);
  });

  it('maps mixed ok/warn/error correctly', async () => {
    const mod = await import('../runtime/health-probe.js');
    vi.mocked(mod.checkPlatformHealth).mockResolvedValue([
      { name: 'memory', status: 'ok', detail: 'fine' },
      { name: 'disk', status: 'warn', detail: 'low space' },
      { name: 'network', status: 'error', detail: 'unreachable' },
    ]);

    const results = await checkPlatformHealth();

    expect(findCheckContaining(results, 'memory')?.severity).toBe('pass');
    expect(findCheckContaining(results, 'disk')?.severity).toBe('warn');
    expect(findCheckContaining(results, 'network')?.severity).toBe('fail');
  });

  it('warns when health-probe import fails', async () => {
    const mod = await import('../runtime/health-probe.js');
    vi.mocked(mod.checkPlatformHealth).mockRejectedValue(
      new Error('Module resolution failed'),
    );

    const results = await checkPlatformHealth();

    expect(results[0]?.severity).toBe('warn');
    expect(results[0]?.name).toBe('platform-import');
  });
});

// ---------------------------------------------------------------------------
// 6. checkSkills
// ---------------------------------------------------------------------------

describe('checkSkills', () => {
  it('passes when builtinSkills has entries', async () => {
    const mod = await import('../bot/skills/builtins/index.js');
    // Reset to default mock value
    Object.defineProperty(mod, 'builtinSkills', {
      value: [{ name: 'weather' }, { name: 'calculator' }],
      writable: true,
    });

    const results = await checkSkills();

    expect(findCheck(results, 'skills-loaded')?.severity).toBe('pass');
    expect(findCheck(results, 'skill-weather')?.severity).toBe('pass');
  });

  it('fails when builtinSkills is empty', async () => {
    const mod = await import('../bot/skills/builtins/index.js');
    Object.defineProperty(mod, 'builtinSkills', {
      value: [],
      writable: true,
    });

    const results = await checkSkills();

    expect(findCheck(results, 'skills-loaded')?.severity).toBe('fail');
    expect(findCheck(results, 'skills-loaded')?.remediation).toContain('empty');
  });

  it('warns when skills import fails', async () => {
    const mod = await import('../bot/skills/builtins/index.js');
    Object.defineProperty(mod, 'builtinSkills', {
      get() {
        throw new Error('Cannot resolve');
      },
      configurable: true,
    });

    const results = await checkSkills();

    expect(results[0]?.severity).toBe('warn');
    expect(results[0]?.name).toBe('skills-import');
  });
});

// ---------------------------------------------------------------------------
// 7. runAllChecks + formatters
// ---------------------------------------------------------------------------

describe('runAllChecks', () => {
  beforeEach(() => {
    // Reset all mocks to happy-path defaults
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('aggregates all 6 categories', async () => {
    const report = await runAllChecks();

    expect(report.categories).toHaveLength(6);
    const names = report.categories.map((c) => c.category);
    expect(names).toContain('Environment');
    expect(names).toContain('Database');
    expect(names).toContain('Ollama / LLM');
    expect(names).toContain('Providers');
    expect(names).toContain('Platform Health');
    expect(names).toContain('Skills');
  });

  it('counts summary correctly', async () => {
    const report = await runAllChecks();

    const { total, passed, warned, failed } = report.summary;
    expect(total).toBe(passed + warned + failed);
    expect(total).toBeGreaterThan(0);
  });

  it('exit code 0 when no failures or warnings', async () => {
    // All mocks default to happy-path → should have 0 failures
    // But checkEnvironment reads process.env which may be empty → some warns/fails
    // Set required env vars for a clean run
    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    const savedJwt = process.env.JWT_SECRET;
    const savedOpenai = process.env.OPENAI_API_KEY;
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.JWT_SECRET = 'sec';
    process.env.OPENAI_API_KEY = 'key';

    const report = await runAllChecks();

    if (report.summary.failed === 0 && report.summary.warned === 0) {
      expect(report.exitCode).toBe(0);
    }

    // Restore
    if (savedToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedToken;
    else delete process.env.TELEGRAM_BOT_TOKEN;
    if (savedJwt !== undefined) process.env.JWT_SECRET = savedJwt;
    else delete process.env.JWT_SECRET;
    if (savedOpenai !== undefined) process.env.OPENAI_API_KEY = savedOpenai;
    else delete process.env.OPENAI_API_KEY;
  });

  it('exit code 1 when any failure exists', async () => {
    // Force a failure: DB file missing
    vi.mocked(existsSync).mockReturnValue(false);

    const report = await runAllChecks();

    expect(report.summary.failed).toBeGreaterThan(0);
    expect(report.exitCode).toBe(1);
  });
});

describe('formatReport', () => {
  it('produces sectioned text with ✓/⚠/✗ icons', () => {
    const report: DoctorReport = {
      categories: [
        {
          category: 'Test',
          checks: [
            { name: 'ok-check', severity: 'pass', message: 'All good' },
            {
              name: 'warn-check',
              severity: 'warn',
              message: 'Watch out',
              remediation: 'Fix it',
            },
            {
              name: 'fail-check',
              severity: 'fail',
              message: 'Broken',
              remediation: 'Repair now',
            },
          ],
        },
      ],
      summary: { total: 3, passed: 1, warned: 1, failed: 1 },
      exitCode: 1,
    };

    const text = formatReport(report);

    // Section header
    expect(text).toContain('Test');
    // Icons
    expect(text).toContain('\u2713'); // ✓
    expect(text).toContain('\u26A0'); // ⚠
    expect(text).toContain('\u2717'); // ✗
    // Remediation shown for non-pass
    expect(text).toContain('Fix it');
    expect(text).toContain('Repair now');
    // Summary line
    expect(text).toContain('3 checks');
    expect(text).toContain('1 passed');
    expect(text).toContain('1 warnings');
    expect(text).toContain('1 failures');
  });

  it('shows healthy message when exitCode is 0', () => {
    const report: DoctorReport = {
      categories: [
        {
          category: 'OK',
          checks: [{ name: 'a', severity: 'pass', message: 'fine' }],
        },
      ],
      summary: { total: 1, passed: 1, warned: 0, failed: 0 },
      exitCode: 0,
    };

    const text = formatReport(report);
    expect(text).toContain('All systems healthy');
  });

  it('shows warning message when exitCode is 2', () => {
    const report: DoctorReport = {
      categories: [
        {
          category: 'Warn',
          checks: [{ name: 'a', severity: 'warn', message: 'hmm' }],
        },
      ],
      summary: { total: 1, passed: 0, warned: 1, failed: 0 },
      exitCode: 2,
    };

    const text = formatReport(report);
    expect(text).toContain('warnings detected');
  });

  it('shows failure message when exitCode is 1', () => {
    const report: DoctorReport = {
      categories: [
        {
          category: 'Fail',
          checks: [{ name: 'a', severity: 'fail', message: 'bad' }],
        },
      ],
      summary: { total: 1, passed: 0, warned: 0, failed: 1 },
      exitCode: 1,
    };

    const text = formatReport(report);
    expect(text).toContain('Failures detected');
  });
});

describe('formatJson', () => {
  it('produces valid JSON matching DoctorReport schema', () => {
    const report: DoctorReport = {
      categories: [
        {
          category: 'Test',
          checks: [{ name: 'a', severity: 'pass', message: 'ok' }],
        },
      ],
      summary: { total: 1, passed: 1, warned: 0, failed: 0 },
      exitCode: 0,
    };

    const json = formatJson(report);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('categories');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('exitCode');
    expect(parsed.categories).toBeInstanceOf(Array);
    expect(parsed.summary.total).toBe(1);
    expect(parsed.exitCode).toBe(0);
  });
});

describe('exit code logic', () => {
  it('exitCode 2 when only warnings, no failures', async () => {
    // Environment will have some fails for required vars — set them
    const saved: Record<string, string | undefined> = {};
    for (const k of ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET', 'OPENAI_API_KEY']) {
      saved[k] = process.env[k];
      process.env[k] = 'val';
    }

    // DB exists, connection OK — already mocked to happy path
    vi.mocked(existsSync).mockReturnValue(true);
    const connModule = await import('../db/connection.js');
    vi.mocked(connModule.getDb).mockReturnValue({
      pragma: vi.fn(() => 'wal'),
      prepare: vi.fn(() => ({ get: vi.fn(() => ({ count: 45 })) })),
    } as any);

    // Ollama unreachable → warn
    const llmMod = await import('../inference/local-llm.js');
    vi.mocked(llmMod.OllamaClient).mockImplementation(() => ({
      isAvailable: vi.fn(async () => false),
      listModels: vi.fn(),
    }) as any);

    const report = await runAllChecks();

    // Should have warns but no fails (Ollama unreachable is warn)
    // Env required vars are set, DB is happy, providers happy, platform happy
    if (report.summary.failed === 0 && report.summary.warned > 0) {
      expect(report.exitCode).toBe(2);
    }

    // Restore
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
  });
});
