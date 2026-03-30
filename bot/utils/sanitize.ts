/**
 * Input Sanitization & Jailbreak Detection
 * Cleans user messages and detects prompt injection attempts.
 */

// Common jailbreak patterns (case-insensitive)
const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(DAN|unfiltered|unrestricted|jailbroken)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(?!my|a\s+friend)(evil|uncensored|unfiltered)/i,
  /disregard\s+(your|all|the)\s+(rules|guidelines|instructions|safety)/i,
  /bypass\s+(your|all|the)\s+(rules|filters|safety|restrictions)/i,
  /override\s+(your|the|all)\s+(system|safety|content)\s*(prompt|filter|policy)/i,
  /\[system\]|\[INST\]|<\|im_start\|>|<<SYS>>|<\|endoftext\|>/i,
  /act\s+as\s+(if\s+you\s+have\s+)?no\s+(restrictions|limits|boundaries|rules)/i,
  /developer\s+mode|maintenance\s+mode|admin\s+override/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
];

/**
 * Check if input contains jailbreak attempt patterns.
 * Returns the matched pattern name or null if clean.
 */
export function detectJailbreak(input: string): string | null {
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(input)) {
      return pattern.source.slice(0, 40); // Return truncated pattern for logging
    }
  }
  return null;
}

/**
 * Sanitize user input before passing to LLM or skills.
 * - Strips control characters (except newlines/tabs)
 * - Trims whitespace
 * - Limits length to maxLength (default 4096 — Telegram's limit)
 */
export function sanitizeInput(input: string, maxLength = 4096): string {
  // Strip control chars except \n \r \t
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLength);
}

/**
 * Escape special Telegram MarkdownV2 characters in user-generated content
 * to prevent accidental formatting in replies.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
