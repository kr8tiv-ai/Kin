/**
 * TailscaleSetup component for one-click VPN setup flow.
 */

import React, { useState, useEffect } from 'react';
import { useAuthKey } from '../hooks/useTailscaleStatus';
import { generateTailscaleQRCode } from '../utils/qrGenerator';

type SetupStep = 'initial' | 'generating' | 'connecting' | 'success' | 'error';

interface TailscaleSetupProps {
  onComplete?: () => void;
  onDeviceConnected?: () => void;
  className?: string;
}

export function TailscaleSetup({
  onComplete,
  onDeviceConnected,
  className = '',
}: TailscaleSetupProps): React.ReactElement {
  const [step, setStep] = useState<SetupStep>('initial');
  const [authKey, setAuthKey] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { generateKey, loading: generatingKey } = useAuthKey();

  const handleStartSetup = async () => {
    setStep('generating');
    setError(null);

    try {
      const key = await generateKey(true, ['tag:mobile']);
      if (!key) {
        throw new Error('Failed to generate auth key');
      }

      setAuthKey(key);

      // Generate QR code
      const qr = await generateTailscaleQRCode(key);
      setQrCode(qr);

      setStep('connecting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep('error');
    }
  };

  const handleCopyKey = () => {
    if (authKey) {
      navigator.clipboard.writeText(authKey);
    }
  };

  const handleComplete = () => {
    setStep('success');
    onComplete?.();
    onDeviceConnected?.();
  };

  const handleReset = () => {
    setStep('initial');
    setAuthKey(null);
    setQrCode(null);
    setError(null);
  };

  return (
    <div className={`tailscale-setup ${className}`}>
      {step === 'initial' && (
        <div className="setup-initial">
          <div className="setup-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3>Enable Remote Access</h3>
          <p className="setup-description">
            Connect your devices to securely access your Kin companions from anywhere.
          </p>
          <button
            className="btn btn-primary setup-btn"
            onClick={handleStartSetup}
            disabled={generatingKey}
          >
            {generatingKey ? 'Generating...' : 'Setup Remote Access'}
          </button>
        </div>
      )}

      {step === 'connecting' && (
        <div className="setup-connecting">
          <h3>Connect Your Device</h3>
          <p className="setup-description">
            Scan this QR code with your Tailscale app or copy the key below.
          </p>

          {qrCode && (
            <div className="qr-container">
              <img src={qrCode} alt="Tailscale QR Code" className="qr-code" />
            </div>
          )}

          <div className="auth-key-section">
            <label>Auth Key</label>
            <div className="auth-key-input">
              <code>{authKey}</code>
              <button className="btn btn-small" onClick={handleCopyKey}>
                Copy
              </button>
            </div>
          </div>

          <div className="setup-instructions">
            <h4>How to connect:</h4>
            <ol>
              <li>Install Tailscale on your device</li>
              <li>Open Tailscale and tap "Add Device"</li>
              <li>Scan the QR code or paste the auth key</li>
              <li>Wait for connection to establish</li>
            </ol>
          </div>

          <div className="setup-actions">
            <button className="btn btn-secondary" onClick={handleReset}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleComplete}>
              Done
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="setup-success">
          <div className="success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22,4 12,14.01 9,11.01" />
            </svg>
          </div>
          <h3>Device Connected!</h3>
          <p className="setup-description">
            Your device is now part of the Kin network. You can access your companions securely from anywhere.
          </p>
          <button className="btn btn-primary" onClick={handleReset}>
            Connect Another Device
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="setup-error">
          <div className="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h3>Setup Failed</h3>
          <p className="error-message">{error}</p>
          <button className="btn btn-primary" onClick={handleReset}>
            Try Again
          </button>
        </div>
      )}

      <style>{`
        .tailscale-setup {
          background: var(--card-bg, #1a1a2e);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
        }

        .setup-icon, .success-icon, .error-icon {
          margin-bottom: 16px;
        }

        .setup-icon svg {
          color: var(--primary, #6366f1);
        }

        .success-icon svg {
          color: var(--success, #22c55e);
        }

        .error-icon svg {
          color: var(--error, #ef4444);
        }

        .setup-description {
          color: var(--text-secondary, #9ca3af);
          margin-bottom: 20px;
        }

        .setup-btn {
          width: 100%;
        }

        .qr-container {
          background: white;
          padding: 16px;
          border-radius: 8px;
          display: inline-block;
          margin-bottom: 16px;
        }

        .qr-code {
          width: 200px;
          height: 200px;
        }

        .auth-key-section {
          margin-bottom: 16px;
        }

        .auth-key-section label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary, #9ca3af);
          margin-bottom: 4px;
        }

        .auth-key-input {
          display: flex;
          gap: 8px;
          background: var(--input-bg, #0f0f1a);
          border-radius: 6px;
          padding: 8px 12px;
        }

        .auth-key-input code {
          flex: 1;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .setup-instructions {
          text-align: left;
          background: var(--input-bg, #0f0f1a);
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .setup-instructions h4 {
          margin-bottom: 8px;
          font-size: 14px;
        }

        .setup-instructions ol {
          margin: 0;
          padding-left: 20px;
          color: var(--text-secondary, #9ca3af);
          font-size: 13px;
        }

        .setup-instructions li {
          margin-bottom: 4px;
        }

        .setup-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-primary {
          background: var(--primary, #6366f1);
          color: white;
        }

        .btn-primary:hover {
          background: var(--primary-hover, #5558e3);
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border, #374151);
          color: var(--text, #e5e7eb);
        }

        .btn-secondary:hover {
          background: var(--hover, #1f2937);
        }

        .btn-small {
          padding: 4px 12px;
          font-size: 12px;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-message {
          color: var(--error, #ef4444);
          margin-bottom: 16px;
        }
      `}</style>
    </div>
  );
}

export default TailscaleSetup;
