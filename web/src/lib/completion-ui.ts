import type { CompletionGate, CompletionProgress, CompletionStatusResponse } from './types.js';

// --- Badge & label helpers ---

export function gateStatusToBadgeColor(ready: boolean): 'cyan' | 'magenta' {
  return ready ? 'cyan' : 'magenta';
}

export function gateStatusToLabel(ready: boolean): string {
  return ready ? 'Complete' : 'Needs Attention';
}

// --- Progress helpers ---

export function progressToPercentage(progress: CompletionProgress): number {
  if (progress.totalGates === 0) return 0;
  return (progress.completedGates / progress.totalGates) * 100;
}

export function progressToLabel(progress: CompletionProgress): string {
  return `${progress.completedGates} of ${progress.totalGates} setup gates complete`;
}

// --- Recovery action mapping ---

function normalizeAction(action: string): string {
  return action.trim().toLowerCase();
}

const RECOVERY_ACTION_MAP: Record<string, string> = {
  retry: 'Retry',
  restart: 'Restart',
  'contact-support': 'Contact Support',
  'open-setup-wizard': 'Open Setup Wizard',
  'check-deploy-status': 'Check Deploy Status',
  'retry-deploy': 'Retry Deployment',
};

export function getGateRecoveryLabels(
  actions: string[],
): { label: string; action: string }[] {
  return actions.map((rawAction) => {
    const action = normalizeAction(rawAction);
    const label = RECOVERY_ACTION_MAP[action];
    return label ? { label, action } : { label: rawAction, action };
  });
}

// --- Deployment completion eligibility ---

export function canCompleteDeployment(status: CompletionStatusResponse): boolean {
  // Eligible to mark complete when not already complete but all gates pass
  if (status.overallComplete) return false;
  return status.gates.every((gate) => gate.ready);
}

// --- Blocking summary ---

export function getOverallBlockingSummary(status: CompletionStatusResponse): string {
  const blockingGates = status.gates.filter((g) => !g.ready);

  if (blockingGates.length === 0) {
    return 'All setup gates are ready. You can complete setup.';
  }

  if (blockingGates.length === 1) {
    return `${blockingGates[0]!.label} must be resolved before setup can be completed.`;
  }

  return `${blockingGates.length} setup gates must be resolved before setup can be completed.`;
}
