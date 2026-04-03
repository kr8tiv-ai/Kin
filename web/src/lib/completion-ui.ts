export interface CompletionStatus {
  installerReady: boolean;
  installerStatus: string;
  installerPhase: string;
  wizardComplete: boolean;
  wizardSteps: Array<{ id: string; status: string; blocking: boolean }>;
  cloudReady: boolean;
  cloudProvider: string | null;
  overallComplete: boolean;
  blockingReasons: string[];
  nextActions: string[];
}

export function completionStatusToProgressLabel(
  status: CompletionStatus,
): string {
  if (status.overallComplete) {
    return 'All set! Your KIN is ready.';
  }

  const steps: string[] = [];
  
  if (!status.installerReady) {
    steps.push('Finish local setup');
  }
  
  if (!status.wizardComplete) {
    steps.push('Complete setup wizard');
  }
  
  if (!status.cloudReady) {
    steps.push('Deploy to cloud (optional)');
  }

  return steps.length > 0 
    ? `Next: ${steps.join(', ')}`
    : 'Setting up...';
}

export function getProgressPercentage(status: CompletionStatus): number {
  let complete = 0;
  const total = 4;

  if (status.installerReady) complete++;
  if (status.wizardComplete) complete++;
  if (status.cloudReady) complete++;
  if (status.overallComplete) complete++;

  return Math.round((complete / total) * 100);
}

export function completionToBadgeColor(
  complete: boolean,
): 'cyan' | 'gold' | 'muted' {
  return complete ? 'cyan' : 'gold';
}

export function getRecoveryActions(
  status: CompletionStatus,
): { label: string; action: string; variant: 'primary' | 'outline' | 'ghost' }[] {
  const actions: { label: string; action: string; variant: 'primary' | 'outline' | 'ghost' }[] = [];

  if (!status.installerReady) {
    actions.push({ 
      label: 'Continue Setup', 
      action: '/dashboard/setup', 
      variant: 'primary' 
    });
  } else if (!status.wizardComplete) {
    actions.push({ 
      label: 'Complete Wizard', 
      action: '/dashboard/setup', 
      variant: 'primary' 
    });
  } else if (!status.cloudReady) {
    actions.push({ 
      label: 'Deploy to Cloud', 
      action: '/dashboard/projects/new', 
      variant: 'outline' 
    });
  }

  actions.push({ 
    label: 'Get Help', 
    action: '/dashboard/help', 
    variant: 'ghost' 
  });

  return actions;
}
