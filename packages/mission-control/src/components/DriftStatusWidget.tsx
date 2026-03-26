/**
 * DriftStatusWidget Component
 *
 * Displays drift scores per Kin in Mission Control dashboard with color-coded severity.
 * Shows overall health status, individual Kin scores, and handles all UI states.
 *
 * @module @kr8tiv-ai/mission-control/components/DriftStatusWidget
 */

import React, { useMemo } from 'react';
import { useDriftStatus } from '../hooks/useDriftStatus';
import type { KinDriftScore, DriftHealthStatus } from '../types/drift';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get status color based on drift score.
 * green < 0.15, yellow 0.15-0.25, orange 0.25-0.35, red > 0.35
 */
function getStatusColor(driftScore: number): string {
  if (driftScore < 0.15) {
    return '#16a34a'; // green-600
  } else if (driftScore < 0.25) {
    return '#ca8a04'; // yellow-600
  } else if (driftScore < 0.35) {
    return '#ea580c'; // orange-600
  } else {
    return '#dc2626'; // red-600
  }
}

/**
 * Get status background color.
 */
function getStatusBgColor(driftScore: number): string {
  if (driftScore < 0.15) {
    return '#f0fdf4'; // green-50
  } else if (driftScore < 0.25) {
    return '#fefce8'; // yellow-50
  } else if (driftScore < 0.35) {
    return '#fff7ed'; // orange-50
  } else {
    return '#fef2f2'; // red-50
  }
}

/**
 * Get overall health color.
 */
function getOverallHealthColor(health: DriftHealthStatus): string {
  switch (health) {
    case 'stable':
      return '#16a34a'; // green-600
    case 'warning':
      return '#ca8a04'; // yellow-600
    case 'critical':
      return '#dc2626'; // red-600
    default:
      return '#6b7280'; // gray-500
  }
}

/**
 * Format drift score as percentage.
 */
function formatDriftScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Individual Kin drift score card.
 */
interface KinScoreCardProps {
  kin: KinDriftScore;
}

const KinScoreCard: React.FC<KinScoreCardProps> = ({ kin }) => {
  const color = getStatusColor(kin.drift_score);
  const bgColor = getStatusBgColor(kin.drift_score);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem',
        backgroundColor: bgColor,
        borderRadius: '0.375rem',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
          {kin.kin_name}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            backgroundColor: color,
            color: '#ffffff',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 600,
          }}
        >
          {kin.status}
        </span>
      </div>
      <span
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color,
        }}
      >
        {formatDriftScore(kin.drift_score)}
      </span>
    </div>
  );
};

/**
 * Overall health indicator.
 */
interface HealthIndicatorProps {
  health: DriftHealthStatus;
  alertCount: number;
  criticalCount: number;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  health,
  alertCount,
  criticalCount,
}) => {
  const color = getOverallHealthColor(health);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.5rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <div
          style={{
            width: '0.75rem',
            height: '0.75rem',
            borderRadius: '50%',
            backgroundColor: color,
            boxShadow: `0 0 0 3px ${color}33`,
          }}
        />
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
          System: {health.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {alertCount} alerts (24h)
        </span>
        {criticalCount > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}>
            {criticalCount} critical
          </span>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * Props for DriftStatusWidget component.
 */
export interface DriftStatusWidgetProps {
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Whether to auto-refresh */
  autoRefresh?: boolean;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Custom className for styling */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Show compact view (no header) */
  compact?: boolean;
}

/**
 * DriftStatusWidget displays drift scores for all monitored Kin.
 *
 * @example
 * ```tsx
 * <DriftStatusWidget
 *   refreshInterval={30000}
 *   compact={false}
 * />
 * ```
 */
export const DriftStatusWidget: React.FC<DriftStatusWidgetProps> = ({
  refreshInterval = 30000,
  autoRefresh = true,
  baseUrl = '/api',
  className,
  style,
  compact = false,
}) => {
  const { status, loading, error, refetch } = useDriftStatus({
    refreshInterval,
    autoRefresh,
    baseUrl,
  });

  // Sort Kin by drift score (highest first)
  const sortedKinScores = useMemo(() => {
    if (!status?.kin_drift_scores) return [];
    return [...status.kin_drift_scores].sort((a, b) => b.drift_score - a.drift_score);
  }, [status?.kin_drift_scores]);

  // Loading state
  if (loading && !status) {
    return (
      <div
        className={className}
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⏳</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading drift status...</p>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div
        className={className}
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#dc2626',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', marginBottom: '1rem' }}>
          Failed to load drift status
        </p>
        <button
          onClick={refetch}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#ffffff',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!status || sortedKinScores.length === 0) {
    return (
      <div
        className={className}
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>📊</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>No Kin processes monitored</p>
      </div>
    );
  }

  // Main render
  return (
    <div className={className} style={style}>
      {/* Header */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Drift Status
          </span>
          <button
            onClick={refetch}
            disabled={loading}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#374151',
              backgroundColor: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      )}

      {/* Overall health indicator */}
      <HealthIndicator
        health={status.overall_health}
        alertCount={status.alert_count_24h}
        criticalCount={status.critical_count_24h}
      />

      {/* Kin scores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sortedKinScores.map(kin => (
          <KinScoreCard key={kin.kin_id} kin={kin} />
        ))}
      </div>

      {/* Timestamp */}
      <div
        style={{
          marginTop: '0.75rem',
          textAlign: 'right',
          fontSize: '0.75rem',
          color: '#9ca3af',
        }}
      >
        Updated: {new Date(status.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default DriftStatusWidget;
