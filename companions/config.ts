/**
 * Companion Configuration - Runtime config for each KIN companion
 *
 * Maps companion IDs to their model preferences, escalation thresholds,
 * supervisor settings, and frontier model assignments.
 *
 * Each companion is powered by a specific frontier AI model:
 * - Cipher  → OpenAI GPT-5.4 (code generation)
 * - Mischief → Google Gemini 3.1 Pro (creative multimodal)
 * - Vortex  → Anthropic Claude Opus 4.6 (strategy & analysis)
 * - Forge   → xAI Grok 4.20 (2M context architecture)
 * - Aether  → Moonshot Kimi K2.5 (creative writing)
 * - Catalyst → Z.ai GLM-4.6 (cost-efficient coaching)
 *
 * Free tier uses Groq Qwen 3 32B for all companions.
 *
 * @module companions/config
 */

import type { FrontierProviderId } from '../inference/providers/types.js';
import type { OllamaClient } from '../inference/local-llm.js';
import { getModelName } from '../training/modelfile-generator.js';

// ============================================================================
// Types
// ============================================================================

export type EscalationLevel = 'low' | 'medium' | 'high' | 'always' | 'never';

export interface CompanionConfig {
  /** Display name */
  name: string;
  /** Species / subtitle */
  species: string;
  /** Emoji for UI display */
  emoji: string;
  /** One-line description of specialization */
  tagline: string;
  /** Local Ollama model to use */
  localModel: string;
  /** Preferred supervisor provider (legacy — used by FallbackHandler for free tier) */
  supervisorProvider: 'openai' | 'anthropic';
  /** How eagerly this companion escalates to the supervisor */
  escalationLevel: EscalationLevel;
  /** Keywords that signal this companion should escalate */
  escalationKeywords: string[];
  /** Max conversation history messages to send to supervisor */
  supervisorContextWindow: number;
  /** Frontier model provider for paid/NFT users */
  frontierProvider: FrontierProviderId;
  /** Frontier model ID (e.g. 'gpt-5.4', 'claude-opus-4-6') */
  frontierModelId: string;
  /** Display name of the frontier model (for UI) */
  frontierModelName: string;
}

// ============================================================================
// Companion Configs
// ============================================================================

export const COMPANION_CONFIGS: Record<string, CompanionConfig> = {
  cipher: {
    name: 'Cipher',
    species: 'Code Kraken',
    emoji: '\uD83D\uDC19',
    tagline: 'Web design, frontend, creative technology',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'architecture', 'design system', 'refactor', 'optimize', 'security',
      'deploy', 'production', 'scale', 'performance', 'database design',
    ],
    supervisorContextWindow: 6,
    frontierProvider: 'openai',
    frontierModelId: 'gpt-5.4',
    frontierModelName: 'OpenAI GPT-5.4',
  },

  mischief: {
    name: 'Mischief',
    species: 'Glitch Pup',
    emoji: '\uD83D\uDC15',
    tagline: 'Family, personal branding, social media',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'brand strategy', 'content plan', 'social media strategy', 'analytics',
      'engagement', 'audience', 'campaign', 'schedule',
    ],
    supervisorContextWindow: 6,
    frontierProvider: 'google',
    frontierModelId: 'gemini-3.1-pro',
    frontierModelName: 'Google Gemini 3.1 Pro',
  },

  vortex: {
    name: 'Vortex',
    species: 'Teal Dragon',
    emoji: '\uD83D\uDC09',
    tagline: 'Content strategy, brand voice, analytics',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'funnel', 'conversion', 'A/B test', 'campaign strategy', 'ROI',
      'market research', 'competitive analysis', 'positioning',
    ],
    supervisorContextWindow: 6,
    frontierProvider: 'anthropic',
    frontierModelId: 'claude-opus-4-6',
    frontierModelName: 'Anthropic Claude Opus 4.6',
  },

  forge: {
    name: 'Forge',
    species: 'Cyber Unicorn',
    emoji: '\uD83E\uDD84',
    tagline: 'Code review, debugging, architecture',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'architecture', 'system design', 'debug complex', 'concurrency',
      'memory leak', 'race condition', 'algorithm', 'data structure',
    ],
    supervisorContextWindow: 8,
    frontierProvider: 'xai',
    frontierModelId: 'grok-4.20',
    frontierModelName: 'xAI Grok 4.20',
  },

  aether: {
    name: 'Aether',
    species: 'Frost Ape',
    emoji: '\uD83E\uDD8D',
    tagline: 'Creative writing, storytelling, prose editing',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'novel structure', 'character arc', 'plot analysis', 'literary',
      'manuscript', 'worldbuilding', 'prose style', 'narrative voice',
    ],
    supervisorContextWindow: 10,
    frontierProvider: 'moonshot',
    frontierModelId: 'kimi-k2.5',
    frontierModelName: 'Moonshot Kimi K2.5',
  },

  catalyst: {
    name: 'Catalyst',
    species: 'Cosmic Blob',
    emoji: '\uD83E\uDEE7',
    tagline: 'Financial literacy, habit formation, life optimization',
    localModel: process.env.OLLAMA_MODEL ?? 'llama3.2',
    supervisorProvider: (process.env.SUPERVISOR_PROVIDER as 'openai' | 'anthropic') ?? 'anthropic',
    escalationLevel: (process.env.SUPERVISOR_ESCALATION as EscalationLevel) ?? 'medium',
    escalationKeywords: [
      'investment strategy', 'portfolio', 'tax', 'retirement', 'compound',
      'budget analysis', 'financial plan', 'debt strategy',
    ],
    supervisorContextWindow: 6,
    frontierProvider: 'zai',
    frontierModelId: 'glm-4.6',
    frontierModelName: 'Z.ai GLM-4.6',
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get config for a companion, falling back to cipher defaults.
 */
export function getCompanionConfig(companionId: string): CompanionConfig {
  return COMPANION_CONFIGS[companionId] ?? COMPANION_CONFIGS['cipher']!;
}

/**
 * List all available companion IDs.
 */
export function getCompanionIds(): string[] {
  return Object.keys(COMPANION_CONFIGS);
}

/**
 * Resolve which local model to use for a companion.
 *
 * Prefers the branded model (kin-{companionId}) if it exists in Ollama,
 * otherwise falls back to the companion's default localModel (typically llama3.2).
 * This is the integration seam for the supervisor — call it to determine
 * which model to use without hardcoding model names.
 */
export async function resolveLocalModel(
  companionId: string,
  ollamaClient: OllamaClient,
): Promise<string> {
  const brandedModel = getModelName(companionId);
  const exists = await ollamaClient.hasModel(brandedModel);

  if (exists) {
    return brandedModel;
  }

  return getCompanionConfig(companionId).localModel;
}
