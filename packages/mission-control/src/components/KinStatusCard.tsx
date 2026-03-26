import React, { useMemo } from 'react';
import { GLBViewer } from './GLBViewer';
import type { KinStatusRecord } from '../types/kin-status';

// Re-export for convenience
export type { KinStatusRecord } from '../types/kin-status';

export interface KinStatusCardProps {
  kin: KinStatusRecord;
  className?: string;
  onCardClick?: (kinId: string) => void;
}

/**
 * Formats an ISO 8601 timestamp to relative time
 * e.g., "2 minutes ago", "1 hour ago", "3 days ago"
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (isNaN(date.getTime())) {
    return 'Unknown';
  }
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  
  if (seconds < 60) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (days < 7) {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  } else {
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Status badge configuration
 */
const statusConfig = {
  healthy: {
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    label: 'Healthy',
    pulseColor: 'rgba(16, 185, 129, 0.4)',
  },
  degraded: {
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.15)',
    label: 'Degraded',
    pulseColor: 'rgba(245, 158, 11, 0.4)',
  },
  offline: {
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    label: 'Offline',
    pulseColor: 'rgba(239, 68, 68, 0.4)',
  },
} as const;

/**
 * KinStatusCard - Displays a Kin's status with 3D GLB avatar preview
 * 
 * Features:
 * - 3D GLB avatar preview with auto-rotation
 * - Status badge with animated pulse for healthy/degraded states
 * - Kin name and specialization text
 * - Relative time formatting for last seen
 * - Hover effects and click interaction
 */
export function KinStatusCard({ kin, className = '', onCardClick }: KinStatusCardProps): React.ReactElement {
  const config = statusConfig[kin.status] || statusConfig.offline;
  const relativeTime = useMemo(() => formatRelativeTime(kin.last_seen), [kin.last_seen]);
  
  const handleClick = () => {
    onCardClick?.(kin.kin_id);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick?.(kin.kin_id);
    }
  };
  
  return (
    <article
      className={`kin-status-card ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onCardClick ? 0 : -1}
      role={onCardClick ? 'button' : undefined}
      aria-label={`${kin.name} - ${config.label} - ${kin.specialization}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 28, 0.98))',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: `
          0 4px 24px rgba(0, 0, 0, 0.4),
          0 1px 2px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.05)
        `,
        cursor: onCardClick ? 'pointer' : 'default',
        transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1)',
        minHeight: '280px',
      }}
    >
      {/* GLB Avatar Viewer */}
      <div
        className="glb-preview"
        style={{
          position: 'relative',
          width: '100%',
          height: '160px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <GLBViewer glbUrl={kin.glb_url} />
        
        {/* Kin Name Overlay */}
        <span
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: '"Space Grotesk", "SF Pro Display", system-ui, sans-serif',
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
          }}
        >
          {kin.name}
        </span>
      </div>
      
      {/* Content Section */}
      <div
        className="card-content"
        style={{
          padding: '16px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Header: Name + Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <h3
            style={{
              fontFamily: '"Space Grotesk", "SF Pro Display", system-ui, sans-serif',
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: '#ffffff',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {kin.name}
          </h3>
          
          {/* Status Badge */}
          <div
            className="status-badge"
            role="status"
            aria-label={`Status: ${config.label}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: config.bgColor,
              borderRadius: '100px',
              border: `1px solid ${config.color}30`,
            }}
          >
            {/* Pulse Indicator */}
            {kin.status !== 'offline' && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: config.color,
                  boxShadow: `0 0 8px ${config.pulseColor}`,
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            )}
            {kin.status === 'offline' && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: config.color,
                  opacity: 0.6,
                }}
              />
            )}
            <span
              style={{
                fontFamily: '"SF Mono", "Fira Code", monospace',
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.03em',
                color: config.color,
                textTransform: 'uppercase',
              }}
            >
              {config.label}
            </span>
          </div>
        </div>
        
        {/* Specialization */}
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: '13px',
            fontWeight: 400,
            letterSpacing: '0.01em',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: 0,
          }}
        >
          {kin.specialization}
        </p>
        
        {/* Last Seen */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: 'auto',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <span
            style={{
              fontFamily: '"SF Mono", "Fira Code", monospace',
              fontSize: '12px',
              fontWeight: 400,
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            {relativeTime}
          </span>
        </div>
      </div>
      
      {/* Hover State Styles */}
      <style>{`
        .kin-status-card:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        
        .kin-status-card:focus-visible {
          outline: 2px solid rgba(99, 102, 241, 0.6);
          outline-offset: 2px;
        }
        
        .kin-status-card:active {
          transform: scale(0.98);
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }
        
        /* Tabular numbers for timestamps */
        .kin-status-card span {
          font-variant-numeric: tabular-nums;
        }
        
        /* Font smoothing for macOS */
        .kin-status-card {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </article>
  );
}

/**
 * Fallback component for missing or invalid Kin data
 */
export function KinStatusCardFallback({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <article
      className={`kin-status-card kin-status-card--fallback ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 28, 0.98))',
        borderRadius: '16px',
        minHeight: '280px',
        padding: '24px',
        boxShadow: `
          0 4px 24px rgba(0, 0, 0, 0.4),
          0 1px 2px rgba(0, 0, 0, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.05)
        `,
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <span
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: '14px',
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.4)',
          textAlign: 'center',
        }}
      >
        Unknown Kin
      </span>
      <span
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: '12px',
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.25)',
          marginTop: '4px',
        }}
      >
        Data unavailable
      </span>
    </article>
  );
}

export default KinStatusCard;
