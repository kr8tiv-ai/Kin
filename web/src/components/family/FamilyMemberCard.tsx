'use client';

// ============================================================================
// FamilyMemberCard — Displays a family member with role badge, activity stats.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import type { FamilyMember } from '@/lib/types';

interface FamilyMemberCardProps {
  member: FamilyMember;
  isCurrentUser: boolean;
  onRemove?: (memberId: string) => void;
}

function roleBadgeColor(role: string): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (role) {
    case 'parent': return 'gold';
    case 'child': return 'cyan';
    default: return 'muted';
  }
}

function ageBadgeLabel(ageBracket?: string | null): string | null {
  if (!ageBracket) return null;
  if (ageBracket === 'under_13') return 'Under 13';
  if (ageBracket === 'teen') return 'Teen';
  return null;
}

export function FamilyMemberCard({ member, isCurrentUser, onRemove }: FamilyMemberCardProps) {
  const initial = member.firstName.charAt(0).toUpperCase();
  const ageLabel = ageBadgeLabel(member.ageBracket);

  return (
    <GlassCard className="p-4" hover={false}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan/20 text-cyan font-display font-bold text-lg">
          {initial}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">
              {member.firstName}
              {member.lastName ? ` ${member.lastName}` : ''}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-white/40">(you)</span>
            )}
            <Badge color={roleBadgeColor(member.role)}>
              {member.role}
            </Badge>
            {ageLabel && (
              <Badge color="muted">{ageLabel}</Badge>
            )}
          </div>

          {/* Activity stats */}
          <div className="mt-1.5 flex items-center gap-4 text-xs text-white/40">
            <span>{member.messageCount} messages</span>
            {member.lastActive ? (
              <span>Active {formatRelativeTime(new Date(member.lastActive))}</span>
            ) : (
              <span>No activity yet</span>
            )}
          </div>
        </div>

        {/* Remove button — only for parents viewing non-self members */}
        {onRemove && !isCurrentUser && (
          <button
            type="button"
            onClick={() => onRemove(member.memberId)}
            className="shrink-0 rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-magenta transition-colors"
            title={`Remove ${member.firstName}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </GlassCard>
  );
}
