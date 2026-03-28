'use client';

// ============================================================================
// CompanionDetail — Large companion card with image, info, and color accent.
// ============================================================================

import Image from 'next/image';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import type { CompanionData } from '@/lib/companions';
import { getCompanionColor } from '@/lib/companions';

interface CompanionDetailProps {
  companion: CompanionData;
  stats?: {
    conversations: number;
    messages: number;
    daysTogether: number;
  };
}

const PERSONALITY_TRAITS: Record<string, string[]> = {
  cipher: ['Creative', 'Detail-oriented', 'Visual Thinker'],
  mischief: ['Playful', 'Energetic', 'Storyteller'],
  vortex: ['Strategic', 'Analytical', 'Big-picture'],
  forge: ['Perfectionist', 'Methodical', 'Architect'],
  aether: ['Literary', 'Thoughtful', 'Eloquent'],
  catalyst: ['Optimizer', 'Practical', 'Goal-driven'],
};

export function CompanionDetail({ companion, stats }: CompanionDetailProps) {
  const color = getCompanionColor(companion.id);
  const traits = PERSONALITY_TRAITS[companion.id] ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <GlassCard
        hover={false}
        glow={companion.color}
        className="relative overflow-hidden p-8"
      >
        {/* Background glow */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{ background: color }}
        />

        <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-start">
          {/* Companion Image */}
          <div
            className="relative h-56 w-56 shrink-0 overflow-hidden rounded-2xl border-2"
            style={{
              borderColor: `${color}40`,
              boxShadow: `0 0 60px ${color}33`,
            }}
          >
            <Image
              src={companion.images[0]}
              alt={companion.name}
              fill
              className="object-cover"
              sizes="224px"
              priority
            />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center gap-3 md:justify-start">
                <h2 className="font-display text-3xl font-bold text-white">
                  {companion.emoji} {companion.name}
                </h2>
              </div>
              <p
                className="mt-1 font-mono text-sm font-medium"
                style={{ color }}
              >
                {companion.species}
              </p>
              <p className="mt-1 text-sm text-text-muted">{companion.tagline}</p>
            </div>

            <p className="max-w-md text-sm leading-relaxed text-white/70">
              {companion.description}
            </p>

            {/* Personality Traits */}
            {traits.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 md:justify-start">
                {traits.map((trait) => (
                  <Badge key={trait} color={companion.color}>
                    {trait}
                  </Badge>
                ))}
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div className="mt-2 grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-white/[0.04] px-4 py-3 text-center">
                  <p className="font-mono text-xl font-bold text-white">
                    {stats.conversations}
                  </p>
                  <p className="text-xs text-text-muted">Conversations</p>
                </div>
                <div className="rounded-lg bg-white/[0.04] px-4 py-3 text-center">
                  <p className="font-mono text-xl font-bold text-white">
                    {stats.messages}
                  </p>
                  <p className="text-xs text-text-muted">Messages</p>
                </div>
                <div className="rounded-lg bg-white/[0.04] px-4 py-3 text-center">
                  <p className="font-mono text-xl font-bold text-white">
                    {stats.daysTogether}
                  </p>
                  <p className="text-xs text-text-muted">Days Together</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
