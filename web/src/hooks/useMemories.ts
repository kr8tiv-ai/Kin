'use client';

// ============================================================================
// useMemories — Hook for fetching and deleting user memories.
// ============================================================================

import { useCallback, useState } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { Memory } from '@/lib/types';

interface UseMemoriesResult {
  memories: Memory[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deleteMemory: (id: string) => Promise<void>;
  deleting: string | null;
}

export function useMemories(): UseMemoriesResult {
  const { data, loading, error, refresh, mutate } = useApi<{
    memories: Memory[];
  }>('/memory');
  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteMemory = useCallback(
    async (id: string) => {
      setDeleting(id);
      try {
        await kinApi.delete(`/memory/${id}`);
        // Optimistically remove from local state
        if (data) {
          mutate({
            memories: data.memories.filter((m) => m.id !== id),
          });
        }
      } finally {
        setDeleting(null);
      }
    },
    [data, mutate],
  );

  return {
    memories: data?.memories ?? [],
    loading,
    error,
    refresh,
    deleteMemory,
    deleting,
  };
}
