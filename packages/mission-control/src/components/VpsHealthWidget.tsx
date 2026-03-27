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
 *
 * Styled with KIN / KR8TIV design system tokens.
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

  // Metric color based on threshold
  const metricColor = (value: number): string => {
    if (value > 80) return 'var(--magenta, #ff00aa)';
    if (value > 60) return 'var(--gold, #ffd700)';
    return 'var(--cyan, #00f0ff)';
  };

  // Status color for Kin process indicators
  const statusColor = (status: string): string => {
    if (status === 'healthy') return 'var(--cyan, #00f0ff)';
    if (status === 'unhealthy') return 'var(--magenta, #ff00aa)';
    return 'var(--text-muted, rgba(255,255,255,0.7))';
  };

  /* ---- Shared Styles ---- */

  const cardStyle: React.CSSProperties = {
    background: 'var(--glass-bg, rgba(255,255,255,0.02))',
    backdropFilter: 'blur(var(--glass-blur, 20px))',
    WebkitBackdropFilter: 'blur(var(--glass-blur, 20px))',
    borderRadius: 'var(--radius-md, 20px)',
    border: '1px solid var(--border, rgba(255,255,255,0.1))',
    padding: '24px',
    color: 'var(--text, #ffffff)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: "var(--font-display, 'Outfit', sans-serif)",
    fontWeight: 800,
    fontSize: '16px',
    color: 'var(--gold, #ffd700)',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    fontSize: '10px',
    color: 'var(--text-muted, rgba(255,255,255,0.7))',
  };

  const metricValueStyle = (value: number): React.CSSProperties => ({
    fontFamily: "var(--font-display, 'Outfit', sans-serif)",
    fontWeight: 800,
    fontSize: '28px',
    lineHeight: 1.1,
    color: metricColor(value),
  });

  const uptimeValueStyle: React.CSSProperties = {
    fontFamily: "var(--font-display, 'Outfit', sans-serif)",
    fontWeight: 800,
    fontSize: '28px',
    lineHeight: 1.1,
    color: 'var(--text, #ffffff)',
  };

  const refreshBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--border, rgba(255,255,255,0.1))',
    borderRadius: 'var(--radius-sm, 12px)',
    color: 'var(--cyan, #00f0ff)',
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: '14px',
    transition: 'all 0.2s ease',
  };

  const dotStyle = (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    boxShadow: `0 0 6px ${color}`,
  });

  const dividerStyle: React.CSSProperties = {
    borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
    paddingTop: '16px',
    marginTop: '0',
  };

  const spinnerStyle: React.CSSProperties = {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid transparent',
    borderBottomColor: 'var(--cyan, #00f0ff)',
    animation: 'spin 0.8s linear infinite',
  };

  // Loading state
  if (loading && !data) {
    return (
      <div className={className} style={cardStyle} data-testid="vps-health-widget">
        <div style={headerStyle}>
          <h3 style={titleStyle}>VPS Health</h3>
          <div style={spinnerStyle} />
        </div>
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted, rgba(255,255,255,0.7))' }}>
          Loading...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className} style={cardStyle} data-testid="vps-health-widget">
        <div style={headerStyle}>
          <h3 style={titleStyle}>VPS Health</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: 'var(--magenta, #ff00aa)', fontSize: '13px', marginBottom: '12px' }}>
            Unable to load health data
          </p>
          <button
            onClick={refresh}
            style={{
              background: 'transparent',
              border: '1px solid var(--cyan, #00f0ff)',
              borderRadius: 'var(--radius-pill, 100px)',
              color: 'var(--cyan, #00f0ff)',
              cursor: 'pointer',
              padding: '6px 16px',
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              fontSize: '12px',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.1em',
              transition: 'all 0.2s ease',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const metrics = data?.vps_metrics || { cpu_percent: 0, memory_percent: 0, uptime_seconds: 0 };

  return (
    <div className={className} style={cardStyle} data-testid="vps-health-widget">
      {/* Widget Header */}
      <div style={headerStyle}>
        <h3 style={titleStyle}>VPS Health</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={dotStyle(
            unhealthyCount > 0
              ? 'var(--magenta, #ff00aa)'
              : 'var(--cyan, #00f0ff)'
          )} />
          <button
            onClick={handleCheckNow}
            style={refreshBtnStyle}
            title="Check now"
          >
            ↻
          </button>
        </div>
      </div>

      {/* VPS Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={metricValueStyle(metrics.cpu_percent)}>
            {metrics.cpu_percent.toFixed(0)}%
          </div>
          <div style={labelStyle}>CPU</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={metricValueStyle(metrics.memory_percent)}>
            {metrics.memory_percent.toFixed(0)}%
          </div>
          <div style={labelStyle}>Memory</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={uptimeValueStyle}>
            {formatUptime(metrics.uptime_seconds)}
          </div>
          <div style={labelStyle}>Uptime</div>
        </div>
      </div>

      {/* Kin Status Summary */}
      <div style={dividerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            textTransform: 'uppercase' as const,
            letterSpacing: '0.15em',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text, #ffffff)',
          }}>
            Kin Processes
          </span>
          <span style={{
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            fontSize: '11px',
            color: 'var(--text-muted, rgba(255,255,255,0.7))',
          }}>
            {totalKin} total
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Healthy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={dotStyle('var(--cyan, #00f0ff)')} />
            <span style={{ fontSize: '13px', color: 'var(--cyan, #00f0ff)' }}>{healthyCount}</span>
          </div>

          {/* Unhealthy */}
          {unhealthyCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={dotStyle('var(--magenta, #ff00aa)')} />
              <span style={{ fontSize: '13px', color: 'var(--magenta, #ff00aa)' }}>{unhealthyCount}</span>
            </div>
          )}

          {/* Unknown */}
          {unknownCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={dotStyle('var(--text-muted, rgba(255,255,255,0.7))')} />
              <span style={{ fontSize: '13px', color: 'var(--text-muted, rgba(255,255,255,0.7))' }}>{unknownCount}</span>
            </div>
          )}
        </div>

        {/* Individual Kin Status */}
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(healthSummary).slice(0, 5).map(([kinId, health]) => (
            <div key={kinId} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
            }}>
              <span style={{
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                color: 'var(--text-muted, rgba(255,255,255,0.7))',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {kinId.split('-')[0]}
              </span>
              <span style={{
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                textTransform: 'capitalize' as const,
                fontSize: '11px',
                color: statusColor(health.status),
              }}>
                {health.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Last Updated */}
      <div style={{
        ...dividerStyle,
        marginTop: '16px',
        textAlign: 'center',
      }}>
        <span style={{
          fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
          fontSize: '10px',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          color: 'var(--text-muted, rgba(255,255,255,0.7))',
        }}>
          Updated: {formatLastUpdated()}
        </span>
      </div>
    </div>
  );
}

export default VpsHealthWidget;
