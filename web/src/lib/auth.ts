// ============================================================================
// KIN Auth Helpers — JWT cookie management and token parsing.
// ============================================================================

import Cookies from 'js-cookie';

const TOKEN_COOKIE = 'kin_token';
const TOKEN_EXPIRY_HOURS = 2;

export interface JwtPayload {
  userId: string;
  telegramId: string;
  tier: 'free' | 'pro' | 'enterprise';
  exp: number;
}

/**
 * Store the JWT token in a secure cookie.
 */
export function setAuthToken(token: string): void {
  Cookies.set(TOKEN_COOKIE, token, {
    secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
    sameSite: 'lax',
    expires: TOKEN_EXPIRY_HOURS / 24, // js-cookie expects days
    path: '/',
  });
}

/**
 * Read the JWT token from the cookie.
 */
export function getAuthToken(): string | undefined {
  return Cookies.get(TOKEN_COOKIE);
}

/**
 * Remove the JWT token cookie.
 */
export function clearAuthToken(): void {
  Cookies.remove(TOKEN_COOKIE, { path: '/' });
}

/**
 * Decode a JWT payload without verifying the signature.
 * Only use client-side for reading claims — the server validates signatures.
 */
export function parseJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  // Base64url decode the payload (index 1)
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const jsonStr = atob(base64);
  const payload = JSON.parse(jsonStr);

  return {
    userId: payload.userId ?? payload.sub ?? '',
    telegramId: payload.telegramId ?? '',
    tier: payload.tier ?? 'free',
    exp: payload.exp ?? 0,
  };
}

/**
 * Check if a JWT token has expired.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwt(token);
    return payload.exp < Date.now() / 1000;
  } catch {
    return true;
  }
}
