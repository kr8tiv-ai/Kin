// ============================================================================
// KIN API Client — Singleton HTTP client with JWT auth and error handling.
// ============================================================================

import Cookies from 'js-cookie';

const TOKEN_COOKIE = 'kin_token';

export class KinApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? '';
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

    if (response.status === 401) {
      this.handleUnauthorized();
      throw new Error('Unauthorized');
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
