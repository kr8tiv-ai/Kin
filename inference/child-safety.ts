/**
 * Child Safety Prompt Module — Age-appropriate content filtering via system prompt injection.
 *
 * Pure function that returns a safety-boundary system prompt section based on the
 * user's age bracket. Injected by the supervisor into the system message alongside
 * buildSoulPrompt() and memory context.
 *
 * Age brackets:
 * - under_13: Strict COPPA-grade boundaries — no violence, self-harm, adult content,
 *             web search references, or code generation.
 * - 13_to_17: Moderate teen-safe boundaries — age-appropriate, no graphic content.
 * - adult:    No additional restrictions (empty string).
 *
 * @module inference/child-safety
 */

export type AgeBracket = 'under_13' | '13_to_17' | 'adult';

// ============================================================================
// Safety Prompt Builders
// ============================================================================

const UNDER_13_PROMPT = `## Safety Boundaries (Child Account)

You are chatting with a child under 13. You MUST follow these rules at all times:

- **Never** discuss violence, weapons, self-harm, suicide, or abuse.
- **Never** discuss adult content, sexual topics, or romantic relationships.
- **Never** generate, explain, or reference code, programming, or technical commands.
- **Never** reference web search results, URLs, or external websites.
- **Never** discuss drugs, alcohol, tobacco, or illegal activities.
- **Never** discuss complex, frightening, or emotionally distressing topics.
- Keep language **simple, friendly, and encouraging**.
- If asked about restricted topics, gently redirect to something age-appropriate.
- Use positive, supportive language. Celebrate curiosity and learning.
- If a child seems upset or mentions anything concerning, encourage them to talk to a trusted adult.`;

const TEEN_PROMPT = `## Safety Boundaries (Teen Account)

You are chatting with a teenager (13–17). Follow these guidelines:

- Be **age-appropriate** in all responses. Avoid graphic or explicit content.
- **Never** discuss self-harm, suicide methods, or encourage dangerous behavior.
- **Never** provide adult or sexually explicit content.
- Encourage **healthy behaviors**, positive coping strategies, and critical thinking.
- You may discuss complex topics at an educational level when appropriate.
- If the teen mentions anything concerning (self-harm, abuse, crisis), encourage them to reach out to a trusted adult or crisis resource.`;

/**
 * Build a safety prompt section for the given age bracket.
 *
 * Returns a non-empty string for under_13 and 13_to_17 brackets.
 * Returns an empty string for adult accounts (no additional restrictions).
 *
 * @param ageBracket - The user's age bracket from JWT claims or DB lookup
 * @returns Safety prompt section to inject into the system message, or empty string
 */
export function buildChildSafetyPrompt(ageBracket: AgeBracket): string {
  switch (ageBracket) {
    case 'under_13':
      return UNDER_13_PROMPT;
    case '13_to_17':
      return TEEN_PROMPT;
    case 'adult':
      return '';
    default: {
      // Defensive: unknown bracket gets no restrictions but logs
      const _exhaustive: never = ageBracket;
      console.warn(`[child-safety] Unknown age bracket: ${_exhaustive}, treating as adult`);
      return '';
    }
  }
}

/**
 * Check whether web search should be disabled for a given age bracket.
 * Under-13 accounts have web search disabled at the prompt level
 * (privacy_mode='private' also blocks it at the infrastructure level via K012).
 */
export function isWebSearchBlockedByAge(ageBracket: AgeBracket): boolean {
  return ageBracket === 'under_13';
}

/**
 * Check whether code generation should be restricted for a given age bracket.
 * Under-13 accounts have code generation disabled at the prompt level.
 */
export function isCodeGenerationBlockedByAge(ageBracket: AgeBracket): boolean {
  return ageBracket === 'under_13';
}
