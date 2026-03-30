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
import { identify, resetIdentity } from '@/lib/analytics';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  onboardingComplete: boolean;
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
    onboardingComplete: false,
  });

  // On mount, check for an existing token and verify it
  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      const storedToken = getAuthToken();

      if (!storedToken) {
        setState({ user: null, token: null, loading: false, error: null, onboardingComplete: false });
        return;
      }

      // Check expiration locally first
      if (isTokenExpired(storedToken)) {
        clearAuthToken();
        setState({ user: null, token: null, loading: false, error: null, onboardingComplete: false });
        return;
      }

      try {
        // Verify with the backend
        const verifyResponse = await kinApi.get<{ user: User; valid: boolean }>('/auth/verify');
        if (cancelled) return;

        if (!verifyResponse.valid || !verifyResponse.user) {
          clearAuthToken();
          setState({ user: null, token: null, loading: false, error: null, onboardingComplete: false });
          return;
        }

        identify(verifyResponse.user.id, {
          tier: verifyResponse.user.tier,
          firstName: verifyResponse.user.firstName,
        });

        setState({
          user: verifyResponse.user,
          token: storedToken,
          loading: false,
          error: null,
          onboardingComplete: verifyResponse.user.onboardingComplete ?? false,
        });
      } catch {
        if (cancelled) return;
        // Token invalid on the server side — clear it
        clearAuthToken();
        setState({ user: null, token: null, loading: false, error: null, onboardingComplete: false });
      }
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((token: string, user: User) => {
    setAuthToken(token);
    identify(user.id, { tier: user.tier, firstName: user.firstName });
    setState({ user, token, loading: false, error: null, onboardingComplete: user.onboardingComplete ?? false });
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    resetIdentity();
    setState({ user: null, token: null, loading: false, error: null, onboardingComplete: false });
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
