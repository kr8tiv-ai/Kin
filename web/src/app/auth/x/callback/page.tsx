'use client';

// ============================================================================
// X (Twitter) OAuth Callback — exchanges code for token, logs user in
// ============================================================================

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { kinApi } from '@/lib/api';
import type { User } from '@/lib/types';

export default function XCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Missing authorization code or state from X.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await kinApi.post<{ token: string; user: User }>(
          '/auth/x/callback',
          { code, state },
        );

        if (cancelled) return;

        login(result.token, result.user);
        router.push('/onboard');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'X sign-in failed. Please try again.');
      }
    })();

    return () => { cancelled = true; };
  }, [searchParams, login, router]);

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
            Sign-In Failed
          </h1>
          <p className="text-white/60 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="rounded-full border border-white/20 px-8 py-3 font-display text-sm font-medium uppercase tracking-wide text-white/60 transition-all duration-300 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/30"
          >
            Back to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <p className="font-display text-sm uppercase tracking-wide text-white/60">
          Completing X sign-in...
        </p>
      </div>
    </main>
  );
}
