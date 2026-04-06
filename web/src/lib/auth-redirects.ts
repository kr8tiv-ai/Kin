export interface AuthRedirectInput {
  loading: boolean;
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  setupWizardComplete: boolean;
  deploymentComplete: boolean;
  pathname: string;
}

export function getAuthRedirectPath(input: AuthRedirectInput): string | null {
  if (input.loading) {
    return null;
  }

  if (!input.isAuthenticated) {
    return '/login';
  }

  if (!input.onboardingComplete && !input.pathname.startsWith('/onboard')) {
    return '/onboard';
  }

  if (input.onboardingComplete && input.pathname.startsWith('/onboard')) {
    return '/dashboard';
  }

  if (
    input.onboardingComplete &&
    !input.setupWizardComplete &&
    !input.pathname.startsWith('/dashboard/setup')
  ) {
    return '/dashboard/setup';
  }

  if (
    input.deploymentComplete === false &&
    !input.pathname.startsWith('/dashboard/setup') &&
    !input.pathname.startsWith('/dashboard/help')
  ) {
    return '/dashboard/setup';
  }

  if (
    input.setupWizardComplete &&
    input.deploymentComplete !== false &&
    input.pathname.startsWith('/dashboard/setup')
  ) {
    return '/dashboard';
  }

  return null;
}

export function shouldRenderProtectedChildren(input: AuthRedirectInput): boolean {
  if (input.loading) return false;
  return getAuthRedirectPath(input) === null;
}
