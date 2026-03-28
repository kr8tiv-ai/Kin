'use client';

// ============================================================================
// Companion Page — View active companion details and switch companions.
// ============================================================================

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useCompanions } from '@/hooks/useCompanions';
import { useConversations } from '@/hooks/useConversations';
import { CompanionDetail } from '@/components/dashboard/CompanionDetail';
import { CompanionSwitcher } from '@/components/dashboard/CompanionSwitcher';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { getCompanion } from '@/lib/companions';

export default function CompanionPage() {
  const { companions, loading, error, claimCompanion, claiming, refresh } =
    useCompanions();
  const { conversations } = useConversations();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const active = companions.find((c) => c.isActive);
  const companionData = active ? getCompanion(active.companion.id) : null;

  // Calculate stats from conversations
  const stats = useMemo(() => {
    if (!active) return undefined;

    const companionConvos = conversations.filter(
      (c) => c.companionId === active.companion.id,
    );
    const totalMessages = companionConvos.reduce(
      (sum, c) => sum + c.messageCount,
      0,
    );
    const claimedDate = new Date(active.claimedAt);
    const daysTogether = Math.max(
      1,
      Math.floor(
        (Date.now() - claimedDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    return {
      conversations: companionConvos.length,
      messages: totalMessages,
      daysTogether,
    };
  }, [active, conversations]);

  const handleSwitch = async (companionId: string) => {
    await claimCompanion(companionId);
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Your Companion
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

  // --- No Companion State ---
  if (!active || !companionData) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Choose Your Companion
        </h1>
        <p className="text-text-muted">
          Select your first AI companion to begin your journey.
        </p>
        <CompanionSwitcher
          open={true}
          onClose={() => {}}
          onSwitch={handleSwitch}
          switching={claiming}
        />
      </div>
    );
  }

  // --- Active Companion ---
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Your Companion
          </h1>
          <p className="mt-1 text-text-muted">
            Meet your AI companion and track your journey together.
          </p>
        </div>
        <Button
          variant="outline"
          size="md"
          onClick={() => setSwitcherOpen(true)}
        >
          Switch Companion
        </Button>
      </motion.div>

      <CompanionDetail companion={companionData} stats={stats} />

      <CompanionSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        currentCompanionId={active.companion.id}
        onSwitch={handleSwitch}
        switching={claiming}
      />
    </div>
  );
}
