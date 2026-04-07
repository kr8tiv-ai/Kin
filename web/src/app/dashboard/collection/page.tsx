'use client';

// ============================================================================
// Collection Page — Browse all 6 KIN companions. Shows owned vs locked state.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useCollection, type CollectionItem } from '@/hooks/useCollection';
import { useConversations } from '@/hooks/useConversations';
import { useCompanions } from '@/hooks/useCompanions';
import { useRebindingStatus } from '@/hooks/useRebinding';
import { COMPANION_LIST, type CompanionData } from '@/lib/companions';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { CollectionDetail } from '@/components/dashboard/CollectionDetail';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

const SOLANA_EXPLORER = 'https://explorer.solana.com/address';
const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? '' : '?cluster=devnet';

/**
 * Shows rebinding status badge for an owned companion NFT.
 * Uses individual status hook — only renders when mintAddress exists.
 */
function RebindingBadge({ mintAddress }: { mintAddress: string }) {
  const { rebinding } = useRebindingStatus(mintAddress);

  if (!rebinding) return null;

  if (rebinding.status === 'pending_onboarding') {
    return (
      <Badge color="gold">
        ✨ Complete Setup
      </Badge>
    );
  }

  if (rebinding.status === 'complete') {
    return (
      <Badge color="cyan">
        New! Rebound
      </Badge>
    );
  }

  if (rebinding.status === 'processing') {
    return (
      <Badge color="magenta">
        Rebinding…
      </Badge>
    );
  }

  return null;
}

function CompanionCardInner({
  companion,
  isOwned,
  isActive,
  nftMintAddress,
}: {
  companion: CompanionData;
  isOwned: boolean;
  isActive: boolean;
  nftMintAddress?: string;
}) {
  return (
    <div
      className={`group rounded-[24px] border bg-surface overflow-hidden transition-all duration-400 ${
        isOwned
          ? `border-${companion.color}/20 hover:-translate-y-[10px]`
          : 'border-white/10 opacity-75 cursor-default'
      }`}
      onMouseEnter={(e) => {
        if (isOwned) {
          const glowMap: Record<string, string> = {
            cyan: '0 10px 30px rgba(0,240,255,0.12)',
            magenta: '0 10px 30px rgba(255,0,170,0.12)',
            gold: '0 10px 30px rgba(255,215,0,0.12)',
          };
          e.currentTarget.style.boxShadow = glowMap[companion.color] ?? 'none';
          e.currentTarget.style.borderColor = `var(--color-${companion.color})`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '';
      }}
    >
      <div className="relative aspect-square overflow-hidden">
        <CompanionViewer
          glbUrl={companion.glbUrl}
          fallbackImage={companion.images[0]}
          alt={companion.name}
          modelReady={companion.modelReady}
          initialRotation={companion.modelRotation}
          className="h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {isActive && (
          <div className="absolute top-4 left-4">
            <Badge color="cyan">Active</Badge>
          </div>
        )}
        {isOwned && (
          <div className="absolute top-4 right-4">
            <Badge color="gold">Owned</Badge>
          </div>
        )}
        {isOwned && nftMintAddress && (
          <div className="absolute bottom-4 left-4">
            <RebindingBadge mintAddress={nftMintAddress} />
          </div>
        )}
        {!isOwned && (
          <>
            <div className="absolute top-4 right-4">
              <span className="text-2xl drop-shadow-lg">{companion.emoji}</span>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <span className="text-4xl mb-2">{'\uD83D\uDD12'}</span>
              <span className="font-mono text-xs uppercase tracking-[0.15em] text-white/80">
                Mint to Unlock
              </span>
            </div>
          </>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg font-bold text-white">
            {companion.name}
          </h3>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono border-${companion.color}/20 bg-${companion.color}/10`}
            style={{ color: `var(--color-${companion.color})` }}
          >
            {companion.species}
          </span>
        </div>
        <p className="text-sm text-white/50 leading-relaxed">
          {companion.tagline}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-white/25 font-mono">
          <span>{companion.frontierModel.provider}</span>
          <span>{'\u00B7'}</span>
          <span>{companion.frontierModel.modelName}</span>
        </div>
        {/* NFT on-chain link */}
        {isOwned && nftMintAddress && !nftMintAddress.startsWith('kin-') && (
          <a
            href={`${SOLANA_EXPLORER}/${nftMintAddress}${SOLANA_CLUSTER}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#AB6DFE]/20 bg-[#AB6DFE]/10 px-3 py-1 text-[10px] font-mono text-[#AB6DFE] hover:bg-[#AB6DFE]/20 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"/>
            </svg>
            View on Solana
          </a>
        )}
        {isOwned && nftMintAddress && nftMintAddress.startsWith('kin-') && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[10px] font-mono text-gold/60">
            Pending on-chain mint
          </div>
        )}
      </div>
    </div>
  );
}

export default function CollectionPage() {
  const { items, loading, error, refresh } = useCollection();
  const { conversations } = useConversations();
  const { claimCompanion, claiming } = useCompanions();
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

  const handleMakeActive = async (companionId: string) => {
    await claimCompanion(companionId);
    refresh();
    setSelectedItem(null);
  };

  // Build a set of owned companion IDs for quick lookup
  const ownedIds = new Set(items.map((i) => i.companionId));

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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
          <p className="text-magenta">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Try Again
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="inline-flex items-center rounded-full bg-magenta/10 border border-magenta/20 px-4 py-1.5 text-xs font-mono text-magenta mb-4">
          Genesis Collection
        </span>
        <h1
          className="font-display font-extrabold uppercase tracking-[-0.04em] text-white"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
        >
          The Genesis Six
        </h1>
        <p className="mt-2 text-white/50" style={{ fontSize: 'clamp(0.9rem, 1.5vw, 1.15rem)' }}>
          Six unique AI companions, each with their own personality, skills, and style.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="flex gap-4">
        <GlassCard className="px-4 py-3" hover={false}>
          <span className="text-xs text-white/40">Owned</span>
          <p className="font-display text-lg font-bold text-cyan">{items.length}</p>
        </GlassCard>
        <GlassCard className="px-4 py-3" hover={false}>
          <span className="text-xs text-white/40">Available</span>
          <p className="font-display text-lg font-bold text-white/60">{COMPANION_LIST.length - items.length}</p>
        </GlassCard>
      </div>

      {/* All 6 Companions Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {COMPANION_LIST.map((companion, index) => {
          const isOwned = ownedIds.has(companion.id);
          const ownedItem = items.find((i) => i.companionId === companion.id);
          const isActive = ownedItem?.isActive ?? false;
          const nftMintAddress = ownedItem?.nftMintAddress;

          return (
            <motion.div
              key={companion.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              {isOwned ? (
                <Link
                  href={`/dashboard/companion/${companion.id}`}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 rounded-lg"
                >
                  <CompanionCardInner companion={companion} isOwned={isOwned} isActive={isActive} nftMintAddress={nftMintAddress} />
                </Link>
              ) : (
                <CompanionCardInner companion={companion} isOwned={isOwned} isActive={isActive} />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Detail Modal (for owned companions) */}
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
