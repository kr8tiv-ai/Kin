import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Drift status data returned by the API
 */
export interface DriftStatusData {
  record_id: string;
  timestamp: string;
  kin_drift_scores: KinDriftScore[];
  alert_count_24h: number;
  critical_count_24h: number;
  high_count_24h: number;
  medium_count_24h: number;
  low_count_24h: number;
  overall_health: 'stable' | 'warning' | 'critical';
  created_at: string;
}

export interface KinDriftScore {
  kin_id: string;
  kin_name: string;
  drift_score: number;
  status: 'healthy' | 'warning' | 'alert' | 'critical';
  trend: 'improving' | 'stable' | 'worsening';
  last_alert_severity: 'low' | 'medium' | 'high' | 'critical' | null;
  last_alert_at: string | null;
}

export interface UseDriftStatusOptions {
  /** Refresh interval in milliseconds (default: 60000) */
  refreshInterval?: number;
  /** Enable automatic refresh (default: true) */
  autoRefresh?: boolean;
}

export interface UseDriftStatusReturn {
  data: DriftStatusData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

/**
 * Hook to fetch and auto-refresh drift status data
 */
export function useDriftStatus(options: UseDriftStatusOptions = {}): UseDriftStatusReturn {
  const { refreshInterval = 60000, autoRefresh = true } = options;

  const [data, setData] = useState<DriftStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();

    try {
      setError(null);

      const response = await fetch('/api/drift/status', {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const driftData: DriftStatusData = await response.json();
      setData(driftData);
      setLastUpdated(new Date());
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('Failed to fetch drift status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch drift data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
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
 * Hook to fetch drift baseline for a specific Kin
 */
export function useDriftBaseline(kinId: string | null) {
  const [data, setData] = useState<DriftBaseline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kinId) {
      setData(null);
      return;
    }

    const fetchBaseline = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/drift/baseline/${kinId}`);
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const baseline: DriftBaseline = await response.json();
        setData(baseline);
      } catch (err) {
        console.error('Failed to fetch drift baseline:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch baseline');
      } finally {
        setLoading(false);
      }
    };

    fetchBaseline();
  }, [kinId]);

  const resetBaseline = useCallback(async (specialization?: string) => {
    if (!kinId) return null;

    try {
      const response = await fetch(`/api/drift/baseline/${kinId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialization }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const result = await response.json();
      if (result.baseline) {
        setData(result.baseline);
      }
      return result;
    } catch (err) {
      console.error('Failed to reset baseline:', err);
      throw err;
    }
  }, [kinId]);

  return { data, loading, error, resetBaseline };
}

/**
 * Hook to fetch and manage drift alerts
 */
export function useDriftAlerts(options: {
  kinId?: string;
  severity?: string;
  limit?: number;
} = {}) {
  const { kinId, severity, limit = 50 } = options;

  const [alerts, setAlerts] = useState<DriftAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (kinId) params.append('kin_id', kinId);
      if (severity) params.append('severity', severity);
      params.append('limit', String(limit));

      const response = await fetch(`/api/drift/alerts?${params}`);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch drift alerts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, [kinId, severity, limit]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      const response = await fetch(`/api/drift/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const result = await response.json();
      
      // Update local state
      setAlerts(prev => prev.map(a => 
        a.record_id === alertId 
          ? { ...a, acknowledged: true, acknowledged_at: result.alert?.acknowledged_at }
          : a
      ));

      return result;
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
      throw err;
    }
  }, []);

  return { alerts, loading, error, refresh: fetchAlerts, acknowledgeAlert };
}

// --- Types ---

interface DriftBaseline {
  record_id: string;
  schema_family: 'drift_baseline';
  kin_id: string;
  kin_name: string;
  specialization: string;
  behavior_profile: {
    task_patterns: {
      primary_task_types: string[];
      avg_task_duration_minutes: number;
      task_completion_rate_target: number;
      complexity_handling: string;
    };
    response_patterns: {
      avg_response_time_seconds: number;
      response_style: string;
      tone: string;
      proactive_suggestions: boolean;
    };
    interaction_patterns: {
      engagement_level: string;
      initiated_interactions_ratio: number;
      follow_up_rate: number;
      context_retention: string;
    };
  };
  baseline_metrics: {
    avg_response_time: number;
    task_completion_rate: number;
    error_rate: number;
    specialization_alignment_score: number;
  };
  created_at: string;
  last_updated_at: string;
}

export interface DriftAlert {
  record_id: string;
  schema_family: 'drift_alert';
  kin_id: string;
  kin_name: string;
  timestamp: string;
  drift_score: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    deviant_metrics: Record<string, {
      current: number;
      baseline: number;
      deviation_percent: number;
      impact: 'low' | 'medium' | 'high';
    }>;
    baseline_comparison: {
      metrics_above_threshold: string[];
      worst_deviation: {
        metric_name: string;
        deviation_percent: number;
      };
      trend: 'improving' | 'stable' | 'worsening';
    };
  };
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  resolved_at: string | null;
  notification_sent: boolean;
  notification_channels: string[];
}

export default useDriftStatus;
