'use client';

// ============================================================================
// Active Companion — Shows the user's current active companion on dashboard.
// ============================================================================

import Image from 'next/image';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { getCompanion, getCompanionColor } from '@/lib/companions';
import type { UserCompanion } from '@/lib/types';

interface ActiveCompanionProps {
  companions: UserCompanion[];
  loading?: boolean;
}

export function ActiveCompanion({
  companions,
  loading = false,
}: ActiveCompanionProps) {
  if (loading) {
    return (
      <GlassCard hover={false} className="p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-40 w-40 animate-pulse rounded-2xl bg-white/5" />
          <div className="h-5 w-32 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
        </div>
      </GlassCard>
    );
  }

  const active = companions.find((c) => c.isActive);

  // No companion claimed
  if (!active) {
    return (
      <GlassCard hover={false} className="p-6">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="text-5xl">🥚</span>
          <h3 className="font-display text-lg font-semibold text-white">
            No Companion Yet
          </h3>
          <p className="max-w-[240px] text-sm text-text-muted">
            Claim your first AI companion and start your journey together.
          </p>
          <Button href="/dashboard/companion" variant="primary" size="md">
            Claim Your First Companion
          </Button>
        </div>
      </GlassCard>
    );
  }

  const companionData = getCompanion(active.companion.id);
  const companionColor = getCompanionColor(active.companion.id);
  const name = companionData?.name ?? active.companion.name;
  const species = companionData?.species ?? active.companion.type;
  const tagline =
    companionData?.tagline ?? active.companion.specialization;
  const emoji = companionData?.emoji ?? '🐙';
  const imageSrc = companionData?.images[0];
  const colorName = companionData?.color ?? 'cyan';

  return (
    <GlassCard
      hover={false}
      glow={colorName as 'cyan' | 'magenta' | 'gold'}
      className="relative overflow-hidden p-6"
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full opacity-15 blur-3xl"
        style={{ background: companionColor }}
      />

      <div className="relative flex flex-col items-center gap-4 text-center">
        {/* Companion Image or Emoji Fallback */}
        {imageSrc ? (
          <div
            className="relative h-40 w-40 overflow-hidden rounded-2xl border border-white/10"
            style={{
              boxShadow: `0 0 40px ${companionColor}33`,
            }}
          >
            <Image
              src={imageSrc}
              alt={name}
              fill
              className="object-cover"
              sizes="160px"
            />
          </div>
        ) : (
          <div
            className="flex h-40 w-40 items-center justify-center rounded-2xl border border-white/10"
            style={{
              background: `${companionColor}10`,
              boxShadow: `0 0 40px ${companionColor}33`,
            }}
          >
            <span className="text-6xl">{emoji}</span>
          </div>
        )}

        {/* Info */}
        <div>
          <h3 className="font-display text-xl font-bold text-white">
            {name}
          </h3>
          <p
            className="text-sm font-mono font-medium"
            style={{ color: companionColor }}
          >
            {species}
          </p>
          <p className="mt-1 text-sm text-text-muted">{tagline}</p>
        </div>

        {/* CTA */}
        <Button
          href="https://t.me/KinCompanionBot"
          variant="outline"
          size="md"
        >
          Chat on Telegram
        </Button>
      </div>
    </GlassCard>
  );
}
