import type {
  InstallerPendingAction,
  InstallerRuntimeStatus,
} from './types.js';

export function phaseToPlainLanguage(phase: string): string {
  switch (phase) {
    case 'preflight':
      return 'Checking your system';
    case 'dependencies':
      return 'Installing required tools';
    case 'environment':
      return 'Preparing configuration';
    case 'services':
      return 'Starting local services';
    case 'verification':
      return 'Verifying everything works';
    case 'complete':
      return 'Setup complete';
    default:
      return 'Preparing setup';
  }
}

export function recoveryActionsForStatus(
  status: InstallerRuntimeStatus,
  pendingAction: InstallerPendingAction | null,
): string[] {
  if (status === 'failed') {
    return ['retry', 'restart', 'contact-support'];
  }

  if (status === 'waiting-confirmation' && pendingAction?.scope === 'external') {
    return ['approve-external', 'reject-external', 'restart'];
  }

  if (status === 'waiting-confirmation') {
    return ['retry', 'restart'];
  }

  if (status === 'running') {
    return ['restart'];
  }

  if (status === 'idle') {
    return ['retry', 'restart'];
  }

  return ['restart'];
}
