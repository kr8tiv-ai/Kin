import { useVpsHealth, triggerHealthCheck } from '../hooks/useVpsHealth';

interface VpsHealthWidgetProps {
  className?: string;
}

/**
 * VpsHealthWidget - Displays VPS health metrics and Kin process status
 * 
 * Features:
 * - CPU and memory usage display
 * - System uptime
 * - Kin process health summary
 * - Auto-refresh every 30 seconds
 * - Manual refresh button
 */
export function VpsHealthWidget({ className = '' }: VpsHealthWidgetProps) {
  const { data, loading, error, refresh, lastUpdated } = useVpsHealth({
    refreshInterval: 30000,
    autoRefresh: true,
  });

  const handleCheckNow = async () => {
    await triggerHealthCheck();
    await refresh();
  };

  // Count Kin by status
  const healthSummary = data?.health_summary || {};
  const healthyCount = Object.values(healthSummary).filter(k => k.status === 'healthy').length;
  const unhealthyCount = Object.values(healthSummary).filter(k => k.status === 'unhealthy').length;
  const unknownCount = Object.values(healthSummary).filter(k => k.status === 'unknown').length;
  const totalKin = data?.kin_count || 0;

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Format last updated time
  const formatLastUpdated = (): string => {
    if (!lastUpdated) return '';
    return lastUpdated.toLocaleTimeString();
  };

  // Loading state
  if (loading && !data) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="vps-health-widget">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">VPS Health</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-kin-primary"></div>
        </div>
        <div className="text-center py-4 text-gray-500">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="vps-health-widget">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">VPS Health</h3>
          <span className="text-red-500">⚠️</span>
        </div>
        <div className="text-center py-4">
          <p className="text-red-500 text-sm mb-2">Unable to load health data</p>
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

  const metrics = data?.vps_metrics || { cpu_percent: 0, memory_percent: 0, uptime_seconds: 0 };

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="vps-health-widget">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">VPS Health</h3>
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${
            unhealthyCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
          }`}></span>
          <button
            onClick={handleCheckNow}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            title="Check now"
          >
            ↻
          </button>
        </div>
      </div>

      {/* VPS Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className={`text-2xl font-semibold ${
            metrics.cpu_percent > 80 ? 'text-red-500' : 
            metrics.cpu_percent > 60 ? 'text-yellow-500' : 'text-gray-700'
          }`}>
            {metrics.cpu_percent.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">CPU</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-semibold ${
            metrics.memory_percent > 80 ? 'text-red-500' : 
            metrics.memory_percent > 60 ? 'text-yellow-500' : 'text-gray-700'
          }`}>
            {metrics.memory_percent.toFixed(0)}%
          </div>
          <div className="text-xs text-gray-500">Memory</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700">
            {formatUptime(metrics.uptime_seconds)}
          </div>
          <div className="text-xs text-gray-500">Uptime</div>
        </div>
      </div>

      {/* Kin Status Summary */}
      <div className="pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Kin Processes</span>
          <span className="text-sm text-gray-500">{totalKin} total</span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Healthy */}
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-sm text-gray-600">{healthyCount}</span>
          </div>

          {/* Unhealthy */}
          {unhealthyCount > 0 && (
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-sm text-red-600">{unhealthyCount}</span>
            </div>
          )}

          {/* Unknown */}
          {unknownCount > 0 && (
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              <span className="text-sm text-gray-500">{unknownCount}</span>
            </div>
          )}
        </div>

        {/* Individual Kin Status */}
        <div className="mt-3 space-y-1">
          {Object.entries(healthSummary).slice(0, 5).map(([kinId, health]) => (
            <div key={kinId} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 truncate">{kinId.split('-')[0]}</span>
              <span className={`capitalize ${
                health.status === 'healthy' ? 'text-green-600' :
                health.status === 'unhealthy' ? 'text-red-600' : 'text-gray-400'
              }`}>
                {health.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Last Updated */}
      <div className="mt-4 pt-3 border-t border-gray-100 text-center">
        <span className="text-xs text-gray-400">
          Updated: {formatLastUpdated()}
        </span>
      </div>
    </div>
  );
}

export default VpsHealthWidget;
