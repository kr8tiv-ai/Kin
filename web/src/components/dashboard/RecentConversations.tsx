'use client';

// ============================================================================
// Recent Conversations — Shows the last 5 conversations in the dashboard.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { formatRelativeTime } from '@/lib/utils';
import { getCompanion } from '@/lib/companions';
import type { Conversation } from '@/lib/types';

interface RecentConversationsProps {
  conversations: Conversation[];
  loading?: boolean;
}

export function RecentConversations({
  conversations,
  loading = false,
}: RecentConversationsProps) {
  if (loading) {
    return (
      <GlassCard hover={false} className="p-6">
        <h3 className="mb-4 font-display text-lg font-semibold text-white">
          Recent Conversations
        </h3>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-24 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  const recent = conversations.slice(0, 5);

  return (
    <GlassCard hover={false} className="p-6">
      <h3 className="mb-4 font-display text-lg font-semibold text-white">
        Recent Conversations
      </h3>

      {recent.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="text-3xl">💬</span>
          <p className="text-sm text-text-muted">
            No conversations yet — start chatting on Telegram!
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {recent.map((conversation) => {
            const companionData = getCompanion(conversation.companionId);
            const emoji = companionData?.emoji ?? '🐙';

            return (
              <li key={conversation.id}>
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5">
                  {/* Companion Emoji */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-base">
                    {emoji}
                  </div>

                  {/* Conversation Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {conversation.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{conversation.messageCount} messages</span>
                      <span className="text-white/20">|</span>
                      <span>
                        {formatRelativeTime(conversation.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
