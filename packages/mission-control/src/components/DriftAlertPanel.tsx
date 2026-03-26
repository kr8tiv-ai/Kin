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
      return '#dc2626'; // red-600
    case 'high':
      return '#ea580c'; // orange-600
    case 'medium':
      return '#ca8a04'; // yellow-600
    case 'low':
    default:
      return '#6b7280'; // gray-500
  }
}

/**
 * Get severity background color for badge.
 */
function getSeverityBgColor(severity: DriftSeverity): string {
  switch (severity) {
    case 'critical':
      return '#fef2f2'; // red-50
    case 'high':
      return '#fff7ed'; // orange-50
    case 'medium':
      return '#fefce8'; // yellow-50
    case 'low':
    default:
      return '#f9fafb'; // gray-50
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
  const scoreColor = isOverThreshold ? getSeverityColor('critical') : '#16a34a'; // green-600

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
      <span
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: scoreColor,
        }}
      >
        {formatDriftScore(driftScore)}
      </span>
      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1rem',
        backgroundColor: alert.acknowledged ? '#f9fafb' : '#ffffff',
        opacity: alert.acknowledged ? 0.7 : 1,
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
          <span style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            {alert.kin_name}
          </span>
          <SeverityBadge severity={alert.severity} />
        </div>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {formatRelativeTime(alert.timestamp)}
        </span>
      </div>

      {/* Drift score vs threshold */}
      <div style={{ marginBottom: '0.75rem' }}>
        <DriftScoreDisplay driftScore={alert.drift_score} threshold={alert.threshold} />
      </div>

      {/* Deviant metrics */}
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
          Deviant metrics:{' '}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          {alert.details.deviant_metrics.map(m => m.replace(/_/g, ' ')).join(', ')}
        </span>
      </div>

      {/* Trend indicator */}
      <div style={{ marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
          Trend:{' '}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color:
              alert.details.trend === 'increasing'
                ? '#dc2626'
                : alert.details.trend === 'decreasing'
                  ? '#16a34a'
                  : '#6b7280',
          }}
        >
          {alert.details.trend}
        </span>
      </div>

      {/* Remediation guidance */}
      <div
        style={{
          padding: '0.75rem',
          backgroundColor: '#f3f4f6',
          borderRadius: '0.375rem',
          marginBottom: '0.75rem',
        }}
      >
        <p
          style={{
            fontSize: '0.875rem',
            color: '#374151',
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
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            ✓ Acknowledged {alert.acknowledged_at ? formatRelativeTime(alert.acknowledged_at) : ''}
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
                color: '#ffffff',
                backgroundColor: isAcknowledging ? '#9ca3af' : '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: isAcknowledging ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {isAcknowledging ? 'Acknowledging...' : 'Acknowledge'}
            </button>
            {ackError && (
              <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{ackError}</span>
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
          color: '#6b7280',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⏳</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading drift alerts...</p>
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
          color: '#dc2626',
          ...style,
        }}
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem', marginBottom: '1rem' }}>
          Failed to load drift alerts
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
  if (displayedAlerts.length === 0) {
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
          <span style={{ fontSize: '1.5rem' }}>✓</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>
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
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            Drift Alerts
          </span>
          {severityCounts.critical > 0 && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
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
            color: '#6b7280',
          }}
        >
          Showing {maxAlerts} of {alerts.length} alerts
        </div>
      )}
    </div>
  );
};

export default DriftAlertPanel;
