'use client';

// ============================================================================
// useCollection — Hook for fetching the user's companion collection.
// Merges API data with static companion definitions for a rich UI.
// ============================================================================

import { useMemo } from 'react';
import { useApi } from './useApi';
import { useCompanions } from './useCompanions';
import { getCompanion, type CompanionData } from '@/lib/companions';
import type { UserCompanion } from '@/lib/types';

export interface CollectionItem {
  companionId: string;
  companionData: CompanionData;
  claimedAt: string;
  isActive: boolean;
  rarity: 'genesis';
}

interface UseCollectionResult {
  items: CollectionItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  isEmpty: boolean;
}

export function useCollection(): UseCollectionResult {
  const { companions, loading, error, refresh } = useCompanions();

  const items = useMemo<CollectionItem[]>(() => {
    if (!companions || companions.length === 0) return [];

    return companions
      .map((uc: UserCompanion) => {
        const companionData = getCompanion(uc.companion.id);
        if (!companionData) return null;

        return {
          companionId: uc.companion.id,
          companionData,
          claimedAt: uc.claimedAt,
          isActive: uc.isActive,
          rarity: 'genesis' as const,
        };
      })
      .filter((item): item is CollectionItem => item !== null);
  }, [companions]);

  return {
    items,
    loading,
    error,
    refresh,
    isEmpty: !loading && items.length === 0,
  };
}
