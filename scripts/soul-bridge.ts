/**
 * Soul Bridge CLI — Export KIN companions as OpenClaw SOUL.md files,
 * or import SOUL.md files back into KIN companion soul configs.
 *
 * Usage:
 *   npx tsx scripts/soul-bridge.ts export --companion-id cipher
 *   npx tsx scripts/soul-bridge.ts export --companion-id cipher --output ./SOUL.md
 *   npx tsx scripts/soul-bridge.ts export --companion-id forge --user-id u123
 *   npx tsx scripts/soul-bridge.ts import --file ./SOUL.md --companion-id cipher --dry-run
 *   npx tsx scripts/soul-bridge.ts import --file ./SOUL.md --companion-id cipher --user-id u123
 *
 * @module scripts/soul-bridge
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { COMPANION_CONFIGS } from '../companions/config.js';
import { soulToOpenClaw, openClawToSoul } from '../inference/soul-bridge.js';
import type { SoulConfigBody } from '../inference/soul-types.js';

// ============================================================================
// Types
// ============================================================================

export type SoulBridgeCommand = 'export' | 'import';

export interface SoulBridgeArgs {
  command: SoulBridgeCommand;
  companionId: string;
  /** Output file path for export (default: stdout) */
  output?: string;
  /** Input SOUL.md file path for import */
  file?: string;
  /** Optional user ID for DB-backed export/import */
  userId?: string;
  /** Print parsed config as JSON without persisting */
  dryRun: boolean;
}

// ============================================================================
// Logging
// ============================================================================

