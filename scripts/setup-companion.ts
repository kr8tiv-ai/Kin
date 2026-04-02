/**
 * Setup Companion CLI — End-user entry point for branded model installation.
 *
 * Pulls a pre-trained companion model from HuggingFace via Ollama, creates
 * a branded model with a baked system prompt, and verifies the companion
 * responds. Zero user config beyond `--companion-id`.
 *
 * Usage:
 *   npx tsx scripts/setup-companion.ts --companion-id cipher
 *   npx tsx scripts/setup-companion.ts --companion-id forge --registry kr8tiv
 *   npx tsx scripts/setup-companion.ts --companion-id vortex --quantization Q5_K_M
 *
 * @module scripts/setup-companion
 */

import { COMPANION_SHORT_PROMPTS } from '../inference/companion-prompts.js';
import { generateModelfile, getModelName } from '../training/modelfile-generator.js';
import { OllamaClient } from '../inference/local-llm.js';

// ============================================================================
// Types
// ============================================================================

export interface SetupCompanionArgs {
  companionId: string;
  registry: string;
  quantization: string;
}

// ============================================================================
// Logging
// ============================================================================

export function log(msg: string): void {
  console.log(`[setup-companion] ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`[setup-companion] WARNING: ${msg}`);
}

export function fatal(msg: string): never {
  console.error(`[setup-companion] ERROR: ${msg}`);
  process.exit(1);
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(argv: string[]): SetupCompanionArgs {
  const args: Partial<SetupCompanionArgs> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--companion-id':
        args.companionId = argv[++i];
        break;
      case '--registry':
        args.registry = argv[++i];
        break;
      case '--quantization':
        args.quantization = argv[++i];
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

  return {
    companionId,
    registry: args.registry ?? 'kr8tiv',
    quantization: args.quantization ?? 'Q4_K_M',
  };
}

// ============================================================================
// Phase 1: Ollama Health Check
// ============================================================================

export async function checkOllamaHealth(): Promise<OllamaClient> {
  log('Checking Ollama health...');
  const client = new OllamaClient();
  const health = await client.checkHealth();

  if (!health.healthy) {
    const errorMsg = health.error ?? '';
    // Heuristic: connection refused / ECONNREFUSED → Ollama might be installed but not running.
    // fetch failed / ENOENT → likely not installed at all.
    if (
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('connect ECONNREFUSED')
    ) {
      throw new Error(
        'Ollama is installed but not running. Start it with: ollama serve',
      );
    }
    throw new Error(
      'Ollama is not installed. Download from https://ollama.com/download',
    );
  }

  log(`✓ Ollama is healthy (v${health.version ?? 'unknown'}, ${Math.round(health.latencyMs)}ms)`);
  return client;
}

// ============================================================================
// Phase 2: Pull Companion Model from HuggingFace
// ============================================================================

export async function pullCompanionModel(
  client: OllamaClient,
  registry: string,
  companionId: string,
  quantization: string,
): Promise<string> {
  const modelRef = `hf.co/${registry}/kin-${companionId}-GGUF:${quantization}`;
  log(`Pulling model: ${modelRef}`);

  try {
    await client.pullModel(modelRef, (status) => {
      log(`  pull: ${status}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Model not yet available for companion "${companionId}". ` +
        `The builder must publish it first using: npx tsx scripts/publish-model.ts --companion-id ${companionId}\n` +
        `Pull error: ${msg}`,
    );
  }

  log(`✓ Model pulled: ${modelRef}`);
  return modelRef;
}

// ============================================================================
// Phase 3: Create Branded Model
// ============================================================================

export async function createBrandedModel(
  client: OllamaClient,
  companionId: string,
  modelRef: string,
): Promise<string> {
  log(`Creating branded model for companion "${companionId}"...`);

  const { modelfileContent, modelName } = generateModelfile({
    companionId,
    modelRef,
  });

  try {
    await client.createModel(modelName, modelfileContent, (status) => {
      log(`  create: ${status}`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create branded model: ${msg}`);
  }

  log(`✓ Branded model created: ${modelName}`);
  return modelName;
}

// ============================================================================
// Phase 4: Verify Model
// ============================================================================

export async function verifyModel(
  client: OllamaClient,
  modelName: string,
): Promise<void> {
  log(`Verifying model "${modelName}"...`);

  const hasIt = await client.hasModel(modelName);
  if (!hasIt) {
    warn(`Model "${modelName}" not found in Ollama model list. It may still be loading.`);
    return;
  }
  log(`✓ Model "${modelName}" is registered in Ollama`);

  // Send a test chat
  try {
    const response = await client.chat({
      model: modelName,
      messages: [{ role: 'user', content: 'Hello, who are you?' }],
    });
    const content = response.message.content;
    const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
    log(`✓ Test chat response: "${preview}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Test chat failed (model may still be loading): ${msg}`);
  }
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function runSetup(args: SetupCompanionArgs): Promise<void> {
  log(`Setting up companion "${args.companionId}"`);
  log(`  Registry:     ${args.registry}`);
  log(`  Quantization: ${args.quantization}`);

  // Phase 1: Ollama health
  const client = await checkOllamaHealth();

  // Phase 2: Pull model from HuggingFace
  const modelRef = await pullCompanionModel(
    client,
    args.registry,
    args.companionId,
    args.quantization,
  );

  // Phase 3: Create branded model
  const modelName = await createBrandedModel(client, args.companionId, modelRef);

  // Phase 4: Verify
  await verifyModel(client, modelName);

  log('────────────────────────────────');
  log(`Setup complete! Use your companion:`);
  log(`  ollama run ${modelName}`);
  log('────────────────────────────────');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runSetup(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fatal(msg);
  }
}

// Only run main when executed directly (not when imported for testing)
const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('setup-companion.ts') === true;

if (isDirectExecution) {
  main().catch((err) => {
    fatal(err instanceof Error ? err.message : String(err));
  });
}
