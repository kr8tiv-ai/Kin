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
    return '#00f0ff'; // var(--cyan)
  } else if (driftScore < 0.25) {
    return '#ffd700'; // var(--gold)
  } else if (driftScore < 0.35) {
    return '#ff6b35'; // orange accent
  } else {
    return '#ff00aa'; // var(--magenta)
  }
}

/**
 * Get status background color.
 */
function getStatusBgColor(driftScore: number): string {
  if (driftScore < 0.15) {
    return 'rgba(0,240,255,0.15)'; // cyan @ 0.15
  } else if (driftScore < 0.25) {
    return 'rgba(255,215,0,0.15)'; // gold @ 0.15
  } else if (driftScore < 0.35) {
    return 'rgba(255,107,53,0.15)'; // orange @ 0.15
  } else {
    return 'rgba(255,0,170,0.15)'; // magenta @ 0.15
  }
}

/**
 * Get overall health color.
 */
function getOverallHealthColor(health: DriftHealthStatus): string {
  switch (health) {
    case 'stable':
      return '#00f0ff'; // var(--cyan)
    case 'warning':
      return '#ffd700'; // var(--gold)
    case 'critical':
      return '#ff00aa'; // var(--magenta)
    default:
      return 'rgba(255,255,255,0.7)'; // var(--text-muted)
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
        backgroundColor: '#0A0A0A',
        borderRadius: '0.375rem',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, fontFamily: "'Outfit', var(--font-display, sans-serif)", color: '#ffffff' }}>
          {kin.kin_name}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            backgroundColor: color,
            color: '#ffffff',
            fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
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
          fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
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
        backgroundColor: '#0A0A0A',
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
        <span style={{ fontSize: '0.875rem', fontWeight: 800, fontFamily: "'Outfit', var(--font-display, sans-serif)", color: '#ffffff' }}>
          System: {health.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
        <span style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', var(--font-mono, monospace)", color: 'rgba(255,255,255,0.7)' }}>
          {alertCount} alerts (24h)
        </span>
        {criticalCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontFamily: "'JetBrains Mono', var(--font-mono, monospace)", color: '#ff00aa', fontWeight: 500 }}>
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
          backgroundColor: '#000000',
          color: 'rgba(255,255,255,0.7)',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>...</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>Loading drift status...</p>
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
          backgroundColor: '#000000',
          color: '#ff00aa',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>!</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', marginBottom: '1rem', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
          Failed to load drift status
        </p>
        <button
          onClick={refetch}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
            color: '#ffffff',
            backgroundColor: '#00f0ff',
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
          backgroundColor: '#000000',
          color: 'rgba(255,255,255,0.7)',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>--</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>No Kin processes monitored</p>
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
          <span style={{ fontSize: '0.875rem', fontWeight: 800, fontFamily: "'Outfit', var(--font-display, sans-serif)", color: '#ffffff' }}>
            Drift Status
          </span>
          <button
            onClick={refetch}
            disabled={loading}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
              color: 'rgba(255,255,255,0.7)',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
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
          fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        Updated: {new Date(status.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default DriftStatusWidget;
