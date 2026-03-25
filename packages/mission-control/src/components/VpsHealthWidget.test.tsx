import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VpsHealthWidget } from './VpsHealthWidget';

// Mock the useVpsHealth hook
vi.mock('../hooks/useVpsHealth', () => ({
  useVpsHealth: vi.fn(() => ({
    data: null,
    loading: true,
    error: null,
    refresh: vi.fn(),
    lastUpdated: null,
  })),
  triggerHealthCheck: vi.fn(() => Promise.resolve(true)),
}));

import { useVpsHealth, triggerHealthCheck } from '../hooks/useVpsHealth';

const mockUseVpsHealth = vi.mocked(useVpsHealth);
const mockTriggerHealthCheck = vi.mocked(triggerHealthCheck);

describe('VpsHealthWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockUseVpsHealth.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
      lastUpdated: null,
    });

    render(<VpsHealthWidget />);
    
    expect(screen.getByTestId('vps-health-widget')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays VPS metrics when data is loaded', async () => {
    const mockData = {
      timestamp: new Date().toISOString(),
      kin_count: 3,
      health_summary: {
        'cipher-001': { status: 'healthy' as const, error_count: 0, last_check: new Date().toISOString() },
        'mischief-001': { status: 'healthy' as const, error_count: 0, last_check: new Date().toISOString() },
        'vortex-001': { status: 'unhealthy' as const, error_count: 2, last_check: new Date().toISOString() },
      },
      vps_metrics: {
        cpu_percent: 45,
        memory_percent: 62,
        uptime_seconds: 86400,
      },
    };

    mockUseVpsHealth.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refresh: vi.fn(),
      lastUpdated: new Date(),
    });

    render(<VpsHealthWidget />);
    
    expect(screen.getByText('VPS Health')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('1d 0h')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', () => {
    mockUseVpsHealth.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to fetch',
      refresh: vi.fn(),
      lastUpdated: null,
    });

    render(<VpsHealthWidget />);
    
    expect(screen.getByText('Unable to load health data')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('displays Kin health summary correctly', async () => {
    const mockData = {
      timestamp: new Date().toISOString(),
      kin_count: 3,
      health_summary: {
        'cipher-001': { status: 'healthy' as const, error_count: 0, last_check: new Date().toISOString() },
        'mischief-001': { status: 'healthy' as const, error_count: 0, last_check: new Date().toISOString() },
        'vortex-001': { status: 'unhealthy' as const, error_count: 2, last_check: new Date().toISOString() },
      },
      vps_metrics: {
        cpu_percent: 45,
        memory_percent: 62,
        uptime_seconds: 86400,
      },
    };

    mockUseVpsHealth.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
      refresh: vi.fn(),
      lastUpdated: new Date(),
    });

    render(<VpsHealthWidget />);
    
    expect(screen.getByText('3 total')).toBeInTheDocument();
    expect(screen.getByText('cipher')).toBeInTheDocument();
    expect(screen.getByText('mischief')).toBeInTheDocument();
    expect(screen.getByText('vortex')).toBeInTheDocument();
  });

  it('calls refresh when retry button is clicked', async () => {
    const mockRefresh = vi.fn();
    
    mockUseVpsHealth.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to fetch',
      refresh: mockRefresh,
      lastUpdated: null,
    });

    render(<VpsHealthWidget />);
    
    screen.getByText('Retry').click();
    
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('applies custom className', () => {
    mockUseVpsHealth.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
      lastUpdated: null,
    });

    render(<VpsHealthWidget className="custom-class" />);
    
    const widget = screen.getByTestId('vps-health-widget');
    expect(widget).toHaveClass('custom-class');
  });
});
