'use client';

// ============================================================================
// Progress Page — User level, XP, stats, and badge collection.
// ============================================================================

import { motion } from 'framer-motion';
import { useProgress } from '@/hooks/useProgress';
import { ProgressDisplay } from '@/components/dashboard/ProgressDisplay';
import { BadgeGrid } from '@/components/dashboard/BadgeGrid';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';

export default function ProgressPage() {
  const { progress, loading, error, refresh } = useProgress();

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton variant="card" className="h-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="card" className="h-24" />
          <Skeleton variant="card" className="h-24" />
        </div>
        <Skeleton variant="card" className="h-40" />
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Your Progress
        </h1>
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  // Default values when data has not loaded yet
  const level = progress?.level ?? 1;
  const xp = progress?.xp ?? 0;
  const totalMessages = progress?.totalMessages ?? 0;
  const streakDays = progress?.streakDays ?? 0;
  const badges = progress?.badges ?? [];
  const joinedAt = progress?.joinedAt;

  // Fresh user with no activity
  if (level <= 1 && xp === 0 && totalMessages === 0) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Your Progress
          </h1>
          <p className="mt-1 text-text-muted">
            Track your level, streaks, and badge collection.
          </p>
        </motion.div>
        <EmptyState
          icon="🚀"
          title="Your journey starts here"
          description="Start chatting with your companion to earn XP, level up, and unlock badges. Every message counts!"
          actionLabel="Start Chatting"
          actionHref="https://t.me/KinCompanionBot"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Your Progress
        </h1>
        <p className="mt-1 text-text-muted">
          Track your level, streaks, and badge collection.
        </p>
      </motion.div>

      {/* Level + XP Display */}
      <ProgressDisplay level={level} xp={xp} />

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <GlassCard hover={false} className="p-5 text-center">
          <p className="font-mono text-2xl font-bold text-white">
            {totalMessages.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-text-muted">Total Messages</p>
        </GlassCard>

        <GlassCard hover={false} className="p-5 text-center">
          <p className="font-mono text-2xl font-bold text-white">
            {streakDays}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Day Streak
          </p>
        </GlassCard>

        <GlassCard hover={false} className="p-5 text-center">
          <p className="font-mono text-2xl font-bold text-white">
            {joinedAt ? formatDate(joinedAt) : '--'}
          </p>
          <p className="mt-1 text-xs text-text-muted">Member Since</p>
        </GlassCard>
      </motion.div>

      {/* Badges Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <h2 className="mb-4 font-display text-xl font-bold text-white">
          Badges
          <span className="ml-2 text-sm font-normal text-text-muted">
            {badges.length} earned
          </span>
        </h2>
        <BadgeGrid earnedBadgeIds={badges} />
      </motion.div>
    </div>
  );
}
