'use client';

// ============================================================================
// Auth Guard — Protects dashboard routes from unauthenticated access.
// Also redirects users who haven't completed onboarding.
// ============================================================================

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading, onboardingComplete } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Redirect to onboarding if not complete and not already on /onboard
    if (!onboardingComplete && !pathname.startsWith('/onboard')) {
      router.push('/onboard');
      return;
    }

    // If on /onboard but already completed onboarding, go to dashboard
    if (onboardingComplete && pathname.startsWith('/onboard')) {
      router.push('/dashboard');
      return;
    }
  }, [loading, isAuthenticated, onboardingComplete, pathname, router]);

  // Full-page loading skeleton while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 animate-pulse">
            <span className="text-4xl">&#x1F419;</span>
            <span
              className="font-display text-3xl font-bold text-cyan"
              style={{
                textShadow:
                  '0 0 7px rgba(0,240,255,0.6), 0 0 20px rgba(0,240,255,0.4)',
              }}
            >
              KIN
            </span>
          </div>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan/60 animate-[pulse_1.2s_ease-in-out_infinite]" />
            <span className="h-2 w-2 rounded-full bg-cyan/60 animate-[pulse_1.2s_ease-in-out_0.2s_infinite]" />
            <span className="h-2 w-2 rounded-full bg-cyan/60 animate-[pulse_1.2s_ease-in-out_0.4s_infinite]" />
          </div>
          <p className="text-sm text-text-muted">Loading your session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — return nothing (redirect is in flight)
  if (!isAuthenticated) {
    return null;
  }

  // Waiting for onboarding redirect
  if (!onboardingComplete && !pathname.startsWith('/onboard')) {
    return null;
  }

  // On onboarding page but already complete — waiting for redirect
  if (onboardingComplete && pathname.startsWith('/onboard')) {
    return null;
  }

  return <>{children}</>;
}
