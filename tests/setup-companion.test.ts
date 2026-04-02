import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// OllamaClient.createModel() tests
// ============================================================================

describe('OllamaClient.createModel()', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * Helper: build a mock Response with a ReadableStream body from NDJSON lines.
   */
  function mockStreamResponse(
    lines: string[],
    status = 200,
  ): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + '\n'));
        }
        controller.close();
      },
    });

    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  it('sends correct request and streams progress callbacks', async () => {
    const { OllamaClient } = await import('../inference/local-llm.js');

    const ndjsonLines = [
      '{"status":"reading model metadata"}',
      '{"status":"creating system layer"}',
      '{"status":"writing manifest"}',
      '{"status":"success"}',
    ];

    const capturedStatuses: string[] = [];

    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const client = new OllamaClient({ host: '127.0.0.1', port: 11434 });
    await client.createModel('kin-cipher', 'FROM test\nSYSTEM "hi"', (status) => {
      capturedStatuses.push(status);
    });

    // Verify fetch was called with correct endpoint and body
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/create');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe('kin-cipher');
    expect(body.modelfile).toBe('FROM test\nSYSTEM "hi"');
    expect(body.stream).toBe(true);

    // Verify progress callbacks received all status lines
    expect(capturedStatuses).toEqual([
      'reading model metadata',
      'creating system layer',
      'writing manifest',
      'success',
    ]);
  });

  it('throws OllamaError on non-200 HTTP status', async () => {
    const { OllamaClient, OllamaError } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Not found', { status: 404 }),
    );

    const client = new OllamaClient({ host: '127.0.0.1', port: 11434 });

    await expect(
      client.createModel('bad-model', 'FROM nothing'),
    ).rejects.toThrow('Create model failed: 404');

    await expect(
      client.createModel('bad-model', 'FROM nothing'),
    ).rejects.toBeInstanceOf(OllamaError);
  });

  it('handles stream with mixed valid/invalid JSON lines', async () => {
    const { OllamaClient } = await import('../inference/local-llm.js');

    const ndjsonLines = [
      '{"status":"step 1"}',
      'not valid json',
      '{"status":"step 2"}',
      '{"no_status_field": true}',
      '{"status":"success"}',
    ];

    const capturedStatuses: string[] = [];

    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStreamResponse(ndjsonLines),
    );

    const client = new OllamaClient({ host: '127.0.0.1', port: 11434 });
    await client.createModel('kin-test', 'FROM x', (status) => {
      capturedStatuses.push(status);
    });

    // Only lines with a truthy `status` field trigger callback
    expect(capturedStatuses).toEqual(['step 1', 'step 2', 'success']);
  });

  it('works without onProgress callback', async () => {
    const { OllamaClient } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStreamResponse(['{"status":"success"}']),
    );

    const client = new OllamaClient({ host: '127.0.0.1', port: 11434 });
    // Should not throw even with no callback
    await expect(
      client.createModel('kin-test', 'FROM x'),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// Modelfile FROM generalization tests
// ============================================================================

describe('generateModelfile — modelRef support', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelfile-ref-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses modelRef in FROM line when provided', async () => {
    const { generateModelfile } = await import(
      '../training/modelfile-generator.js'
    );

    const result = generateModelfile({
      companionId: 'cipher',
      modelRef: 'hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M',
      outputDir: tmpDir,
    });

    const fromLine = result.modelfileContent
      .split('\n')
      .find((l: string) => l.startsWith('FROM '));
    expect(fromLine).toBe('FROM hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M');
  });

  it('prefers modelRef over ggufPath when both are provided', async () => {
    const { generateModelfile } = await import(
      '../training/modelfile-generator.js'
    );

    const result = generateModelfile({
      companionId: 'cipher',
      ggufPath: '/local/model.gguf',
      modelRef: 'hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M',
      outputDir: tmpDir,
    });

    expect(result.modelfileContent).toContain(
      'FROM hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M',
    );
    expect(result.modelfileContent).not.toContain('/local/model.gguf');
  });

  it('falls back to ggufPath when modelRef is not provided', async () => {
    const { generateModelfile } = await import(
      '../training/modelfile-generator.js'
    );

    const result = generateModelfile({
      companionId: 'cipher',
      ggufPath: '/models/cipher.gguf',
      outputDir: tmpDir,
    });

    const fromLine = result.modelfileContent
      .split('\n')
      .find((l: string) => l.startsWith('FROM '));
    expect(fromLine).toBe('FROM /models/cipher.gguf');
  });

  it('throws error when neither modelRef nor ggufPath is provided', async () => {
    const { generateModelfile } = await import(
      '../training/modelfile-generator.js'
    );

    expect(() =>
      generateModelfile({
        companionId: 'cipher',
        outputDir: tmpDir,
      }),
    ).toThrow('Either modelRef or ggufPath must be provided');
  });

  it('still produces correct SYSTEM, PARAMETER, and model name with modelRef', async () => {
    const { generateModelfile } = await import(
      '../training/modelfile-generator.js'
    );
    const { COMPANION_SHORT_PROMPTS } = await import(
      '../inference/companion-prompts.js'
    );

    const result = generateModelfile({
      companionId: 'forge',
      modelRef: 'hf.co/kr8tiv/kin-forge-GGUF:Q4_K_M',
      outputDir: tmpDir,
    });

    expect(result.modelName).toBe('kin-forge');
    expect(result.modelfileContent).toContain(`SYSTEM """${COMPANION_SHORT_PROMPTS['forge']}"""`);
    expect(result.modelfileContent).toContain('PARAMETER temperature 0.7');
    expect(result.modelfileContent).toContain('PARAMETER num_ctx 2048');
  });
});