export function log(msg: string): void {
  console.log(`[soul-bridge] ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`[soul-bridge] WARNING: ${msg}`);
}

export function fatal(msg: string): never {
  console.error(`[soul-bridge] ERROR: ${msg}`);
  process.exit(1);
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(argv: string[]): SoulBridgeArgs {
  if (argv.length === 0) {
    fatal(
      'No command provided. Usage:\n' +
      '  npx tsx scripts/soul-bridge.ts export --companion-id <id> [--output <path>] [--user-id <id>]\n' +
      '  npx tsx scripts/soul-bridge.ts import --file <path> --companion-id <id> [--user-id <id>] [--dry-run]',
    );
  }

  const command = argv[0] as string;
  if (command !== 'export' && command !== 'import') {
    fatal(`Unknown command "${command}". Must be "export" or "import".`);
  }

  const args: Partial<SoulBridgeArgs> = { command, dryRun: false };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--companion-id':
        args.companionId = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--file':
        args.file = argv[++i];
        break;
      case '--user-id':
        args.userId = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        fatal(`Unknown argument "${arg}".`);
    }
  }

  // ── Validate common requirements ──────────────────────────────────────
  if (!args.companionId) {
    fatal('--companion-id is required. Example: --companion-id cipher');
  }

  const available = Object.keys(COMPANION_CONFIGS).join(', ');
  if (!(args.companionId in COMPANION_CONFIGS)) {
    fatal(`Unknown companion "${args.companionId}". Available: ${available}`);
  }

  // ── Command-specific validation ───────────────────────────────────────
  if (command === 'import' && !args.file) {
    fatal('--file is required for import. Example: --file ./SOUL.md');
  }

  return args as SoulBridgeArgs;
}

// ============================================================================
// DB Helpers (optional — graceful degradation when better-sqlite3 unavailable)
// ============================================================================

interface DbHandle {
  prepare(sql: string): { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
  close(): void;
}

/**
 * Attempt to open the SQLite database. Returns null if better-sqlite3 is
 * unavailable or the DB file doesn't exist — callers degrade gracefully.
 */
async function tryOpenDb(): Promise<DbHandle | null> {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'kin.db');
  if (!existsSync(dbPath)) {
    return null;
  }

  try {
    const Database = (await import('better-sqlite3')).default;
    return new Database(dbPath) as unknown as DbHandle;
  } catch {
    // K001: better-sqlite3 may not load on Windows Node v24
    return null;
  }
}

/**
 * Read a user's soul config from the companion_souls table.
 */
function readSoulFromDb(db: DbHandle, userId: string, companionId: string): SoulConfigBody | null {
  const row = db.prepare(
    'SELECT custom_name, traits, soul_values, style, custom_instructions, boundaries, anti_patterns FROM companion_souls WHERE user_id = ? AND companion_id = ?',
  ).get(userId, companionId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    customName: (row.custom_name as string) || undefined,
    traits: JSON.parse((row.traits as string) || '{}'),
    values: JSON.parse((row.soul_values as string) || '[]'),
    style: JSON.parse((row.style as string) || '{}'),
    customInstructions: (row.custom_instructions as string) || '',
    boundaries: JSON.parse((row.boundaries as string) || '[]'),
    antiPatterns: JSON.parse((row.anti_patterns as string) || '[]'),
  };
}

/**
 * Upsert a soul config into the companion_souls table.
 */
function writeSoulToDb(
  db: DbHandle,
  userId: string,
  companionId: string,
  config: SoulConfigBody,
): void {
  const id = `${userId}_${companionId}`;
  const now = Date.now();

  db.prepare(
    `INSERT INTO companion_souls (id, user_id, companion_id, custom_name, traits, soul_values, style, custom_instructions, boundaries, anti_patterns, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       custom_name = excluded.custom_name,
       traits = excluded.traits,
       soul_values = excluded.soul_values,
       style = excluded.style,
       custom_instructions = excluded.custom_instructions,
       boundaries = excluded.boundaries,
       anti_patterns = excluded.anti_patterns,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    userId,
    companionId,
    config.customName || null,
    JSON.stringify(config.traits),
    JSON.stringify(config.values),
    JSON.stringify(config.style),
    config.customInstructions || '',
    JSON.stringify(config.boundaries),
    JSON.stringify(config.antiPatterns),
    now,
    now,
  );
}

// ============================================================================
// Export Command
// ============================================================================

export async function runExport(args: SoulBridgeArgs): Promise<void> {
  const companionId = args.companionId;
  const config = COMPANION_CONFIGS[companionId]!;

  // Read companion personality markdown
  const mdPath = join(process.cwd(), 'companions', `${companionId}.md`);
  if (!existsSync(mdPath)) {
    fatal(`Companion markdown not found: ${mdPath}`);
  }
  const companionMarkdown = readFileSync(mdPath, 'utf-8');

  // Optionally read soul config from DB
  let soulConfig: SoulConfigBody | undefined;
  if (args.userId) {
    const db = await tryOpenDb();
    if (db) {
      try {
        const loaded = readSoulFromDb(db, args.userId, companionId);
        if (loaded) {
          soulConfig = loaded;
          log(`Loaded soul config for user "${args.userId}"`);
        } else {
          warn(`No soul config found for user "${args.userId}", companion "${companionId}". Using defaults.`);
        }
      } finally {
        db.close();
      }
    } else {
      warn('Database not available — exporting without user soul config.');
    }
  }

  // Generate OpenClaw SOUL.md
  const soulMd = soulToOpenClaw(config, companionMarkdown, soulConfig);

  // Write to file or stdout
  if (args.output) {
    const outPath = resolve(args.output);
    writeFileSync(outPath, soulMd, 'utf-8');
    log(`Exported to ${outPath}`);
  } else {
    process.stdout.write(soulMd);
  }
}

// ============================================================================
// Import Command
// ============================================================================

export async function runImport(args: SoulBridgeArgs): Promise<void> {
  const filePath = resolve(args.file!);
  if (!existsSync(filePath)) {
    fatal(`File not found: ${filePath}`);
  }

  const markdown = readFileSync(filePath, 'utf-8');
  const config = openClawToSoul(markdown);

  log(`Parsed SOUL.md from ${filePath}`);

  // Dry-run: print and exit
  if (args.dryRun) {
    log('Dry-run mode — printing parsed config:');
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // Persist to DB if --user-id provided
  if (args.userId) {
    const db = await tryOpenDb();
    if (!db) {
      fatal('Database not available. Cannot persist soul config without DB. Use --dry-run to preview.');
    }
    try {
      writeSoulToDb(db, args.userId, args.companionId, config);
      log(`Saved soul config for user "${args.userId}", companion "${args.companionId}".`);
    } finally {
      db.close();
    }
    return;
  }

  // No user ID and not dry-run: print parsed config to stdout
  console.log(JSON.stringify(config, null, 2));
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  log(`Command: ${args.command}`);
  log(`Companion: ${args.companionId}`);

  switch (args.command) {
    case 'export':
      await runExport(args);
      break;
    case 'import':
      await runImport(args);
      break;
  }
}

// Only run main when executed directly (not when imported for testing) — K010
const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('soul-bridge.ts') === true;

if (isDirectExecution) {
  main().catch((err) => {
    fatal(err instanceof Error ? err.message : String(err));
  });
}
