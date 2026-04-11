'use client';

// ============================================================================
// Google Sign-In Button — Custom-styled button with invisible GIS overlay.
// Loads Google Identity Services, renders the real Google button off-screen,
// and overlays it (opacity-0) on top of our custom button so clicks pass
// through to Google's iframe — preserving OAuth security while giving us
// full visual control.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/types';
import { kinApi } from '@/lib/api';

interface GoogleLoginButtonProps {
  onAuth: (token: string, user: User) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: string;
              size?: string;
              shape?: string;
              width?: number;
              text?: string;
            },
          ) => void;
        };
      };
    };
  }
}

export function GoogleLoginButton({ onAuth }: GoogleLoginButtonProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

  // Load Google Identity Services script
  useEffect(() => {
    if (!clientId) return;
    if (document.getElementById('google-gis-script')) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, [clientId]);

  // Initialize Google Sign-In and render hidden button
  useEffect(() => {
    if (!scriptLoaded || !clientId || !overlayRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setLoading(true);
        setError(null);
        try {
          const result = await kinApi.post<{ token: string; user: User }>(
            '/auth/google',
            { idToken: response.credential },
          );
          onAuth(result.token, result.user);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
          setLoading(false);
        }
      },
    });

    // Render the real Google button inside the overlay container.
    // It becomes invisible but still captures clicks.
    window.google.accounts.id.renderButton(overlayRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      width: 320,
      text: 'continue_with',
    });
  }, [scriptLoaded, clientId, onAuth]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative w-full">
        {/* Our custom visible button */}
        <div
          className="kin-login-btn group flex w-full items-center justify-center gap-3 rounded-full px-8 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white/80 transition-all duration-500 ease-out hover:text-white cursor-pointer select-none"
          style={{ '--btn-accent': '#4285F4', '--btn-glow': 'rgba(66,133,244,0.4)' } as React.CSSProperties}
        >
          {/* Google multicolor logo */}
          <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span className="relative">
            {loading ? 'Signing in...' : 'Continue with Google'}
          </span>
        </div>

        {/* Invisible Google button overlay — captures clicks for OAuth */}
        <div
          ref={overlayRef}
          className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-full"
          style={{ opacity: 0.01 }}
          aria-hidden="true"
        />
      </div>

      {error && (
        <p className="text-xs text-magenta text-center animate-pulse" role="alert">{error}</p>
      )}
    </div>
  );
}
