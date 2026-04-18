import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock child_process before imports.
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs selectively.
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// Mock OllamaClient.
vi.mock('../inference/local-llm.js', () => {
  const mockClient = {
    checkHealth: vi.fn(),
    hasModel: vi.fn(),
    chat: vi.fn(),
    getModelInfo: vi.fn(),
    listModels: vi.fn(),
  };
  return {
    OllamaClient: vi.fn(() => mockClient),
    __mockClient: mockClient,
  };
});

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import {
  parseArgs,
  validateCompanionId,
  validateDataFile,
  validateOllama,
  validatePython,
  toWslPath,
  buildPythonArgs,
  generateAndWriteModelfile,
  registerWithOllama,
  verifyModel,
  runPipeline,
  type TrainCompanionArgs,
} from '../training/train-companion.js';
import { OllamaClient } from '../inference/local-llm.js';

// Get the mock client instance
function getMockClient() {
  const mod = vi.mocked(OllamaClient);
  const instance = new mod();
  return instance;
}

// ============================================================================
// parseArgs
// ============================================================================

describe('parseArgs', () => {
  it('parses all arguments correctly', () => {
    const result = parseArgs([
      '--companion-id', 'cipher',
      '--data-path', '/some/data.jsonl',
      '--base-model', 'unsloth/Llama-3.2-3B-Instruct-bnb-4bit',
      '--output-dir', '/some/output',
      '--dry-run',
      '--skip-training',
    ]);

    expect(result.companionId).toBe('cipher');
    expect(result.dataPath).toBe('/some/data.jsonl');
    expect(result.baseModel).toBe('unsloth/Llama-3.2-3B-Instruct-bnb-4bit');
    expect(result.outputDir).toBe('/some/output');
    expect(result.dryRun).toBe(true);
    expect(result.skipTraining).toBe(true);
  });

  it('applies defaults when optional args are missing', () => {
    const result = parseArgs(['--companion-id', 'forge']);
    expect(result.companionId).toBe('forge');
    expect(result.dataPath).toBe(path.join('data', 'training', 'forge', 'training.jsonl'));
    expect(result.baseModel).toBe('unsloth/Llama-3.2-1B-Instruct-bnb-4bit');
    expect(result.outputDir).toBe(path.join('training', 'output', 'forge'));
    expect(result.epochs).toBe(2);
    expect(result.maxSeqLength).toBe(1024);
    expect(result.learningRate).toBe(2e-4);
    expect(result.minAssistantChars).toBe(0);
    expect(result.maxDuplicateRatio).toBe(1.0);
    expect(result.dryRun).toBe(false);
    expect(result.skipTraining).toBe(false);
  });

  it('exits with error when --companion-id is missing', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs([])).toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--companion-id is required'),
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ============================================================================
// validateCompanionId
// ============================================================================

describe('validateCompanionId', () => {
  it('accepts known companion IDs', () => {
    expect(() => validateCompanionId('cipher')).not.toThrow();
    expect(() => validateCompanionId('forge')).not.toThrow();
    expect(() => validateCompanionId('vortex')).not.toThrow();
    expect(() => validateCompanionId('mischief')).not.toThrow();
    expect(() => validateCompanionId('aether')).not.toThrow();
    expect(() => validateCompanionId('catalyst')).not.toThrow();
  });

  it('rejects unknown companion IDs with clear error', () => {
    expect(() => validateCompanionId('unknown')).toThrow(
      /Unknown companionId "unknown"/,
    );
    expect(() => validateCompanionId('unknown')).toThrow(
      /Available:/,
    );
  });
});

// ============================================================================
// validateDataFile
// ============================================================================

describe('validateDataFile', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
  });

  it('passes when file exists and has content', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats);

    expect(() => validateDataFile('/data/training.jsonl')).not.toThrow();
  });

  it('reports clear error when data file is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => validateDataFile('/data/training.jsonl')).toThrow(
      /Training data file not found/,
    );
  });

  it('reports error when data file is empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as fs.Stats);

    expect(() => validateDataFile('/data/training.jsonl')).toThrow(
      /Training data file is empty/,
    );
  });
});

// ============================================================================
// validateOllama
// ============================================================================

describe('validateOllama', () => {
  it('succeeds when Ollama is healthy', async () => {
    const mock = getMockClient();
    vi.mocked(mock.checkHealth).mockResolvedValue({
      healthy: true,
      latencyMs: 10,
      version: '0.5.1',
    });

    const client = await validateOllama();
    expect(client).toBeDefined();
  });

  it('reports clear error when Ollama is not running', async () => {
    const mock = getMockClient();
    vi.mocked(mock.checkHealth).mockResolvedValue({
      healthy: false,
      latencyMs: 0,
      error: 'Connection refused',
    });

    await expect(validateOllama()).rejects.toThrow(
      /Ollama is not running or unreachable/,
    );
  });
});

// ============================================================================
// validatePython
// ============================================================================

