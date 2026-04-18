/**
 * Training Orchestrator CLI - Single entry point for companion model fine-tuning.
 *
 * Validates prerequisites, invokes the Python fine-tune script, generates an
 * Ollama Modelfile, registers the model with Ollama, and verifies it responds.
 *
 * Usage:
 *   npx tsx training/train-companion.ts --companion-id cipher
 *   npx tsx training/train-companion.ts --companion-id cipher --dry-run
 *   npx tsx training/train-companion.ts --companion-id cipher --skip-training
 *
 * @module training/train-companion
 */

import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { COMPANION_SHORT_PROMPTS } from '../inference/companion-prompts.js';
import {
  generateModelfile,
  getModelName,
} from './modelfile-generator.js';
import { OllamaClient } from '../inference/local-llm.js';

// ============================================================================
// Types
// ============================================================================

export interface TrainCompanionArgs {
  companionId: string;
  dataPath: string;
  baseModel: string;
  outputDir: string;
  epochs?: number;
  maxSeqLength?: number;
  learningRate?: number;
  minAssistantChars?: number;
  maxDuplicateRatio?: number;
  dryRun: boolean;
  skipTraining: boolean;
}

const LLAMA_CPP_RELEASE_TAG = 'b8831';
const LLAMA_CPP_WINDOWS_DIR = path.resolve(
  path.join('training', 'tools', `llama.cpp-${LLAMA_CPP_RELEASE_TAG}-win-cpu-x64`),
);
const LLAMA_CPP_WINDOWS_ZIP_URL =
  `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE_TAG}/` +
  `llama-${LLAMA_CPP_RELEASE_TAG}-bin-win-cpu-x64.zip`;
const LLAMA_CPP_WINDOWS_ZIP_PATH = path.join(
  os.tmpdir(),
  `llama-${LLAMA_CPP_RELEASE_TAG}-bin-win-cpu-x64.zip`,
);
const LLAMA_CPP_CONVERTER_URL =
  `https://raw.githubusercontent.com/ggml-org/llama.cpp/${LLAMA_CPP_RELEASE_TAG}/convert_hf_to_gguf.py`;
const MERGED_MODEL_FILENAME = 'model.safetensors';
const F16_GGUF_FILENAME = 'model-f16.gguf';
const Q4_GGUF_FILENAME = 'unsloth.Q4_K_M.gguf';

// ============================================================================
// Logging
// ============================================================================

function log(msg: string): void {
  console.log(`[train-companion] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[train-companion] WARNING: ${msg}`);
}

function fatal(msg: string): never {
  console.error(`[train-companion] ERROR: ${msg}`);
  process.exit(1);
}

function quoteShellArg(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode ?? 0;
      const redirect = response.headers.location;

      if (status >= 300 && status < 400 && redirect) {
        response.resume();
        downloadFile(redirect, destination).then(resolve, reject);
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${status}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        response.resume();
        reject(err);
      });

      response.on('error', reject);
    });

    request.on('error', reject);
  });
}

async function ensureWindowsLlamaCppTools(): Promise<{
  converterPath: string;
  quantizePath: string;
}> {
  const quantizePath = path.join(LLAMA_CPP_WINDOWS_DIR, 'llama-quantize.exe');
  const converterPath = path.join(LLAMA_CPP_WINDOWS_DIR, 'convert_hf_to_gguf.py');

  if (!fs.existsSync(quantizePath)) {
    log(`Downloading llama.cpp ${LLAMA_CPP_RELEASE_TAG} Windows tools...`);
    await downloadFile(LLAMA_CPP_WINDOWS_ZIP_URL, LLAMA_CPP_WINDOWS_ZIP_PATH);
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command ` +
        `"Expand-Archive -LiteralPath '${LLAMA_CPP_WINDOWS_ZIP_PATH}' ` +
        `-DestinationPath '${LLAMA_CPP_WINDOWS_DIR}' -Force"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    );
  }

  if (!fs.existsSync(converterPath)) {
    log('Downloading llama.cpp HF->GGUF converter...');
    await downloadFile(LLAMA_CPP_CONVERTER_URL, converterPath);
  }

  return { converterPath, quantizePath };
}

function ensureWslGgufPythonDeps(): void {
  const pythonLauncher = toWslPath(
    path.resolve(path.join('training', 'run-python-wsl.sh')),
  );
  const pipLauncher = toWslPath(
    path.resolve(path.join('training', 'run-pip-wsl.sh')),
  );

  try {
    execSync(
      `wsl bash ${pythonLauncher} -c "import transformers, gguf"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    log(`Installing GGUF conversion deps in WSL for llama.cpp ${LLAMA_CPP_RELEASE_TAG}...`);
    execSync(
      `wsl bash ${pipLauncher} install -q ` +
        `"git+https://github.com/ggml-org/llama.cpp@${LLAMA_CPP_RELEASE_TAG}#subdirectory=gguf-py" ` +
        `sentencepiece`,
      { encoding: 'utf-8', stdio: ['inherit', 'inherit', 'inherit'] },
    );
  }
}

