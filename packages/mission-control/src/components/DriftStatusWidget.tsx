import { useDriftStatus } from '../hooks/useDriftStatus';

interface DriftStatusWidgetProps {
  className?: string;
}

/**
 * DriftStatusWidget - Displays drift status for all Kin companions
 * 
 * Features:
 * - Drift score per Kin with color coding
 * - Overall health status indicator
 * - Recent alerts count
 * - Click to view detailed drift breakdown
 */
export function DriftStatusWidget({ className = '' }: DriftStatusWidgetProps) {
  const { data, loading, error, refresh, lastUpdated } = useDriftStatus({
    refreshInterval: 60000, // Refresh every minute
    autoRefresh: true,
  });

  // Format last updated time
  const formatLastUpdated = (): string => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString();
  };

  // Get status color based on drift status
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'alert':
        return 'text-orange-500';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  // Get drift score bar color
  const getScoreBarColor = (score: number): string => {
    if (score < 0.1) return 'bg-green-500';
    if (score < 0.2) return 'bg-yellow-500';
    if (score < 0.3) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Get overall health badge
  const getOverallHealthBadge = () => {
    if (!data) return null;

    const healthStyles = {
      stable: 'bg-green-100 text-green-800 border-green-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    };

    const healthIcons = {
      stable: '✓',
      warning: '⚠',
      critical: '⚠',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${
        healthStyles[data.overall_health]
      }`}>
        {healthIcons[data.overall_health]} {data.overall_health.charAt(0).toUpperCase() + data.overall_health.slice(1)}
      </span>
    );
  };

  // Loading state
  if (loading && !data) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-status-widget">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Status</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-kin-primary"></div>
        </div>
        <div className="text-center py-4 text-gray-500">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-status-widget">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Status</h3>
          <span className="text-red-500">⚠️</span>
        </div>
        <div className="text-center py-4">
          <p className="text-red-500 text-sm mb-2">Unable to load drift data</p>
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
  if (!data || data.kin_drift_scores.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-status-widget">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Drift Status</h3>
        </div>
        <div className="text-center py-4">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-gray-500 text-sm">No Kin tracked for drift</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="drift-status-widget">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Drift Status</h3>
        <div className="flex items-center space-x-2">
          {getOverallHealthBadge()}
          <button
            onClick={refresh}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Alert Summary */}
      {data.alert_count_24h > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-yellow-800">
              {data.alert_count_24h} alert{data.alert_count_24h !== 1 ? 's' : ''} in last 24h
            </span>
            {data.critical_count_24h > 0 && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                {data.critical_count_24h} critical
              </span>
            )}
          </div>
        </div>
      )}

      {/* Kin Drift Scores */}
      <div className="space-y-3">
        {data.kin_drift_scores.map((kin) => (
          <div
            key={kin.kin_id}
            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              {/* Status indicator */}
              <div className={`w-2 h-2 rounded-full ${
                kin.status === 'healthy' ? 'bg-green-500' :
                kin.status === 'warning' ? 'bg-yellow-500' :
                kin.status === 'alert' ? 'bg-orange-500' : 'bg-red-500'
              }`}></div>
              
              <div>
                <span className="text-sm font-medium text-gray-800">{kin.kin_name}</span>
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <span className={getStatusColor(kin.status)}>{kin.status}</span>
                  {kin.trend !== 'stable' && (
                    <span className={kin.trend === 'improving' ? 'text-green-500' : 'text-red-500'}>
                      {kin.trend === 'improving' ? '↓' : '↑'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Drift score bar */}
            <div className="flex items-center space-x-2">
              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getScoreBarColor(kin.drift_score)} transition-all`}
                  style={{ width: `${Math.min(kin.drift_score * 100, 100)}%` }}
                ></div>
              </div>
              <span className="text-xs text-gray-600 w-10 text-right">
                {(kin.drift_score * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-3">
            <span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> Healthy</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></span> Warning</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span> Critical</span>
          </div>
          <span>Threshold: 20%</span>
        </div>
      </div>

      {/* Last Updated */}
      <div className="mt-3 text-center">
        <span className="text-xs text-gray-400">
          Updated: {formatLastUpdated()}
        </span>
      </div>
    </div>
  );
}

export default DriftStatusWidget;
