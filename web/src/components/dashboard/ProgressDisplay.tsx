'use client';

// ============================================================================
// ProgressDisplay — Large level display with animated XP progress bar.
// ============================================================================

import { motion } from 'framer-motion';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { GlassCard } from '@/components/ui/GlassCard';
import { getLevelTitle, XP_FOR_LEVEL } from '@/lib/constants';

interface ProgressDisplayProps {
  level: number;
  xp: number;
}

export function ProgressDisplay({ level, xp }: ProgressDisplayProps) {
  const title = getLevelTitle(level);
  const xpForCurrent = XP_FOR_LEVEL(level);
  const xpForNext = XP_FOR_LEVEL(level + 1);
  const xpIntoLevel = xp - xpForCurrent;
  const xpNeeded = xpForNext - xpForCurrent;
  const percent = xpNeeded > 0 ? Math.min(100, (xpIntoLevel / xpNeeded) * 100) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard hover={false} glow="cyan" className="p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Level Number */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan/30 bg-cyan/5"
            style={{
              boxShadow: '0 0 40px rgba(0, 240, 255, 0.15)',
            }}
          >
            <span className="font-display text-4xl font-bold text-cyan">
              {level}
            </span>
          </motion.div>

          {/* Title */}
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              {title}
            </h2>
            <p className="mt-1 text-sm text-text-muted">Level {level}</p>
          </div>

          {/* XP Bar */}
          <div className="w-full max-w-sm">
            <div className="mb-1 flex justify-between text-xs text-white/50">
              <span className="font-mono">{xp.toLocaleString()} XP</span>
              <span className="font-mono">
                {xpForNext.toLocaleString()} XP
              </span>
            </div>
            <ProgressBar
              value={percent}
              color="cyan"
              size="md"
            />
            <p className="mt-1 text-center text-xs text-white/40">
              {Math.max(0, xpForNext - xp).toLocaleString()} XP to Level{' '}
              {level + 1}
            </p>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
