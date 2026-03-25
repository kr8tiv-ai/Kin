/**
 * DeviceCard component for displaying individual Tailscale device status.
 */

import React from 'react';
import type { TailscaleDevice } from '../hooks/useTailscaleStatus';

interface DeviceCardProps {
  device: TailscaleDevice;
  compact?: boolean;
  onTagDevice?: (deviceId: string) => void;
  onRemoveDevice?: (deviceId: string) => void;
  className?: string;
}

const OS_ICONS: Record<string, string> = {
  linux: '🐧',
  windows: '🪟',
  macos: '🍎',
  ios: '📱',
  android: '🤖',
  unknown: '❓',
};

function formatLastSeen(lastSeen: string): string {
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function DeviceCard({
  device,
  compact = false,
  onTagDevice,
  onRemoveDevice,
  className = '',
}: DeviceCardProps): React.ReactElement {
  const osIcon = OS_ICONS[device.os] || OS_ICONS.unknown;
  const primaryIp = device.ip_addresses[0] || 'No IP';

  if (compact) {
    return (
      <div className={`device-card compact ${device.online ? 'online' : 'offline'} ${className}`}>
        <div className="device-status-indicator" />
        <div className="device-info">
          <span className="device-name">{device.hostname}</span>
          <span className="device-ip">{primaryIp}</span>
        </div>
        <span className="device-os">{osIcon}</span>

        <style>{`
          .device-card.compact {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--input-bg, #0f0f1a);
            border-radius: 6px;
          }

          .device-status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
          }

          .device-card.online .device-status-indicator {
            background: var(--success, #22c55e);
          }

          .device-card.offline .device-status-indicator {
            background: var(--error, #ef4444);
          }

          .device-info {
            flex: 1;
            min-width: 0;
          }

          .device-name {
            display: block;
            font-size: 13px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .device-ip {
            display: block;
            font-size: 11px;
            color: var(--text-secondary, #9ca3af);
          }

          .device-os {
            font-size: 16px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`device-card ${device.online ? 'online' : 'offline'} ${className}`}>
      <div className="device-header">
        <div className="device-status">
          <div className="device-status-indicator" />
          <span className="device-status-text">
            {device.online ? 'Online' : 'Offline'}
          </span>
        </div>
        <span className="device-os">{osIcon} {device.os}</span>
      </div>

      <div className="device-body">
        <h4 className="device-hostname">{device.hostname}</h4>

        {device.is_kin_host && device.kin_id && (
          <div className="device-kin-badge">
            <span className="kin-icon">🤖</span>
            <span className="kin-id">{device.kin_id}</span>
          </div>
        )}

        <div className="device-details">
          <div className="detail-row">
            <span className="detail-label">IP Address</span>
            <span className="detail-value">{primaryIp}</span>
          </div>

          {device.ip_addresses.length > 1 && (
            <div className="detail-row">
              <span className="detail-label">IPv6</span>
              <span className="detail-value detail-ip6">
                {device.ip_addresses[1]}
              </span>
            </div>
          )}

          <div className="detail-row">
            <span className="detail-label">Last Seen</span>
            <span className="detail-value">
              {formatLastSeen(device.last_seen)}
            </span>
          </div>

          {device.user && (
            <div className="detail-row">
              <span className="detail-label">User</span>
              <span className="detail-value">{device.user}</span>
            </div>
          )}
        </div>

        {device.tags && device.tags.length > 0 && (
          <div className="device-tags">
            {device.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="device-actions">
        {onTagDevice && (
          <button
            className="btn btn-small btn-secondary"
            onClick={() => onTagDevice(device.device_id)}
          >
            Tag
          </button>
        )}
        {onRemoveDevice && (
          <button
            className="btn btn-small btn-danger"
            onClick={() => onRemoveDevice(device.device_id)}
          >
            Remove
          </button>
        )}
      </div>

      <style>{`
        .device-card {
          background: var(--card-bg, #1a1a2e);
          border-radius: 8px;
          overflow: hidden;
          border-left: 3px solid transparent;
        }

        .device-card.online {
          border-left-color: var(--success, #22c55e);
        }

        .device-card.offline {
          border-left-color: var(--error, #ef4444);
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--input-bg, #0f0f1a);
        }

        .device-status {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .device-status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .device-card.online .device-status-indicator {
          background: var(--success, #22c55e);
          box-shadow: 0 0 6px var(--success, #22c55e);
        }

        .device-card.offline .device-status-indicator {
          background: var(--error, #ef4444);
        }

        .device-status-text {
          font-size: 12px;
          font-weight: 500;
        }

        .device-os {
          font-size: 12px;
          color: var(--text-secondary, #9ca3af);
        }

        .device-body {
          padding: 16px;
        }

        .device-hostname {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .device-kin-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: var(--primary, #6366f1);
          padding: 4px 8px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 12px;
        }

        .kin-icon {
          font-size: 14px;
        }

        .kin-id {
          font-weight: 500;
        }

        .device-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .detail-label {
          color: var(--text-secondary, #9ca3af);
        }

        .detail-value {
          font-family: monospace;
          font-size: 12px;
        }

        .detail-ip6 {
          font-size: 10px;
        }

        .device-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 12px;
        }

        .tag {
          font-size: 10px;
          padding: 2px 6px;
          background: var(--input-bg, #0f0f1a);
          border-radius: 3px;
          color: var(--text-secondary, #9ca3af);
        }

        .device-actions {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--border, #374151);
        }

        .btn {
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border, #374151);
          color: var(--text, #e5e7eb);
        }

        .btn-secondary:hover {
          background: var(--hover, #1f2937);
        }

        .btn-danger {
          background: var(--error, #ef4444);
          color: white;
        }

        .btn-danger:hover {
          background: #dc2626;
        }

        .btn-small {
          padding: 4px 8px;
          font-size: 11px;
        }
      `}</style>
    </div>
  );
}

export default DeviceCard;