describe('validatePython', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('finds python3 first', () => {
    vi.mocked(execSync).mockReturnValue('Python 3.11.7');
    const cmd = validatePython();
    expect(cmd).toBe('python3');
    expect(execSync).toHaveBeenCalledWith('python3 --version', expect.anything());
  });

  it('falls back to python when python3 is not available', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => { throw new Error('not found'); })
      .mockReturnValueOnce('Python 3.10.0' as never);

    const cmd = validatePython();
    expect(cmd).toBe('python');
  });

  it('throws when neither python3 nor python is available', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    expect(() => validatePython()).toThrow(/Python not found/);
  });
});

// ============================================================================
// toWslPath
// ============================================================================

describe('toWslPath', () => {
  it('converts Windows paths correctly', () => {
    expect(toWslPath('C:\\Users\\lucid\\project')).toBe('/mnt/c/Users/lucid/project');
    expect(toWslPath('D:\\data\\training.jsonl')).toBe('/mnt/d/data/training.jsonl');
  });

  it('converts forward-slash Windows paths', () => {
    expect(toWslPath('C:/Users/lucid/project')).toBe('/mnt/c/Users/lucid/project');
  });

  it('passes through non-Windows paths unchanged', () => {
    expect(toWslPath('/home/user/data')).toBe('/home/user/data');
    expect(toWslPath('./relative/path')).toBe('./relative/path');
  });

  it('handles uppercase and lowercase drive letters', () => {
    expect(toWslPath('c:\\data')).toBe('/mnt/c/data');
    expect(toWslPath('E:\\data')).toBe('/mnt/e/data');
  });
});

// ============================================================================
// buildPythonArgs
// ============================================================================

describe('buildPythonArgs', () => {
  const baseArgs: TrainCompanionArgs = {
    companionId: 'cipher',
    dataPath: 'data/training/cipher/training.jsonl',
    baseModel: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
    outputDir: 'training/output/cipher',
    dryRun: false,
    skipTraining: false,
  };

  it('constructs correct Python subprocess arguments', () => {
    // Force non-windows for this test
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const result = buildPythonArgs('python3', baseArgs);
    expect(result.command).toBe('python3');
    expect(result.spawnArgs).toContain(path.join('training', 'fine-tune.py'));
    expect(result.spawnArgs).toContain('--companion-id');
    expect(result.spawnArgs).toContain('cipher');
    expect(result.spawnArgs).toContain('--data-path');
    expect(result.spawnArgs).toContain('--base-model');
    expect(result.spawnArgs).toContain('--output-dir');

    if (origPlatform) {
      Object.defineProperty(process, 'platform', origPlatform);
    }
  });

  it('passes --dry-run flag through to Python script', () => {
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const dryRunArgs = { ...baseArgs, dryRun: true };
    const result = buildPythonArgs('python3', dryRunArgs);
    expect(result.spawnArgs).toContain('--dry-run');

    if (origPlatform) {
      Object.defineProperty(process, 'platform', origPlatform);
    }
  });

  it('uses wsl prefix on Windows', () => {
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = buildPythonArgs('python3', baseArgs);
    expect(result.command).toBe('wsl');
    expect(result.spawnArgs[0]).toBe('bash');
    expect(result.spawnArgs[1]).toContain('/mnt/');
    expect(result.spawnArgs[1]).toContain('training/run-python-wsl.sh');
    expect(result.spawnArgs[2]).toContain('/mnt/');
    expect(result.spawnArgs[2]).toContain('training/fine-tune.py');
    expect(result.spawnArgs).toContain('--skip-gguf-export');

    if (origPlatform) {
      Object.defineProperty(process, 'platform', origPlatform);
    }
  });

  it('normalizes Windows python fallback to python3 inside WSL', () => {
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = buildPythonArgs('python', baseArgs);
    expect(result.command).toBe('wsl');
    expect(result.spawnArgs[0]).toBe('bash');
    expect(result.spawnArgs[1]).toContain('training/run-python-wsl.sh');
    expect(result.spawnArgs[2]).toContain('training/fine-tune.py');

    if (origPlatform) {
      Object.defineProperty(process, 'platform', origPlatform);
    }
  });
});

// ============================================================================
// generateAndWriteModelfile
// ============================================================================

describe('generateAndWriteModelfile', () => {
  it('calls generateModelfile with correct ggufPath', () => {
    // generateModelfile is not mocked - it calls through to the real
    // implementation which writes via the mocked fs.writeFileSync.
    const result = generateAndWriteModelfile('cipher', 'training/output/cipher');
    expect(result.modelName).toBe('kin-cipher');
    expect(result.modelfilePath).toBe(path.join('training', 'output', 'cipher', 'Modelfile'));
  });

  it('writes an absolute GGUF path into the Modelfile FROM line', () => {
    generateAndWriteModelfile('cipher', 'training/output/cipher');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join('training', 'output', 'cipher', 'Modelfile'),
      expect.stringContaining(`FROM ${path.resolve('training/output/cipher', 'unsloth.Q4_K_M.gguf')}`),
      'utf-8',
    );
  });
});