async function ensureGgufArtifact(outputDir: string): Promise<string> {
  const ggufPath = path.join(outputDir, Q4_GGUF_FILENAME);
  if (fs.existsSync(ggufPath)) {
    return ggufPath;
  }

  const mergedModelPath = path.join(outputDir, MERGED_MODEL_FILENAME);
  if (!fs.existsSync(mergedModelPath)) {
    throw new Error(
      `Expected either ${Q4_GGUF_FILENAME} or ${MERGED_MODEL_FILENAME} in ${outputDir}`,
    );
  }

  if (process.platform !== 'win32') {
    throw new Error(
      `GGUF artifact missing at ${ggufPath}. Re-run training with GGUF export enabled or add a platform-specific converter.`,
    );
  }

  const { converterPath, quantizePath } = await ensureWindowsLlamaCppTools();
  ensureWslGgufPythonDeps();

  const f16Path = path.join(outputDir, F16_GGUF_FILENAME);
  const tempQ4Path = path.join(os.tmpdir(), `${path.basename(outputDir)}-q4.gguf`);

  if (!fs.existsSync(f16Path)) {
    log('Converting merged HuggingFace model to F16 GGUF via llama.cpp...');
    const pythonLauncher = toWslPath(
      path.resolve(path.join('training', 'run-python-wsl.sh')),
    );
    const converterWsl = toWslPath(path.resolve(converterPath));
    const outputDirWsl = toWslPath(path.resolve(outputDir));
    const f16PathWsl = toWslPath(path.resolve(f16Path));

    execSync(
      `wsl bash ${pythonLauncher} ${converterWsl} ` +
        `--use-temp-file --outtype f16 --outfile ${f16PathWsl} ${outputDirWsl}`,
      {
        encoding: 'utf-8',
        stdio: ['inherit', 'inherit', 'inherit'],
        maxBuffer: 32 * 1024 * 1024,
      },
    );
  }

  log('Quantizing GGUF to Q4_K_M via llama.cpp...');
  execSync(
    `${quoteShellArg(quantizePath)} ${quoteShellArg(f16Path)} ${quoteShellArg(tempQ4Path)} Q4_K_M`,
    {
      encoding: 'utf-8',
      stdio: ['inherit', 'inherit', 'inherit'],
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  fs.copyFileSync(tempQ4Path, ggufPath);
  return ggufPath;
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(argv: string[]): TrainCompanionArgs {
  const args: Partial<TrainCompanionArgs> = {
    dryRun: false,
    skipTraining: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--companion-id':
        args.companionId = argv[++i];
        break;
      case '--data-path':
        args.dataPath = argv[++i];
        break;
      case '--base-model':
        args.baseModel = argv[++i];
        break;
      case '--output-dir':
        args.outputDir = argv[++i];
        break;
      case '--epochs':
        args.epochs = Number(argv[++i]);
        break;
      case '--max-seq-length':
        args.maxSeqLength = Number(argv[++i]);
        break;
      case '--learning-rate':
        args.learningRate = Number(argv[++i]);
        break;
      case '--min-assistant-chars':
        args.minAssistantChars = Number(argv[++i]);
        break;
      case '--max-duplicate-ratio':
        args.maxDuplicateRatio = Number(argv[++i]);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--skip-training':
        args.skipTraining = true;
        break;
    }
  }

  if (!args.companionId) {
    fatal('--companion-id is required');
  }

  const companionId = args.companionId;

  return {
    companionId,
    dataPath:
      args.dataPath ??
      path.join('data', 'training', companionId, 'training.jsonl'),
    baseModel:
      args.baseModel ?? 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
    outputDir:
      args.outputDir ?? path.join('training', 'output', companionId),
    epochs: args.epochs ?? 2,
    maxSeqLength: args.maxSeqLength ?? 1024,
    learningRate: args.learningRate ?? 2e-4,
    minAssistantChars: args.minAssistantChars ?? 0,
    maxDuplicateRatio: args.maxDuplicateRatio ?? 1.0,
    dryRun: args.dryRun ?? false,
    skipTraining: args.skipTraining ?? false,
  };
}

// ============================================================================
// Prerequisite Validation
// ============================================================================

export function validateCompanionId(companionId: string): void {
  const prompt = COMPANION_SHORT_PROMPTS[companionId];
  if (prompt === undefined) {
    const available = Object.keys(COMPANION_SHORT_PROMPTS).join(', ');
    throw new Error(
      `Unknown companionId "${companionId}". Available: ${available}`,
    );
  }
  log(`[ok] Companion "${companionId}" is valid`);
}

export function validateDataFile(dataPath: string): void {
  if (!fs.existsSync(dataPath)) {
    throw new Error(
      `Training data file not found: ${dataPath}`,
    );
  }
  const stat = fs.statSync(dataPath);
  if (stat.size === 0) {
    throw new Error(
      `Training data file is empty: ${dataPath}`,
    );
  }
  log(`[ok] Data file exists: ${dataPath} (${stat.size} bytes)`);
}

export async function validateOllama(): Promise<OllamaClient> {
  const client = new OllamaClient();
  const health = await client.checkHealth();
  if (!health.healthy) {
    throw new Error(
      `Ollama is not running or unreachable: ${health.error ?? 'unknown error'}`,
    );
  }
  log(`[ok] Ollama is healthy (v${health.version ?? 'unknown'}, ${Math.round(health.latencyMs)}ms)`);
  return client;
}

export function validatePython(): string {
  // Try python3 first, then python
  for (const cmd of ['python3', 'python']) {
    try {
      const version = execSync(`${cmd} --version`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      log(`[ok] Python found: ${version} (${cmd})`);
      return cmd;
    } catch {
      // Try next
    }
  }
  throw new Error(
    'Python not found. Install Python 3.10+ and ensure python3 or python is on PATH.',
  );
}

// ============================================================================
// Windows -> WSL Path Translation
// ============================================================================

/**
 * Convert a Windows path (e.g. C:\Users\foo) to a WSL path (/mnt/c/Users/foo).
 * Only transforms paths that look like Windows absolute paths. Passes others through.
 */
export function toWslPath(windowsPath: string): string {
  // Match drive letter pattern: C:\ or C:/
  const match = /^([A-Za-z]):[/\\](.*)$/.exec(windowsPath);
  if (!match) return windowsPath;
  const driveLetter = match[1]!.toLowerCase();
  const rest = match[2]!.replace(/\\/g, '/');
  return `/mnt/${driveLetter}/${rest}`;
}

// ============================================================================
// Python Training Invocation
// ============================================================================

export function buildPythonArgs(
  pythonCmd: string,
  args: TrainCompanionArgs,
): { command: string; spawnArgs: string[] } {
  const isWindows = process.platform === 'win32';
  const scriptPath = path.join('training', 'fine-tune.py');

  // Build the Python script arguments
  const scriptArgs: string[] = [
    '--companion-id', args.companionId,
    '--data-path', isWindows ? toWslPath(path.resolve(args.dataPath)) : args.dataPath,
    '--base-model', args.baseModel,
    '--output-dir', isWindows ? toWslPath(path.resolve(args.outputDir)) : args.outputDir,
    '--epochs', String(args.epochs ?? 2),
    '--max-seq-length', String(args.maxSeqLength ?? 1024),
    '--learning-rate', String(args.learningRate ?? 2e-4),
    '--min-assistant-chars', String(args.minAssistantChars ?? 0),
    '--max-duplicate-ratio', String(args.maxDuplicateRatio ?? 1.0),
  ];

  if (args.dryRun) {
    scriptArgs.push('--dry-run');
  }

  if (isWindows) {
    scriptArgs.push('--skip-gguf-export');
    const wslLauncherPath = toWslPath(
      path.resolve(path.join('training', 'run-python-wsl.sh')),
    );
    const wslScriptPath = toWslPath(path.resolve(scriptPath));

    // Run Python through WSL
    return {
      command: 'wsl',
      // Prefer a standard WSL training venv when present, then fall back to
      // the distro-level python3 interpreter via a checked-in wrapper script.
      spawnArgs: ['bash', wslLauncherPath, wslScriptPath, ...scriptArgs],
    };
  }

  return {
    command: pythonCmd,
    spawnArgs: [scriptPath, ...scriptArgs],
  };
}

export function runPythonTraining(
  pythonCmd: string,
  args: TrainCompanionArgs,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { command, spawnArgs } = buildPythonArgs(pythonCmd, args);

    log(`Running: ${command} ${spawnArgs.join(' ')}`);

    const child = spawn(command, spawnArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(data);
    });

    child.on('error', (err) => {
      reject(
        new Error(`Failed to spawn Python process: ${err.message}`),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python training failed with exit code ${code ?? 'null'}.\n` +
              `stderr: ${stderr.slice(-500)}`,
          ),
        );
      } else {
        log('[ok] Python training completed successfully');
        resolve();
      }
    });
  });
}

// ============================================================================
// Modelfile Generation & Ollama Registration
// ============================================================================

export function generateAndWriteModelfile(
  companionId: string,
  outputDir: string,
): { modelfilePath: string; modelName: string } {
  const ggufPath = path.resolve(outputDir, Q4_GGUF_FILENAME);
  log(`Generating Modelfile for companion "${companionId}" with GGUF: ${ggufPath}`);

  const result = generateModelfile({
    companionId,
    ggufPath,
    outputDir,
  });

  log(`[ok] Modelfile written to: ${result.modelfilePath}`);
  return { modelfilePath: result.modelfilePath, modelName: result.modelName };
}

export function registerWithOllama(
  modelName: string,
  modelfilePath: string,
): void {
  log(`Registering model "${modelName}" with Ollama...`);
  try {
    const output = execSync(
      `ollama create ${modelName} -f ${quoteShellArg(modelfilePath)}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    );
    log(`[ok] Ollama registration output: ${output.trim()}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to register model with Ollama: ${msg}`);
  }
}

export async function verifyModel(
  client: OllamaClient,
  modelName: string,
): Promise<void> {
  log(`Verifying model "${modelName}" is loaded...`);
  const hasIt = await client.hasModel(modelName);
  if (!hasIt) {
    warn(`Model "${modelName}" not found in Ollama model list. It may still be loading.`);
    return;
  }
  log(`[ok] Model "${modelName}" is registered in Ollama`);

  // Send a test message
  try {
    const response = await client.chat({
      model: modelName,
      messages: [{ role: 'user', content: 'Hello, who are you?' }],
    });
    log(`[ok] Test chat response: "${response.message.content.slice(0, 100)}..."`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Test chat failed (model may need time to load): ${msg}`);
  }
}

// ============================================================================
// Summary
// ============================================================================

export async function printSummary(
  client: OllamaClient,
  modelName: string,
  ggufPath: string,
  modelfilePath: string,
): Promise<void> {
  log('--- Training Pipeline Summary ---');
  log(`  Model name:    ${modelName}`);
  log(`  GGUF path:     ${ggufPath}`);
  log(`  Modelfile:     ${modelfilePath}`);

  try {
    const info = await client.getModelInfo(modelName);
    if (info.details) {
      log(`  Parameter size: ${info.details.parameter_size}`);
      log(`  Quantization:   ${info.details.quantization_level}`);
    }
  } catch {
    log('  (model info not available yet)');
  }

  log('---------------------------------');
}

// ============================================================================
// Main Pipeline
// ============================================================================

export async function runPipeline(args: TrainCompanionArgs): Promise<void> {
  log(`Starting training pipeline for companion "${args.companionId}"`);
  log(`  Data path:    ${args.dataPath}`);
  log(`  Base model:   ${args.baseModel}`);
  log(`  Output dir:   ${args.outputDir}`);
  log(`  Epochs:       ${args.epochs ?? 2}`);
  log(`  Max seq len:  ${args.maxSeqLength ?? 1024}`);
  log(`  Learning rate:${args.learningRate ?? 2e-4}`);
  log(`  Min chars:    ${args.minAssistantChars ?? 0}`);
  log(`  Max dup ratio:${args.maxDuplicateRatio ?? 1.0}`);
  log(`  Dry run:      ${args.dryRun}`);
  log(`  Skip training: ${args.skipTraining}`);

  // Step 1: Validate prerequisites
  validateCompanionId(args.companionId);

  if (!args.skipTraining) {
    validateDataFile(args.dataPath);
  }

  const ollamaClient = await validateOllama();

  let pythonCmd = 'python3';
  if (!args.skipTraining) {
    pythonCmd = validatePython();
  }

  // Step 2: Run Python training
  if (!args.skipTraining) {
    await runPythonTraining(pythonCmd, args);
  } else {
    log('Skipping Python training (--skip-training)');
  }

  const ggufPath = await ensureGgufArtifact(args.outputDir);

  // Step 3: Generate Modelfile
  const { modelfilePath, modelName } = generateAndWriteModelfile(
    args.companionId,
    args.outputDir,
  );

  // Step 4: Register with Ollama
  registerWithOllama(modelName, modelfilePath);

  // Step 5: Verify model
  await verifyModel(ollamaClient, modelName);

  // Step 6: Print summary
  await printSummary(ollamaClient, modelName, ggufPath, modelfilePath);

  log('Pipeline complete!');
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runPipeline(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fatal(msg);
  }
}

// Only run main when executed directly (not when imported for testing)
const isDirectExecution =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('train-companion.ts') === true;

if (isDirectExecution) {
  main().catch((err) => {
    fatal(err instanceof Error ? err.message : String(err));
  });
}

