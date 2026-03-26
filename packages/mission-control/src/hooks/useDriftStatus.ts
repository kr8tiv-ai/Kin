/**
 * useDriftStatus Hook
 *
 * Fetches drift status from the API with caching and auto-refresh.
 * Handles loading, error, and empty states with mock data fallback in DEV mode.
 *
 * @module @kr8tiv-ai/mission-control/hooks/useDriftStatus
 */

import { useState, useEffect, useCallback } from 'react';
import type { DriftStatus, KinDriftScore } from '../types/drift';

/**
 * Hook state interface.
 */
export interface UseDriftStatusState {
  status: DriftStatus | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook options interface.
 */
export interface UseDriftStatusOptions {
  refreshInterval?: number;
  autoRefresh?: boolean;
  baseUrl?: string;
}

/**
 * Generate mock drift status for DEV mode fallback.
 */
function generateMockDriftStatus(): DriftStatus {
  const now = new Date().toISOString();

  return {
    record_id: `dss-mock-${Date.now().toString(16)}`,
    schema_family: 'drift_status',
    timestamp: now,
    kin_drift_scores: [
      { kin_id: 'kin-atlas-001', kin_name: 'Atlas', drift_score: 0.12, status: 'stable' },
      { kin_id: 'kin-nova-002', kin_name: 'Nova', drift_score: 0.78, status: 'critical' },
      { kin_id: 'kin-orion-003', kin_name: 'Orion', drift_score: 0.35, status: 'warning' },
      { kin_id: 'kin-luna-004', kin_name: 'Luna', drift_score: 0.08, status: 'stable' },
    ],
    alert_count_24h: 7,
    critical_count_24h: 2,
    overall_health: 'critical',
    created_at: now,
  };
}

/**
 * Hook for fetching drift status for all monitored Kin.
 *
 * @param options - Hook options
 * @returns Hook state with status, loading, error, and refetch
 *
 * @example
 * ```tsx
 * const { status, loading, error, refetch } = useDriftStatus({
 *   refreshInterval: 30000,
 * });
 * ```
 */
export function useDriftStatus(options: UseDriftStatusOptions = {}): UseDriftStatusState {
  const {
    refreshInterval = 30000,
    autoRefresh = true,
    baseUrl = '/api',
  } = options;

  const [status, setStatus] = useState<DriftStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch status from API.
   */
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/drift/status`);

      if (!response.ok) {
        throw new Error(`Failed to fetch drift status: ${response.status} ${response.statusText}`);
      }

      const data: DriftStatus = await response.json();
      setStatus(data);
    } catch (err) {
      // In DEV mode, use mock data fallback
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.warn('[useDriftStatus] API unavailable, using mock data:', err);
        setStatus(generateMockDriftStatus());
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  };
}

export default useDriftStatus;
