'use client';

// ============================================================================
// Telegram Login Button — Renders the Telegram Login Widget and handles auth.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/types';
import { kinApi } from '@/lib/api';

interface TelegramLoginButtonProps {
  onAuth: (token: string, user: User) => void;
  botUsername?: string;
}

interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// Extend Window to include our callback
declare global {
  interface Window {
    __kinTelegramCallback?: (data: TelegramAuthData) => void;
  }
}

const CALLBACK_NAME = '__kinTelegramCallback';

export function TelegramLoginButton({
  onAuth,
  botUsername,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolvedBot =
    botUsername ?? process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

  useEffect(() => {
    if (!resolvedBot || !containerRef.current) return;

    // Set up the global callback Telegram calls on success
    window[CALLBACK_NAME] = async (data: TelegramAuthData) => {
      setLoading(true);
      setError(null);

      try {
        const response = await kinApi.post<{ token: string; user: User }>(
          '/auth/telegram',
          data,
        );
        onAuth(response.token, response.user);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Authentication failed';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    // Inject the Telegram widget script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', resolvedBot);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '20');
    script.setAttribute('data-onauth', `${CALLBACK_NAME}(user)`);
    script.setAttribute('data-request-access', 'write');

    containerRef.current.appendChild(script);

    return () => {
      delete window[CALLBACK_NAME];
      if (containerRef.current) {
        const existingScript = containerRef.current.querySelector('script');
        if (existingScript) {
          containerRef.current.removeChild(existingScript);
        }
      }
    };
  }, [resolvedBot, onAuth]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Telegram Widget Container */}
      <div ref={containerRef} className="min-h-[40px]" />

      {loading && (
        <p className="text-sm text-text-muted animate-pulse">
          Authenticating...
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {/* Dev Login — only in development */}
      {process.env.NODE_ENV === 'development' && <DevLoginButton onAuth={onAuth} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dev Login — bypasses Telegram for local development
// ---------------------------------------------------------------------------

function DevLoginButton({
  onAuth,
}: {
  onAuth: (token: string, user: User) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDevLogin() {
    setLoading(true);
    setError(null);

    try {
      const response = await kinApi.post<{ token: string; user: User }>(
        '/auth/dev-login',
      );
      onAuth(response.token, response.user);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Dev login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="h-px w-full max-w-[240px] bg-white/10" />
      <p className="text-xs text-text-muted">Development Only</p>
      <button
        type="button"
        onClick={handleDevLogin}
        disabled={loading}
        className="rounded-full border border-gold/40 bg-gold/10 px-6 py-2 text-sm font-medium text-gold transition-all duration-200 hover:bg-gold/20 disabled:opacity-40"
      >
        {loading ? 'Logging in...' : 'Dev Login'}
      </button>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
