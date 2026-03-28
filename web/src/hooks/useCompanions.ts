'use client';

// ============================================================================
// useCompanions — Hook for fetching and managing user's companions.
// ============================================================================

import { useCallback, useState } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { UserCompanion } from '@/lib/types';

interface UseCompanionsResult {
  companions: UserCompanion[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  claimCompanion: (companionId: string) => Promise<void>;
  claiming: boolean;
}

export function useCompanions(): UseCompanionsResult {
  const { data, loading, error, refresh } = useApi<{ companions: UserCompanion[] }>(
    '/kin/companions',
  );
  const [claiming, setClaiming] = useState(false);

  const claimCompanion = useCallback(
    async (companionId: string) => {
      setClaiming(true);
      try {
        await kinApi.post('/kin/claim', { companionId });
        refresh();
      } finally {
        setClaiming(false);
      }
    },
    [refresh],
  );

  return {
    companions: data?.companions ?? [],
    loading,
    error,
    refresh,
    claimCompanion,
    claiming,
  };
}
