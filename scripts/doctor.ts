#!/usr/bin/env node
/**
 * KIN Doctor — Deep Diagnostic CLI
 *
 * Runs health checks across all KIN subsystems and outputs a sectioned
 * pass/fail/warn report with remediation hints.
 *
 * Usage:
 *   npx tsx scripts/doctor.ts          # Console output
 *   npx tsx scripts/doctor.ts --json   # Machine-readable JSON
 *   npm run doctor                     # Via npm script
 *
 * Named exports are available for programmatic use (K010 CLI guard pattern).
 *
 * @module scripts/doctor
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// ============================================================================
// Types
// ============================================================================

export type CheckSeverity = 'pass' | 'warn' | 'fail';

export interface CheckResult {
  name: string;
  severity: CheckSeverity;
  message: string;
  remediation?: string;
}

export interface CategoryResult {
  category: string;
  checks: CheckResult[];
}

export interface DoctorReport {
  categories: CategoryResult[];
  summary: { total: number; passed: number; warned: number; failed: number };
  exitCode: number;
}

// ============================================================================
// 1. Environment Checks
// ============================================================================

const REQUIRED_VARS = ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET'];
const RECOMMENDED_VARS = ['OPENAI_API_KEY'];
const OPTIONAL_VARS = ['ELEVENLABS_API_KEY', 'TAILSCALE_API_KEY', 'ANTHROPIC_API_KEY'];

export async function checkEnvironment(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const key of REQUIRED_VARS) {
    if (process.env[key]) {
      results.push({ name: key, severity: 'pass', message: `${key} is set` });
    } else {
      results.push({
        name: key,
        severity: 'fail',
        message: `${key} is NOT SET (required)`,
        remediation: `Add ${key} to your .env file`,
      });
    }
  }

  for (const key of RECOMMENDED_VARS) {
    if (process.env[key]) {
      results.push({ name: key, severity: 'pass', message: `${key} is set` });
    } else {
      results.push({
        name: key,
        severity: 'warn',
        message: `${key} is not set (recommended)`,
        remediation: `Add ${key} to .env for cloud LLM fallback`,
      });
    }
  }

  for (const key of OPTIONAL_VARS) {
    if (process.env[key]) {
      results.push({ name: key, severity: 'pass', message: `${key} is set` });
    } else {
      results.push({
        name: key,
        severity: 'pass',
        message: `${key} is not set (optional)`,
      });
    }
  }

  return results;
}

// ============================================================================
// 2. Database Checks
// ============================================================================

const EXPECTED_TABLE_COUNT = 45;

export async function checkDatabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const dbPath = process.env.DATABASE_PATH || './data/kin.db';

  // File existence
  if (!existsSync(dbPath)) {
    results.push({
      name: 'db-file',
      severity: 'fail',
      message: `Database not found at ${dbPath}`,
      remediation: 'Run: npm run db:migrate (or npm run start:all to auto-create)',
    });
    return results;
  }
  results.push({ name: 'db-file', severity: 'pass', message: `Database found at ${dbPath}` });

  // Dynamic import — better-sqlite3 may not load (K001, K029)
  let db: any;
  try {
    const { getDb } = await import('../db/connection.js');
    db = getDb();
  } catch (err: any) {
    results.push({
      name: 'db-connection',
      severity: 'warn',
      message: `Cannot load better-sqlite3: ${err.message?.slice(0, 80)}`,
      remediation: 'Run: npm rebuild better-sqlite3 (requires Node 20 on Linux/WSL — see K001)',
    });
    return results;
  }

  results.push({ name: 'db-connection', severity: 'pass', message: 'Database connection OK' });

  // WAL mode
  try {
    const journalMode = db.pragma('journal_mode', { simple: true }) as string;
    if (journalMode === 'wal') {
      results.push({ name: 'db-wal', severity: 'pass', message: 'WAL mode enabled' });
    } else {
      results.push({
        name: 'db-wal',
        severity: 'warn',
        message: `Journal mode is "${journalMode}" (expected WAL)`,
        remediation: 'Run: PRAGMA journal_mode=WAL; on the database',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'db-wal',
      severity: 'warn',
      message: `Could not check journal mode: ${err.message?.slice(0, 60)}`,
    });
  }

  // Table count
  try {
    const tables = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get() as { count: number };

    if (tables.count >= EXPECTED_TABLE_COUNT) {
      results.push({
        name: 'db-tables',
        severity: 'pass',
        message: `${tables.count} tables found (expected ${EXPECTED_TABLE_COUNT})`,
      });
    } else {
      results.push({
        name: 'db-tables',
        severity: 'warn',
        message: `${tables.count} tables found (expected ${EXPECTED_TABLE_COUNT})`,
        remediation: 'Schema may be outdated. Run: npm run db:migrate',
      });
    }
  } catch (err: any) {
    results.push({
      name: 'db-tables',
      severity: 'warn',
      message: `Could not count tables: ${err.message?.slice(0, 60)}`,
    });
  }

  return results;
}

// ============================================================================
// 3. Ollama / LLM Checks
// ============================================================================

export async function checkOllama(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Dynamic import — OllamaClient
  let OllamaClient: any;
  try {
    const mod = await import('../inference/local-llm.js');
    OllamaClient = mod.OllamaClient;
  } catch (err: any) {
    results.push({
      name: 'ollama-import',
      severity: 'warn',
      message: `Cannot import local-llm module: ${err.message?.slice(0, 80)}`,
      remediation: 'Check that inference/local-llm.ts compiles cleanly',
    });
    return results;
  }

  const client = new OllamaClient({ timeout: 3000 });

  // Ollama availability
  let available: boolean;
  try {
    available = await client.isAvailable(3000);
  } catch {
    available = false;
  }

  if (!available) {
    results.push({
      name: 'ollama-server',
      severity: 'warn',
      message: 'Ollama is not reachable (local LLM unavailable)',
      remediation: 'Install Ollama (https://ollama.com) and run: ollama serve',
    });
    return results;
  }

  results.push({ name: 'ollama-server', severity: 'pass', message: 'Ollama is running' });

  // Check companion models
  let companionIds: string[];
  try {
    const configMod = await import('../companions/config.js');
    companionIds = configMod.getCompanionIds();
  } catch (err: any) {
    results.push({
      name: 'companion-config',
      severity: 'warn',
      message: `Cannot load companion config: ${err.message?.slice(0, 60)}`,
    });
    return results;
  }

  let models: Array<{ name: string }>;
  try {
    models = await client.listModels();
  } catch (err: any) {
    results.push({
      name: 'ollama-models',
      severity: 'warn',
      message: `Cannot list Ollama models: ${err.message?.slice(0, 60)}`,
    });
    return results;
  }

  const modelNames = new Set(models.map((m) => m.name.split(':')[0]));

  for (const id of companionIds) {
    const expected = `kin-${id}`; // K014
    if (modelNames.has(expected)) {
      results.push({
        name: `model-${id}`,
        severity: 'pass',
        message: `Companion model ${expected} registered`,
      });
    } else {
      results.push({
        name: `model-${id}`,
        severity: 'warn',
        message: `Companion model ${expected} not found`,
        remediation: `Run: npm run setup-companion -- ${id} (or pull base model)`,
      });
    }
  }

  return results;
}

// ============================================================================
// 4. Provider / Circuit Breaker Checks
// ============================================================================

export async function checkProviders(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  let getProviderHealth: any;
  try {
    const mod = await import('../inference/providers/circuit-breaker.js');
    getProviderHealth = mod.getProviderHealth;
  } catch (err: any) {
    results.push({
      name: 'providers-import',
      severity: 'warn',
      message: `Cannot import circuit-breaker module: ${err.message?.slice(0, 80)}`,
      remediation: 'Check that inference/providers/circuit-breaker.ts compiles',
    });
    return results;
  }

  const statuses = getProviderHealth();

  if (statuses.length === 0) {
    results.push({
      name: 'providers',
      severity: 'pass',
      message: 'No providers tracked yet (circuits initialize on first use)',
    });
    return results;
  }

  for (const s of statuses) {
    const severity: CheckSeverity =
      s.state === 'CLOSED' ? 'pass' :
      s.state === 'HALF_OPEN' ? 'warn' :
      'fail';

    results.push({
      name: `provider-${s.providerId}`,
      severity,
      message: `${s.providerId}: ${s.state} (${s.failures} failures)`,
      ...(severity !== 'pass' && {
        remediation: `Provider ${s.providerId} circuit is ${s.state}. It will auto-recover after cooldown.`,
      }),
    });
  }

  return results;
}

// ============================================================================
// 5. Platform Health Checks
// ============================================================================

export async function checkPlatformHealth(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  let healthResults: Array<{ name: string; status: string; detail: string }>;
  try {
    const mod = await import('../runtime/health-probe.js');
    healthResults = await mod.checkPlatformHealth();
  } catch (err: any) {
    results.push({
      name: 'platform-import',
      severity: 'warn',
      message: `Cannot import health-probe module: ${err.message?.slice(0, 80)}`,
      remediation: 'Check that runtime/health-probe.ts compiles cleanly',
    });
    return results;
  }

  for (const h of healthResults) {
    const severity: CheckSeverity =
      h.status === 'ok' ? 'pass' :
      h.status === 'warn' ? 'warn' :
      'fail';

    results.push({
      name: `platform-${h.name}`,
      severity,
      message: `${h.name}: ${h.detail}`,
    });
  }

  return results;
}

// ============================================================================
// 6. Skills Checks
// ============================================================================

export async function checkSkills(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  let builtinSkills: any[];
  try {
    const mod = await import('../bot/skills/builtins/index.js');
    builtinSkills = mod.builtinSkills;
  } catch (err: any) {
    results.push({
      name: 'skills-import',
      severity: 'warn',
      message: `Cannot import skills module: ${err.message?.slice(0, 80)}`,
      remediation: 'Check that bot/skills/builtins/index.ts compiles cleanly',
    });
    return results;
  }

  if (!Array.isArray(builtinSkills) || builtinSkills.length === 0) {
    results.push({
      name: 'skills-loaded',
      severity: 'fail',
      message: 'No built-in skills found',
      remediation: 'builtinSkills array is empty — check bot/skills/builtins/index.ts',
    });
    return results;
  }

  results.push({
    name: 'skills-loaded',
    severity: 'pass',
    message: `${builtinSkills.length} built-in skills loaded`,
  });

  // Verify each skill has a name
  for (const skill of builtinSkills) {
    if (skill && typeof skill.name === 'string' && skill.name.length > 0) {
      results.push({
        name: `skill-${skill.name}`,
        severity: 'pass',
        message: `Skill "${skill.name}" registered`,
      });
    } else {
      results.push({
        name: 'skill-unnamed',
        severity: 'warn',
        message: 'Found a skill without a valid name property',
        remediation: 'Every KinSkill must have a non-empty name string',
      });
    }
  }

  return results;
}

// ============================================================================
// Aggregation
// ============================================================================

export async function runAllChecks(): Promise<DoctorReport> {
  const categories: CategoryResult[] = [
    { category: 'Environment', checks: await checkEnvironment() },
    { category: 'Database', checks: await checkDatabase() },
    { category: 'Ollama / LLM', checks: await checkOllama() },
    { category: 'Providers', checks: await checkProviders() },
    { category: 'Platform Health', checks: await checkPlatformHealth() },
    { category: 'Skills', checks: await checkSkills() },
  ];

  let total = 0;
  let passed = 0;
  let warned = 0;
  let failed = 0;

  for (const cat of categories) {
    for (const check of cat.checks) {
      total++;
      if (check.severity === 'pass') passed++;
      else if (check.severity === 'warn') warned++;
      else failed++;
    }
  }

  const exitCode = failed > 0 ? 1 : warned > 0 ? 2 : 0;

  return { categories, summary: { total, passed, warned, failed }, exitCode };
}

// ============================================================================
// Formatters
// ============================================================================

const ICON: Record<CheckSeverity, string> = {
  pass: '\u2713',  // ✓
  warn: '\u26A0',  // ⚠
  fail: '\u2717',  // ✗
};

export function formatReport(report: DoctorReport): string {
  const lines: string[] = [
    '\uD83E\uDE7A KIN Doctor — Diagnostic Report',
    '='.repeat(44),
    '',
  ];

  for (const cat of report.categories) {
    lines.push(`\u250C\u2500 ${cat.category}`);

    for (const check of cat.checks) {
      lines.push(`\u2502  ${ICON[check.severity]} ${check.message}`);
      if (check.remediation && check.severity !== 'pass') {
        lines.push(`\u2502    \u2192 ${check.remediation}`);
      }
    }

    lines.push('\u2514' + '\u2500'.repeat(40));
    lines.push('');
  }

  // Summary
  const { total, passed, warned, failed } = report.summary;
  lines.push(`Summary: ${total} checks — ${passed} passed, ${warned} warnings, ${failed} failures`);

  if (report.exitCode === 0) {
    lines.push('\n\u2705 All systems healthy');
  } else if (report.exitCode === 2) {
    lines.push('\n\u26A0\uFE0F Some warnings detected — review above');
  } else {
    lines.push('\n\u274C Failures detected — fix required items above');
  }

  return lines.join('\n');
}

export function formatJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

// ============================================================================
// CLI Entry Point (K010 guard)
// ============================================================================

import { resolve } from 'path';

function isCliEntryPoint(): boolean {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = resolve(process.argv[1] ?? '');
    return resolve(thisFile) === entryFile;
  } catch {
    return false;
  }
}

if (isCliEntryPoint()) {
  const jsonMode = process.argv.includes('--json');

  const report = await runAllChecks();

  if (jsonMode) {
    console.log(formatJson(report));
  } else {
    console.log(formatReport(report));
  }

  process.exit(report.exitCode);
}
