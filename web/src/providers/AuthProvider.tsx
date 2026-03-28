'use client';

// ============================================================================
// KIN Auth Provider — Context for authentication state across the app.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/types';
import { kinApi } from '@/lib/api';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  parseJwt,
  isTokenExpired,
} from '@/lib/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  // On mount, check for an existing token and verify it
  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      const storedToken = getAuthToken();

      if (!storedToken) {
        setState({ user: null, token: null, loading: false, error: null });
        return;
      }

      // Check expiration locally first
      if (isTokenExpired(storedToken)) {
        clearAuthToken();
        setState({ user: null, token: null, loading: false, error: null });
        return;
      }

      try {
        // Verify with the backend
        const verifyResponse = await kinApi.get<{ user: User }>('/auth/verify');
        if (cancelled) return;

        setState({
          user: verifyResponse.user,
          token: storedToken,
          loading: false,
          error: null,
        });
      } catch {
        if (cancelled) return;
        // Token invalid on the server side — clear it
        clearAuthToken();
        setState({ user: null, token: null, loading: false, error: null });
      }
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((token: string, user: User) => {
    setAuthToken(token);
    setState({ user, token, loading: false, error: null });
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setState({ user: null, token: null, loading: false, error: null });
    router.push('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      isAuthenticated: state.user !== null && state.token !== null,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state and actions.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
