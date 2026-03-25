import { useState } from 'react';
import { useDriftAlerts, DriftAlert } from '../hooks/useDriftStatus';

interface DriftAlertPanelProps {
  /** Filter to specific Kin ID */
  kinId?: string;
  /** Filter to specific severity */
  severity?: 'low' | 'medium' | 'high' | 'critical';
  /** Maximum number of alerts to display */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * DriftAlertPanel - Displays and manages drift alerts for Kin companions
 *
 * Features:
 * - Severity badges with color coding
 * - Drift score vs threshold comparison
 * - Relative time display
 * - Acknowledgment functionality
 * - Loading/error/empty states
 */
export function DriftAlertPanel({
  kinId,
  severity,
  limit = 50,
  className = '',
}: DriftAlertPanelProps) {
  const { alerts, loading, error, refresh, acknowledgeAlert } = useDriftAlerts({
    kinId,
    severity,
    limit,
  });

  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  // Get severity badge styling
  const getSeverityBadge = (severity: DriftAlert['severity']) => {
    const styles = {
      low: 'bg-gray-100 text-gray-700 border-gray-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    };

    const icons = {
      low: '○',
      medium: '◐',
      high: '◑',
      critical: '●',
    };

    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[severity]}`}>
        {icons[severity]} {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    );
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return then.toLocaleDateString();
  };

  // Handle acknowledgment
  const handleAcknowledge = async (alertId: string) => {
    setAcknowledging(alertId);
    setAckError(null);

    try {
      await acknowledgeAlert(alertId);
    } catch (err) {
      setAckError(err instanceof Error ? err.message : 'Failed to acknowledge');
    } finally {
      setAcknowledging(null);
    }
  };

  // Format drift score vs threshold
  const formatScoreComparison = (driftScore: number, threshold: number): string => {
    const scorePercent = (driftScore * 100).toFixed(0);
    const thresholdPercent = (threshold * 100).toFixed(0);
    return `${scorePercent}% / ${thresholdPercent}%`;
  };

  // Get trend indicator
  const getTrendIndicator = (trend: 'improving' | 'stable' | 'worsening') => {
    const styles = {
      improving: 'text-green-500',
      stable: 'text-gray-500',
      worsening: 'text-red-500',
    };

    const arrows = {
      improving: '↓',
      stable: '→',
      worsening: '↑',
    };

    return (
      <span className={styles[trend]} title={`Trend: ${trend}`}>
        {arrows[trend]}
      </span>
    );
  };

  // Loading state
  if (loading && alerts.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-alert-panel">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Alerts</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-kin-primary"></div>
        </div>
        <div className="text-center py-4 text-gray-500">Loading alerts...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-alert-panel">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Alerts</h3>
          <span className="text-red-500">⚠️</span>
        </div>
        <div className="text-center py-4">
          <p className="text-red-500 text-sm mb-2">{error}</p>
          <button
            onClick={refresh}
            className="text-sm text-kin-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-alert-panel">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Alerts</h3>
        </div>
        <div className="text-center py-4">
          <div className="text-4xl mb-2">✓</div>
          <p className="text-gray-500 text-sm">No drift alerts</p>
          <p className="text-gray-400 text-xs mt-1">All Kin companions are within normal parameters</p>
        </div>
      </div>
    );
  }

  // Count unacknowledged alerts
  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-alert-panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold text-gray-800">Drift Alerts</h3>
          {unacknowledgedCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
              {unacknowledgedCount} new
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Acknowledgment error */}
      {ackError && (
        <div className="mb-4 p-2 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {ackError}
          <button
            onClick={() => setAckError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Alert List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.record_id}
            className={`p-3 rounded-lg border ${
              alert.acknowledged
                ? 'bg-gray-50 border-gray-200'
                : 'bg-white border-gray-300'
            }`}
          >
            {/* Alert Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {getSeverityBadge(alert.severity)}
                <span className="font-medium text-gray-800">{alert.kin_name}</span>
              </div>
              <span className="text-xs text-gray-500">
                {formatRelativeTime(alert.timestamp)}
              </span>
            </div>

            {/* Score Comparison */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1 text-sm">
                <span className="text-gray-600">Drift:</span>
                <span className={`font-mono ${
                  alert.drift_score > alert.threshold ? 'text-red-600 font-semibold' : 'text-gray-800'
                }`}>
                  {formatScoreComparison(alert.drift_score, alert.threshold)}
                </span>
                <span className="text-gray-400 text-xs">(score / threshold)</span>
              </div>
              {getTrendIndicator(alert.details.baseline_comparison.trend)}
            </div>

            {/* Worst Deviation */}
            {alert.details.baseline_comparison.worst_deviation && (
              <div className="text-xs text-gray-600 mb-2">
                <span className="font-medium">Worst deviation:</span>{' '}
                <span className="text-gray-800">
                  {alert.details.baseline_comparison.worst_deviation.metric_name.replace(/_/g, ' ')}
                </span>
                <span className="text-red-600 ml-1">
                  ({alert.details.baseline_comparison.worst_deviation.deviation_percent.toFixed(1)}% off)
                </span>
              </div>
            )}

            {/* Metrics Above Threshold */}
            {alert.details.baseline_comparison.metrics_above_threshold.length > 0 && (
              <div className="text-xs text-gray-500 mb-2">
                <span className="font-medium">Metrics affected:</span>{' '}
                {alert.details.baseline_comparison.metrics_above_threshold.map((m, i) => (
                  <span key={m}>
                    {m.replace(/_/g, ' ')}
                    {i < alert.details.baseline_comparison.metrics_above_threshold.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}

            {/* Acknowledgment / Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              {alert.acknowledged ? (
                <span className="text-xs text-gray-500">
                  ✓ Acknowledged {alert.acknowledged_at && formatRelativeTime(alert.acknowledged_at)}
                </span>
              ) : (
                <button
                  onClick={() => handleAcknowledge(alert.record_id)}
                  disabled={acknowledging === alert.record_id}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    acknowledging === alert.record_id
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-kin-primary text-white hover:bg-kin-primary-dark'
                  }`}
                >
                  {acknowledging === alert.record_id ? 'Acknowledging...' : 'Acknowledge'}
                </button>
              )}

              {alert.notification_sent && (
                <span className="text-xs text-gray-400" title={`Notified via: ${alert.notification_channels.join(', ')}`}>
                  🔔 Notified
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center"><span className="w-2 h-2 bg-gray-400 rounded-full mr-1"></span> Low</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></span> Medium</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-orange-500 rounded-full mr-1"></span> High</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span> Critical</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriftAlertPanel;
