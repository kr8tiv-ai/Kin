/**
 * Companion Configuration - Runtime config for each KIN companion
 *
 * Maps companion IDs to their model preferences, escalation thresholds,
 * and supervisor settings. This is the runtime counterpart to the
 * personality definitions in the companion .md files.
 *
 * @module companions/config
 */

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
  /** Preferred supervisor provider */
  supervisorProvider: 'openai' | 'anthropic';
  /** How eagerly this companion escalates to the supervisor */
  escalationLevel: EscalationLevel;
  /** Keywords that signal this companion should escalate */
  escalationKeywords: string[];
  /** Max conversation history messages to send to supervisor */
  supervisorContextWindow: number;
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
