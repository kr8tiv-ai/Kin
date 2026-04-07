'use client';

// ============================================================================
// useTraits — Fetch companion skill data with optional IPFS/chain verification.
//
// When a real mint address is available (not a mock kin-* address), fetches
// from /nft/:mintAddress/traits which includes snapshot + IPFS/chain status.
// Otherwise falls back to /companion-skills/:companionId for skills only.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';
import type { TraitSkill, TraitSnapshot, TraitResponse, CompanionSkill } from '@/lib/types';

interface UseTraitsResult {
  skills: TraitSkill[];
  snapshot: TraitSnapshot | null;
  loading: boolean;
  error: string | null;
}

/**
 * Returns true when mintAddress is a real on-chain address (not a mock kin-* placeholder).
 */
function isRealMint(mintAddress: string | undefined | null): mintAddress is string {
  return !!mintAddress && !mintAddress.startsWith('kin-');
}

export function useTraits(
  companionId: string,
  mintAddress?: string | null,
): UseTraitsResult {
  const [skills, setSkills] = useState<TraitSkill[]>([]);
  const [snapshot, setSnapshot] = useState<TraitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const companionIdRef = useRef(companionId);
  companionIdRef.current = companionId;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isRealMint(mintAddress)) {
        // Full traits endpoint with snapshot/IPFS/chain data
        const result = await kinApi.get<TraitResponse>(
          `/nft/${mintAddress}/traits`,
        );
        setSkills(result.skills);
        setSnapshot(result.latestSnapshot);
      } else {
        // Skills-only fallback — response is an array of CompanionSkill
        const result = await kinApi.get<CompanionSkill[]>(
          `/companion-skills/${companionIdRef.current}`,
        );
        // Map CompanionSkill to TraitSkill shape
        setSkills(
          result.map((s) => ({
            skillId: s.skillId,
            skillName: s.skillName,
            skillDisplayName: s.skillDisplayName,
            skillCategory: '',
            skillLevel: s.skillLevel,
            xp: s.xp,
            xpToNextLevel: s.xpToNextLevel,
            isPortable: s.isPortable,
            usageCount: s.usageCount,
            accruedAt: s.accruedAt,
            lastUsedAt: s.lastUsedAt ?? null,
          })),
        );
        setSnapshot(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load trait data';
      if (message !== 'Unauthorized') {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [mintAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData, companionId]);

  return { skills, snapshot, loading, error };
}
