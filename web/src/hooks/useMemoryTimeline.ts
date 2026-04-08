'use client';

// ============================================================================
// useMemoryTimeline — Hook for browsing, filtering, and deleting memories.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';
import type { Memory } from '@/lib/types';

const PAGE_SIZE = 50;

interface UseMemoryTimelineParams {
  companionId?: string;
  sort?: 'created_at_desc' | 'importance_desc';
  type?: Memory['type'];
}

interface UseMemoryTimelineResult {
  memories: Memory[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deleteMemory: (id: string) => Promise<void>;
  batchDelete: (ids: string[]) => Promise<void>;
  deleting: boolean;
  loadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}

export function useMemoryTimeline(
  params: UseMemoryTimelineParams = {},
): UseMemoryTimelineResult {
  const { companionId, sort = 'created_at_desc', type } = params;

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const offsetRef = useRef(0);

  // Build query string for the API
  const buildPath = useCallback(
    (offset: number) => {
      const qs = new URLSearchParams();
      qs.set('sort', sort);
      qs.set('limit', String(PAGE_SIZE));
      qs.set('offset', String(offset));
      if (companionId) qs.set('companionId', companionId);
      if (type) qs.set('type', type);
      return `/memory?${qs.toString()}`;
    },
    [sort, companionId, type],
  );

  // Initial fetch + re-fetch when params change
  const fetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    offsetRef.current = 0;

    try {
      const result = await kinApi.get<{ memories: Memory[] }>(buildPath(0));
      const items = result.memories ?? [];
      setMemories(items);
      setHasMore(items.length === PAGE_SIZE);
      offsetRef.current = items.length;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load memories';
      if (message !== 'Unauthorized') {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [buildPath]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const result = await kinApi.get<{ memories: Memory[] }>(
        buildPath(offsetRef.current),
      );
      const items = result.memories ?? [];
      setMemories((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      offsetRef.current += items.length;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load more memories';
      if (message !== 'Unauthorized') {
        setError(message);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, buildPath]);

  // Delete a single memory with optimistic removal
  const deleteMemory = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      await kinApi.delete(`/memory/${id}`);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setDeleting(false);
    }
  }, []);

  // Batch delete with optimistic removal
  const batchDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      await kinApi.post('/memory/batch-delete', { ids });
      const idSet = new Set(ids);
      setMemories((prev) => prev.filter((m) => !idSet.has(m.id)));
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    memories,
    loading,
    error,
    refresh: fetchInitial,
    deleteMemory,
    batchDelete,
    deleting,
    loadMore,
    hasMore,
    loadingMore,
  };
}
