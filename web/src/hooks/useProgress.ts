'use client';

// ============================================================================
// useProgress — Hook for fetching user progress, XP, and badges.
// ============================================================================

import { useApi } from './useApi';
import type { ProgressData } from '@/lib/types';

interface ProgressResponse {
  xp: number;
  level: number;
  totalMessages: number;
  streakDays: number;
  badges: string[];
  joinedAt: string;
}

interface UseProgressResult {
  progress: ProgressResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProgress(): UseProgressResult {
  const { data, loading, error, refresh } = useApi<ProgressResponse>(
    '/progress',
  );

  return {
    progress: data,
    loading,
    error,
    refresh,
  };
}
