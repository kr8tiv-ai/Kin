'use client';

// ============================================================================
// Auth Guard — Protects dashboard routes from unauthenticated access.
// ============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Full-page loading skeleton while checking auth
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 animate-pulse">
            <span className="text-4xl">🐙</span>
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

  return <>{children}</>;
}
