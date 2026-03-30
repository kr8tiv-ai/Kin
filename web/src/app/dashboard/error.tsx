'use client';

// ============================================================================
// Dashboard Error Boundary — In-context error recovery for dashboard pages.
// ============================================================================

import { useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">
        Oops
      </h1>
      <GlassCard hover={false} className="flex flex-col items-center px-8 py-12">
        <span className="text-4xl mb-4">🐙</span>
        <h2 className="font-display text-lg font-bold text-white mb-2">
          Something went sideways
        </h2>
        <p className="text-sm text-white/50 text-center max-w-sm mb-6">
          {error.message || 'An unexpected error occurred. Your companion is fine — just this page had a hiccup.'}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={reset}>
            Try Again
          </Button>
          <Button variant="ghost" size="sm" href="/dashboard">
            Back to Dashboard
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
