/**
 * Companion Abilities - Skills powered by companion-specific local models
 *
 * Each companion (cipher, mischief, vortex, forge, aether, catalyst)
 * has specialized abilities driven by their trained local models via
 * structured domain prompts. Each ability uses createAbilityExecute()
 * to wire up OllamaClient inference with domain-specific system prompts.
 *
 * @module bot/skills/companion-abilities
 */

import type { KinSkill, SkillContext, SkillResult } from './types.js';
import type { SkillRouter } from './loader.js';
import { getOllamaClient } from '../../inference/local-llm.js';
import { resolveLocalModel } from '../../companions/config.js';
import { getMediaManager } from '../../inference/media-manager.js';
import {
  CODE_GEN_PROMPT,
  SOCIAL_CONTENT_PROMPT,
  DATA_ANALYSIS_PROMPT,
  ARCHITECTURE_REVIEW_PROMPT,
  CREATIVE_WRITING_PROMPT,
  HABIT_COACHING_PROMPT,
  VIDEO_GEN_PROMPT,
  MUSIC_GEN_PROMPT,
} from './ability-prompts.js';

// ============================================================================
// Companion Ability Interface
// ============================================================================

export interface CompanionAbility extends KinSkill {
  /** Companion IDs that provide this ability */
  companionIds: string[];

  /** Whether this ability requires a locally-hosted model */
  requiresLocalModel: boolean;

  /** Whether the ability is currently active (model available) */
  isActive: boolean;

  /** Domain-specific system prompt guiding structured output */
  systemPrompt: string;
}

// ============================================================================
// Ability Executor Factory
// ============================================================================

/**
 * Creates a real execute function that calls OllamaClient inference
 * with a domain-specific system prompt.
 *
 * The factory resolves the correct model (branded kin-{companionId} or
 * fallback) at call time, sends the domain prompt as the system message,
 * and returns structured results with metadata for observability.
 *
 * On error (Ollama unreachable, model missing, timeout), returns a
 * descriptive fallback message instead of throwing — callers always
 * get a SkillResult.
 */
