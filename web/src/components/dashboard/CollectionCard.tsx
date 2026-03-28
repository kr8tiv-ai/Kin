'use client';

// ============================================================================
// CollectionCard — Glass card displaying a companion in the user's collection.
// Shows 3D model (or 2D fallback), name, species, and Genesis rarity badge.
// ============================================================================

import { motion } from 'framer-motion';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import type { CollectionItem } from '@/hooks/useCollection';

interface CollectionCardProps {
  item: CollectionItem;
  index: number;
  onClick: () => void;
}

export function CollectionCard({ item, index, onClick }: CollectionCardProps) {
  const { companionData, claimedAt, isActive } = item;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-lg"
      >
        <GlassCard
          hover
          glow={companionData.color}
          className="overflow-hidden"
        >
          {/* Companion Viewer */}
          <div className="relative h-52 w-full">
            <CompanionViewer
              glbUrl={companionData.glbUrl}
              fallbackImage={companionData.images[0]}
              alt={companionData.name}
              modelReady={companionData.modelReady}
              className="h-full w-full"
            />

            {/* Active indicator */}
            {isActive && (
              <div className="absolute top-3 left-3">
                <Badge color="cyan">Active</Badge>
              </div>
            )}

            {/* Genesis badge */}
            <div className="absolute top-3 right-3">
              <Badge color="gold">Genesis</Badge>
            </div>
          </div>

          {/* Info */}
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">
                {companionData.emoji}
              </span>
              <h3 className="font-display text-lg font-bold text-white">
                {companionData.name}
              </h3>
            </div>

            <p
              className="mt-0.5 font-mono text-xs font-medium"
              style={{ color: `var(--color-${companionData.color})` }}
            >
              {companionData.species}
            </p>

            <p className="mt-1 text-sm text-text-muted line-clamp-1">
              {companionData.tagline}
            </p>

            <p className="mt-3 text-xs text-white/40">
              Claimed {formatRelativeTime(claimedAt)}
            </p>
          </div>
        </GlassCard>
      </button>
    </motion.div>
  );
}
