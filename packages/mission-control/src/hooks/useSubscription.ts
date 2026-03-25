import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Subscription data types
 */
export interface SubscriptionData {
  record_id: string;
  schema_family: 'subscription_record';
  owner_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'unpaid';
  usage: UsageMetrics;
  billing_cycle: BillingCycle;
  renewal_date: string;
  trial_end?: string | null;
  cancel_at_period_end: boolean;
  canceled_at?: string | null;
  payment_method?: PaymentMethod | null;
  features: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface UsageMetrics {
  kin_count: number;
  kin_limit: number;
  api_calls_current: number;
  api_calls_limit: number;
  storage_used_mb: number;
  storage_limit_mb: number;
  voice_minutes_current?: number;
  voice_minutes_limit?: number;
}

export interface BillingCycle {
  interval: 'month' | 'year';
  current_period_start: string;
  current_period_end: string;
  amount?: number;
  currency?: string;
}

export interface PaymentMethod {
  type: 'card' | 'bank_transfer' | 'other';
  last_four: string;
  brand: string;
  expiry_month: number;
  expiry_year: number;
}

export interface Invoice {
  invoice_id: string;
  number: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  created_at: string;
  due_date?: string | null;
  paid_at?: string | null;
  invoice_url?: string | null;
  invoice_pdf?: string | null;
}

export interface UseSubscriptionOptions {
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  refreshInterval?: number;
}

export interface UseSubscriptionReturn {
  subscription: SubscriptionData | null;
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upgrade: (tier: string) => Promise<void>;
  cancel: (immediate: boolean) => Promise<void>;
  isUpgrading: boolean;
  isCanceling: boolean;
}

/**
 * Hook to manage subscription state and operations
 */
export function useSubscription(
  options: UseSubscriptionOptions = {}
): UseSubscriptionReturn {
  const { refreshInterval = 0 } = options;

  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch subscription data
  const fetchSubscription = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setError(null);

      const response = await fetch('/api/subscription', {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data: SubscriptionData = await response.json();
      setSubscription(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const response = await fetch('/api/subscription/invoices?limit=6');

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
      // Don't set error for invoices, they're optional
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSubscription();
    fetchInvoices();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchSubscription, fetchInvoices]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchSubscription, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchSubscription]);

  // Upgrade tier
  const upgrade = useCallback(async (tier: string) => {
    setIsUpgrading(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `API returned ${response.status}`);
      }

      const result = await response.json();

      if (result.subscription) {
        setSubscription(result.subscription);
      } else {
        // Refetch to get updated subscription
        await fetchSubscription();
      }
    } catch (err) {
      console.error('Failed to upgrade:', err);
      setError(err instanceof Error ? err.message : 'Failed to upgrade subscription');
      throw err;
    } finally {
      setIsUpgrading(false);
    }
  }, [fetchSubscription]);

  // Cancel subscription
  const cancel = useCallback(async (immediate: boolean) => {
    setIsCanceling(true);
    setError(null);

    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `API returned ${response.status}`);
      }

      const result = await response.json();

      if (result.subscription) {
        setSubscription(result.subscription);
      } else {
        await fetchSubscription();
      }
    } catch (err) {
      console.error('Failed to cancel:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
      throw err;
    } finally {
      setIsCanceling(false);
    }
  }, [fetchSubscription]);

  // Refresh both subscription and invoices
  const refresh = useCallback(async () => {
    await Promise.all([fetchSubscription(), fetchInvoices()]);
  }, [fetchSubscription, fetchInvoices]);

  return {
    subscription,
    invoices,
    loading,
    error,
    refresh,
    upgrade,
    cancel,
    isUpgrading,
    isCanceling,
  };
}

export default useSubscription;
