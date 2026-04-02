import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock inference/local-llm.js ─────────────────────────────────────────
const mockOllamaClient = {
  chat: vi.fn(),
  hasModel: vi.fn(),
  checkHealth: vi.fn(),
  listModels: vi.fn(),
  getModelInfo: vi.fn(),
  generate: vi.fn(),
  isAvailable: vi.fn(),
};

vi.mock('../inference/local-llm.js', () => ({
  OllamaClient: vi.fn(() => mockOllamaClient),
  getOllamaClient: vi.fn(() => mockOllamaClient),
}));

// ── Mock companions/config.ts — resolveLocalModel ───────────────────────
vi.mock('../companions/config.js', async () => {
  const actual = await vi.importActual<typeof import('../companions/config.js')>('../companions/config.js');
  return {
    ...actual,
    resolveLocalModel: vi.fn(),
  };
});

// ── Imports (after mocks) ───────────────────────────────────────────────
import {
  companionAbilities,
  registerCompanionAbilities,
  getCompanionAbilities,
  codeGenAbility,
  socialContentAbility,
  dataAnalysisAbility,
  architectureReviewAbility,
  creativeWritingAbility,
  habitCoachingAbility,
  type CompanionAbility,
} from '../bot/skills/companion-abilities.js';
import {
  CODE_GEN_PROMPT,
  SOCIAL_CONTENT_PROMPT,
  DATA_ANALYSIS_PROMPT,
  ARCHITECTURE_REVIEW_PROMPT,
  CREATIVE_WRITING_PROMPT,
  HABIT_COACHING_PROMPT,
  ABILITY_PROMPTS,
} from '../bot/skills/ability-prompts.js';
import { SkillRouter, createSkillRouter } from '../bot/skills/loader.js';
import { resolveLocalModel } from '../companions/config.js';
import type { SkillContext } from '../bot/skills/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeCtx(message = 'test input'): SkillContext {
  return {
    message,
    userId: 'test-user-123',
    userName: 'TestUser',
    conversationHistory: [],
    env: {},
  };
}

const mockedResolveLocalModel = vi.mocked(resolveLocalModel);

// ============================================================================
// Factory Tests — createAbilityExecute behavior via ability.execute()
// ============================================================================

describe('createAbilityExecute (via codeGenAbility.execute)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns markdown response with correct metadata', async () => {
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockResolvedValue({
      message: { content: '```ts\nconst x = 1;\n```' },
    });

    const result = await codeGenAbility.execute(makeCtx('generate code for a counter'));

    expect(result.type).toBe('markdown');
    expect(result.content).toBe('```ts\nconst x = 1;\n```');
    expect(result.metadata).toMatchObject({
      companion: 'cipher',
      ability: 'code-gen',
      model: 'kin-cipher',
    });
  });

  it('resolves branded model (kin-cipher) when available', async () => {
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockResolvedValue({
      message: { content: 'result' },
    });

    const result = await codeGenAbility.execute(makeCtx());

    expect(mockedResolveLocalModel).toHaveBeenCalledWith('cipher', mockOllamaClient);
    expect(result.metadata?.model).toBe('kin-cipher');
  });

  it('falls back to default model (llama3.2) when branded not available', async () => {
    mockedResolveLocalModel.mockResolvedValue('llama3.2');
    mockOllamaClient.chat.mockResolvedValue({
      message: { content: 'fallback result' },
    });

    const result = await codeGenAbility.execute(makeCtx());

    expect(result.metadata?.model).toBe('llama3.2');
  });

  it('returns graceful error message when OllamaClient.chat() throws', async () => {
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockRejectedValue(new Error('Connection refused'));

    const result = await codeGenAbility.execute(makeCtx());

    expect(result.type).toBe('text');
    expect(result.content).toContain('unavailable');
    expect(result.content).toContain('Connection refused');
    expect(result.metadata?.status).toBe('model-unavailable');
    expect(result.metadata?.error).toBe('Connection refused');
  });

  it('logs ability execution details', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockResolvedValue({
      message: { content: 'logged result' },
    });

    await codeGenAbility.execute(makeCtx());

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ability:code-gen]'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('companion=cipher'),
    );
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Per-ability tests — all 6 abilities
// ============================================================================