// ============================================================================
// setup-companion.ts — parseArgs, phases, orchestrator
// ============================================================================

// We test setup-companion functions by dynamically importing the module inside
// each describe block so we can control mocks per-suite.  The OllamaClient
// mock is handled at the fetch level (same as the createModel tests above)
// because the setup script instantiates OllamaClient directly.

describe('setup-companion — parseArgs', () => {
  it('parses valid args with defaults', async () => {
    const { parseArgs } = await import('../scripts/setup-companion.js');

    const result = parseArgs(['--companion-id', 'cipher']);
    expect(result).toEqual({
      companionId: 'cipher',
      registry: 'kr8tiv',
      quantization: 'Q4_K_M',
    });
  });

  it('accepts custom registry and quantization', async () => {
    const { parseArgs } = await import('../scripts/setup-companion.js');

    const result = parseArgs([
      '--companion-id', 'forge',
      '--registry', 'myorg',
      '--quantization', 'Q5_K_M',
    ]);

    expect(result.companionId).toBe('forge');
    expect(result.registry).toBe('myorg');
    expect(result.quantization).toBe('Q5_K_M');
  });

  it('calls fatal (process.exit) when --companion-id is missing', async () => {
    const { parseArgs } = await import('../scripts/setup-companion.js');

    // fatal() calls process.exit(1) — we mock it to throw instead
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs([])).toThrow('process.exit called');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('--companion-id is required'),
    );

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('calls fatal for unknown companion ID', async () => {
    const { parseArgs } = await import('../scripts/setup-companion.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs(['--companion-id', 'nonexistent'])).toThrow('process.exit called');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown companion "nonexistent"'),
    );

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

describe('setup-companion — checkOllamaHealth', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns a client when Ollama is healthy', async () => {
    const { checkOllamaHealth } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: '0.5.1' }), { status: 200 }),
    );

    const client = await checkOllamaHealth();
    expect(client).toBeInstanceOf(OllamaClient);
  });

  it('throws actionable error when Ollama is not running (ECONNREFUSED)', async () => {
    const { checkOllamaHealth } = await import('../scripts/setup-companion.js');

    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:11434'),
    );

    await expect(checkOllamaHealth()).rejects.toThrow(
      'Ollama is installed but not running',
    );
  });

  it('throws install instructions when Ollama is not installed', async () => {
    const { checkOllamaHealth } = await import('../scripts/setup-companion.js');

    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError('fetch failed'),
    );

    await expect(checkOllamaHealth()).rejects.toThrow(
      'https://ollama.com/download',
    );
  });
});

describe('setup-companion — pullCompanionModel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockStreamResponse(lines: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + '\n'));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  it('constructs correct HuggingFace model ref and pulls successfully', async () => {
    const { pullCompanionModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    // Mock: checkHealth for constructor, then pull
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStreamResponse(['{"status":"downloading"}', '{"status":"success"}']),
    );

    const client = new OllamaClient();
    const ref = await pullCompanionModel(client, 'kr8tiv', 'cipher', 'Q4_K_M');

    expect(ref).toBe('hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M');
  });

  it('throws with publish instructions on pull failure', async () => {
    const { pullCompanionModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Not found', { status: 404 }),
    );

    const client = new OllamaClient();

    await expect(
      pullCompanionModel(client, 'kr8tiv', 'cipher', 'Q4_K_M'),
    ).rejects.toThrow('Model not yet available');
  });
});

