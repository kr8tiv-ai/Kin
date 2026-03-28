'use client';

// ============================================================================
// Leaderboard — Referral ranking table with medal highlights.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/types';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserName?: string;
}

function getRankDisplay(rank: number): { label: string; color: string } {
  switch (rank) {
    case 1:
      return { label: '1st', color: 'text-gold' };
    case 2:
      return { label: '2nd', color: 'text-white/80' };
    case 3:
      return { label: '3rd', color: 'text-[#CD7F32]' };
    default:
      return { label: `${rank}th`, color: 'text-white/40' };
  }
}

export function Leaderboard({ entries, currentUserName }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Leaderboard
        </h2>
        <div className="py-8 text-center text-sm text-white/40">
          No leaderboard data yet. Be the first to refer a friend!
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden p-0" hover={false}>
      <div className="p-6 pb-0">
        <h2 className="font-display text-lg font-semibold text-white">
          Leaderboard
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Top referrers this month
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-6 py-3 text-left font-medium text-white/50">
                Rank
              </th>
              <th className="px-6 py-3 text-left font-medium text-white/50">
                User
              </th>
              <th className="px-6 py-3 text-right font-medium text-white/50">
                Referrals
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.map((entry) => {
              const rankInfo = getRankDisplay(entry.rank);
              const isCurrentUser =
                currentUserName !== undefined &&
                entry.displayName === currentUserName;

              return (
                <tr
                  key={entry.rank}
                  className={cn(
                    'transition-colors',
                    isCurrentUser && 'bg-cyan/5',
                    entry.rank <= 3 && 'bg-white/[0.02]',
                  )}
                >
                  <td className="px-6 py-3">
                    <span
                      className={cn('font-mono font-bold', rankInfo.color)}
                    >
                      {rankInfo.label}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={cn(
                        'text-white/70',
                        isCurrentUser && 'font-medium text-cyan',
                      )}
                    >
                      {entry.displayName}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-cyan/60">(you)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="font-mono text-white/60">
                      {entry.referralCount}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
