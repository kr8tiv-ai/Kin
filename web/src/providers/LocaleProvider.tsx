'use client';

// ============================================================================
// LocaleProvider — Manages active locale, persists to API + cookie, triggers
// router refresh so next-intl picks up the new locale.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { kinApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface LocaleContextValue {
  /** Current active locale code, e.g. 'en', 'ja' */
  locale: string;
  /** Change locale — persists to API, sets cookie, refreshes router */
  setLocale: (locale: string) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface LocaleProviderProps {
  children: ReactNode;
  /** Initial locale from server (passed from layout.tsx getLocale()) */
  initialLocale: string;
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    async (newLocale: string) => {
      // Optimistic update
      setLocaleState(newLocale);

      // Set NEXT_LOCALE cookie so next-intl reads the new locale on refresh
      Cookies.set('NEXT_LOCALE', newLocale, { path: '/', expires: 365 });

      // Persist to API (fire-and-forget with error logging)
      try {
        await kinApi.put('/preferences', { language: newLocale });
      } catch {
        // Preference persistence failed — locale still works locally via cookie
        console.warn('[LocaleProvider] Failed to persist language preference');
      }

      // Trigger full router refresh so the server re-reads getLocale()
      // which picks up the new NEXT_LOCALE cookie value
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}