const abilitiesUnderTest: Array<{
  ability: CompanionAbility;
  companionId: string;
  abilityName: string;
  prompt: string;
  sampleTrigger: string;
}> = [
  {
    ability: codeGenAbility,
    companionId: 'cipher',
    abilityName: 'code-gen',
    prompt: CODE_GEN_PROMPT,
    sampleTrigger: 'generate code for login',
  },
  {
    ability: socialContentAbility,
    companionId: 'mischief',
    abilityName: 'social-content',
    prompt: SOCIAL_CONTENT_PROMPT,
    sampleTrigger: 'create a post about our product',
  },
  {
    ability: dataAnalysisAbility,
    companionId: 'vortex',
    abilityName: 'data-analysis',
    prompt: DATA_ANALYSIS_PROMPT,
    sampleTrigger: 'analyze data from Q1',
  },
  {
    ability: architectureReviewAbility,
    companionId: 'forge',
    abilityName: 'architecture-review',
    prompt: ARCHITECTURE_REVIEW_PROMPT,
    sampleTrigger: 'review the architecture of our API',
  },
  {
    ability: creativeWritingAbility,
    companionId: 'aether',
    abilityName: 'creative-writing',
    prompt: CREATIVE_WRITING_PROMPT,
    sampleTrigger: 'write a story about a lost ship',
  },
  {
    ability: habitCoachingAbility,
    companionId: 'catalyst',
    abilityName: 'habit-coaching',
    prompt: HABIT_COACHING_PROMPT,
    sampleTrigger: 'help me build a habit of reading',
  },
];

describe('Per-ability verification (all 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const { ability, companionId, abilityName, prompt, sampleTrigger } of abilitiesUnderTest) {
    describe(abilityName, () => {
      it('execute is not the placeholder (no "Coming soon")', async () => {
        mockedResolveLocalModel.mockResolvedValue(`kin-${companionId}`);
        mockOllamaClient.chat.mockResolvedValue({
          message: { content: `Real output for ${abilityName}` },
        });

        const result = await ability.execute(makeCtx(sampleTrigger));
        expect(result.content).not.toContain('Coming soon');
      });

      it('calls OllamaClient.chat() with the domain system prompt', async () => {
        mockedResolveLocalModel.mockResolvedValue(`kin-${companionId}`);
        mockOllamaClient.chat.mockResolvedValue({
          message: { content: 'domain response' },
        });

        await ability.execute(makeCtx(sampleTrigger));

        expect(mockOllamaClient.chat).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              { role: 'system', content: prompt },
              { role: 'user', content: sampleTrigger },
            ]),
          }),
        );
      });

      it('trigger patterns match expected inputs', () => {
        const patterns = ability.triggers.map((t) => new RegExp(t, 'i'));
        const matched = patterns.some((p) => p.test(sampleTrigger));
        expect(matched).toBe(true);
      });

      it('has correct companion ID', () => {
        expect(ability.companionIds).toContain(companionId);
      });

      it('is active', () => {
        expect(ability.isActive).toBe(true);
      });

      it('has a system prompt', () => {
        expect(ability.systemPrompt).toBe(prompt);
      });
    });
  }
});

// ============================================================================
// Registration tests
// ============================================================================

describe('registerCompanionAbilities', () => {
  let router: SkillRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createSkillRouter();
    registerCompanionAbilities(router);
  });

  it('all 6 abilities are registered in the SkillRouter', () => {
    for (const ability of companionAbilities) {
      expect(router.hasSkill(ability.name)).toBe(true);
    }
  });

  it('each ability is matchable by its trigger patterns', () => {
    // Use the same sample triggers from above
    const triggerMap: Record<string, string> = {
      'code-gen': 'generate code for login',
      'social-content': 'create a post about our product',
      'data-analysis': 'analyze data from Q1',
      'architecture-review': 'review the architecture',
      'creative-writing': 'write a story about pirates',
      'habit-coaching': 'help me build a habit',
    };

    for (const [name, trigger] of Object.entries(triggerMap)) {
      const matched = router.matchSkill(trigger);
      expect(matched, `Expected "${trigger}" to match skill "${name}"`).not.toBeNull();
      // The match may be a builtin that triggers on the same pattern,
      // or the companion ability — both are acceptable since builtins have priority
    }
  });

  it('getCompanionAbilities() returns all 6', () => {
    const all = getCompanionAbilities();
    expect(all).toHaveLength(6);
    const names = all.map((a) => a.name);
    expect(names).toContain('code-gen');
    expect(names).toContain('social-content');
    expect(names).toContain('data-analysis');
    expect(names).toContain('architecture-review');
    expect(names).toContain('creative-writing');
    expect(names).toContain('habit-coaching');
  });

  it('getCompanionAbilities("cipher") returns only code-gen', () => {
    const cipherAbilities = getCompanionAbilities('cipher');
    expect(cipherAbilities).toHaveLength(1);
    expect(cipherAbilities[0]!.name).toBe('code-gen');
  });

  it('getCompanionAbilities("catalyst") returns only habit-coaching', () => {
    const catalystAbilities = getCompanionAbilities('catalyst');
    expect(catalystAbilities).toHaveLength(1);
    expect(catalystAbilities[0]!.name).toBe('habit-coaching');
  });

  it('getCompanionAbilities("unknown") returns empty array', () => {
    const unknown = getCompanionAbilities('unknown');
    expect(unknown).toHaveLength(0);
  });

  it('router size increased after registration', () => {
    const base = createSkillRouter();
    const baseSize = base.size;
    registerCompanionAbilities(base);
    expect(base.size).toBe(baseSize + 6);
  });
});

