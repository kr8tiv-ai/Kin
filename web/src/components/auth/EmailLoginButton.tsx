'use client';

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
        className="flex w-full items-center justify-center gap-2.5 rounded-full border border-white/20 px-8 py-3 font-display text-sm font-medium uppercase tracking-wide text-white/60 transition-all duration-300 hover:bg-white/[0.06] hover:text-white/80 hover:border-white/30"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Continue with Email
      </button>
    );
  }

  // Login / Register form
  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      {mode === 'register' && (
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.06]"
        />
      )}
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.06]"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.06]"
      />
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center rounded-full border border-white/20 px-8 py-3 font-display text-sm font-medium uppercase tracking-wide text-white/80 transition-all duration-300 hover:bg-white/[0.08] hover:text-white hover:border-white/30 disabled:opacity-40"
      >
        {loading
          ? 'Please wait...'
          : mode === 'register'
            ? 'Create Account'
            : 'Sign In'
        }
      </button>

      {error && (
        <p className="text-sm text-center text-magenta" role="alert">{error}</p>
      )}

      <div className="flex items-center justify-center gap-1 text-[11px]">
        {mode === 'login' ? (
          <>
            <span className="text-white/25">No account?</span>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className="text-white/50 hover:text-white/70 transition-colors underline underline-offset-2"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            <span className="text-white/25">Have an account?</span>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className="text-white/50 hover:text-white/70 transition-colors underline underline-offset-2"
            >
              Sign in
            </button>
          </>
        )}
        <span className="text-white/10 mx-1">|</span>
        <button
          type="button"
          onClick={() => { setMode('idle'); setError(null); }}
          className="text-white/30 hover:text-white/50 transition-colors"
        >
          Back
        </button>
      </div>
    </form>
  );
}
