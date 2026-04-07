'use client';

// ============================================================================
// useBilling — Hook for billing status, Stripe checkout, and portal sessions.
// ============================================================================

import { useCallback, useState } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { BillingStatus } from '@/lib/types';

interface UseBillingResult {
  billing: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Create a Stripe checkout session and redirect to the returned URL. */
  checkout: (tier?: string) => Promise<void>;
  checkingOut: boolean;
  /** Create a Stripe portal session and redirect to the returned URL. */
  openPortal: () => Promise<void>;
  openingPortal: boolean;
}

export function useBilling(): UseBillingResult {
  const { data, loading, error, refresh } = useApi<BillingStatus>(
    '/billing/status',
  );
  const [checkingOut, setCheckingOut] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const checkout = useCallback(async (tier?: string) => {
    setCheckingOut(true);
    try {
      const result = await kinApi.post<{ url: string }>('/billing/checkout', {
        tier,
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } finally {
      setCheckingOut(false);
    }
  }, []);

  const openPortal = useCallback(async () => {
    setOpeningPortal(true);
    try {
      const result = await kinApi.post<{ url: string }>('/billing/portal');
      if (result.url) {
        window.location.href = result.url;
      }
    } finally {
      setOpeningPortal(false);
    }
  }, []);

  return {
    billing: data,
    loading,
    error,
    refresh,
    checkout,
    checkingOut,
    openPortal,
    openingPortal,
  };
}
