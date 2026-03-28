'use client';

// ============================================================================
// Referrals Page — Code sharing, stats, and leaderboard.
// ============================================================================

import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useReferral } from '@/hooks/useReferral';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ReferralCode } from '@/components/dashboard/ReferralCode';
import { Leaderboard } from '@/components/dashboard/Leaderboard';

export default function ReferPage() {
  const { user } = useAuth();
  const { stats, leaderboard, loading, error, refresh } = useReferral();

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-white/60">{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const code = stats?.referralCode ?? 'KIN-XXXX';

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Refer a Friend
        </h1>
        <p className="mt-1 text-white/50">
          Share KIN and earn rewards for every friend who joins.
        </p>
      </div>

      {/* Referral Code */}
      <ReferralCode code={code} />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-5" hover={false}>
          <p className="text-sm text-white/50">Total Referrals</p>
          <p className="mt-1 font-display text-2xl font-bold text-white">
            {stats?.totalReferrals ?? 0}
          </p>
        </GlassCard>
        <GlassCard className="p-5" hover={false}>
          <p className="text-sm text-white/50">Active Referrals</p>
          <p className="mt-1 font-display text-2xl font-bold text-cyan">
            {stats?.completedReferrals ?? 0}
          </p>
        </GlassCard>
        <GlassCard className="p-5" hover={false}>
          <p className="text-sm text-white/50">Rewards Earned</p>
          <p className="mt-1 font-display text-2xl font-bold text-gold">
            {stats?.rewardsGranted ?? 0}
          </p>
        </GlassCard>
      </div>

      {/* Leaderboard */}
      <Leaderboard
        entries={leaderboard}
        currentUserName={user?.username}
      />

      {/* How It Works */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          How It Works
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-cyan/10 text-cyan">
              <span className="font-display text-lg font-bold">1</span>
            </div>
            <h3 className="mb-1 font-medium text-white">Share Your Code</h3>
            <p className="text-sm text-white/50">
              Send your unique referral code or link to friends via any
              channel.
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-magenta/10 text-magenta">
              <span className="font-display text-lg font-bold">2</span>
            </div>
            <h3 className="mb-1 font-medium text-white">Friend Joins</h3>
            <p className="text-sm text-white/50">
              When they sign up using your code, both of you get credit
              towards rewards.
            </p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold">
              <span className="font-display text-lg font-bold">3</span>
            </div>
            <h3 className="mb-1 font-medium text-white">Earn Rewards</h3>
            <p className="text-sm text-white/50">
              Get free Pro days, bonus XP, and climb the leaderboard with
              each successful referral.
            </p>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
