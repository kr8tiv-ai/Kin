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
        className="kin-login-btn group flex w-full items-center justify-center gap-3 rounded-full px-8 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white/80 transition-all duration-500 ease-out hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{ '--btn-accent': '#ffffff', '--btn-glow': 'rgba(255,255,255,0.25)' } as React.CSSProperties}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span>{loading ? 'Connecting...' : 'Continue with X'}</span>
      </button>

      {error && (
        <p className="text-xs text-magenta text-center animate-pulse" role="alert">{error}</p>
      )}
    </div>
  );
}
