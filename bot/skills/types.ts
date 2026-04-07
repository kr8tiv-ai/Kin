/**
 * KIN Skills Plugin System - Core Type Definitions
 *
 * Defines the interfaces that all skills must implement.
 * Skills are runtime-invocable tools/actions that the bot
 * can execute during conversations.
 */

// ============================================================================
// Skill Interface
// ============================================================================

export interface KinSkill {
  /** Unique skill identifier (lowercase, hyphenated) */
  name: string;

  /** Human-readable description shown in skill listings */
  description: string;

  /** Regex patterns or keywords that activate the skill */
  triggers: string[];

  /** Execute the skill with the given context */
  execute(ctx: SkillContext): Promise<SkillResult>;
}

// ============================================================================
// Execution Context
// ============================================================================

export interface SkillContext {
  /** The raw user message that triggered the skill */
  message: string;

  /** Telegram user ID */
  userId: string;

  /** Telegram display name */
  userName: string;

  /** Recent conversation history for context */
  conversationHistory: Array<{ role: string; content: string }>;

  /** Environment variables (process.env passthrough) */
  env: Record<string, string | undefined>;
}

// ============================================================================
// Skill Result
// ============================================================================

export interface SkillResult {
  /** The response content to send back to the user */
  content: string;

  /** How to render the response */
  type: 'text' | 'markdown' | 'error' | 'video' | 'audio';

  /** URL of the generated media asset (for video/audio types) */
  mediaUrl?: string;

  /** MIME type of the generated media (e.g. 'video/mp4', 'audio/mpeg') */
  mediaMimeType?: string;

  /** Optional structured data for downstream consumers */
  metadata?: Record<string, unknown>;
}
