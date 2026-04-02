/**
 * Publish Model CLI — Builder-side script for uploading trained GGUFs to HuggingFace.
 *
 * Takes a trained companion GGUF from training/output/{companionId}/ and uploads
 * it to the HuggingFace Model Hub under the organization's namespace. The
 * resulting model can then be pulled by end-users via setup-companion.ts.
 *
 * Usage:
 *   npx tsx scripts/publish-model.ts --companion-id cipher --hf-token hf_xxxxx
 *   npx tsx scripts/publish-model.ts --companion-id forge --registry myorg
 *   HF_TOKEN=hf_xxxxx npx tsx scripts/publish-model.ts --companion-id vortex
 *
 * @module scripts/publish-model
 */

import * as fs from 'fs';
import * as path from 'path';
import { COMPANION_SHORT_PROMPTS } from '../inference/companion-prompts.js';

// ============================================================================
// Types
// ============================================================================

export interface PublishModelArgs {
  companionId: string;
  hfToken: string;
  registry: string;
}

// ============================================================================
// Logging
// ============================================================================

export function log(msg: string): void {
  console.log(`[publish-model] ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`[publish-model] WARNING: ${msg}`);
}

export function fatal(msg: string): never {
  console.error(`[publish-model] ERROR: ${msg}`);
  process.exit(1);
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(argv: string[]): PublishModelArgs {
  const args: Partial<PublishModelArgs> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--companion-id':
        args.companionId = argv[++i];
        break;
      case '--hf-token':
        args.hfToken = argv[++i];
        break;
      case '--registry':
        args.registry = argv[++i];
        break;
    }
  }

  if (!args.companionId) {
    fatal('--companion-id is required. Example: --companion-id cipher');
  }

  const companionId = args.companionId;

  // Validate companionId against known companions
  if (!(companionId in COMPANION_SHORT_PROMPTS)) {
    const available = Object.keys(COMPANION_SHORT_PROMPTS).join(', ');
    fatal(
      `Unknown companion "${companionId}". Available companions: ${available}`,
    );
  }

  // Resolve HuggingFace token: CLI flag → env var
  const hfToken = args.hfToken ?? process.env.HF_TOKEN ?? '';

  return {
    companionId,
    hfToken,
    registry: args.registry ?? 'kr8tiv',
  };
}

// ============================================================================
// Phase 1: Validate GGUF Exists
// ============================================================================

/**
 * Verify the trained GGUF file exists for the given companion.
 * @returns Absolute path to the GGUF file.
 * @throws Error if the file is not found.
 */
export function validateGgufExists(companionId: string): string {
  const ggufPath = path.join(
    'training',
    'output',
    companionId,
    'unsloth.Q4_K_M.gguf',
  );

  if (!fs.existsSync(ggufPath)) {
    throw new Error(
      `No trained model found for ${companionId}. Run training first: npx tsx training/train-companion.ts --companion-id ${companionId}`,
    );
  }

  return ggufPath;
}

// ============================================================================
// Phase 2: Validate HuggingFace Token
// ============================================================================

/**
 * Verify the HuggingFace token is present and non-empty.
 * @returns The validated token string.
 * @throws Error if no token is provided.
 */
export function validateHfToken(token?: string): string {
  if (!token) {
    throw new Error(
      'HuggingFace token required. Provide --hf-token or set HF_TOKEN environment variable.',
    );
  }

  return token;
}

// ============================================================================
// Phase 3: Create HuggingFace Repository
// ============================================================================

/**
 * Create the HuggingFace model repository (idempotent — 409 = already exists).
 */
export async function createHfRepo(
  registry: string,
  companionId: string,
  token: string,
): Promise<void> {
  const repoName = `kin-${companionId}-GGUF`;
  log(`Creating HuggingFace repo: ${registry}/${repoName}`);

  const response = await fetch('https://huggingface.co/api/repos/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: 'model',
      name: repoName,
      organization: registry,
      private: false,
    }),
  });

  if (response.ok || response.status === 409) {
    const status = response.status === 409 ? 'already exists' : 'created';
    log(`✓ Repository ${status}: ${registry}/${repoName}`);
    return;
  }

  const body = await response.text().catch(() => '');
  throw new Error(
    `Failed to create HuggingFace repo (HTTP ${response.status}): ${body}`,
  );
}

// ============================================================================
// Phase 4: Upload GGUF File
// ============================================================================

/**
 * Upload the GGUF file to the HuggingFace repository.
 */
export async function uploadGgufFile(
  registry: string,
  companionId: string,
  ggufPath: string,
  token: string,
): Promise<void> {
  const repoName = `kin-${companionId}-GGUF`;
  const fileName = 'unsloth.Q4_K_M.gguf';
  const url = `https://huggingface.co/api/${registry}/${repoName}/upload/main/${fileName}`;

  const fileBuffer = fs.readFileSync(ggufPath);
  const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(1);
  log(`Uploading ${fileName} (${fileSizeMB} MB) to ${registry}/${repoName}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Authorization: `Bearer ${token}`,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed to upload GGUF file (HTTP ${response.status}): ${body}`,
    );
  }

  log(`✓ Upload complete: ${registry}/${repoName}/${fileName}`);
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Run the full publish pipeline: validate → create repo → upload.
 */
export async function runPublish(args: PublishModelArgs): Promise<void> {
  log(`Publishing companion "${args.companionId}"`);
  log(`  Registry: ${args.registry}`);

  // Phase 1: Validate GGUF exists
  const ggufPath = validateGgufExists(args.companionId);
  log(`✓ Found trained model: ${ggufPath}`);

  // Phase 2: Validate HuggingFace token
  const token = validateHfToken(args.hfToken);
  log('✓ HuggingFace token validated');

  // Phase 3: Create repository
  await createHfRepo(args.registry, args.companionId, token);

  // Phase 4: Upload GGUF file
  await uploadGgufFile(args.registry, args.companionId, ggufPath, token);

  log('────────────────────────────────');
  log('Publish complete! Users can now install:');
  log(
    `  npx tsx scripts/setup-companion.ts --companion-id ${args.companionId}`,
  );
  log('────────────────────────────────');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runPublish(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fatal(msg);
  }
}

// Only run main when executed directly (not when imported for testing)
const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('publish-model.ts') === true;

if (isDirectExecution) {
  main().catch((err) => {
    fatal(err instanceof Error ? err.message : String(err));
  });
}
