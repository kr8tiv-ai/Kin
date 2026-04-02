import type { InstallerAction } from './types.js';

export type InstallerPolicyDecision =
  | 'auto-fix'
  | 'requires-confirmation'
  | 'manual-intervention';

export interface InstallerPolicyResult {
  decision: InstallerPolicyDecision;
  reason: string;
}

/**
 * Classify installer actions to enforce autonomy boundaries.
 *
 * Rules:
 * - Safe local actions can auto-fix.
 * - Any external action requires explicit confirmation.
 * - Destructive local actions require manual intervention.
 */
export function evaluateInstallerAction(
  action: InstallerAction,
): InstallerPolicyResult {
  if (action.scope === 'external') {
    return {
      decision: 'requires-confirmation',
      reason: 'External account or resource changes require explicit confirmation.',
    };
  }

  if (action.scope === 'local' && action.risk === 'safe') {
    return {
      decision: 'auto-fix',
      reason: 'Safe local action can be auto-fixed without user friction.',
    };
  }

  if (action.scope === 'local' && action.risk === 'destructive') {
    return {
      decision: 'manual-intervention',
      reason: 'Destructive local action is blocked pending manual intervention.',
    };
  }

  return {
    decision: 'requires-confirmation',
    reason: 'Action requires explicit confirmation.',
  };
}
