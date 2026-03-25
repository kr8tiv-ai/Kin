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
          background: var(--card-bg, #1a1a2e);
          border-top: 1px solid var(--border, #374151);
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
          font-size: 16px;
          font-weight: 600;
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
          background: var(--input-bg, #0f0f1a);
          border-radius: 8px;
        }

        .label {
          color: var(--text-secondary, #9ca3af);
          font-size: 13px;
        }

        .value {
          font-weight: 600;
          font-size: 14px;
        }

        .value.status-queued {
          color: var(--warning, #f59e0b);
        }

        .value.status-assigned {
          color: var(--info, #3b82f6);
        }

        .value.status-connected {
          color: var(--success, #22c55e);
        }

        .agent-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--input-bg, #0f0f1a);
          border-radius: 8px;
        }

        .agent-avatar {
          font-size: 32px;
        }

        .agent-details {
          display: flex;
          flex-direction: column;
        }

        .agent-name {
          font-weight: 600;
          font-size: 14px;
        }

        .agent-status {
          color: var(--text-secondary, #9ca3af);
          font-size: 12px;
        }

        .queue-message {
          margin-bottom: 16px;
        }

        .queue-message p {
          margin: 0;
          color: var(--text-secondary, #9ca3af);
          font-size: 13px;
          line-height: 1.5;
        }

        .queue-actions {
          display: flex;
          justify-content: center;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border, #374151);
          color: var(--text, #e5e7eb);
        }

        .btn-secondary:hover {
          background: var(--hover, #1f2937);
        }
      `}</style>
    </div>
  );
}

export default EscalationQueue;
