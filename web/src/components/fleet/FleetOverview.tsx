'use client';

// ============================================================================
// FleetOverview — Stat cards showing fleet-wide instance counts by status.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { FleetStatusResponse } from '@/lib/types';

interface FleetOverviewProps {
  data: FleetStatusResponse | null;
  loading: boolean;
}

interface StatCard {
  label: string;
  value: number;
  color: string;
  glow: 'cyan' | 'magenta' | 'gold' | 'none';
}

export function FleetOverview({ data, loading }: FleetOverviewProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <GlassCard key={i} className="p-4" hover={false}>
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </GlassCard>
        ))}
      </div>
    );
  }

  const cards: StatCard[] = [
    { label: 'Total Instances', value: data.totalInstances, color: 'text-white', glow: 'none' },
    { label: 'Running', value: data.running, color: 'text-cyan', glow: 'cyan' },
    { label: 'Stopped', value: data.stopped, color: 'text-white/50', glow: 'none' },
    { label: 'Error', value: data.error, color: 'text-magenta', glow: 'magenta' },
    { label: 'Provisioning', value: data.provisioning, color: 'text-gold', glow: 'gold' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <GlassCard key={card.label} className="p-4" glow={card.glow} hover={false}>
          <p className={`font-display text-3xl font-bold ${card.color}`}>
            {card.value}
          </p>
          <p className="mt-1 text-xs text-white/50">{card.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}