function createAbilityExecute(
  companionId: string,
  abilityName: string,
  domainSystemPrompt: string,
): (ctx: SkillContext) => Promise<SkillResult> {
  return async (ctx: SkillContext): Promise<SkillResult> => {
    let model = 'unknown';

    try {
      const ollamaClient = getOllamaClient();
      model = await resolveLocalModel(companionId, ollamaClient);

      const response = await ollamaClient.chat({
        model,
        messages: [
          { role: 'system', content: domainSystemPrompt },
          { role: 'user', content: ctx.message },
        ],
        stream: false,
      });

      const content = response.message.content;

      console.log(
        `[ability:${abilityName}] companion=${companionId} model=${model} responseLen=${content.length}`,
      );

      return {
        content,
        type: 'markdown',
        metadata: {
          companion: companionId,
          ability: abilityName,
          model,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      console.error(
        `[ability:${abilityName}] companion=${companionId} model=${model} error=${errorMessage}`,
      );

      return {
        content: `I'm unable to process this right now — the local model (${model}) for ${abilityName} is unavailable. Error: ${errorMessage}`,
        type: 'text',
        metadata: {
          companion: companionId,
          ability: abilityName,
          model,
          status: 'model-unavailable',
          error: errorMessage,
        },
      };
    }
  };
}

// ============================================================================
// Media Ability Executor Factory
// ============================================================================

/** Timeout for prompt enhancement via Ollama (30s). */
const ENHANCE_TIMEOUT_MS = 30_000;

/**
 * Creates an execute function for media generation abilities.
 *
 * Unlike createAbilityExecute() which delegates entirely to Ollama,
 * this factory uses Ollama only for prompt enhancement and delegates
 * the actual generation to MediaManager (Replicate API).
 *
 * Flow: user prompt → Ollama enhancement → MediaManager generation → SkillResult
 *
 * Failure handling:
 * - Replicate not configured → friendly error
 * - Ollama enhancement fails/times out → falls back to raw prompt
 * - Generation fails → surfaces MediaManager error
 */
function createMediaAbilityExecute(
  companionId: string,
  abilityName: string,
  enhancementPrompt: string,
  mediaType: 'video' | 'audio',
): (ctx: SkillContext) => Promise<SkillResult> {
  return async (ctx: SkillContext): Promise<SkillResult> => {
    const manager = getMediaManager();

    // Gate: Replicate must be configured
    if (!manager.getHealth().configured) {
      return {
        content: `Media generation is not available — the Replicate API token is not configured. Ask the admin to set REPLICATE_API_TOKEN.`,
        type: 'error',
        metadata: { companion: companionId, ability: abilityName, error: 'replicate_not_configured' },
      };
    }

    const startMs = Date.now();
    let enhancedPrompt = ctx.message;
    let wasEnhanced = false;

    // Prompt enhancement via companion's local model
    try {
      const ollamaClient = getOllamaClient();
      const model = await resolveLocalModel(companionId, ollamaClient);

      const response = await Promise.race([
        ollamaClient.chat({
          model,
          messages: [
            { role: 'system', content: enhancementPrompt },
            { role: 'user', content: ctx.message },
          ],
          stream: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ENHANCE_TIMEOUT')), ENHANCE_TIMEOUT_MS),
        ),
      ]);

      const content = response.message?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        enhancedPrompt = content.trim();
        wasEnhanced = true;
      } else {
        console.warn(`[ability:${abilityName}] companion=${companionId} Ollama returned empty response, using raw prompt`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[ability:${abilityName}] companion=${companionId} enhancement failed (${msg}), using raw prompt`);
    }

    // Generation via MediaManager
    const genResult = mediaType === 'video'
      ? await manager.generateVideo(enhancedPrompt, ctx.userId)
      : await manager.generateMusic(enhancedPrompt, ctx.userId);

    if (genResult.status !== 'completed') {
      console.error(`[ability:${abilityName}] companion=${companionId} generation failed: ${genResult.error}`);
      return {
        content: `${mediaType === 'video' ? 'Video' : 'Music'} generation failed: ${genResult.error}`,
        type: 'error',
        metadata: {
          companion: companionId,
          ability: abilityName,
          status: genResult.status,
          error: genResult.error,
          enhancedPrompt: wasEnhanced,
        },
      };
    }

    const totalMs = Date.now() - startMs;
    const emoji = mediaType === 'video' ? '🎬' : '🎵';
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'audio/mpeg';

    console.log(
      `[ability:${abilityName}] companion=${companionId} completed in ${totalMs}ms enhanced=${wasEnhanced}`,
    );

    return {
      content: `${emoji} ${mediaType === 'video' ? 'Video' : 'Music'} generated! (${(totalMs / 1000).toFixed(1)}s)`,
      type: mediaType,
      mediaUrl: genResult.result.url,
      mediaMimeType: mimeType,
      metadata: {
        companion: companionId,
        ability: abilityName,
        generationId: genResult.result.id,
        durationMs: genResult.result.durationMs,
        totalDurationMs: totalMs,
        enhancedPrompt: wasEnhanced,
        mimeType,
      },
    };
  };
}

// ============================================================================
// Companion Abilities Registry
// ============================================================================

export const codeGenAbility: CompanionAbility = {
  name: 'code-gen',
  description: 'Generate, review, and refactor code with cipher',
  triggers: ['generate code', 'write.*function', 'review.*code'],
  companionIds: ['cipher'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: CODE_GEN_PROMPT,
  execute: createAbilityExecute('cipher', 'code-gen', CODE_GEN_PROMPT),
};

export const socialContentAbility: CompanionAbility = {
  name: 'social-content',
  description: 'Create social media posts and brand content with mischief',
  triggers: ['create.*post', 'social.*media', 'brand.*content'],
  companionIds: ['mischief'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: SOCIAL_CONTENT_PROMPT,
  execute: createAbilityExecute('mischief', 'social-content', SOCIAL_CONTENT_PROMPT),
};

export const dataAnalysisAbility: CompanionAbility = {
  name: 'data-analysis',
  description: 'Analyze data, run market research, and spot trends with vortex',
  triggers: ['analyze.*data', 'market.*research', 'trend'],
  companionIds: ['vortex'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: DATA_ANALYSIS_PROMPT,
  execute: createAbilityExecute('vortex', 'data-analysis', DATA_ANALYSIS_PROMPT),
};

/**
 * Note: 'code.*review' trigger overlaps with code-gen's 'review.*code'.
 * Since SkillRouter returns the first match and companion abilities
 * register after builtins, registration order determines priority.
 * This is acceptable — both abilities produce relevant output for
 * code review requests.
 */
export const architectureReviewAbility: CompanionAbility = {
  name: 'architecture-review',
  description: 'Review system architecture and code design with forge',
  triggers: ['architecture', 'system.*design', 'code.*review'],
  companionIds: ['forge'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: ARCHITECTURE_REVIEW_PROMPT,
  execute: createAbilityExecute('forge', 'architecture-review', ARCHITECTURE_REVIEW_PROMPT),
};

export const creativeWritingAbility: CompanionAbility = {
  name: 'creative-writing',
  description: 'Write stories, creative pieces, and worldbuilding with aether',
  triggers: ['write.*story', 'creative.*writing', 'worldbuild'],
  companionIds: ['aether'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: CREATIVE_WRITING_PROMPT,
  execute: createAbilityExecute('aether', 'creative-writing', CREATIVE_WRITING_PROMPT),
};

export const habitCoachingAbility: CompanionAbility = {
  name: 'habit-coaching',
  description: 'Build habits, set goals, and track accountability with catalyst',
  triggers: ['habit', 'goal.*setting', 'routine', 'accountability'],
  companionIds: ['catalyst'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: HABIT_COACHING_PROMPT,
  execute: createAbilityExecute('catalyst', 'habit-coaching', HABIT_COACHING_PROMPT),
};

// ============================================================================
// Video Generation — Vortex, Mischief, Aether (creative companions)
// ============================================================================

export const videoGenAbility: CompanionAbility = {
  name: 'video-gen',
  description: 'Generate videos from text descriptions using Replicate',
  triggers: ['generate.*video', 'create.*video', 'make.*video', 'video.*for'],
  companionIds: ['vortex', 'mischief', 'aether'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: VIDEO_GEN_PROMPT,
  execute: createMediaAbilityExecute('vortex', 'video-gen', VIDEO_GEN_PROMPT, 'video'),
};

// ============================================================================
// Music Generation — Aether, Mischief
// ============================================================================

export const musicGenAbility: CompanionAbility = {
  name: 'music-gen',
  description: 'Generate music from text descriptions using Replicate',
  triggers: ['generate.*music', 'create.*song', 'make.*music', 'compose.*music'],
  companionIds: ['aether', 'mischief'],
  requiresLocalModel: true,
  isActive: true,
  systemPrompt: MUSIC_GEN_PROMPT,
  execute: createMediaAbilityExecute('aether', 'music-gen', MUSIC_GEN_PROMPT, 'audio'),
};

// ============================================================================
// All Companion Abilities
// ============================================================================

export const companionAbilities: CompanionAbility[] = [
  codeGenAbility,
  socialContentAbility,
  dataAnalysisAbility,
  architectureReviewAbility,
  creativeWritingAbility,
  habitCoachingAbility,
  videoGenAbility,
  musicGenAbility,
];

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all companion abilities with a SkillRouter instance.
 *
 * Call this after builtin skills are registered so that builtin triggers
 * take precedence over companion ability triggers. Companion abilities
 * are additive — they extend the router's capabilities without overriding
 * existing skills.
 */
export function registerCompanionAbilities(router: SkillRouter): void {
  for (const ability of companionAbilities) {
    router.register(ability);
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get companion abilities, optionally filtered by companion ID.
 *
 * - If `companionId` is provided, returns only abilities belonging to
 *   that companion and that are currently active.
 * - If omitted, returns all abilities regardless of active status.
 */
export function getCompanionAbilities(companionId?: string): CompanionAbility[] {
  if (!companionId) {
    return companionAbilities;
  }

  return companionAbilities.filter(
    (ability) => ability.companionIds.includes(companionId) && ability.isActive,
  );
}
