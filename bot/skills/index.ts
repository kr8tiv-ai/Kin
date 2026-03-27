/**
 * KIN Skills Plugin System - Public API
 *
 * Usage:
 *
 *   import { createSkillRouter } from './skills/index.js';
 *
 *   const router = createSkillRouter();
 *
 *   // Check if a message triggers a skill
 *   const skill = router.matchSkill("weather in London");
 *
 *   // Execute directly
 *   const result = await router.matchAndExecute({
 *     message: "calculate 2 + 3",
 *     userId: "123",
 *     userName: "Alice",
 *     conversationHistory: [],
 *     env: process.env,
 *   });
 *
 *   // Register custom skills
 *   router.register({
 *     name: 'my-skill',
 *     description: 'A custom skill',
 *     triggers: ['my trigger'],
 *     execute: async (ctx) => ({
 *       content: 'Hello!',
 *       type: 'text',
 *     }),
 *   });
 */

// Core types
export type { KinSkill, SkillContext, SkillResult } from './types.js';

// Loader and router
export {
  SkillRouter,
  createSkillRouter,
  matchSkill,
  executeSkill,
} from './loader.js';

// Built-in skills
export {
  builtinSkills,
  weatherSkill,
  calculatorSkill,
  reminderSkill,
  webSearchSkill,
} from './builtins/index.js';

// Reminder API (for wiring up notification delivery)
export {
  addReminder,
  getReminders,
  clearReminders,
  onReminderFired,
} from './builtins/reminder.js';
export type { Reminder } from './builtins/reminder.js';
