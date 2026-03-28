'use client';

// ============================================================================
// useApi — Generic data-fetching hook backed by the KIN API client.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';

interface UseApiOptions {
  /** Skip fetching (useful for conditional queries). */
  skip?: boolean;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch data from the server. */
  refresh: () => void;
  /** Optimistically update the local data without a server round-trip. */
  mutate: (data: T) => void;
}

export function useApi<T>(
  path: string,
  options?: UseApiOptions,
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<string | null>(null);

  // Track the latest path to avoid stale responses
  const pathRef = useRef(path);
  pathRef.current = path;

  const fetchData = useCallback(async () => {
    if (options?.skip) return;

    setLoading(true);
    setError(null);

    try {
      const result = await kinApi.get<T>(pathRef.current);
      setData(result);
    } catch (err) {
      // Don't set error for auth redirects
      const message =
        err instanceof Error ? err.message : 'Failed to load data';
      if (message !== 'Unauthorized') {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [options?.skip]);

  useEffect(() => {
    fetchData();
  }, [fetchData, path]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, refresh, mutate };
}
