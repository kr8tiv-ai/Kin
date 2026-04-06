export type WizardStepStatus = 'ready' | 'needs-attention' | 'not-configured';

export interface WizardStep {
  id: 'keys' | 'telegram' | 'discord' | 'whatsapp';
  label: string;
  message: string;
  status: WizardStepStatus;
  blocking: boolean;
  reasonCode: string | null;
  nextActions: string[];
}

export interface WizardStatus {
  steps: WizardStep[];
  completion?: {
    persisted: boolean;
    eligible: boolean;
    reason: string | null;
  };
  isComplete: boolean;
}

export function stepStatusToBadgeColor(
  status: WizardStep['status'],
): 'cyan' | 'gold' | 'magenta' | 'muted' {
  switch (status) {
    case 'ready':
      return 'cyan';
    case 'needs-attention':
      return 'magenta';
    case 'not-configured':
      return 'gold';
    default:
      return 'muted';
  }
}

export function stepStatusToLabel(status: WizardStep['status']): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'needs-attention':
      return 'Needs Attention';
    case 'not-configured':
      return 'Not Configured';
    default:
      return 'Unknown';
  }
}

export function getBlockingSteps(status: WizardStatus): WizardStep[] {
  return status.steps.filter((step) => step.blocking);
}

export function getBlockingSummary(status: WizardStatus): string {
  const blockingSteps = getBlockingSteps(status);
  if (blockingSteps.length === 0) {
    return 'All blocking setup steps are ready. You can complete setup.';
  }

  if (blockingSteps.length === 1) {
    return `${blockingSteps[0]?.label ?? 'A step'} must be fixed before setup can be completed.`;
  }

  return `${blockingSteps.length} setup steps must be fixed before setup can be completed.`;
}

function normalizeAction(action: string): string {
  return action.trim().toLowerCase();
}

export function getNextActionLabels(
  actions: string[],
): { label: string; action: string }[] {
  return actions.map((rawAction) => {
    const action = normalizeAction(rawAction);

    switch (action) {
      case 'retry':
        return { label: 'Retry', action: 'retry' };
      case 'open provider':
      case 'open-provider':
        return { label: 'Open Provider', action: 'open-provider' };
      case 'contact support':
      case 'contact-support':
        return { label: 'Contact Support', action: 'contact-support' };
      default:
        return { label: rawAction, action };
    }
  });
}

export function canCompleteWizard(status: WizardStatus): boolean {
  if (status.completion) {
    return status.completion.eligible;
  }

  return getBlockingSteps(status).length === 0;
}

export function isWizardComplete(status: WizardStatus): boolean {
  return status.isComplete;
}
