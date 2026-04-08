'use client';

// ============================================================================
// useApi — Generic data-fetching hook backed by SWR + KIN API client.
// Preserves the same return shape {data, loading, error, refresh, mutate}
// while gaining SWR's deduplication, caching, and revalidation.
// ============================================================================

import { useCallback } from 'react';
import useSWR from 'swr';
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

/** SWR fetcher that delegates to kinApi.get(). */
async function fetcher<T>(path: string): Promise<T> {
  return kinApi.get<T>(path);
}

export function useApi<T>(
  path: string,
  options?: UseApiOptions,
): UseApiResult<T> {
  // Pass null as the key when skip is true — SWR won't fetch.
  const key = options?.skip ? null : path;

  const { data, error: swrError, isLoading, mutate: swrMutate } = useSWR<T>(
    key,
    fetcher,
    {
      // Don't throw on errors — we handle them via the error return value.
      shouldRetryOnError: false,
      // Suppress auto-revalidation on window focus for now to match
      // the previous manual-fetch behavior. Can be enabled later.
      revalidateOnFocus: false,
    },
  );

  const refresh = useCallback(() => {
    swrMutate();
  }, [swrMutate]);

  const mutate = useCallback(
    (newData: T) => {
      // Optimistic update — sets local data without revalidation.
      swrMutate(newData, { revalidate: false });
    },
    [swrMutate],
  );

  // Map SWR error to a string, suppressing auth redirects like before.
  let errorMessage: string | null = null;
  if (swrError) {
    const message =
      swrError instanceof Error ? swrError.message : 'Failed to load data';
    if (message !== 'Unauthorized') {
      errorMessage = message;
    }
  }

  return {
    data: data ?? null,
    loading: isLoading,
    error: errorMessage,
    refresh,
    mutate,
  };
}
