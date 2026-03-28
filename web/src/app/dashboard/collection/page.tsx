'use client';

// ============================================================================
// Collection Page — Browse, view, and manage companion collection.
// ============================================================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCollection, type CollectionItem } from '@/hooks/useCollection';
import { useConversations } from '@/hooks/useConversations';
import { useCompanions } from '@/hooks/useCompanions';
import { CollectionCard } from '@/components/dashboard/CollectionCard';
import { CollectionDetail } from '@/components/dashboard/CollectionDetail';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

export default function CollectionPage() {
  const { items, loading, error, refresh, isEmpty } = useCollection();
  const { conversations } = useConversations();
  const { claimCompanion, claiming } = useCompanions();
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

  const handleMakeActive = async (companionId: string) => {
    await claimCompanion(companionId);
    refresh();
    setSelectedItem(null);
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="card" className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          My Collection
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

  // --- Empty State ---
  if (isEmpty) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            My Collection
          </h1>
          <p className="mt-1 text-text-muted">
            Your companions — view, interact, and manage your collection.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <GlassCard hover={false} className="flex flex-col items-center px-8 py-16">
            <span className="text-6xl" aria-hidden="true">
              🥚
            </span>
            <h2 className="mt-6 font-display text-xl font-bold text-white">
              Your collection is empty
            </h2>
            <p className="mt-2 max-w-sm text-center text-sm text-text-muted">
              Choose your first companion to start building your collection and
              unlock unique abilities.
            </p>
            <Button
              variant="primary"
              size="lg"
              href="/dashboard/companion"
              className="mt-6"
            >
              Choose Your First Companion
            </Button>
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // --- Collection Grid ---
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          My Collection
        </h1>
        <p className="mt-1 text-text-muted">
          Your companions — view, interact, and manage your collection.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <CollectionCard
            key={item.companionId}
            item={item}
            index={index}
            onClick={() => setSelectedItem(item)}
          />
        ))}
      </div>

      {/* Detail Modal */}
      <CollectionDetail
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        conversations={conversations}
        onMakeActive={handleMakeActive}
        activating={claiming}
      />
    </div>
  );
}
