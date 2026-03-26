/**
 * useDriftAlerts Hook
 *
 * Fetches drift alerts from the API with optional kin_id filter.
 * Handles loading, error, and empty states with mock data fallback in DEV mode.
 *
 * @module @kr8tiv-ai/mission-control/hooks/useDriftAlerts
 */

import { useState, useEffect, useCallback } from 'react';
import type { DriftAlert } from '../types/drift';

/**
 * Hook state interface.
 */
export interface UseDriftAlertsState {
  alerts: DriftAlert[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  acknowledge: (alertId: string) => Promise<boolean>;
}

/**
 * Hook options interface.
 */
export interface UseDriftAlertsOptions {
  kinId?: string;
  refreshInterval?: number;
  autoRefresh?: boolean;
  baseUrl?: string;
}

/**
 * Generate mock alerts for DEV mode fallback.
 */
function generateMockAlerts(): DriftAlert[] {
  const now = new Date().toISOString();

  return [
    {
      record_id: 'dar-mock-001',
      schema_family: 'drift_alert',
      kin_id: 'kin-nova-002',
      kin_name: 'Nova',
      timestamp: now,
      drift_score: 0.78,
      threshold: 0.3,
      severity: 'critical',
      details: {
        deviant_metrics: ['avg_response_time_ms', 'error_rate'],
        baseline_comparison: {
          avg_response_time_ms: { baseline: 1800, current: 4200 },
          error_rate: { baseline: 0.05, current: 0.22 },
        },
        trend: 'increasing',
      },
      remediation_guidance:
        'Response time and error rate significantly elevated. Consider: 1) Checking for resource constraints, 2) Reviewing recent task load, 3) Investigating potential API or external service issues.',
      acknowledged: false,
      acknowledged_at: null,
      created_at: now,
    },
    {
      record_id: 'dar-mock-002',
      schema_family: 'drift_alert',
      kin_id: 'kin-orion-003',
      kin_name: 'Orion',
      timestamp: now,
      drift_score: 0.35,
      threshold: 0.3,
      severity: 'medium',
      details: {
        deviant_metrics: ['task_completion_rate'],
        baseline_comparison: {
          task_completion_rate: { baseline: 0.92, current: 0.78 },
        },
        trend: 'stable',
      },
      remediation_guidance:
        'Task completion rate below baseline. Monitor for continued degradation. May indicate task complexity mismatch or resource constraints.',
      acknowledged: false,
      acknowledged_at: null,
      created_at: now,
    },
    {
      record_id: 'dar-mock-003',
      schema_family: 'drift_alert',
      kin_id: 'kin-atlas-001',
      kin_name: 'Atlas',
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      drift_score: 0.18,
      threshold: 0.3,
      severity: 'low',
      details: {
        deviant_metrics: ['avg_response_time_ms'],
        baseline_comparison: {
          avg_response_time_ms: { baseline: 2340, current: 2890 },
        },
        trend: 'stable',
      },
      remediation_guidance:
        'Response time slightly elevated. Monitor for continued increase. Check for recent changes in task complexity or volume.',
      acknowledged: false,
      acknowledged_at: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      record_id: 'dar-mock-004',
      schema_family: 'drift_alert',
      kin_id: 'kin-nova-002',
      kin_name: 'Nova',
      timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      drift_score: 0.52,
      threshold: 0.3,
      severity: 'high',
      details: {
        deviant_metrics: ['error_rate', 'specialization_alignment_score'],
        baseline_comparison: {
          error_rate: { baseline: 0.05, current: 0.15 },
          specialization_alignment_score: { baseline: 0.88, current: 0.65 },
        },
        trend: 'increasing',
      },
      remediation_guidance:
        'Error rate trending upward and specialization alignment dropping. Review recent task assignments for appropriateness.',
      acknowledged: true,
      acknowledged_at: new Date(Date.now() - 3600000).toISOString(),
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
}

/**
 * Hook for fetching and managing drift alerts.
 *
 * @param options - Hook options
 * @returns Hook state with alerts, loading, error, refetch, and acknowledge
 *
 * @example
 * ```tsx
 * const { alerts, loading, error, refetch, acknowledge } = useDriftAlerts({
 *   kinId: 'kin-nova-002', // optional filter
 *   refreshInterval: 30000, // optional auto-refresh
 * });
 * ```
 */
export function useDriftAlerts(options: UseDriftAlertsOptions = {}): UseDriftAlertsState {
  const {
    kinId,
    refreshInterval = 30000,
    autoRefresh = true,
    baseUrl = '/api',
  } = options;

  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch alerts from API.
   */
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = kinId
        ? `${baseUrl}/drift/alerts?kin_id=${encodeURIComponent(kinId)}`
        : `${baseUrl}/drift/alerts`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.status} ${response.statusText}`);
      }

      const data: DriftAlert[] = await response.json();
      setAlerts(data);
    } catch (err) {
      // In DEV mode, use mock data fallback
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.warn('[useDriftAlerts] API unavailable, using mock data:', err);
        const mockAlerts = generateMockAlerts();
        setAlerts(kinId ? mockAlerts.filter(a => a.kin_id === kinId) : mockAlerts);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  }, [kinId, baseUrl]);

  /**
   * Acknowledge an alert.
   */
  const acknowledge = useCallback(async (alertId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${baseUrl}/drift/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ acknowledged: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to acknowledge alert: ${response.status}`);
      }

      const updatedAlert: DriftAlert = await response.json();

      // Update local state
      setAlerts(prev =>
        prev.map(alert =>
          alert.record_id === alertId
            ? updatedAlert
            : alert
        )
      );

      return true;
    } catch (err) {
      // In DEV mode, update mock data
      if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.warn('[useDriftAlerts] API unavailable, updating mock data locally:', err);
        setAlerts(prev =>
          prev.map(alert =>
            alert.record_id === alertId
              ? { ...alert, acknowledged: true, acknowledged_at: new Date().toISOString() }
              : alert
          )
        );
        return true;
      }

      console.error('[useDriftAlerts] Failed to acknowledge alert:', err);
      return false;
    }
  }, [baseUrl]);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(fetchAlerts, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    refetch: fetchAlerts,
    acknowledge,
  };
}

export default useDriftAlerts;
