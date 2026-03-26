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
            background: 'linear-gradient(180deg, rgba(40, 40, 55, 0.6) 0%, rgba(25, 25, 35, 0.8) 100%)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(239, 68, 68, 0.8)"
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
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: '13px',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.6)',
              textAlign: 'center',
            }}
          >
            Failed to load avatar
          </span>
          {import.meta.env?.DEV && this.state.error && (
            <span
              style={{
                fontFamily: '"SF Mono", "Fira Code", monospace',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.3)',
                marginTop: '4px',
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
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