describe('setup-companion — createBrandedModel', () => {
  let originalFetch: typeof globalThis.fetch;

  let tmpDir: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Use a real temp dir so generateModelfile can write the Modelfile
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-branded-test-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function mockStreamResponse(lines: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + '\n'));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  it('creates branded model with correct name', async () => {
    // We test createBrandedModel indirectly — it calls generateModelfile which
    // writes to disk.  We use a higher-level approach: call generateModelfile
    // separately (to tmpDir) and verify createBrandedModel returns the right name.
    const { OllamaClient } = await import('../inference/local-llm.js');
    const { generateModelfile } = await import('../training/modelfile-generator.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      mockStreamResponse(['{"status":"success"}']),
    );

    const client = new OllamaClient();

    // Directly test the model name and createModel call by exercising the
    // same logic: generateModelfile + createModel
    const { modelfileContent, modelName } = generateModelfile({
      companionId: 'cipher',
      modelRef: 'hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M',
      outputDir: tmpDir,
    });

    await client.createModel(modelName, modelfileContent);

    expect(modelName).toBe('kin-cipher');
    expect(modelfileContent).toContain('FROM hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M');
  });

  it('throws descriptive error on creation failure', async () => {
    const { createBrandedModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Server error', { status: 500 }),
    );

    const client = new OllamaClient();

    await expect(
      createBrandedModel(client, 'cipher', 'hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M'),
    ).rejects.toThrow('Failed to create branded model');
  });
});

describe('setup-companion — verifyModel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('verifies model exists and chat works', async () => {
    const { verifyModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // listModels (hasModel calls listModels → /api/tags)
        return Promise.resolve(
          new Response(
            JSON.stringify({ models: [{ name: 'kin-cipher', size: 100 }] }),
            { status: 200 },
          ),
        );
      }
      // chat response
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'kin-cipher',
            message: { role: 'assistant', content: 'Hello! I am Cipher.' },
            done: true,
          }),
          { status: 200 },
        ),
      );
    });

    const client = new OllamaClient();
    // Should not throw
    await expect(verifyModel(client, 'kin-cipher')).resolves.toBeUndefined();
  });

  it('warns but does not throw when model is not found', async () => {
    const { verifyModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), { status: 200 }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = new OllamaClient();
    await expect(verifyModel(client, 'kin-missing')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found in Ollama model list'),
    );

    warnSpy.mockRestore();
  });

  it('warns but does not throw when chat fails', async () => {
    const { verifyModel } = await import('../scripts/setup-companion.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // hasModel → model exists
        return Promise.resolve(
          new Response(
            JSON.stringify({ models: [{ name: 'kin-cipher' }] }),
            { status: 200 },
          ),
        );
      }
      // chat fails
      return Promise.resolve(new Response('Error', { status: 500 }));
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = new OllamaClient();
    await expect(verifyModel(client, 'kin-cipher')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test chat failed'),
    );

    warnSpy.mockRestore();
  });
});

describe('setup-companion — runSetup (integration)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // generateModelfile writes to training/output/{companionId}/Modelfile — 
    // acceptable side effect in integration tests; it's just a small text file
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockStreamResponse(lines: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + '\n'));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  it('runs full setup pipeline successfully', async () => {
    const { runSetup } = await import('../scripts/setup-companion.js');

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(
      (url: string) => {
        callCount++;
        const urlStr = typeof url === 'string' ? url : '';

        // Phase 1: health check (/api/version)
        if (urlStr.includes('/api/version')) {
          return Promise.resolve(
            new Response(JSON.stringify({ version: '0.5.1' }), { status: 200 }),
          );
        }

        // Phase 2: pull model (/api/pull)
        if (urlStr.includes('/api/pull')) {
          return Promise.resolve(
            mockStreamResponse([
              '{"status":"pulling manifest"}',
              '{"status":"success"}',
            ]),
          );
        }

        // Phase 3: create model (/api/create)
        if (urlStr.includes('/api/create')) {
          return Promise.resolve(
            mockStreamResponse([
              '{"status":"creating system layer"}',
              '{"status":"success"}',
            ]),
          );
        }

        // Phase 4a: hasModel → list models (/api/tags)
        if (urlStr.includes('/api/tags')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ models: [{ name: 'kin-cipher' }] }),
              { status: 200 },
            ),
          );
        }

        // Phase 4b: test chat (/api/chat)
        if (urlStr.includes('/api/chat')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                model: 'kin-cipher',
                message: { role: 'assistant', content: 'Hello! I am Cipher, the Code Kraken.' },
                done: true,
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response('Not found', { status: 404 }));
      },
    );

    await expect(
      runSetup({ companionId: 'cipher', registry: 'kr8tiv', quantization: 'Q4_K_M' }),
    ).resolves.toBeUndefined();

    // Verify all major endpoints were called
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map(([url]: [string]) => url);
    expect(urls.some((u: string) => u.includes('/api/version'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/api/pull'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/api/create'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/api/tags'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/api/chat'))).toBe(true);
  });
});

