'use client';

// ============================================================================
// useMintCheckout — One-click companion minting via Stripe.
//
// Handles the entire flow: ensure wallet exists → Stripe checkout → redirect.
// Users never see crypto complexity — they just click "Mint" and pay.
// ============================================================================

import { useCallback, useState } from 'react';
import { kinApi } from '@/lib/api';
import { getStoredWallet, createWallet } from '@/lib/wallet';

interface UseMintCheckoutResult {
  /** Start the mint checkout flow for a companion */
  mintCheckout: (companionId: string) => Promise<void>;
  /** Whether the checkout flow is in progress */
  loading: boolean;
  /** Error message if checkout failed */
  error: string | null;
}

export function useMintCheckout(): UseMintCheckoutResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mintCheckout = useCallback(async (companionId: string) => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Ensure wallet exists (auto-create if needed)
      let wallet = getStoredWallet();
      if (!wallet) {
        wallet = await createWallet();
      }

      // Step 2: Create Stripe checkout session
      const result = await kinApi.post<{ url: string; error?: string }>(
        '/billing/mint-checkout',
        {
          companionId,
          walletAddress: wallet.publicKey,
        },
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      // Step 3: Redirect to Stripe
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { mintCheckout, loading, error };
}
