'use client';

// ============================================================================
// useReferral — Hook for referral stats and leaderboard data.
// Auto-generates a referral code if the user doesn't have one yet.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { ReferralStats, LeaderboardEntry } from '@/lib/types';

interface UseReferralResult {
  stats: ReferralStats | null;
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  generating: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReferral(): UseReferralResult {
  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refresh: refreshStats,
  } = useApi<ReferralStats>('/referral');

  const {
    data: leaderboardData,
    loading: lbLoading,
    error: lbError,
  } = useApi<{ leaderboard: LeaderboardEntry[] }>('/referral/leaderboard');

  // Auto-generate referral code if user doesn't have one yet.
  // Uses a ref guard to prevent duplicate generate calls.
  const generateAttempted = useRef(false);
  const generating = useRef(false);

  useEffect(() => {
    if (statsLoading || generateAttempted.current) return;
    if (stats && stats.referralCode === null) {
      generateAttempted.current = true;
      generating.current = true;
      kinApi
        .post('/referral/generate')
        .then(() => {
          refreshStats();
        })
        .catch(() => {
          // Generation failed — user can retry via page refresh
        })
        .finally(() => {
          generating.current = false;
        });
    }
  }, [stats, statsLoading, refreshStats]);

  return {
    stats,
    leaderboard: leaderboardData?.leaderboard ?? [],
    loading: statsLoading || lbLoading,
    generating: generating.current,
    error: statsError || lbError,
    refresh: refreshStats,
  };
}
