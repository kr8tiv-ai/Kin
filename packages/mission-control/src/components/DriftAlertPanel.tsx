/**
 * DriftAlertPanel Component
 *
 * Displays and manages drift alerts with severity badges, drift score vs threshold
 * comparison, relative time display, and acknowledgment functionality.
 *
 * @module @kr8tiv-ai/mission-control/components/DriftAlertPanel
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useDriftAlerts } from '../hooks/useDriftAlerts';
import type { DriftAlert, DriftSeverity } from '../types/drift';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format relative time since a timestamp.
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

/**
 * Get severity color for badge.
 */
function getSeverityColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'critical':
      return '#ff00aa'; // var(--magenta)
    case 'high':
      return '#ff6b35'; // orange accent
    case 'medium':
      return '#ffd700'; // var(--gold)
    case 'low':
    default:
      return 'rgba(255,255,255,0.5)'; // var(--text-muted)
  }
}

/**
 * Get severity background color for badge.
 */
function getSeverityBgColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'critical':
      return 'rgba(255,0,170,0.15)'; // magenta @ 0.15
    case 'high':
      return 'rgba(255,107,53,0.15)'; // orange @ 0.15
    case 'medium':
      return 'rgba(255,215,0,0.15)'; // gold @ 0.15
    case 'low':
    default:
      return 'rgba(255,255,255,0.05)'; // neutral @ 0.05
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
 * Severity badge component.
 */
interface SeverityBadgeProps {
  severity: DriftSeverity;
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const bgColor = getSeverityBgColor(severity);
  const textColor = getSeverityColor(severity);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.125rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      {severity}
    </span>
  );
};

/**
 * Drift score display with threshold comparison.
 */
interface DriftScoreDisplayProps {
  driftScore: number;
  threshold: number;
}

const DriftScoreDisplay: React.FC<DriftScoreDisplayProps> = ({ driftScore, threshold }) => {
  const isOverThreshold = driftScore > threshold;
  const scoreColor = isOverThreshold ? getSeverityColor('critical') : '#00f0ff'; // var(--cyan)

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
      <span
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
          color: scoreColor,
        }}
      >
        {formatDriftScore(driftScore)}
      </span>
      <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
        / {formatDriftScore(threshold)} threshold
      </span>
    </div>
  );
};

/**
 * Single alert card component.
 */