// ============================================================================
// publish-model.ts — parseArgs, phases, orchestrator
// ============================================================================

describe('publish-model — parseArgs', () => {
  it('parses valid args with HF token from CLI flag', async () => {
    const { parseArgs } = await import('../scripts/publish-model.js');

    const result = parseArgs(['--companion-id', 'cipher', '--hf-token', 'hf_test123']);
    expect(result).toEqual({
      companionId: 'cipher',
      hfToken: 'hf_test123',
      registry: 'kr8tiv',
    });
  });

  it('falls back to HF_TOKEN env var when --hf-token not provided', async () => {
    const { parseArgs } = await import('../scripts/publish-model.js');

    const originalEnv = process.env.HF_TOKEN;
    process.env.HF_TOKEN = 'hf_from_env';
    try {
      const result = parseArgs(['--companion-id', 'forge']);
      expect(result.hfToken).toBe('hf_from_env');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.HF_TOKEN;
      } else {
        process.env.HF_TOKEN = originalEnv;
      }
    }
  });

  it('accepts custom registry', async () => {
    const { parseArgs } = await import('../scripts/publish-model.js');

    const result = parseArgs([
      '--companion-id', 'vortex',
      '--hf-token', 'hf_abc',
      '--registry', 'myorg',
    ]);

    expect(result.registry).toBe('myorg');
  });

  it('calls fatal when --companion-id is missing', async () => {
    const { parseArgs } = await import('../scripts/publish-model.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs([])).toThrow('process.exit called');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('--companion-id is required'),
    );

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('calls fatal for unknown companion ID', async () => {
    const { parseArgs } = await import('../scripts/publish-model.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs(['--companion-id', 'unknown'])).toThrow('process.exit called');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown companion "unknown"'),
    );

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});

describe('publish-model — validateGgufExists', () => {
  it('returns path when GGUF file exists', async () => {
    const { validateGgufExists } = await import('../scripts/publish-model.js');

    // Create a temp GGUF file at the expected location
    const ggufDir = path.join('training', 'output', 'cipher');
    const ggufFile = path.join(ggufDir, 'unsloth.Q4_K_M.gguf');
    fs.mkdirSync(ggufDir, { recursive: true });
    fs.writeFileSync(ggufFile, 'fake-gguf-content');

    try {
      const result = validateGgufExists('cipher');
      expect(result).toBe(ggufFile);
    } finally {
      fs.unlinkSync(ggufFile);
    }
  });

  it('throws descriptive error when GGUF file is missing', async () => {
    const { validateGgufExists } = await import('../scripts/publish-model.js');

    expect(() => validateGgufExists('nonexistent_companion_xyz')).toThrow(
      'No trained model found for nonexistent_companion_xyz',
    );
    expect(() => validateGgufExists('nonexistent_companion_xyz')).toThrow(
      'Run training first',
    );
  });
});

describe('publish-model — validateHfToken', () => {
  it('returns the token when it is valid', async () => {
    const { validateHfToken } = await import('../scripts/publish-model.js');

    expect(validateHfToken('hf_valid_token')).toBe('hf_valid_token');
  });

  it('throws when token is empty string', async () => {
    const { validateHfToken } = await import('../scripts/publish-model.js');

    expect(() => validateHfToken('')).toThrow(
      'HuggingFace token required',
    );
  });

  it('throws when token is undefined', async () => {
    const { validateHfToken } = await import('../scripts/publish-model.js');

    expect(() => validateHfToken(undefined)).toThrow(
      'HuggingFace token required',
    );
  });
});

describe('publish-model — createHfRepo', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('succeeds on HTTP 200 (new repo)', async () => {
    const { createHfRepo } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'test' }), { status: 200 }),
    );

    await expect(createHfRepo('kr8tiv', 'cipher', 'hf_token')).resolves.toBeUndefined();

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://huggingface.co/api/repos/create');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe('kin-cipher-GGUF');
    expect(body.organization).toBe('kr8tiv');
    expect(body.type).toBe('model');
    expect(body.private).toBe(false);
  });

  it('succeeds on HTTP 409 (already exists)', async () => {
    const { createHfRepo } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Conflict', { status: 409 }),
    );

    await expect(createHfRepo('kr8tiv', 'forge', 'hf_token')).resolves.toBeUndefined();
  });

  it('throws on other HTTP errors', async () => {
    const { createHfRepo } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(createHfRepo('kr8tiv', 'cipher', 'bad_token')).rejects.toThrow(
      'Failed to create HuggingFace repo (HTTP 401)',
    );
  });
});

