/**
 * Approval Policy — declarative gate for external mutations.
 *
 * Pure function that determines whether a skill+intent combination requires
 * user confirmation before execution. Currently gates email send/draft
 * operations; all other skills pass through ungated.
 *
 * @module inference/approval-policy
 */

// ---------------------------------------------------------------------------
// Policy Map
// ---------------------------------------------------------------------------

/**
 * Map of skill names → set of intents that require approval.
 * If a skill is listed here, only the specified intents are gated.
 * Intents not in the set pass through without approval.
 */
const APPROVAL_REQUIRED: Record<string, Set<string>> = {
  email: new Set(['send', 'draft']),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a skill+intent combination requires user approval.
 *
 * @param skillName - The skill being invoked (e.g. 'email', 'weather')
 * @param intent    - Optional intent within the skill (e.g. 'send', 'draft')
 * @returns true if execution should be held for user confirmation
 */
export function requiresApproval(skillName: string, intent?: string): boolean {
  const gatedIntents = APPROVAL_REQUIRED[skillName];
  if (!gatedIntents) return false;
  if (!intent) return false;
  return gatedIntents.has(intent);
}

/**
 * Extract the intent for a skill from a natural-language message.
 *
 * Used by the pipeline/scheduler execution paths where the skill context
 * contains a free-text message rather than a pre-parsed intent. For the
 * email skill, looks for 'send' / 'draft' keywords. For all other skills,
 * returns undefined (no intent extraction rules defined yet).
 *
 * @param message   - The natural-language message from the skill context
 * @param skillName - The skill being invoked
 * @returns The extracted intent string, or undefined if no intent detected
 */
export function extractSkillIntent(message: string, skillName: string): string | undefined {
  if (skillName !== 'email') return undefined;

  const lower = message.toLowerCase();
  if (/\bsend\b/.test(lower)) return 'send';
  if (/\bdraft\b/.test(lower)) return 'draft';
  return undefined;
}
