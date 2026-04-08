'use client';

// ============================================================================
// SharedMemoryFeed — Displays parent-visible shared memories from family.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/utils';
import type { SharedMemory } from '@/lib/types';

interface SharedMemoryFeedProps {
  memories: SharedMemory[];
  loading: boolean;
}

function memoryTypeBadge(type: string): { label: string; color: 'cyan' | 'magenta' | 'gold' | 'muted' } {
  switch (type) {
    case 'personal': return { label: 'Personal', color: 'cyan' };
    case 'preference': return { label: 'Preference', color: 'magenta' };
    case 'event': return { label: 'Event', color: 'gold' };
    case 'context': return { label: 'Context', color: 'muted' };
    default: return { label: type, color: 'muted' };
  }
}

export function SharedMemoryFeed({ memories, loading }: SharedMemoryFeedProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="card" className="h-24" />
        ))}
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center">
        <span className="mb-2 block text-3xl">🔒</span>
        <p className="text-sm text-white/50">
          No shared memories yet. Family members can mark memories as shared for you to see here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {memories.map((memory) => {
        const badge = memoryTypeBadge(memory.memoryType);
        return (
          <GlassCard key={memory.id} className="p-4" hover={false}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-white/60">
                    {memory.authorFirstName}
                  </span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                </div>
                <p className="text-sm text-white/80 leading-relaxed">
                  {memory.content}
                </p>
              </div>
              <span className="shrink-0 text-xs text-white/30">
                {formatRelativeTime(new Date(memory.createdAt))}
              </span>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
