export interface WizardStep {
  id: string;
  label: string;
  status: 'ready' | 'needs-attention' | 'not-configured';
  blocking: boolean;
  reasonCode: string | null;
  nextActions: string[];
}

export interface WizardStatus {
  steps: WizardStep[];
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

export function getBlockingSteps(
  status: WizardStatus,
): WizardStep[] {
  return status.steps.filter(step => step.blocking);
}

export function getNextActionLabels(
  actions: string[],
): { label: string; action: string }[] {
  return actions.map(action => {
    switch (action) {
      case 'retry':
        return { label: 'Retry', action: 'retry' };
      case 'open provider':
        return { label: 'Open Settings', action: 'open-provider' };
      case 'contact support':
        return { label: 'Get Help', action: 'support' };
      default:
        return { label: action, action };
    }
  });
}

export function isWizardComplete(
  status: WizardStatus,
): boolean {
  return status.isComplete;
}