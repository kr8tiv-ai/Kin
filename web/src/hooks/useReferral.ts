'use client';

// ============================================================================
// useReferral — Hook for referral stats and leaderboard data.
// ============================================================================

import { useApi } from './useApi';
import type { ReferralStats, LeaderboardEntry } from '@/lib/types';

interface UseReferralResult {
  stats: ReferralStats | null;
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReferral(): UseReferralResult {
  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refresh: refreshStats,
  } = useApi<ReferralStats>('/referral/stats');

  const {
    data: leaderboardData,
    loading: lbLoading,
    error: lbError,
  } = useApi<{ leaderboard: LeaderboardEntry[] }>('/referral/leaderboard');

  return {
    stats,
    leaderboard: leaderboardData?.leaderboard ?? [],
    loading: statsLoading || lbLoading,
    error: statsError || lbError,
    refresh: refreshStats,
  };
}
