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

  // Setup wizard and deployment gates removed — cloud users should never
  // be forced through a self-hosting setup flow.  Admins can still visit
  // /dashboard/setup manually if needed.

  return null;
}

export function shouldRenderProtectedChildren(input: AuthRedirectInput): boolean {
  if (input.loading) return false;
  return getAuthRedirectPath(input) === null;
}