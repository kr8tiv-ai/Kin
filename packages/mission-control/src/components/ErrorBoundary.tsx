import React from 'react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary - Catches React render errors and displays fallback UI
 * 
 * Used to gracefully handle GLB loading failures, WebGL errors,
 * and other rendering issues in the 3D viewer.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI matching KinStatusCard dark aesthetic
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: '160px',
            background: 'var(--surface, #0A0A0A)',
            borderRadius: 'var(--radius-sm, 12px)',
            border: '1px solid rgba(255, 0, 170, 0.2)',
            padding: '16px',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--magenta, #ff00aa)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: '8px' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span
            style={{
              fontFamily: "var(--font-body, 'Plus Jakarta Sans', sans-serif)",
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-muted, rgba(255,255,255,0.7))',
              textAlign: 'center',
            }}
          >
            Failed to load avatar
          </span>
          {import.meta.env?.DEV && this.state.error && (
            <span
              style={{
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                fontSize: '10px',
                color: 'var(--text-muted, rgba(255,255,255,0.7))',
                marginTop: '4px',
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: 0.5,
              }}
            >
              {this.state.error.message}
            </span>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