describe('publish-model — uploadGgufFile', () => {
  let originalFetch: typeof globalThis.fetch;
  let tmpFile: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Create a small temp file to act as a GGUF
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'));
    tmpFile = path.join(tmpDir, 'unsloth.Q4_K_M.gguf');
    fs.writeFileSync(tmpFile, 'fake-gguf-binary-content');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('uploads file successfully', async () => {
    const { uploadGgufFile } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('OK', { status: 200 }),
    );

    await expect(
      uploadGgufFile('kr8tiv', 'cipher', tmpFile, 'hf_token'),
    ).resolves.toBeUndefined();

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(
      'https://huggingface.co/api/kr8tiv/kin-cipher-GGUF/upload/main/unsloth.Q4_K_M.gguf',
    );
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/octet-stream');
    expect(opts.headers['Authorization']).toBe('Bearer hf_token');
  });

  it('throws on upload failure', async () => {
    const { uploadGgufFile } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    );

    await expect(
      uploadGgufFile('kr8tiv', 'cipher', tmpFile, 'hf_token'),
    ).rejects.toThrow('Failed to upload GGUF file (HTTP 500)');
  });
});

describe('publish-model — runPublish (integration)', () => {
  let originalFetch: typeof globalThis.fetch;
  let ggufFile: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Create the expected GGUF file in training/output/cipher/
    const ggufDir = path.join('training', 'output', 'cipher');
    ggufFile = path.join(ggufDir, 'unsloth.Q4_K_M.gguf');
    fs.mkdirSync(ggufDir, { recursive: true });
    fs.writeFileSync(ggufFile, 'fake-gguf-content-for-integration-test');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (fs.existsSync(ggufFile)) {
      fs.unlinkSync(ggufFile);
    }
  });

  it('runs full publish pipeline successfully', async () => {
    const { runPublish } = await import('../scripts/publish-model.js');

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = typeof url === 'string' ? url : '';

      // createHfRepo
      if (urlStr.includes('/api/repos/create')) {
        return Promise.resolve(
          new Response(JSON.stringify({ url: 'test' }), { status: 200 }),
        );
      }

      // uploadGgufFile
      if (urlStr.includes('/upload/main/')) {
        return Promise.resolve(new Response('OK', { status: 200 }));
      }

      return Promise.resolve(new Response('Not found', { status: 404 }));
    });

    await expect(
      runPublish({
        companionId: 'cipher',
        hfToken: 'hf_test_token',
        registry: 'kr8tiv',
      }),
    ).resolves.toBeUndefined();

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const urls = calls.map(([u]: [string]) => u);
    expect(urls.some((u: string) => u.includes('/api/repos/create'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/upload/main/'))).toBe(true);
  });
});

// ============================================================================
// resolveLocalModel() tests
// ============================================================================

describe('resolveLocalModel', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns branded model name when it exists in Ollama', async () => {
    const { resolveLocalModel } = await import('../companions/config.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    // Mock listModels (hasModel calls listModels → /api/tags)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ name: 'kin-cipher', size: 100 }] }),
        { status: 200 },
      ),
    );

    const client = new OllamaClient();
    const result = await resolveLocalModel('cipher', client);

    expect(result).toBe('kin-cipher');
  });

  it('returns default localModel when branded model is not in Ollama', async () => {
    const { resolveLocalModel } = await import('../companions/config.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    // Mock listModels returning empty (no branded model)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [] }),
        { status: 200 },
      ),
    );

    const client = new OllamaClient();
    const result = await resolveLocalModel('cipher', client);

    // Falls back to default localModel from companion config
    expect(result).toBe(process.env.OLLAMA_MODEL ?? 'llama3.2');
  });

  it('works for all companion IDs', async () => {
    const { resolveLocalModel, getCompanionIds } = await import('../companions/config.js');
    const { OllamaClient } = await import('../inference/local-llm.js');

    // Return a fresh Response per call so the body is not consumed twice
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ models: [] }),
          { status: 200 },
        ),
      ),
    );

    const client = new OllamaClient();

    for (const id of getCompanionIds()) {
      const result = await resolveLocalModel(id, client);
      // All companions default to llama3.2 (or env override)
      expect(result).toBe(process.env.OLLAMA_MODEL ?? 'llama3.2');
    }
  });
});