// ============================================================================
// Domain prompt tests
// ============================================================================

describe('Domain prompts', () => {
  const prompts: Record<string, string> = {
    'code-gen': CODE_GEN_PROMPT,
    'social-content': SOCIAL_CONTENT_PROMPT,
    'data-analysis': DATA_ANALYSIS_PROMPT,
    'architecture-review': ARCHITECTURE_REVIEW_PROMPT,
    'creative-writing': CREATIVE_WRITING_PROMPT,
    'habit-coaching': HABIT_COACHING_PROMPT,
  };

  for (const [name, prompt] of Object.entries(prompts)) {
    it(`${name} prompt is a non-empty string`, () => {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    });
  }

  it('code-gen prompt mentions code', () => {
    expect(CODE_GEN_PROMPT.toLowerCase()).toContain('code');
  });

  it('social-content prompt mentions social', () => {
    expect(SOCIAL_CONTENT_PROMPT.toLowerCase()).toContain('social');
  });

  it('data-analysis prompt mentions data', () => {
    expect(DATA_ANALYSIS_PROMPT.toLowerCase()).toContain('data');
  });

  it('architecture-review prompt mentions architecture', () => {
    expect(ARCHITECTURE_REVIEW_PROMPT.toLowerCase()).toContain('architecture');
  });

  it('creative-writing prompt mentions writing', () => {
    expect(CREATIVE_WRITING_PROMPT.toLowerCase()).toContain('writing');
  });

  it('habit-coaching prompt mentions habit', () => {
    expect(HABIT_COACHING_PROMPT.toLowerCase()).toContain('habit');
  });

  it('ABILITY_PROMPTS registry has all 6 entries', () => {
    expect(Object.keys(ABILITY_PROMPTS)).toHaveLength(6);
    for (const name of Object.keys(prompts)) {
      expect(ABILITY_PROMPTS[name]).toBeDefined();
      expect(ABILITY_PROMPTS[name]).toBe(prompts[name]);
    }
  });
});

// ============================================================================
// Graceful unavailability test
// ============================================================================

describe('Graceful unavailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns descriptive message with model name when OllamaClient is not reachable', async () => {
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await codeGenAbility.execute(makeCtx('generate code'));

    expect(result.type).toBe('text');
    expect(result.content).toContain('kin-cipher');
    expect(result.content).toContain('code-gen');
    expect(result.content).toContain('ECONNREFUSED');
    expect(result.metadata?.status).toBe('model-unavailable');
  });

  it('handles non-Error throws gracefully', async () => {
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockRejectedValue('string error');

    const result = await codeGenAbility.execute(makeCtx('generate code'));

    expect(result.type).toBe('text');
    expect(result.metadata?.status).toBe('model-unavailable');
    expect(result.metadata?.error).toBe('Unknown error');
  });

  it('handles resolveLocalModel failure gracefully', async () => {
    mockedResolveLocalModel.mockRejectedValue(new Error('Ollama not running'));

    const result = await codeGenAbility.execute(makeCtx('generate code'));

    expect(result.type).toBe('text');
    expect(result.content).toContain('unavailable');
    expect(result.metadata?.status).toBe('model-unavailable');
  });

  it('logs error with ability and companion context', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedResolveLocalModel.mockResolvedValue('kin-cipher');
    mockOllamaClient.chat.mockRejectedValue(new Error('timeout'));

    await codeGenAbility.execute(makeCtx('generate code'));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ability:code-gen]'),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('error=timeout'),
    );
    consoleSpy.mockRestore();
  });

  it('each ability handles errors independently', async () => {
    for (const ability of companionAbilities) {
      mockedResolveLocalModel.mockResolvedValue(`kin-${ability.companionIds[0]}`);
      mockOllamaClient.chat.mockRejectedValue(new Error('unavailable'));

      const result = await ability.execute(makeCtx('test'));
      expect(result.type).toBe('text');
      expect(result.metadata?.status).toBe('model-unavailable');
    }
  });
});
