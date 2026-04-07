/**
 * Tests for new frontier providers: DeepSeek, Mistral, Together AI, Fireworks
 *
 * Validates registration in the provider registry, isConfigured() behavior,
 * and spec correctness for all 4 new OpenAI-compatible providers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The providers read process.env at construction time (in the OpenAICompatProvider constructor),
// so we need to stub env vars BEFORE importing the modules for the "configured" tests.
// For "unconfigured" tests, we import normally (no env vars set).

describe('New Frontier Providers', () => {
  // -------------------------------------------------------------------------
  // Registration & spec correctness (no API keys set)
  // -------------------------------------------------------------------------
  describe('provider registration and spec correctness', () => {
    // Dynamic import to get fresh registry state
    let getProvider: typeof import('../inference/providers/index.js').getProvider;

    beforeEach(async () => {
      vi.resetModules();
      const mod = await import('../inference/providers/index.js');
      getProvider = mod.getProvider;
    });

    const EXPECTED_SPECS = [
      {
        id: 'deepseek' as const,
        modelId: 'deepseek-r1',
        displayName: 'DeepSeek R1',
        contextWindow: 128_000,
        apiBaseUrl: 'https://api.deepseek.com/v1',
        apiKeyEnvVar: 'DEEPSEEK_API_KEY',
        inputPer1M: 0.55,
        outputPer1M: 2.19,
      },
      {
        id: 'mistral' as const,
        modelId: 'mistral-large-latest',
        displayName: 'Mistral Large',
        contextWindow: 128_000,
        apiBaseUrl: 'https://api.mistral.ai/v1',
        apiKeyEnvVar: 'MISTRAL_API_KEY',
        inputPer1M: 2.0,
        outputPer1M: 6.0,
      },
      {
        id: 'together' as const,
        modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        displayName: 'Together AI Llama 3.3 70B',
        contextWindow: 128_000,
        apiBaseUrl: 'https://api.together.xyz/v1',
        apiKeyEnvVar: 'TOGETHER_API_KEY',
        inputPer1M: 0.88,
        outputPer1M: 0.88,
      },
      {
        id: 'fireworks' as const,
        modelId: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        displayName: 'Fireworks Llama 3.3 70B',
        contextWindow: 128_000,
        apiBaseUrl: 'https://api.fireworks.ai/inference/v1',
        apiKeyEnvVar: 'FIREWORKS_API_KEY',
        inputPer1M: 0.90,
        outputPer1M: 0.90,
      },
    ];

    for (const expected of EXPECTED_SPECS) {
      describe(expected.id, () => {
        it(`is retrievable via getProvider('${expected.id}')`, () => {
          const provider = getProvider(expected.id);
          expect(provider).toBeDefined();
          expect(provider!.id).toBe(expected.id);
        });

        it('has correct spec fields', () => {
          const provider = getProvider(expected.id)!;
          expect(provider.spec.providerId).toBe(expected.id);
          expect(provider.spec.modelId).toBe(expected.modelId);
          expect(provider.spec.displayName).toBe(expected.displayName);
          expect(provider.spec.contextWindow).toBe(expected.contextWindow);
          expect(provider.spec.apiBaseUrl).toBe(expected.apiBaseUrl);
          expect(provider.spec.apiKeyEnvVar).toBe(expected.apiKeyEnvVar);
          expect(provider.spec.pricing.inputPer1M).toBe(expected.inputPer1M);
          expect(provider.spec.pricing.outputPer1M).toBe(expected.outputPer1M);
        });

        it('returns a valid FrontierProvider shape', () => {
          const provider = getProvider(expected.id)!;
          expect(typeof provider.isConfigured).toBe('function');
          expect(typeof provider.chat).toBe('function');
          expect(provider.spec).toBeDefined();
          expect(provider.spec.apiBaseUrl).toMatch(/^https:\/\//);
          expect(provider.spec.modelId).toBeTruthy();
          expect(provider.spec.apiKeyEnvVar).toBeTruthy();
        });

        it('isConfigured() returns false when env var is unset', () => {
          const provider = getProvider(expected.id)!;
          expect(provider.isConfigured()).toBe(false);
        });
      });
    }
  });

  // -------------------------------------------------------------------------
  // isConfigured() returns true when env var is set
  // -------------------------------------------------------------------------
  describe('isConfigured() with API key set', () => {
    const PROVIDER_ENV_PAIRS = [
      { id: 'deepseek' as const, envVar: 'DEEPSEEK_API_KEY', module: '../inference/providers/deepseek.js', exportName: 'deepseekProvider' },
      { id: 'mistral' as const, envVar: 'MISTRAL_API_KEY', module: '../inference/providers/mistral.js', exportName: 'mistralProvider' },
      { id: 'together' as const, envVar: 'TOGETHER_API_KEY', module: '../inference/providers/together.js', exportName: 'togetherProvider' },
      { id: 'fireworks' as const, envVar: 'FIREWORKS_API_KEY', module: '../inference/providers/fireworks.js', exportName: 'fireworksProvider' },
    ];

    for (const { id, envVar, module: mod, exportName } of PROVIDER_ENV_PAIRS) {
      it(`${id}: isConfigured() returns true when ${envVar} is set`, async () => {
        vi.resetModules();
        vi.stubEnv(envVar, 'test-api-key-12345');

        // Re-import so the constructor reads the now-set env var
        const imported = await import(mod);
        const provider = imported[exportName];

        expect(provider.isConfigured()).toBe(true);

        vi.unstubAllEnvs();
      });
    }
  });
});
