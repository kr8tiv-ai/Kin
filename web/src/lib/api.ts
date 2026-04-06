// ============================================================================
// KIN API Client — Singleton HTTP client with JWT auth and error handling.
// ============================================================================

import Cookies from 'js-cookie';

const TOKEN_COOKIE = 'kin_token';

export class KinApiClient {
  private baseUrl: string;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl?: string) {
    // Always use /api prefix in the browser — Next.js rewrites handle the proxy.
    // NEXT_PUBLIC_API_URL is only used by next.config.ts for the rewrite destination.
    this.baseUrl = baseUrl ?? (typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL ?? '/api'));
  }

  private getToken(): string | undefined {
    return Cookies.get(TOKEN_COOKIE);
  }

  private handleUnauthorized(): void {
    Cookies.remove(TOKEN_COOKIE, { path: '/' });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  /**
   * Attempt to refresh the JWT token. Returns true if refresh succeeded.
   * Deduplicates concurrent refresh attempts via a shared promise.
   */
  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const token = this.getToken();
      if (!token) return false;

      try {
        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) return false;

        const data = await res.json();
        if (data.token) {
          Cookies.set(TOKEN_COOKIE, data.token, {
            secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
            sameSite: 'lax',
            expires: 2 / 24, // 2 hours in days
            path: '/',
          });
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // On 401, try refreshing the token once before giving up
    if (response.status === 401 && path !== '/auth/refresh') {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        // Retry the original request with the new token
        const newToken = this.getToken();
        const retryHeaders: Record<string, string> = {};
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
        if (body !== undefined) retryHeaders['Content-Type'] = 'application/json';

        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: retryHeaders,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (retryResponse.status === 401) {
          this.handleUnauthorized();
          throw new Error('Unauthorized');
        }

        if (retryResponse.status === 204) return undefined as T;
        if (!retryResponse.ok) {
          let message = `Request failed: ${retryResponse.status}`;
          try { const e = await retryResponse.json(); if (e.error) message = e.error; } catch {}
          throw new Error(message);
        }
        return retryResponse.json() as Promise<T>;
      }

      this.handleUnauthorized();
      throw new Error('Unauthorized');
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
      throw new Error(
        `You're sending messages too fast. Please wait ${seconds} second${seconds !== 1 ? 's' : ''} and try again.`,
      );
    }

    if (!response.ok) {
      let message = `Request failed: ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody.error) {
          message = errorBody.error;
        }
      } catch {
        // Response body was not JSON — use default message.
      }
      throw new Error(message);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

/** Singleton API client instance for use across the app. */
export const kinApi = new KinApiClient();
