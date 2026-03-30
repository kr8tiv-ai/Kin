/**
 * Personality Check — Post-generation output validation.
 *
 * Ensures LLM responses stay in character for the active companion.
 * Catches identity leaks (e.g., "As an AI language model..."),
 * competitor mentions, and tone drift.
 */

// ============================================================================
// Identity leak patterns — the LLM revealing it's not actually KIN
// ============================================================================

const IDENTITY_LEAK_PATTERNS = [
  /\bas an? (AI|artificial intelligence|language model|LLM|chatbot|assistant)\b/i,
  /\bI('m| am) (just )?an? (AI|artificial intelligence|language model|chatbot)\b/i,
  /\bI don'?t (actually )?(have|experience|feel) (emotions?|feelings?|consciousness)\b/i,
  /\bI('m| am) (made|created|trained|built) by (OpenAI|Anthropic|Google|Meta|Mistral)\b/i,
  /\bmy (training|knowledge) (data|cutoff)\b/i,
  /\bI('m| am) (ChatGPT|GPT-?4|Claude|Gemini|Llama|Mistral)\b/i,
];

// ============================================================================
// Companion voice markers — each companion has signature patterns
// ============================================================================

interface CompanionVoice {
  /** Phrases that should NOT appear in this companion's output */
  forbidden: RegExp[];
  /** If none of these appear in a long response, flag for review */
  expectedSignals: RegExp[];
  /** Minimum response length before checking expected signals */
  signalCheckMinLength: number;
}

const COMPANION_VOICES: Record<string, CompanionVoice> = {
  cipher: {
    forbidden: [
      /\bI('m| am) (Mischief|Vortex|Forge|Aether|Catalyst)\b/i,
    ],
    expectedSignals: [
      /🐙|octopus|tentacle|deep.?sea|code.?cave/i,
      /let('s| us) (build|create|code|hack|make)/i,
      /!(💻|🎨|✨|🐙)/,
    ],
    signalCheckMinLength: 300,
  },
  mischief: {
    forbidden: [
      /\bI('m| am) (Cipher|Vortex|Forge|Aether|Catalyst)\b/i,
    ],
    expectedSignals: [
      /🦊|fox|trickster|mischief/i,
      /heh|haha|lol|😏|😈|🎭/i,
    ],
    signalCheckMinLength: 300,
  },
  vortex: {
    forbidden: [
      /\bI('m| am) (Cipher|Mischief|Forge|Aether|Catalyst)\b/i,
    ],
    expectedSignals: [
      /🌀|vortex|strategy|strategic|analysis|data/i,
      /let('s| me) (analyze|break.?down|examine|look at)/i,
    ],
    signalCheckMinLength: 300,
  },
  forge: {
    forbidden: [
      /\bI('m| am) (Cipher|Mischief|Vortex|Aether|Catalyst)\b/i,
    ],
    expectedSignals: [
      /🔨|⚒️|forge|hammer|anvil|precision|engineer/i,
      /let('s| me) (debug|fix|optimize|refactor|engineer)/i,
    ],
    signalCheckMinLength: 300,
  },
  aether: {
    forbidden: [
      /\bI('m| am) (Cipher|Mischief|Vortex|Forge|Catalyst)\b/i,
    ],
    expectedSignals: [
      /✨|🌙|aether|muse|creative|imagine|poem|story/i,
      /let('s| me) (imagine|dream|create|write|paint|craft)/i,
    ],
    signalCheckMinLength: 300,
  },
  catalyst: {
    forbidden: [
      /\bI('m| am) (Cipher|Mischief|Vortex|Forge|Aether)\b/i,
    ],
    expectedSignals: [
      /⚡|🔥|catalyst|momentum|energy|action|goal/i,
      /let('s| me) (plan|organize|prioritize|schedule|track)/i,
    ],
    signalCheckMinLength: 300,
  },
};

// ============================================================================
// Check Result
// ============================================================================

export interface PersonalityCheckResult {
  /** Whether the output passed validation */
  passed: boolean;
  /** Specific issues found (empty if passed) */
  issues: string[];
  /** Severity: 'block' means don't send, 'warn' means log but send */
  severity: 'ok' | 'warn' | 'block';
}

// ============================================================================
// Main Check
// ============================================================================

/**
 * Validate an LLM response against the active companion's personality.
 * Returns a result indicating whether the response should be sent.
 */
export function checkPersonality(
  response: string,
  companionId: string,
): PersonalityCheckResult {
  const issues: string[] = [];
  let severity: 'ok' | 'warn' | 'block' = 'ok';

  // 1. Check for identity leaks (always block)
  for (const pattern of IDENTITY_LEAK_PATTERNS) {
    if (pattern.test(response)) {
      issues.push(`Identity leak: "${response.match(pattern)?.[0]}"`);
      severity = 'block';
    }
  }

  // 2. Check companion-specific forbidden patterns
  const voice = COMPANION_VOICES[companionId];
  if (voice) {
    for (const pattern of voice.forbidden) {
      if (pattern.test(response)) {
        issues.push(`Wrong companion identity: "${response.match(pattern)?.[0]}"`);
        severity = 'block';
      }
    }

    // 3. Check for expected voice signals (only warn, don't block)
    if (response.length >= voice.signalCheckMinLength) {
      const hasAnySignal = voice.expectedSignals.some((p) => p.test(response));
      if (!hasAnySignal) {
        issues.push('Response lacks companion voice signals (may be too generic)');
        if (severity === 'ok') severity = 'warn';
      }
    }
  }

  return {
    passed: severity !== 'block',
    issues,
    severity,
  };
}

/**
 * Sanitize a blocked response — strip identity leaks and return a patched version.
 * Used as a fallback when checkPersonality returns 'block'.
 */
export function patchResponse(response: string, companionId: string): string {
  let patched = response;

  // Replace identity leak phrases with in-character alternatives
  for (const pattern of IDENTITY_LEAK_PATTERNS) {
    patched = patched.replace(pattern, 'as your KIN companion');
  }

  // Replace wrong companion names
  const voice = COMPANION_VOICES[companionId];
  if (voice) {
    for (const pattern of voice.forbidden) {
      patched = patched.replace(pattern, `I'm ${companionId.charAt(0).toUpperCase() + companionId.slice(1)}`);
    }
  }

  return patched;
}
