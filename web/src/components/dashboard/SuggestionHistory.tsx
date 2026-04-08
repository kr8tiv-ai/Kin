'use client';

// ============================================================================
// SuggestionHistory — List of recent proactive suggestions with feedback.
// ============================================================================

import { Badge } from '@/components/ui/Badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/utils';
import type { ProactiveSuggestion } from '@/lib/types';

interface SuggestionHistoryProps {
  suggestions: ProactiveSuggestion[];
  loading: boolean;
  onFeedback: (id: string, feedback: 'helpful' | 'not_helpful') => Promise<void>;
}

// Map companion IDs to display names
const COMPANION_NAMES: Record<string, string> = {
  cipher: 'Cipher',
  mischief: 'Mischief',
  vortex: 'Vortex',
  forge: 'Forge',
  aether: 'Aether',
  catalyst: 'Catalyst',
};

// Map status values to badge colors
const STATUS_COLORS: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  pending: 'muted',
  delivered: 'cyan',
  seen: 'gold',
  dismissed: 'muted',
};

// Map channel to display label
const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  dashboard: 'Dashboard',
};

export function SuggestionHistory({
  suggestions,
  loading,
  onFeedback,
}: SuggestionHistoryProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-white/[0.01] px-6 py-8 text-center">
        <p className="text-sm text-white/40">
          No suggestions yet. Your companion will reach out when it notices
          something relevant.
        </p>
      </div>
    );
  }

  // Show at most 20
  const displayed = suggestions.slice(0, 20);

  return (
    <div className="space-y-3">
      {displayed.map((suggestion) => (
        <GlassCard key={suggestion.id} className="p-4" hover={false}>
          <div className="flex items-start justify-between gap-3">
            {/* Content & metadata */}
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge color="magenta">
                  {COMPANION_NAMES[suggestion.companionId] ?? suggestion.companionId}
                </Badge>
                <Badge color={STATUS_COLORS[suggestion.status] ?? 'muted'}>
                  {suggestion.status}
                </Badge>
                {suggestion.deliveryChannel && (
                  <span className="text-xs text-white/30">
                    via {CHANNEL_LABELS[suggestion.deliveryChannel] ?? suggestion.deliveryChannel}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-white/80">
                {suggestion.content}
              </p>
              <p className="mt-1 text-xs text-white/30">
                {suggestion.createdAt ? formatDate(suggestion.createdAt) : ''}
              </p>
            </div>

            {/* Feedback buttons */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onFeedback(suggestion.id, 'helpful')}
                disabled={suggestion.userFeedback === 'helpful'}
                className={`rounded-lg px-2.5 py-1.5 text-base transition-colors ${
                  suggestion.userFeedback === 'helpful'
                    ? 'bg-cyan/10 text-cyan'
                    : 'text-white/30 hover:bg-white/5 hover:text-white/70'
                }`}
                title="Helpful"
              >
                👍
              </button>
              <button
                type="button"
                onClick={() => onFeedback(suggestion.id, 'not_helpful')}
                disabled={suggestion.userFeedback === 'not_helpful'}
                className={`rounded-lg px-2.5 py-1.5 text-base transition-colors ${
                  suggestion.userFeedback === 'not_helpful'
                    ? 'bg-magenta/10 text-magenta'
                    : 'text-white/30 hover:bg-white/5 hover:text-white/70'
                }`}
                title="Not helpful"
              >
                👎
              </button>
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
