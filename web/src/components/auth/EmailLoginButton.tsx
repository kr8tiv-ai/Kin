'use client';

// ============================================================================
// Email Login / Register Button — Expandable form with matching KIN style.
// ============================================================================

import { useState, useCallback } from 'react';
import type { User } from '@/lib/types';
import { kinApi } from '@/lib/api';

interface EmailLoginButtonProps {
  onAuth: (token: string, user: User) => void;
}

export function EmailLoginButton({ onAuth }: EmailLoginButtonProps) {
  const [mode, setMode] = useState<'idle' | 'login' | 'register'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'register') {
        if (!firstName.trim()) {
          setError('Name is required');
          setLoading(false);
          return;
        }
        const result = await kinApi.post<{ token: string; user: User }>(
          '/auth/email/register',
          { email: email.trim(), password, firstName: firstName.trim() },
        );
        onAuth(result.token, result.user);
      } else {
        const result = await kinApi.post<{ token: string; user: User }>(
          '/auth/email/login',
          { email: email.trim(), password },
        );
        onAuth(result.token, result.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, firstName, onAuth]);

  // Idle state — show the trigger button
  if (mode === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setMode('login')}
        className="kin-login-btn group flex w-full items-center justify-center gap-3 rounded-full px-8 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white/80 transition-all duration-500 ease-out hover:text-white"
        style={{ '--btn-accent': '#00f0ff', '--btn-glow': 'rgba(0,240,255,0.35)' } as React.CSSProperties}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        <span>Continue with Email</span>
      </button>
    );
  }

  // Login / Register form
  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {mode === 'register' && (
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm text-white placeholder-white/20 outline-none transition-all duration-300 focus:border-white/20 focus:bg-white/[0.05] focus:shadow-[0_0_20px_rgba(0,240,255,0.06)]"
        />
      )}
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm text-white placeholder-white/20 outline-none transition-all duration-300 focus:border-white/20 focus:bg-white/[0.05] focus:shadow-[0_0_20px_rgba(0,240,255,0.06)]"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm text-white placeholder-white/20 outline-none transition-all duration-300 focus:border-white/20 focus:bg-white/[0.05] focus:shadow-[0_0_20px_rgba(0,240,255,0.06)]"
      />
      <button
        type="submit"
        disabled={loading}
        className="kin-login-btn group flex w-full items-center justify-center rounded-full px-8 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white/80 transition-all duration-500 ease-out hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ '--btn-accent': '#00f0ff', '--btn-glow': 'rgba(0,240,255,0.35)' } as React.CSSProperties}
      >
        {loading
          ? 'Please wait...'
          : mode === 'register'
            ? 'Create Account'
            : 'Sign In'
        }
      </button>

      {error && (
        <p className="text-xs text-center text-magenta animate-pulse" role="alert">{error}</p>
      )}

      <div className="flex items-center justify-center gap-1 text-[11px]">
        {mode === 'login' ? (
          <>
            <span className="text-white/20">No account?</span>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className="text-white/40 hover:text-[#00f0ff] transition-colors duration-300 underline underline-offset-2 decoration-white/10 hover:decoration-[#00f0ff]/40"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            <span className="text-white/20">Have an account?</span>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className="text-white/40 hover:text-[#00f0ff] transition-colors duration-300 underline underline-offset-2 decoration-white/10 hover:decoration-[#00f0ff]/40"
            >
              Sign in
            </button>
          </>
        )}
        <span className="text-white/10 mx-1">|</span>
        <button
          type="button"
          onClick={() => { setMode('idle'); setError(null); }}
          className="text-white/20 hover:text-white/40 transition-colors duration-300"
        >
          Back
        </button>
      </div>
    </form>
  );
}
