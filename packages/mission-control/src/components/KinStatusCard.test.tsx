import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { KinStatusCard, KinStatusCardFallback, KinStatusRecord } from './KinStatusCard';

// Mock Date.now for consistent relative time tests
const MOCK_NOW = new Date('2026-03-23T11:00:00Z');

describe('KinStatusCard', () => {
  const mockKin: KinStatusRecord = {
    kinId: 'kin-cipher-001',
    name: 'Cipher',
    status: 'healthy',
    lastSeen: '2026-03-23T10:58:00Z', // 2 minutes ago
    glbUrl: 'https://assets.kr8tiv.ai/kin/cipher.glb',
    specialization: 'Web Design',
    ownerConsentFlags: {
      supportSafeSummary: true,
      allowAvatarDisplay: true,
      allowStatusTracking: true,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders Kin name', () => {
      render(<KinStatusCard kin={mockKin} />);
      expect(screen.getByText('Cipher')).toBeInTheDocument();
    });

    it('renders specialization', () => {
      render(<KinStatusCard kin={mockKin} />);
      expect(screen.getByText('Web Design')).toBeInTheDocument();
    });

    it('renders GLB preview area', () => {
      const { container } = render(<KinStatusCard kin={mockKin} />);
      const glbPreview = container.querySelector('.glb-preview');
      expect(glbPreview).toBeInTheDocument();
    });

    it('renders status badge', () => {
      render(<KinStatusCard kin={mockKin} />);
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('renders relative time for last seen', () => {
      render(<KinStatusCard kin={mockKin} />);
      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
    });
  });

  describe('status badge colors', () => {
    it('shows healthy badge with green styling for healthy status', () => {
      const healthyKin = { ...mockKin, status: 'healthy' as const };
      const { container } = render(<KinStatusCard kin={healthyKin} />);
      
      const badge = screen.getByText('Healthy');
      expect(badge).toBeInTheDocument();
      
      // Check for pulse indicator on healthy status
      const statusBadge = badge.closest('.status-badge');
      expect(statusBadge).toBeInTheDocument();
    });

    it('shows degraded badge with yellow styling for degraded status', () => {
      const degradedKin = { ...mockKin, status: 'degraded' as const };
      render(<KinStatusCard kin={degradedKin} />);
      
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });

    it('shows offline badge with red styling for offline status', () => {
      const offlineKin = { ...mockKin, status: 'offline' as const };
      render(<KinStatusCard kin={offlineKin} />);
      
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('relative time formatting', () => {
    it('shows "Just now" for timestamps less than a minute ago', () => {
      const recentKin = { ...mockKin, lastSeen: '2026-03-23T10:59:30Z' };
      render(<KinStatusCard kin={recentKin} />);
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows minutes ago for timestamps less than an hour ago', () => {
      const minutesAgoKin = { ...mockKin, lastSeen: '2026-03-23T10:30:00Z' };
      render(<KinStatusCard kin={minutesAgoKin} />);
      expect(screen.getByText('30 minutes ago')).toBeInTheDocument();
    });

    it('shows hours ago for timestamps less than a day ago', () => {
      const hoursAgoKin = { ...mockKin, lastSeen: '2026-03-23T08:00:00Z' };
      render(<KinStatusCard kin={hoursAgoKin} />);
      expect(screen.getByText('3 hours ago')).toBeInTheDocument();
    });

    it('shows days ago for timestamps less than a week ago', () => {
      const daysAgoKin = { ...mockKin, lastSeen: '2026-03-20T11:00:00Z' };
      render(<KinStatusCard kin={daysAgoKin} />);
      expect(screen.getByText('3 days ago')).toBeInTheDocument();
    });

    it('shows weeks ago for timestamps older than a week', () => {
      const weeksAgoKin = { ...mockKin, lastSeen: '2026-03-09T11:00:00Z' };
      render(<KinStatusCard kin={weeksAgoKin} />);
      expect(screen.getByText('2 weeks ago')).toBeInTheDocument();
    });

    it('shows "Unknown" for invalid date strings', () => {
      const invalidKin = { ...mockKin, lastSeen: 'invalid-date' };
      render(<KinStatusCard kin={invalidKin} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onCardClick with kinId when clicked', () => {
      const handleClick = vi.fn();
      render(<KinStatusCard kin={mockKin} onCardClick={handleClick} />);
      
      const card = screen.getByRole('button');
      fireEvent.click(card);
      
      expect(handleClick).toHaveBeenCalledWith('kin-cipher-001');
    });

    it('supports keyboard navigation with Enter key', () => {
      const handleClick = vi.fn();
      render(<KinStatusCard kin={mockKin} onCardClick={handleClick} />);
      
      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: 'Enter' });
      
      expect(handleClick).toHaveBeenCalledWith('kin-cipher-001');
    });

    it('supports keyboard navigation with Space key', () => {
      const handleClick = vi.fn();
      render(<KinStatusCard kin={mockKin} onCardClick={handleClick} />);
      
      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: ' ' });
      
      expect(handleClick).toHaveBeenCalledWith('kin-cipher-001');
    });

    it('does not have button role when onCardClick is not provided', () => {
      render(<KinStatusCard kin={mockKin} />);
      
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('has tabIndex 0 when clickable', () => {
      render(<KinStatusCard kin={mockKin} onCardClick={() => {}} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('has tabIndex -1 when not clickable', () => {
      const { container } = render(<KinStatusCard kin={mockKin} />);
      
      const card = container.querySelector('.kin-status-card');
      expect(card).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('accessibility', () => {
    it('has accessible name including Kin name, status, and specialization', () => {
      render(<KinStatusCard kin={mockKin} />);
      
      const card = screen.getByLabelText('Cipher - Healthy - Web Design');
      expect(card).toBeInTheDocument();
    });

    it('status badge has role="status"', () => {
      const healthyKin = { ...mockKin, status: 'healthy' as const };
      render(<KinStatusCard kin={healthyKin} />);
      
      const statusBadge = screen.getByRole('status', { name: /status: healthy/i });
      expect(statusBadge).toBeInTheDocument();
    });
  });

  describe('className prop', () => {
    it('applies custom className', () => {
      const { container } = render(
        <KinStatusCard kin={mockKin} className="custom-class" />
      );
      
      const card = container.querySelector('.kin-status-card.custom-class');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Kin name overlay in GLB preview', () => {
    it('displays Kin name in uppercase in the preview area', () => {
      render(<KinStatusCard kin={mockKin} />);
      
      // The name appears in uppercase in the preview overlay
      expect(screen.getByText('CIPHER')).toBeInTheDocument();
    });
  });
});

describe('KinStatusCardFallback', () => {
  it('renders fallback UI', () => {
    render(<KinStatusCardFallback />);
    
    expect(screen.getByText('Unknown Kin')).toBeInTheDocument();
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <KinStatusCardFallback className="custom-fallback" />
    );
    
    const fallback = container.querySelector('.kin-status-card--fallback.custom-fallback');
    expect(fallback).toBeInTheDocument();
  });
});

describe('KinStatusRecord type compliance', () => {
  it('accepts valid KinStatusRecord props', () => {
    const validRecord: KinStatusRecord = {
      kinId: 'kin-test-001',
      name: 'Test Kin',
      status: 'healthy',
      lastSeen: '2026-03-23T11:00:00Z',
      glbUrl: 'https://example.com/kin/test.glb',
      specialization: 'Testing',
      ownerConsentFlags: {},
    };
    
    // TypeScript compile-time check
    render(<KinStatusCard kin={validRecord} />);
    expect(screen.getByText('Test Kin')).toBeInTheDocument();
  });
});
