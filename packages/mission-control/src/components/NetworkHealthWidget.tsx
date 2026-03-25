/**
 * NetworkHealthWidget component for displaying Tailscale network status.
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
          background: var(--card-bg, #1a1a2e);
          border-radius: 12px;
          padding: 16px;
        }

        .widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .widget-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .refresh-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary, #9ca3af);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: var(--hover, #1f2937);
          color: var(--text, #e5e7eb);
        }

        .health-score-container {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }

        .health-score {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: var(--input-bg, #0f0f1a);
        }

        .health-score.excellent {
          border: 3px solid var(--success, #22c55e);
        }

        .health-score.excellent .score-value {
          color: var(--success, #22c55e);
        }

        .health-score.good {
          border: 3px solid var(--info, #3b82f6);
        }

        .health-score.good .score-value {
          color: var(--info, #3b82f6);
        }

        .health-score.warning {
          border: 3px solid var(--warning, #f59e0b);
        }

        .health-score.warning .score-value {
          color: var(--warning, #f59e0b);
        }

        .health-score.critical {
          border: 3px solid var(--error, #ef4444);
        }

        .health-score.critical .score-value {
          color: var(--error, #ef4444);
        }

        .score-value {
          font-size: 24px;
          font-weight: 700;
        }

        .score-label {
          font-size: 10px;
          color: var(--text-secondary, #9ca3af);
        }

        .health-stats {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 600;
        }

        .stat-label {
          font-size: 11px;
          color: var(--text-secondary, #9ca3af);
        }

        .devices-section h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: var(--text-secondary, #9ca3af);
        }

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .devices-more {
          text-align: center;
          font-size: 12px;
          color: var(--text-secondary, #9ca3af);
          margin-top: 8px;
        }

        .tailnet-info {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border, #374151);
          font-size: 12px;
        }

        .tailnet-label {
          color: var(--text-secondary, #9ca3af);
        }

        .tailnet-name {
          margin-left: 4px;
          color: var(--text, #e5e7eb);
        }

        .loading-spinner {
          text-align: center;
          padding: 24px;
          color: var(--text-secondary, #9ca3af);
        }

        .error-message {
          color: var(--error, #ef4444);
          margin-bottom: 12px;
        }
      `}</style>
    </div>
  );
}

export default NetworkHealthWidget;
