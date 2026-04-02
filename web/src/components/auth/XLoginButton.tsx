'use client';

// ============================================================================
// X (Twitter) OAuth 2.0 Login Button — PKCE flow via backend
// ============================================================================

import { useState } from 'react';
import { kinApi } from '@/lib/api';

export function XLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const { url } = await kinApi.post<{ url: string }>('/auth/x/authorize');
      // Redirect to X's OAuth authorize page
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start X sign-in');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/20 px-8 py-3 font-display text-sm font-medium uppercase tracking-wide text-white/60 transition-all duration-300 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/30 disabled:opacity-40"
      >
        {/* X logo */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        {loading ? 'Connecting...' : 'Continue with X'}
      </button>

      {error && (
        <p className="text-sm text-magenta text-center" role="alert">{error}</p>
      )}
    </div>
  );
}
