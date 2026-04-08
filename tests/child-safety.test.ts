/**
 * Tests for inference/child-safety.ts — Age-appropriate chat safety prompt injection.
 *
 * Pure function tests for all three age brackets plus a supervisor integration test
 * verifying the safety prompt is injected into the system message.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  buildChildSafetyPrompt,
  isWebSearchBlockedByAge,
  isCodeGenerationBlockedByAge,
  type AgeBracket,
} from '../inference/child-safety.js';

// ============================================================================
// Pure function tests — buildChildSafetyPrompt
// ============================================================================

describe('buildChildSafetyPrompt', () => {
  describe('under_13 bracket', () => {
    const prompt = buildChildSafetyPrompt('under_13');

    it('returns a non-empty safety prompt', () => {
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes strict content restrictions', () => {
      expect(prompt).toContain('Never');
      expect(prompt).toContain('violence');
      expect(prompt).toContain('self-harm');
      expect(prompt).toContain('adult content');
    });

    it('restricts code generation', () => {
      expect(prompt).toContain('code');
    });

    it('restricts web search references', () => {
      expect(prompt).toContain('web search');
    });

    it('encourages simple and friendly language', () => {
      expect(prompt).toContain('simple');
      expect(prompt).toContain('encouraging');
    });

    it('mentions redirecting restricted topics', () => {
      expect(prompt).toContain('redirect');
    });

    it('includes the child account header', () => {
      expect(prompt).toContain('Child Account');
    });

    it('advises talking to a trusted adult for concerning content', () => {
      expect(prompt).toContain('trusted adult');
    });
  });

  describe('13_to_17 bracket', () => {
    const prompt = buildChildSafetyPrompt('13_to_17');

    it('returns a non-empty safety prompt', () => {
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes teen-appropriate restrictions', () => {
      expect(prompt).toContain('age-appropriate');
      expect(prompt).toContain('graphic');
    });

    it('encourages healthy behaviors', () => {
      expect(prompt).toContain('healthy behaviors');
    });

    it('blocks self-harm content', () => {
      expect(prompt).toContain('self-harm');
    });

    it('includes the teen account header', () => {
      expect(prompt).toContain('Teen Account');
    });

    it('does NOT restrict code generation (teens can code)', () => {
      // The teen prompt should not have the blanket code restriction
      expect(prompt).not.toContain('Never** generate, explain, or reference code');
    });

    it('mentions crisis resources for concerning content', () => {
      expect(prompt).toContain('trusted adult');
    });
  });

  describe('adult bracket', () => {
    const prompt = buildChildSafetyPrompt('adult');

    it('returns an empty string', () => {
      expect(prompt).toBe('');
    });
  });

  describe('all brackets produce distinct results', () => {
    it('under_13 and 13_to_17 are different', () => {
      const under13 = buildChildSafetyPrompt('under_13');
      const teen = buildChildSafetyPrompt('13_to_17');
      expect(under13).not.toBe(teen);
    });

    it('under_13 is stricter than 13_to_17 (longer prompt)', () => {
      const under13 = buildChildSafetyPrompt('under_13');
      const teen = buildChildSafetyPrompt('13_to_17');
      expect(under13.length).toBeGreaterThan(teen.length);
    });
  });
});

// ============================================================================
// Pure function tests — helper guards
// ============================================================================

describe('isWebSearchBlockedByAge', () => {
  it('blocks web search for under_13', () => {
    expect(isWebSearchBlockedByAge('under_13')).toBe(true);
  });

  it('allows web search for teens', () => {
    expect(isWebSearchBlockedByAge('13_to_17')).toBe(false);
  });

  it('allows web search for adults', () => {
    expect(isWebSearchBlockedByAge('adult')).toBe(false);
  });
});

describe('isCodeGenerationBlockedByAge', () => {
  it('blocks code generation for under_13', () => {
    expect(isCodeGenerationBlockedByAge('under_13')).toBe(true);
  });

  it('allows code generation for teens', () => {
    expect(isCodeGenerationBlockedByAge('13_to_17')).toBe(false);
  });

  it('allows code generation for adults', () => {
    expect(isCodeGenerationBlockedByAge('adult')).toBe(false);
  });
});

// ============================================================================
// Supervisor integration test — verifies prompt injection
// ============================================================================

describe('supervisor child safety injection', () => {
  // We test that supervisedChat injects the safety prompt into the system message.
  // Since the full supervisor requires Ollama/providers, we mock the local execution
  // and verify the system message was modified.

  let supervisorModule: typeof import('../inference/supervisor.js');
  let skipReason = '';

  beforeAll(async () => {
    try {
      // Mock local-llm to avoid needing Ollama
      vi.mock('../inference/local-llm.js', () => ({
        getOllamaClient: () => ({
          chat: async ({ messages }: any) => ({
            message: {
              role: 'assistant',
              content: messages.find((m: any) => m.role === 'system')?.content ?? 'no system',
            },
          }),
        }),
        isLocalLlmAvailable: async () => true,
      }));

      // Mock web search availability
      vi.mock('../inference/web-search.js', () => ({
        WEB_SEARCH_TOOL: {},
        ollamaWebSearch: async () => ({ results: [] }),
        isWebSearchAvailable: () => false,
      }));

      // Mock fallback handler
      vi.mock('../inference/fallback-handler.js', () => ({
        FallbackHandler: class {
          async executeWithFallback() { throw new Error('mock'); }
          async isFallbackAvailable() { return { groq: false, openai: false, anthropic: false }; }
        },
      }));

      // Mock companion config
      vi.mock('../companions/config.js', () => ({
        getCompanionConfig: () => ({
          id: 'cipher',
          name: 'Cipher',
          localModel: 'test-model',
          frontierProvider: 'groq',
          frontierModelId: 'test-frontier',
          frontierModelName: 'Test Frontier',
          escalationLevel: 'never',
          escalationKeywords: [],
          supervisorContextWindow: 10,
        }),
      }));

      // Mock personality check
      vi.mock('../bot/utils/personality-check.js', () => ({
        checkPersonality: () => ({ passed: true, issues: [], severity: 'ok' }),
        patchResponse: (content: string) => content,
      }));

      // Mock providers
      vi.mock('../inference/providers/index.js', () => ({
        getProvider: () => null,
      }));

      vi.mock('../inference/providers/circuit-breaker.js', () => ({
        isProviderHealthy: () => false,
        recordSuccess: () => {},
        recordFailure: () => {},
        getProviderHealth: () => [],
      }));

      vi.mock('../inference/metrics.js', () => ({
        getMetricsCollector: () => ({
          record: () => {},
          getMetrics: () => ({ totalRequests: 0, successRate: 1, avgLatencyMs: 0 }),
        }),
      }));

      vi.mock('../inference/memory/supermemory.js', () => ({
        getSupermemoryClient: () => null,
      }));

      vi.mock('../inference/observation-extractor.js', () => ({
        extractObservations: () => [],
      }));

      vi.mock('../inference/training-data.js', () => ({
        getTrainingDataCollector: () => ({
          collect: async () => {},
        }),
      }));

      vi.mock('../inference/trajectory.js', () => ({
        getTrajectoryLogger: () => ({
          log: async () => {},
        }),
      }));

      vi.mock('../inference/kin-credits.js', () => ({
        getCredentialManager: () => null,
      }));

      supervisorModule = await import('../inference/supervisor.js');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('better-sqlite3') || msg.includes('ERR_DLOPEN_FAILED') || msg.includes('ERR_MODULE_NOT_FOUND')) {
        skipReason = `Skipped: native dependency unavailable — ${msg.slice(0, 80)}`;
      } else {
        throw err;
      }
    }
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    if (skipReason) return;
  });

  it('injects under_13 safety prompt into system message', async () => {
    if (skipReason) { console.log(skipReason); return; }

    const { FallbackHandler } = await import('../inference/fallback-handler.js');
    const fallback = new FallbackHandler();

    const messages = [
      { role: 'system' as const, content: 'You are Cipher.' },
      { role: 'user' as const, content: 'Hello!' },
    ];

    const result = await supervisorModule.supervisedChat(
      messages,
      'cipher',
      fallback,
      {
        forceLocal: true,
        privacyMode: 'private',
        ageBracket: 'under_13',
      },
    );

    // The mocked OllamaClient returns the system message content as the response
    expect(result.content).toContain('Safety Boundaries (Child Account)');
    expect(result.content).toContain('Never');
    expect(result.content).toContain('violence');
    expect(result.route).toBe('local');
  });

  it('injects 13_to_17 safety prompt into system message', async () => {
    if (skipReason) { console.log(skipReason); return; }

    const { FallbackHandler } = await import('../inference/fallback-handler.js');
    const fallback = new FallbackHandler();

    const messages = [
      { role: 'system' as const, content: 'You are Cipher.' },
      { role: 'user' as const, content: 'Hello!' },
    ];

    const result = await supervisorModule.supervisedChat(
      messages,
      'cipher',
      fallback,
      {
        forceLocal: true,
        privacyMode: 'private',
        ageBracket: '13_to_17',
      },
    );

    expect(result.content).toContain('Safety Boundaries (Teen Account)');
    expect(result.content).toContain('age-appropriate');
  });

  it('does NOT inject safety prompt for adult bracket', async () => {
    if (skipReason) { console.log(skipReason); return; }

    const { FallbackHandler } = await import('../inference/fallback-handler.js');
    const fallback = new FallbackHandler();

    const messages = [
      { role: 'system' as const, content: 'You are Cipher.' },
      { role: 'user' as const, content: 'Hello!' },
    ];

    const result = await supervisorModule.supervisedChat(
      messages,
      'cipher',
      fallback,
      {
        forceLocal: true,
        privacyMode: 'private',
        ageBracket: 'adult',
      },
    );

    expect(result.content).not.toContain('Safety Boundaries');
    expect(result.content).toBe('You are Cipher.');
  });

  it('defaults to adult when ageBracket is not provided', async () => {
    if (skipReason) { console.log(skipReason); return; }

    const { FallbackHandler } = await import('../inference/fallback-handler.js');
    const fallback = new FallbackHandler();

    const messages = [
      { role: 'system' as const, content: 'You are Cipher.' },
      { role: 'user' as const, content: 'Hello!' },
    ];

    const result = await supervisorModule.supervisedChat(
      messages,
      'cipher',
      fallback,
      {
        forceLocal: true,
        privacyMode: 'private',
        // no ageBracket — should default to adult
      },
    );

    expect(result.content).not.toContain('Safety Boundaries');
  });
});
