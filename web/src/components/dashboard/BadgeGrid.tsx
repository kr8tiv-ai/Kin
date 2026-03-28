'use client';

// ============================================================================
// BadgeGrid — Grid of all badges, earned shown in color, unearned greyed out.
// ============================================================================

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { BADGE_DEFINITIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface BadgeGridProps {
  earnedBadgeIds: string[];
}

export function BadgeGrid({ earnedBadgeIds }: BadgeGridProps) {
  const earned = new Set(earnedBadgeIds);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {BADGE_DEFINITIONS.map((badge, i) => {
        const isEarned = earned.has(badge.id);

        return (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
          >
            <GlassCard
              hover={false}
              className={cn(
                'p-4 transition-all duration-200',
                isEarned
                  ? 'border-cyan/20'
                  : 'opacity-50 grayscale',
              )}
            >
              <div className="flex items-start gap-3">
                {/* Badge Emoji */}
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl',
                    isEarned
                      ? 'bg-cyan/10 border border-cyan/20'
                      : 'bg-white/[0.04] border border-white/[0.06]',
                  )}
                >
                  {isEarned ? badge.emoji : '?'}
                </div>

                {/* Badge Info */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isEarned ? 'text-white' : 'text-white/40',
                    )}
                  >
                    {isEarned ? badge.name : '???'}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {isEarned ? badge.description : badge.requirement}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}
