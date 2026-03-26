import { useEffect, useState, useCallback } from 'react';

/**
 * VPS Health data returned by the API
 */
export interface VpsHealthData {
  timestamp: string;
  kin_count: number;
  health_summary: Record<string, KinHealthSummary>;
  vps_metrics: VpsMetrics;
}

export interface KinHealthSummary {
  status: 'healthy' | 'unhealthy' | 'unknown';
  error_count: number;
  last_check: string;
}

export interface VpsMetrics {
  cpu_percent: number;
  memory_percent: number;
  uptime_seconds: number;
}

export interface UseVpsHealthOptions {
  /** Refresh interval in milliseconds (default: 30000) */
  refreshInterval?: number;
  /** Enable automatic refresh (default: true) */
  autoRefresh?: boolean;
}

export interface UseVpsHealthReturn {
  data: VpsHealthData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

/**
 * Hook to fetch and auto-refresh VPS health data
 */
export function useVpsHealth(options: UseVpsHealthOptions = {}): UseVpsHealthReturn {
  const { refreshInterval = 30000, autoRefresh = true } = options;

  const [data, setData] = useState<VpsHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/health/status');

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const healthData: VpsHealthData = await response.json();
      setData(healthData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch VPS health:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    lastUpdated,
  };
}

/**
 * Trigger a health check for all Kin
 */
export async function triggerHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch('/api/health/check', { method: 'POST' });
    return response.ok;
  } catch (error) {
    console.error('Failed to trigger health check:', error);
    return false;
  }
}

/**
 * Trigger restart for a specific Kin
 */
export async function triggerRestart(kinId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/health/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kin_id: kinId }),
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to trigger restart:', error);
    return false;
  }
}

export default useVpsHealth;
