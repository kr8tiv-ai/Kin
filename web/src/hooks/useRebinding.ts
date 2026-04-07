'use client';

// ============================================================================
// useRebinding — Hook for NFT rebinding lifecycle: status, checkout, complete.
// ============================================================================

import { useCallback } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { RebindingStatus } from '@/lib/types';

/**
 * Fetch rebinding status for a given mint address.
 * Returns null data with no error when no rebinding exists (404).
 */
export function useRebindingStatus(mintAddress: string | undefined) {
  const { data, loading, error, refresh } = useApi<RebindingStatus>(
    `/nft/rebind-status/${mintAddress}`,
    { skip: !mintAddress },
  );

  return { rebinding: data, loading, error, refresh };
}

/**
 * Initiate a rebind checkout — redirects to Stripe for $149 payment.
 */
export async function initiateRebind(mintAddress: string): Promise<void> {
  const result = await kinApi.post<{ url: string }>('/nft/rebind-checkout', {
    mintAddress,
  });
  if (result.url) {
    window.location.href = result.url;
  }
}

/**
 * Complete rebinding onboarding — marks the rebinding as fully done.
 */
export async function completeRebinding(
  mintAddress: string,
): Promise<{ success: boolean }> {
  return kinApi.post<{ success: boolean }>('/nft/rebind-complete', {
    mintAddress,
  });
}

/**
 * Combined hook for rebinding actions + status.
 */
export function useRebinding(mintAddress: string | undefined) {
  const { rebinding, loading, error, refresh } =
    useRebindingStatus(mintAddress);

  const handleInitiateRebind = useCallback(async () => {
    if (!mintAddress) return;
    await initiateRebind(mintAddress);
  }, [mintAddress]);

  const handleCompleteRebinding = useCallback(async () => {
    if (!mintAddress) return;
    const result = await completeRebinding(mintAddress);
    if (result.success) {
      refresh();
    }
    return result;
  }, [mintAddress, refresh]);

  return {
    rebinding,
    loading,
    error,
    refresh,
    initiateRebind: handleInitiateRebind,
    completeRebinding: handleCompleteRebinding,
  };
}
