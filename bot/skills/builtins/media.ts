/**
 * Media Generation Skills — Video and Music via Replicate API.
 *
 * Two KinSkills that wrap MediaManager:
 * - videoGenSkill: text → enhanced prompt → video generation
 * - musicGenSkill: text → enhanced prompt → music generation
 *
 * Both use the companion's local Ollama model to enhance the user's
 * raw prompt before sending to Replicate. On enhancement failure,
 * falls back to the raw prompt — generation should still attempt.
 *
 * @module bot/skills/builtins/media
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import { getMediaManager } from '../../../inference/media-manager.js';
import { getOllamaClient } from '../../../inference/local-llm.js';
import { VIDEO_GEN_PROMPT, MUSIC_GEN_PROMPT } from '../ability-prompts.js';

// ---------------------------------------------------------------------------
// Prompt Enhancement
// ---------------------------------------------------------------------------

/** Timeout for prompt enhancement via Ollama (30s). */
const ENHANCE_TIMEOUT_MS = 30_000;

/**
 * Enhance a user prompt using the local Ollama model with a domain-specific
 * system prompt. Returns the enhanced prompt string, or the original raw
 * prompt on any failure (timeout, malformed response, connection error).
 */
async function enhancePrompt(
  rawPrompt: string,
  systemPrompt: string,
  model?: string,
): Promise<{ enhanced: string; wasEnhanced: boolean }> {
  try {
    const ollama = getOllamaClient();
    const chatModel = model ?? 'llama3.2';

    const response = await Promise.race([
      ollama.chat({
        model: chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawPrompt },
        ],
        stream: false,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ENHANCE_TIMEOUT')), ENHANCE_TIMEOUT_MS),
      ),
    ]);

    const content = response.message?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return { enhanced: content.trim(), wasEnhanced: true };
    }

    // Malformed response — fall back to raw
    console.warn('[media-skill] Ollama returned empty/non-string content, using raw prompt');
    return { enhanced: rawPrompt, wasEnhanced: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[media-skill] Prompt enhancement failed (${msg}), using raw prompt`);
    return { enhanced: rawPrompt, wasEnhanced: false };
  }
}

// ---------------------------------------------------------------------------
// Video Generation Skill
// ---------------------------------------------------------------------------

export const videoGenSkill: KinSkill = {
  name: 'video-gen',
  description: 'Generate a video from a text description via Replicate',

  triggers: [
    'generate.*video',
    'create.*video',
    'make.*video',
    'video.*for',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // Gate: check Replicate configuration
    const manager = getMediaManager();
    if (!manager.getHealth().configured) {
      return {
        content: 'Video generation is not available — the Replicate API token is not configured. Ask the admin to set REPLICATE_API_TOKEN.',
        type: 'error',
        metadata: { skill: 'video-gen', error: 'replicate_not_configured' },
      };
    }

    // Enhance the user's prompt for video generation
    const startMs = Date.now();
    const { enhanced, wasEnhanced } = await enhancePrompt(
      ctx.message,
      VIDEO_GEN_PROMPT,
    );

    console.log(
      `[video-gen] userId=${ctx.userId} enhanced=${wasEnhanced} promptLen=${enhanced.length}`,
    );

    // Generate video via MediaManager
    const result = await manager.generateVideo(enhanced, ctx.userId);

    if (result.status !== 'completed') {
      return {
        content: `Video generation failed: ${result.error}`,
        type: 'error',
        metadata: {
          skill: 'video-gen',
          status: result.status,
          error: result.error,
          enhancedPrompt: wasEnhanced,
        },
      };
    }

    const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

    return {
      content: `🎬 Video generated! (${durationSec}s)`,
      type: 'video',
      mediaUrl: result.result.url,
      mediaMimeType: 'video/mp4',
      metadata: {
        skill: 'video-gen',
        generationId: result.result.id,
        durationMs: result.result.durationMs,
        totalDurationMs: Date.now() - startMs,
        enhancedPrompt: wasEnhanced,
        mimeType: 'video/mp4',
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Music Generation Skill
// ---------------------------------------------------------------------------

export const musicGenSkill: KinSkill = {
  name: 'music-gen',
  description: 'Generate music from a text description via Replicate',

  triggers: [
    'generate.*music',
    'create.*song',
    'make.*music',
    'compose.*music',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // Gate: check Replicate configuration
    const manager = getMediaManager();
    if (!manager.getHealth().configured) {
      return {
        content: 'Music generation is not available — the Replicate API token is not configured. Ask the admin to set REPLICATE_API_TOKEN.',
        type: 'error',
        metadata: { skill: 'music-gen', error: 'replicate_not_configured' },
      };
    }

    // Enhance the user's prompt for music generation
    const startMs = Date.now();
    const { enhanced, wasEnhanced } = await enhancePrompt(
      ctx.message,
      MUSIC_GEN_PROMPT,
    );

    console.log(
      `[music-gen] userId=${ctx.userId} enhanced=${wasEnhanced} promptLen=${enhanced.length}`,
    );

    // Generate music via MediaManager
    const result = await manager.generateMusic(enhanced, ctx.userId);

    if (result.status !== 'completed') {
      return {
        content: `Music generation failed: ${result.error}`,
        type: 'error',
        metadata: {
          skill: 'music-gen',
          status: result.status,
          error: result.error,
          enhancedPrompt: wasEnhanced,
        },
      };
    }

    const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

    return {
      content: `🎵 Music generated! (${durationSec}s)`,
      type: 'audio',
      mediaUrl: result.result.url,
      mediaMimeType: 'audio/mpeg',
      metadata: {
        skill: 'music-gen',
        generationId: result.result.id,
        durationMs: result.result.durationMs,
        totalDurationMs: Date.now() - startMs,
        enhancedPrompt: wasEnhanced,
        mimeType: 'audio/mpeg',
      },
    };
  },
};
