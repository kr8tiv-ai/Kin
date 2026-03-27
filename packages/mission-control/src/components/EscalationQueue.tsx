/**
 * EscalationQueue component for showing escalation status.
 */

import React, { useState, useEffect } from 'react';

interface EscalationQueueProps {
  queuePosition?: number;
  estimatedWaitMinutes?: number;
  onResolve?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function EscalationQueue({
  queuePosition = 1,
  estimatedWaitMinutes = 5,
  onResolve,
  onCancel,
  className = '',
}: EscalationQueueProps): React.ReactElement {
  const [countdown, setCountdown] = useState(estimatedWaitMinutes * 60);
  const [status, setStatus] = useState<'queued' | 'assigned' | 'connected'>('queued');

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Simulate status progression
    if (status === 'queued' && countdown < estimatedWaitMinutes * 60 - 30) {
      setStatus('assigned');
    }
  }, [countdown, estimatedWaitMinutes, status]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className={`escalation-queue ${className}`}>
      <div className="escalation-header">
        <div className="status-icon">
          {status === 'queued' && '⏳'}
          {status === 'assigned' && '👤'}
          {status === 'connected' && '✅'}
        </div>
        <h4>Human Support</h4>
      </div>

      <div className="queue-info">
        <div className="info-row">
          <span className="label">Status</span>
          <span className={`value status-${status}`}>
            {status === 'queued' && 'In Queue'}
            {status === 'assigned' && 'Agent Assigned'}
            {status === 'connected' && 'Connected'}
          </span>
        </div>

        {status === 'queued' && (
          <>
            <div className="info-row">
              <span className="label">Queue Position</span>
              <span className="value">{queuePosition}</span>
            </div>
            <div className="info-row">
              <span className="label">Estimated Wait</span>
              <span className="value">{formatTime(countdown)}</span>
            </div>
          </>
        )}

        {status === 'assigned' && (
          <div className="agent-info">
            <div className="agent-avatar">👩‍💻</div>
            <div className="agent-details">
              <span className="agent-name">Support Agent</span>
              <span className="agent-status">Joining chat...</span>
            </div>
          </div>
        )}
      </div>

      <div className="queue-message">
        {status === 'queued' && (
          <p>You're in the queue for human support. An agent will be with you shortly.</p>
        )}
        {status === 'assigned' && (
          <p>An agent has been assigned and will join the chat momentarily.</p>
        )}
      </div>

      {status === 'queued' && (
        <div className="queue-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel Request
          </button>
        </div>
      )}

      <style>{`
        .escalation-queue {
          padding: 16px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          font-family: var(--font-body);
        }

        .escalation-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .status-icon {
          font-size: 32px;
        }

        .escalation-header h4 {
          margin: 0;
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 800;
          color: var(--text);
        }

        .queue-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--bg);
          border-radius: var(--radius-sm);
        }

        .label {
          font-family: var(--font-mono);
          color: var(--text-muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .value {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 14px;
          color: var(--text);
        }

        .value.status-queued {
          color: var(--gold);
        }

        .value.status-assigned {
          color: var(--cyan);
        }

        .value.status-connected {
          color: var(--cyan);
        }

        .agent-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg);
          border-radius: var(--radius-sm);
        }

        .agent-avatar {
          font-size: 32px;
        }

        .agent-details {
          display: flex;
          flex-direction: column;
        }

        .agent-name {
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 14px;
          color: var(--text);
        }

        .agent-status {
          font-family: var(--font-mono);
          color: var(--text-muted);
          font-size: 12px;
        }

        .queue-message {
          margin-bottom: 16px;
        }

        .queue-message p {
          margin: 0;
          font-family: var(--font-body);
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .queue-actions {
          display: flex;
          justify-content: center;
        }

        .btn {
          padding: 10px 20px;
          border-radius: var(--radius-sm);
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
        }

        .btn-secondary:hover {
          background: var(--surface-hover);
        }
      `}</style>
    </div>
  );
}

export default EscalationQueue;
