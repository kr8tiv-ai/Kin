/**
 * Input Sanitization - Cleans user messages before processing
 */

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
