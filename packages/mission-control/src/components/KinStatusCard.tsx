import React, { useMemo } from 'react';
import { GLBViewer } from './GLBViewer';
import type { KinStatusRecord } from '../types/kin-status';

export type { KinStatusRecord } from '../types/kin-status';

export interface KinStatusCardProps {
  kin: KinStatusRecord;
  className?: string;
  onCardClick?: (kinId: string) => void;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (isNaN(date.getTime())) return 'Unknown';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
}

/**
 * Status config using KIN triple accent palette:
 * healthy = cyan, degraded = gold (warning), offline = magenta (error)
 */
const statusConfig = {
  healthy: {
    color: 'var(--cyan, #00f0ff)',
    bgColor: 'rgba(0, 240, 255, 0.15)',
    label: 'Healthy',
    glowColor: 'rgba(0, 240, 255, 0.4)',
    hoverShadow: '0 20px 60px rgba(0, 240, 255, 0.1)',
  },
  degraded: {
    color: 'var(--gold, #ffd700)',
    bgColor: 'rgba(255, 215, 0, 0.15)',
    label: 'Degraded',
    glowColor: 'rgba(255, 215, 0, 0.4)',
    hoverShadow: '0 20px 60px rgba(255, 184, 0, 0.08)',
  },
  offline: {
    color: 'var(--magenta, #ff00aa)',
    bgColor: 'rgba(255, 0, 170, 0.15)',
    label: 'Offline',
    glowColor: 'rgba(255, 0, 170, 0.4)',
    hoverShadow: '0 20px 60px rgba(255, 0, 170, 0.08)',
  },
} as const;

/**
 * KinStatusCard - Glassmorphism card with 3D GLB avatar preview.
 * meetyourkin.com KR8TIV design: glass bg, triple accent,
 * Outfit headings, JetBrains Mono status labels.
 */
export function KinStatusCard({ kin, className = '', onCardClick }: KinStatusCardProps): React.ReactElement {
  const config = statusConfig[kin.status] || statusConfig.offline;
  const relativeTime = useMemo(() => formatRelativeTime(kin.last_seen), [kin.last_seen]);

  const handleClick = () => onCardClick?.(kin.kin_id);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick?.(kin.kin_id); }
  };

  return (
    <article
      className={`ksc ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={onCardClick ? 0 : -1}
      role={onCardClick ? 'button' : undefined}
      aria-label={`${kin.name} - ${config.label} - ${kin.specialization}`}
    >
      {/* GLB Avatar */}
      <div className="ksc-glb">
        <GLBViewer glbUrl={kin.glb_url} />
        <span className="ksc-name-overlay">{kin.name}</span>
      </div>

      {/* Content */}
      <div className="ksc-content">
        <div className="ksc-header">
          <h3 className="ksc-name">{kin.name}</h3>
          <div
            className="ksc-badge"
            role="status"
            aria-label={`Status: ${config.label}`}
            style={{ background: config.bgColor, borderColor: `${config.color}33` }}
          >
            {kin.status !== 'offline' && (
              <span className="ksc-pulse" style={{ background: config.color, boxShadow: `0 0 8px ${config.glowColor}` }} />
            )}
            {kin.status === 'offline' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.color, opacity: 0.6, display: 'inline-block' }} />
            )}
            <span className="ksc-badge-label" style={{ color: config.color }}>{config.label}</span>
          </div>
        </div>

        <p className="ksc-spec">{kin.specialization}</p>

        <div className="ksc-time">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, rgba(255,255,255,0.3))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <span className="ksc-time-text">{relativeTime}</span>
        </div>
      </div>

      <style>{`
        .ksc {
          position: relative;
          display: flex;
          flex-direction: column;
          background: var(--glass-bg, rgba(255,255,255,0.02));
          border: none;
          border-radius: var(--radius-md, 20px);
          overflow: hidden;
          backdrop-filter: blur(var(--glass-blur, 20px));
          -webkit-backdrop-filter: blur(var(--glass-blur, 20px));
          cursor: pointer;
          transition: transform 0.4s ease, box-shadow 0.4s ease;
          min-height: 280px;
          -webkit-font-smoothing: antialiased;
        }
        .ksc:hover {
          transform: translateY(-4px);
          box-shadow: ${config.hoverShadow};
        }
        .ksc:focus-visible {
          outline: 2px solid var(--cyan, #00f0ff);
          outline-offset: 2px;
        }
        .ksc:active { transform: scale(0.98); }

        .ksc-glb {
          position: relative;
          width: 100%;
          height: 160px;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
        }
        .ksc-name-overlay {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted, rgba(255,255,255,0.5));
          white-space: nowrap;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .ksc-content {
          padding: 16px 18px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }
        .ksc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ksc-name {
          font-family: var(--font-display, 'Outfit', sans-serif);
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text, #fff);
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ksc-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: var(--radius-pill, 100px);
          border: 1px solid;
          backdrop-filter: blur(10px);
        }
        .ksc-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          animation: ksc-pulse 2s ease-in-out infinite;
        }
        @keyframes ksc-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        .ksc-badge-label {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .ksc-spec {
          font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
          font-size: 0.8rem;
          color: var(--text-muted, rgba(255,255,255,0.5));
          margin: 0;
        }
        .ksc-time {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: auto;
        }
        .ksc-time-text {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 0.7rem;
          color: var(--text-muted, rgba(255,255,255,0.4));
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </article>
  );
}

export function KinStatusCardFallback({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <article className={`ksc ${className}`} style={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, rgba(255,255,255,0.2))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)' }}>
        Unknown Kin
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: 4, letterSpacing: '0.1em' }}>
        Data unavailable
      </span>
    </article>
  );
}

export default KinStatusCard;
