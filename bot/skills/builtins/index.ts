/**
 * Built-in Skills - Barrel Export
 *
 * Exports all built-in skills as a single array for
 * registration with the skill loader.
 */

import type { KinSkill } from '../types.js';
import { weatherSkill } from './weather.js';
import { calculatorSkill } from './calculator.js';
import { reminderSkill } from './reminder.js';

export const builtinSkills: KinSkill[] = [
  weatherSkill,
  calculatorSkill,
  reminderSkill,
];

export { weatherSkill } from './weather.js';
export { calculatorSkill } from './calculator.js';
export { reminderSkill } from './reminder.js';

export default builtinSkills;
