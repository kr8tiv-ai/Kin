/**
 * NetworkHealthWidget component for displaying Tailscale network status.
 * Styled with KIN / KR8TIV design system tokens.
 */

import React from 'react';
import { useTailscaleStatus } from '../hooks/useTailscaleStatus';
import { DeviceCard } from './DeviceCard';

interface NetworkHealthWidgetProps {
  showDevices?: boolean;
  maxDevices?: number;
  refreshInterval?: number;
  className?: string;
}

export function NetworkHealthWidget({
  showDevices = true,
  maxDevices = 5,
  refreshInterval = 30000,
  className = '',
}: NetworkHealthWidgetProps): React.ReactElement {
  const { status, devices, health, loading, error, refresh } = useTailscaleStatus({
    refreshInterval,
    autoRefresh: true,
  });

  if (loading && !status) {
    return (
      <div className={`network-health-widget loading ${className}`}>
        <div className="widget-header">
          <h3>Network Health</h3>
        </div>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`network-health-widget error ${className}`}>
        <div className="widget-header">
          <h3>Network Health</h3>
        </div>
        <div className="error-message">{error}</div>
        <button className="btn btn-small" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  }

  const healthScoreColor = health
    ? health.health_score >= 90
      ? 'excellent'
      : health.health_score >= 70
        ? 'good'
        : health.health_score >= 50
          ? 'warning'
          : 'critical'
    : 'unknown';

  const displayDevices = devices.slice(0, maxDevices);

  return (
    <div className={`network-health-widget ${className}`}>
      <div className="widget-header">
        <h3>Network Health</h3>
        <button
          className="refresh-btn"
          onClick={refresh}
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {health && (
        <div className="health-score-container">
          <div className={`health-score ${healthScoreColor}`}>
            <span className="score-value">{health.health_score}</span>
            <span className="score-label">Health Score</span>
          </div>

          <div className="health-stats">
            <div className="stat">
              <span className="stat-value">{health.online_devices}</span>
              <span className="stat-label">Online</span>
            </div>
            <div className="stat">
              <span className="stat-value">{health.offline_devices}</span>
              <span className="stat-label">Offline</span>
            </div>
            <div className="stat">
              <span className="stat-value">{health.total_devices}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
        </div>
      )}

      {showDevices && displayDevices.length > 0 && (
        <div className="devices-section">
          <h4>Devices</h4>
          <div className="devices-list">
            {displayDevices.map((device) => (
              <DeviceCard key={device.device_id} device={device} compact />
            ))}
          </div>
          {devices.length > maxDevices && (
            <div className="devices-more">
              +{devices.length - maxDevices} more devices
            </div>
          )}
        </div>
      )}

      {status?.tailnet && (
        <div className="tailnet-info">
          <span className="tailnet-label">Tailnet:</span>
          <span className="tailnet-name">{status.tailnet}</span>
        </div>
      )}

      <style>{`
        .network-health-widget {
          background: var(--glass-bg, rgba(255,255,255,0.02));
          backdrop-filter: blur(var(--glass-blur, 20px));
          -webkit-backdrop-filter: blur(var(--glass-blur, 20px));
          border-radius: var(--radius-md, 20px);
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          padding: 24px;
          color: var(--text, #ffffff);
        }

        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .widget-header h3 {
          margin: 0;
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-weight: 800;
          font-size: 16px;
          color: var(--gold, #ffd700);
        }

        .refresh-btn {
          background: transparent;
          border: 1px solid var(--border, rgba(255,255,255,0.1));
          color: var(--text-muted, rgba(255,255,255,0.7));
          cursor: pointer;
          padding: 6px;
          border-radius: var(--radius-sm, 12px);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .refresh-btn:hover {
          background: var(--surface-hover, #141414);
          color: var(--cyan, #00f0ff);
          border-color: var(--cyan, #00f0ff);
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.15);
        }

        .health-score-container {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          align-items: center;
        }

        .health-score {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 84px;
          height: 84px;
          border-radius: 50%;
          background: var(--surface, #0A0A0A);
          flex-shrink: 0;
        }

        .health-score.excellent {
          border: 3px solid var(--cyan, #00f0ff);
          box-shadow: 0 0 16px rgba(0, 240, 255, 0.2);
        }

        .health-score.excellent .score-value {
          color: var(--cyan, #00f0ff);
        }

        .health-score.good {
          border: 3px solid var(--cyan, #00f0ff);
          box-shadow: 0 0 16px rgba(0, 240, 255, 0.15);
        }

        .health-score.good .score-value {
          color: var(--cyan, #00f0ff);
        }

        .health-score.warning {
          border: 3px solid var(--gold, #ffd700);
          box-shadow: 0 0 16px rgba(255, 215, 0, 0.2);
        }

        .health-score.warning .score-value {
          color: var(--gold, #ffd700);
        }

        .health-score.critical {
          border: 3px solid var(--magenta, #ff00aa);
          box-shadow: 0 0 16px rgba(255, 0, 170, 0.2);
        }

        .health-score.critical .score-value {
          color: var(--magenta, #ff00aa);
        }

        .health-score.unknown {
          border: 3px solid var(--border, rgba(255,255,255,0.1));
        }

        .health-score.unknown .score-value {
          color: var(--text-muted, rgba(255,255,255,0.7));
        }

        .score-value {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 26px;
          font-weight: 800;
          line-height: 1.1;
        }

        .score-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text-muted, rgba(255,255,255,0.7));
          margin-top: 2px;
        }

        .health-stats {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-value {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text, #ffffff);
        }

        .stat-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text-muted, rgba(255,255,255,0.7));
        }

        .devices-section {
          border-top: 1px solid var(--border, rgba(255,255,255,0.1));
          padding-top: 16px;
          margin-top: 4px;
        }

        .devices-section h4 {
          margin: 0 0 12px 0;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: var(--text-muted, rgba(255,255,255,0.7));
        }

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .devices-more {
          text-align: center;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          color: var(--text-muted, rgba(255,255,255,0.7));
          margin-top: 10px;
        }

        .tailnet-info {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--border, rgba(255,255,255,0.1));
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tailnet-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 10px;
          color: var(--text-muted, rgba(255,255,255,0.7));
        }

        .tailnet-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          color: var(--cyan, #00f0ff);
        }

        .loading-spinner {
          text-align: center;
          padding: 24px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted, rgba(255,255,255,0.7));
        }

        .error-message {
          color: var(--magenta, #ff00aa);
          font-size: 13px;
          margin-bottom: 12px;
        }

        .btn.btn-small {
          background: transparent;
          border: 1px solid var(--cyan, #00f0ff);
          border-radius: var(--radius-pill, 100px);
          color: var(--cyan, #00f0ff);
          cursor: pointer;
          padding: 6px 16px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.2s ease;
        }

        .btn.btn-small:hover {
          background: rgba(0, 240, 255, 0.1);
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

export default NetworkHealthWidget;