interface AlertCardProps {
  alert: DriftAlert;
  onAcknowledge: (alertId: string) => Promise<boolean>;
  acknowledging: string | null;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, onAcknowledge, acknowledging }) => {
  const [ackError, setAckError] = useState<string | null>(null);

  const handleAcknowledge = useCallback(async () => {
    setAckError(null);
    const success = await onAcknowledge(alert.record_id);
    if (!success) {
      setAckError('Failed to acknowledge. Please try again.');
    }
  }, [alert.record_id, onAcknowledge]);

  const isAcknowledging = acknowledging === alert.record_id;

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        padding: '1rem',
        backgroundColor: '#0A0A0A',
        opacity: alert.acknowledged ? 0.5 : 1,
      }}
    >
      {/* Header: Kin name + Severity badge + Time */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 600, fontFamily: "'Outfit', var(--font-display, sans-serif)", color: '#ffffff' }}>
            {alert.kin_name}
          </span>
          <SeverityBadge severity={alert.severity} />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: "'JetBrains Mono', var(--font-mono, monospace)" }}>
          {formatRelativeTime(alert.timestamp)}
        </span>
      </div>

      {/* Drift score vs threshold */}
      <div style={{ marginBottom: '0.75rem' }}>
        <DriftScoreDisplay driftScore={alert.drift_score} threshold={alert.threshold} />
      </div>

      {/* Deviant metrics */}
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
          Deviant metrics:{' '}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
          {alert.details.deviant_metrics.map(m => m.replace(/_/g, ' ')).join(', ')}
        </span>
      </div>

      {/* Trend indicator */}
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
          Trend:{' '}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
            color:
              alert.details.trend === 'increasing'
                ? '#ff00aa'
                : alert.details.trend === 'decreasing'
                  ? '#00f0ff'
                  : 'rgba(255,255,255,0.7)',
          }}
        >
          {alert.details.trend}
        </span>
      </div>

      {/* Remediation guidance */}
      <div
        style={{
          padding: '0.75rem',
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderRadius: '0.375rem',
          marginBottom: '0.75rem',
        }}
      >
        <p
          style={{
            fontSize: '0.875rem',
            color: 'rgba(255,255,255,0.7)',
            fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {alert.remediation_guidance}
        </p>
      </div>

      {/* Acknowledgment section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {alert.acknowledged ? (
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
            Acknowledged {alert.acknowledged_at ? formatRelativeTime(alert.acknowledged_at) : ''}
          </span>
        ) : (
          <>
            <button
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 500,
                fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
                color: '#ffffff',
                backgroundColor: isAcknowledging ? 'rgba(255,255,255,0.2)' : '#00f0ff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: isAcknowledging ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {isAcknowledging ? 'Acknowledging...' : 'Acknowledge'}
            </button>
            {ackError && (
              <span style={{ fontSize: '0.75rem', color: '#ff00aa' }}>{ackError}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

/**
 * Props for DriftAlertPanel component.
 */
export interface DriftAlertPanelProps {
  /** Filter alerts by Kin ID */
  kinId?: string;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Whether to auto-refresh */
  autoRefresh?: boolean;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Maximum number of alerts to display */
  maxAlerts?: number;
  /** Show only unacknowledged alerts */
  unacknowledgedOnly?: boolean;
  /** Custom className for styling */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

/**
 * DriftAlertPanel displays and manages drift alerts.
 *
 * @example
 * ```tsx
 * <DriftAlertPanel
 *   kinId="kin-nova-002"
 *   maxAlerts={10}
 *   unacknowledgedOnly={true}
 * />
 * ```
 */
export const DriftAlertPanel: React.FC<DriftAlertPanelProps> = ({
  kinId,
  refreshInterval = 30000,
  autoRefresh = true,
  baseUrl = '/api',
  maxAlerts = 20,
  unacknowledgedOnly = false,
  className,
  style,
}) => {
  const { alerts, loading, error, refetch, acknowledge } = useDriftAlerts({
    kinId,
    refreshInterval,
    autoRefresh,
    baseUrl,
  });

  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  // Handle acknowledgment with loading state
  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      setAcknowledging(alertId);
      const result = await acknowledge(alertId);
      setAcknowledging(null);
      return result;
    },
    [acknowledge]
  );

  // Filter and sort alerts
  const displayedAlerts = useMemo(() => {
    let filtered = alerts;

    // Filter by acknowledgment status
    if (unacknowledgedOnly) {
      filtered = filtered.filter(a => !a.acknowledged);
    }

    // Sort by severity (critical first) then by timestamp (newest first)
    const severityOrder: Record<DriftSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    filtered = [...filtered].sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Limit to maxAlerts
    return filtered.slice(0, maxAlerts);
  }, [alerts, unacknowledgedOnly, maxAlerts]);

  // Count alerts by severity
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const alert of alerts) {
      counts[alert.severity]++;
    }
    return counts;
  }, [alerts]);

  // Loading state
  if (loading && alerts.length === 0) {
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
        <p style={{ margin: 0, fontSize: '0.875rem', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>Loading drift alerts...</p>
      </div>
    );
  }

  // Error state
  if (error && alerts.length === 0) {
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
          Failed to load drift alerts
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
  if (displayedAlerts.length === 0) {
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
          <span style={{ fontSize: '1.5rem', color: '#00f0ff' }}>OK</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)" }}>
          {unacknowledgedOnly
            ? 'No unacknowledged drift alerts'
            : 'No drift alerts'}
        </p>
      </div>
    );
  }

  // Main render
  return (
    <div className={className} style={style}>
      {/* Header with counts */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: '#0A0A0A',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 800, fontFamily: "'Outfit', var(--font-display, sans-serif)", color: '#ffffff' }}>
            Drift Alerts
          </span>
          {severityCounts.critical > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
                color: getSeverityColor('critical'),
              }}
            >
              {severityCounts.critical} critical
            </span>
          )}
          {severityCounts.high > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
                color: getSeverityColor('high'),
              }}
            >
              {severityCounts.high} high
            </span>
          )}
        </div>
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

      {/* Alert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {displayedAlerts.map(alert => (
          <AlertCard
            key={alert.record_id}
            alert={alert}
            onAcknowledge={handleAcknowledge}
            acknowledging={acknowledging}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {alerts.length > maxAlerts && (
        <div
          style={{
            marginTop: '0.75rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            fontFamily: "'Plus Jakarta Sans', var(--font-body, sans-serif)",
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          Showing {maxAlerts} of {alerts.length} alerts
        </div>
      )}
    </div>
  );
};

export default DriftAlertPanel;
