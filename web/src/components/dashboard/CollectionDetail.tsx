'use client';

// ============================================================================
// CollectionDetail — Modal with large interactive 3D companion viewer,
// personality info, usage stats, and action buttons.
// ============================================================================

import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { getCompanionColor } from '@/lib/companions';
import type { CollectionItem } from '@/hooks/useCollection';
import type { Conversation } from '@/lib/types';

interface CollectionDetailProps {
  item: CollectionItem | null;
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onMakeActive: (companionId: string) => Promise<void>;
  activating: boolean;
}

const PERSONALITY_TRAITS: Record<string, string[]> = {
  cipher: ['Creative', 'Detail-oriented', 'Visual Thinker'],
  mischief: ['Playful', 'Energetic', 'Storyteller'],
  vortex: ['Strategic', 'Analytical', 'Big-picture'],
  forge: ['Perfectionist', 'Methodical', 'Architect'],
  aether: ['Literary', 'Thoughtful', 'Eloquent'],
  catalyst: ['Optimizer', 'Practical', 'Goal-driven'],
};

export function CollectionDetail({
  item,
  open,
  onClose,
  conversations,
  onMakeActive,
  activating,
}: CollectionDetailProps) {
  if (!item) return null;

  const { companionData, claimedAt, isActive, companionId } = item;
  const color = getCompanionColor(companionId);
  const traits = PERSONALITY_TRAITS[companionId] ?? [];

  const stats = useMemo(() => {
    const companionConvos = conversations.filter(
      (c) => c.companionId === companionId,
    );
    const totalMessages = companionConvos.reduce(
      (sum, c) => sum + c.messageCount,
      0,
    );
    const claimedDate = new Date(claimedAt);
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
  }, [conversations, companionId, claimedAt]);

  const telegramBotUrl = 'https://t.me/KinCompanionBot';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${companionData.emoji} ${companionData.name}`}
      className="max-w-2xl"
    >
      {/* Color border accent */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: color }}
      />

      {/* 3D Viewer */}
      <div
        className="relative mx-auto mb-6 h-64 w-full overflow-hidden rounded-xl border"
        style={{
          borderColor: `${color}30`,
          boxShadow: `0 0 40px ${color}20`,
        }}
      >
        <CompanionViewer
          glbUrl={companionData.glbUrl}
          fallbackImage={companionData.images[0]}
          alt={companionData.name}
          modelReady={companionData.modelReady}
          interactive
          className="h-full w-full"
        />
      </div>

      {/* Badges row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color="gold">Genesis</Badge>
        {isActive && <Badge color="cyan">Active Companion</Badge>}
        {traits.map((trait) => (
          <Badge key={trait} color={companionData.color}>
            {trait}
          </Badge>
        ))}
      </div>

      {/* Species and tagline */}
      <p className="font-mono text-sm font-medium" style={{ color }}>
        {companionData.species}
      </p>
      <p className="mt-1 text-sm text-text-muted">{companionData.tagline}</p>

      {/* Full description */}
      <p className="mt-4 text-sm leading-relaxed text-white/70">
        {companionData.description}
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
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

      {/* Claimed date */}
      <p className="mt-4 text-xs text-white/40">
        Claimed on {formatDate(claimedAt)}
      </p>

      {/* Action buttons */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {!isActive && (
          <Button
            variant="primary"
            size="md"
            onClick={() => onMakeActive(companionId)}
            disabled={activating}
            className="flex-1"
          >
            {activating ? 'Activating...' : 'Make Active'}
          </Button>
        )}
        <Button
          variant="outline"
          size="md"
          href={telegramBotUrl}
          className="flex-1"
        >
          Chat Now
        </Button>
      </div>
    </Modal>
  );
}
