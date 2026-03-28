'use client';

// ============================================================================
// Onboard Layout — Minimal chrome for the onboarding flow.
// No sidebar, no dashboard navigation. Just the KIN logo and content.
// ============================================================================

import { AuthGuard } from '@/components/auth/AuthGuard';

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="relative min-h-screen bg-bg overflow-hidden">
        {/* KIN Logo */}
        <div className="flex items-center justify-center gap-2 pt-8 pb-4">
          <span className="text-3xl" aria-hidden="true">&#x1F419;</span>
          <span
            className="font-display text-2xl font-bold tracking-tight text-cyan"
            style={{
              textShadow:
                '0 0 7px rgba(0,240,255,0.6), 0 0 20px rgba(0,240,255,0.4)',
            }}
          >
            KIN
          </span>
        </div>

        {/* Centered content */}
        <div className="mx-auto max-w-2xl px-4 pb-16">
          {children}
        </div>

        {/* Grain overlay */}
        <div className="grain-overlay pointer-events-none" aria-hidden="true" />
      </div>
    </AuthGuard>
  );
}