// ============================================================================
// registerWithOllama
// ============================================================================

describe('registerWithOllama', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('calls ollama create with correct model name and Modelfile path', () => {
    vi.mocked(execSync).mockReturnValue('success');

    registerWithOllama('kin-cipher', 'training/output/cipher/Modelfile');

    expect(execSync).toHaveBeenCalledWith(
      'ollama create kin-cipher -f "training/output/cipher/Modelfile"',
      expect.objectContaining({ maxBuffer: 32 * 1024 * 1024 }),
    );
  });

  it('throws on ollama create failure', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('ollama not found');
    });

    expect(() =>
      registerWithOllama('kin-cipher', 'training/output/cipher/Modelfile'),
    ).toThrow(/Failed to register model with Ollama/);
  });
});

// ============================================================================
// verifyModel
// ============================================================================

describe('verifyModel', () => {
  it('succeeds when model is found and responds', async () => {
    const mock = getMockClient();
    vi.mocked(mock.hasModel).mockResolvedValue(true);
    vi.mocked(mock.chat).mockResolvedValue({
      model: 'kin-cipher',
      created_at: '',
      message: { role: 'assistant', content: 'I am Cipher, the Code Kraken!' },
      done: true,
    });

    // Should not throw
    await verifyModel(mock as unknown as OllamaClient, 'kin-cipher');
    expect(mock.hasModel).toHaveBeenCalledWith('kin-cipher');
    expect(mock.chat).toHaveBeenCalled();
  });

  it('warns but does not throw when model is not found', async () => {
    const mock = getMockClient();
    vi.mocked(mock.hasModel).mockResolvedValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await verifyModel(mock as unknown as OllamaClient, 'kin-cipher');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found in Ollama model list'),
    );

    warnSpy.mockRestore();
  });
});

// ============================================================================
// runPipeline - integration scenarios
// ============================================================================

describe('runPipeline', () => {
  let mockClient: ReturnType<typeof getMockClient>;

  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.statSync).mockReset();

    mockClient = getMockClient();
    vi.mocked(mockClient.checkHealth).mockResolvedValue({
      healthy: true,
      latencyMs: 5,
      version: '0.5.1',
    });
    vi.mocked(mockClient.hasModel).mockResolvedValue(true);
    vi.mocked(mockClient.chat).mockResolvedValue({
      model: 'kin-cipher',
      created_at: '',
      message: { role: 'assistant', content: 'Hello!' },
      done: true,
    });
    vi.mocked(mockClient.getModelInfo).mockRejectedValue(new Error('not available'));
  });

  it('--skip-training skips Python invocation but still generates Modelfile and registers model', async () => {
    // Don't need data file or python for skip-training
    vi.mocked(execSync).mockReturnValue('success' as never);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const args: TrainCompanionArgs = {
      companionId: 'cipher',
      dataPath: 'data/training/cipher/training.jsonl',
      baseModel: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
      outputDir: 'training/output/cipher',
      dryRun: false,
      skipTraining: true,
    };

    await runPipeline(args);

    // Should have called ollama create (registration)
    const execCalls = vi.mocked(execSync).mock.calls.map(c => String(c[0]));
    const ollamaCreateCall = execCalls.find(c => c.startsWith('ollama create'));
    expect(ollamaCreateCall).toBeDefined();
    expect(ollamaCreateCall).toContain('kin-cipher');

    // Should NOT have called python3 --version (validation skipped for skip-training)
    // Note: spawn is not called either since training is skipped
  });

  it('rejects pipeline when Ollama is not running', async () => {
    vi.mocked(mockClient.checkHealth).mockResolvedValue({
      healthy: false,
      latencyMs: 0,
      error: 'Connection refused',
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);

    const args: TrainCompanionArgs = {
      companionId: 'cipher',
      dataPath: 'data/training/cipher/training.jsonl',
      baseModel: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
      outputDir: 'training/output/cipher',
      dryRun: false,
      skipTraining: false,
    };

    await expect(runPipeline(args)).rejects.toThrow(
      /Ollama is not running/,
    );
  });

  it('rejects pipeline for unknown companionId', async () => {
    const args: TrainCompanionArgs = {
      companionId: 'nonexistent',
      dataPath: 'data/training/nonexistent/training.jsonl',
      baseModel: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
      outputDir: 'training/output/nonexistent',
      dryRun: false,
      skipTraining: false,
    };

    await expect(runPipeline(args)).rejects.toThrow(
      /Unknown companionId "nonexistent"/,
    );
  });

  it('rejects pipeline when data file is missing and not skipping training', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const args: TrainCompanionArgs = {
      companionId: 'cipher',
      dataPath: 'data/training/cipher/training.jsonl',
      baseModel: 'unsloth/Llama-3.2-1B-Instruct-bnb-4bit',
      outputDir: 'training/output/cipher',
      dryRun: false,
      skipTraining: false,
    };

    await expect(runPipeline(args)).rejects.toThrow(
      /Training data file not found/,
    );
  });
});
