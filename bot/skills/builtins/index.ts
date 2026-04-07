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
import { webSearchSkill } from './web-search.js';
import { browserSkill } from './browser.js';

export const builtinSkills: KinSkill[] = [
  weatherSkill,
  calculatorSkill,
  reminderSkill,
  webSearchSkill,
  browserSkill,
];

export { weatherSkill } from './weather.js';
export { calculatorSkill } from './calculator.js';
export { reminderSkill } from './reminder.js';
export { webSearchSkill } from './web-search.js';
export { browserSkill } from './browser.js';

export default builtinSkills;
