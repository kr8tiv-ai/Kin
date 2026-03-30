'use client';

// ============================================================================
// Global Error Boundary — Catches runtime errors across the entire app.
// ============================================================================

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 text-6xl">🐙</div>
        <h1 className="mb-2 font-display text-2xl font-bold text-white">
          Something went wrong
        </h1>
        <p className="mb-6 text-sm text-white/50 leading-relaxed">
          Don&apos;t worry — your companion is still here. Let&apos;s try that again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-cyan/10 border border-cyan/20 px-6 py-2.5 text-sm font-medium text-cyan transition-all hover:bg-cyan/20"
          >
            Try Again
          </button>
          <a
            href="/"
            className="rounded-full border border-white/10 px-6 py-2.5 text-sm font-medium text-white/50 transition-all hover:bg-white/5 hover:text-white/70"
          >
            Go Home
          </a>
        </div>
        {error.digest && (
          <p className="mt-6 font-mono text-[10px] text-white/20">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
