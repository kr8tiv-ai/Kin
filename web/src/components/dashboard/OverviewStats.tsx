'use client';

// ============================================================================
// Overview Stats — Row of stat cards for the dashboard overview.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { formatNumber } from '@/lib/utils';
import type { Conversation } from '@/lib/types';

interface OverviewStatsProps {
  conversations: Conversation[];
  projectCount: number;
  streak: number;
  level: number;
  loading?: boolean;
}

interface StatCard {
  label: string;
  value: string;
  accent: 'cyan' | 'magenta' | 'gold';
}

const ACCENT_COLORS: Record<string, string> = {
  cyan: 'text-cyan',
  magenta: 'text-magenta',
  gold: 'text-gold',
};

export function OverviewStats({
  conversations,
  projectCount,
  streak,
  level,
  loading = false,
}: OverviewStatsProps) {
  const totalMessages = conversations.reduce(
    (sum, c) => sum + c.messageCount,
    0,
  );

  const stats: StatCard[] = [
    {
      label: 'Total Messages',
      value: formatNumber(totalMessages),
      accent: 'cyan',
    },
    {
      label: 'Active Projects',
      value: formatNumber(projectCount),
      accent: 'magenta',
    },
    {
      label: 'Current Streak',
      value: `${streak}d`,
      accent: 'gold',
    },
    {
      label: 'Level',
      value: level.toString(),
      accent: 'cyan',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} hover={false} className="p-5">
            <div className="h-8 w-16 animate-pulse rounded bg-white/5" />
            <div className="mt-2 h-4 w-24 animate-pulse rounded bg-white/5" />
          </GlassCard>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <GlassCard key={stat.label} hover={false} className="p-5">
          <p
            className={`font-display text-3xl font-bold ${ACCENT_COLORS[stat.accent]}`}
          >
            {stat.value}
          </p>
          <p className="mt-1 text-sm text-text-muted">{stat.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}
