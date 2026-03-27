/**
 * Skill Loader & Router
 *
 * Loads all skills from the builtins directory, compiles
 * their trigger patterns into RegExp matchers, and provides
 * matchSkill() / executeSkill() for the bot runtime.
 */

import type { KinSkill, SkillContext, SkillResult } from './types.js';
import { builtinSkills } from './builtins/index.js';

// ============================================================================
// Compiled Skill Entry
// ============================================================================

interface CompiledSkill {
  skill: KinSkill;
  patterns: RegExp[];
}

// ============================================================================
// Skill Router
// ============================================================================

export class SkillRouter {
  private skills: Map<string, CompiledSkill> = new Map();

  constructor() {
    // Register built-in skills on construction
    for (const skill of builtinSkills) {
      this.register(skill);
    }
  }

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register a skill. Compiles its trigger strings into RegExp patterns
   * for efficient matching. Duplicate names overwrite the previous skill.
   */
  register(skill: KinSkill): void {
    const patterns = skill.triggers.map((trigger) => {
      try {
        return new RegExp(trigger, 'i');
      } catch {
        // If the trigger is not valid regex, escape it and match literally
        const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'i');
      }
    });

    this.skills.set(skill.name, { skill, patterns });
  }

  /**
   * Remove a skill by name.
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  // --------------------------------------------------------------------------
  // Matching
  // --------------------------------------------------------------------------

  /**
   * Find the first skill whose trigger patterns match the message.
   * Returns null if no skill matches.
   */
  matchSkill(message: string): KinSkill | null {
    for (const { skill, patterns } of this.skills.values()) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return skill;
        }
      }
    }

    return null;
  }

  /**
   * Find all skills whose triggers match the message.
   * Useful for disambiguation when multiple skills could handle a request.
   */
  matchAllSkills(message: string): KinSkill[] {
    const matched: KinSkill[] = [];

    for (const { skill, patterns } of this.skills.values()) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          matched.push(skill);
          break; // Only add each skill once
        }
      }
    }

    return matched;
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a registered skill by name with the given context.
   * Throws if the skill is not registered.
   */
  async executeSkill(skillName: string, ctx: SkillContext): Promise<SkillResult> {
    const entry = this.skills.get(skillName);

    if (!entry) {
      return {
        content: `Skill "${skillName}" is not registered.`,
        type: 'error',
        metadata: { availableSkills: this.listSkills().map((s) => s.name) },
      };
    }

    return entry.skill.execute(ctx);
  }

  /**
   * Match a message and execute the matching skill in one call.
   * Returns null if no skill matches.
   */
  async matchAndExecute(ctx: SkillContext): Promise<SkillResult | null> {
    const skill = this.matchSkill(ctx.message);
    if (!skill) {
      return null;
    }

    return skill.execute(ctx);
  }

  // --------------------------------------------------------------------------
  // Introspection
  // --------------------------------------------------------------------------

  /**
   * List all registered skills with their metadata.
   */
  listSkills(): Array<{ name: string; description: string; triggers: string[] }> {
    return Array.from(this.skills.values()).map(({ skill }) => ({
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers,
    }));
  }

  /**
   * Check if a skill is registered by name.
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Total number of registered skills.
   */
  get size(): number {
    return this.skills.size;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a new SkillRouter pre-loaded with all built-in skills.
 */
export function createSkillRouter(): SkillRouter {
  return new SkillRouter();
}

/**
 * Match a message against all built-in skills.
 * Shorthand for cases where you don't need a persistent router instance.
 */
export function matchSkill(message: string): KinSkill | null {
  const router = new SkillRouter();
  return router.matchSkill(message);
}

/**
 * Execute a skill by name.
 * Shorthand for cases where you don't need a persistent router instance.
 */
export async function executeSkill(skillName: string, ctx: SkillContext): Promise<SkillResult> {
  const router = new SkillRouter();
  return router.executeSkill(skillName, ctx);
}
