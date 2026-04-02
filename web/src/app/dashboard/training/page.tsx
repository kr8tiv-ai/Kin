'use client';

// ============================================================================
// Training Dashboard — Builder curation of SFT training pairs.
// ============================================================================

import { useState, useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useTrainingCompanions,
  useTrainingEntries,
  useUpdateVerdict,
  useExportTrainingData,
} from '@/hooks/useTrainingData';
import type { TrainingCompanionStats, TrainingEntry } from '@/lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

const VERDICT_BADGE: Record<string, { label: string; color: 'cyan' | 'magenta' | 'gold' | 'muted' }> = {
  pending: { label: 'Pending', color: 'muted' },
  approved: { label: 'Approved', color: 'cyan' },
  rejected: { label: 'Rejected', color: 'magenta' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function CompanionCard({
  companion,
  selected,
  onClick,
}: {
  companion: TrainingCompanionStats;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 text-center transition-all duration-200 min-w-[120px] ${
        selected
          ? 'border-cyan bg-cyan/10 text-white'
          : 'border-white/10 bg-white/[0.02] text-white/60 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <span className="text-2xl">{companion.emoji}</span>
      <span className="text-sm font-medium truncate max-w-[100px]">{companion.name}</span>
      <span className="text-xs text-white/40">{companion.totalEntries} entries</span>
    </button>
  );
}

function EntryRow({
  entry,
  onApprove,
  onReject,
  verdictLoading,
}: {
  entry: TrainingEntry;
  onApprove: () => void;
  onReject: () => void;
  verdictLoading: boolean;
}) {
  const userMsg = entry.messages.find((m) => m.role === 'user');
  const assistantMsg = entry.messages.find((m) => m.role === 'assistant');
  const badge = VERDICT_BADGE[entry.verdict] ?? VERDICT_BADGE.pending;

  return (
    <GlassCard className="p-4 space-y-3" hover={false}>
      {/* Messages */}
      <div className="space-y-2">
        {userMsg && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">User</span>
            <p className="text-sm text-white/80 mt-0.5">{truncate(userMsg.content, 200)}</p>
          </div>
        )}
        {assistantMsg && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">Assistant</span>
            <p className="text-sm text-white/80 mt-0.5">{truncate(assistantMsg.content, 200)}</p>
          </div>
        )}
      </div>

      {/* Metadata + Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={badge.color}>{badge.label}</Badge>
          <span className="text-[11px] text-white/30 font-mono">
            {formatDate(entry.metadata.timestamp)}
          </span>
          <span className="text-[11px] text-white/30 font-mono">
            {entry.metadata.provider}/{entry.metadata.model}
          </span>
          <span className="text-[11px] text-white/30 font-mono">
            {entry.metadata.latencyMs}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          {entry.verdict !== 'approved' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onApprove}
              disabled={verdictLoading}
            >
              ✓ Approve
            </Button>
          )}
          {entry.verdict !== 'rejected' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={verdictLoading}
              className="text-magenta/70 hover:text-magenta"
            >
              ✗ Reject
            </Button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
      ))}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { user } = useAuth();
  const tier = user?.tier ?? 'free';

  // ── Hero-tier gate ──
  if (tier !== 'hero') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <GlassCard className="p-8 text-center max-w-md" hover={false}>
          <span className="text-4xl mb-4 block">🔒</span>
          <h1 className="font-display text-2xl font-bold text-white mb-2">
            Access Restricted
          </h1>
          <p className="text-white/50 text-sm">
            The training dashboard is only available to Hero-tier users.
          </p>
        </GlassCard>
      </div>
    );
  }

  return <TrainingDashboard />;
}

function TrainingDashboard() {
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: companionsData, loading: companionsLoading, error: companionsError } = useTrainingCompanions();
  const { data: entriesData, loading: entriesLoading, error: entriesError, refresh: refreshEntries } = useTrainingEntries(selectedCompanionId, page);
  const { data: refreshedCompanions, refresh: refreshCompanions } = useTrainingCompanions();
  const { exportData, loading: exportLoading } = useExportTrainingData();

  const handleVerdictSuccess = useCallback(() => {
    refreshEntries();
    refreshCompanions();
  }, [refreshEntries, refreshCompanions]);

  const { updateVerdict, loading: verdictLoading } = useUpdateVerdict(handleVerdictSuccess);

  const companions = (refreshedCompanions ?? companionsData)?.companions ?? [];
  const selectedCompanion = companions.find((c) => c.id === selectedCompanionId) ?? null;

  const entries = entriesData?.entries ?? [];
  const totalEntries = entriesData?.total ?? 0;
  const pageSize = entriesData?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  // Auto-select first companion if none selected
  if (!selectedCompanionId && companions.length > 0) {
    setSelectedCompanionId(companions[0].id);
  }

  // ── No companions / no data ──
  if (!companionsLoading && companions.length === 0 && !companionsError) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon="🧪"
          title="No Training Data"
          description="Enable shared privacy mode on your companions to start collecting training data for fine-tuning."
          actionLabel="Go to Companion"
          actionHref="/dashboard/companion"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* Error banner */}
      {companionsError && (
        <GlassCard className="p-4 border-magenta/30" hover={false}>
          <p className="text-sm text-magenta">{companionsError}</p>
        </GlassCard>
      )}

      {/* Companion selector */}
      {companionsLoading ? (
        <div className="flex gap-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 w-[120px] rounded-lg bg-white/[0.04] border border-white/[0.06]" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {companions.map((c) => (
            <CompanionCard
              key={c.id}
              companion={c}
              selected={c.id === selectedCompanionId}
              onClick={() => {
                setSelectedCompanionId(c.id);
                setPage(1);
              }}
            />
          ))}
        </div>
      )}

      {/* Stats bar + Export */}
      {selectedCompanion && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/50">
              <span className="text-white font-medium">{selectedCompanion.totalEntries}</span> total
            </span>
            <span className="text-sm text-white/50">
              <span className="text-cyan font-medium">{selectedCompanion.approvedCount}</span> approved
            </span>
            <span className="text-sm text-white/50">
              <span className="text-magenta font-medium">{selectedCompanion.rejectedCount}</span> rejected
            </span>
            <span className="text-sm text-white/50">
              <span className="text-white/70 font-medium">{selectedCompanion.pendingCount}</span> pending
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedCompanion.approvedCount === 0 || exportLoading}
            onClick={() => exportData(selectedCompanion.id, selectedCompanion.name)}
          >
            {exportLoading ? 'Exporting…' : '↓ Export JSONL'}
          </Button>
        </div>
      )}

      {/* Entries */}
      {selectedCompanionId && (
        <>
          {entriesError && (
            <GlassCard className="p-4 border-magenta/30" hover={false}>
              <p className="text-sm text-magenta">{entriesError}</p>
            </GlassCard>
          )}

          {entriesLoading ? (
            <LoadingSkeleton />
          ) : entries.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No Training Entries"
              description={`No training entries found for ${selectedCompanion?.name ?? 'this companion'}. Conversations in shared mode will appear here.`}
            />
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.hash}
                  entry={entry}
                  onApprove={() => updateVerdict(entry.hash, 'approved')}
                  onReject={() => updateVerdict(entry.hash, 'rejected')}
                  verdictLoading={verdictLoading}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </Button>
              <span className="text-sm text-white/40 font-mono">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-white">Training Data</h1>
      <p className="text-white/50 text-sm mt-1">
        Review conversation pairs, approve for fine-tuning, and export curated JSONL
      </p>
    </div>
  );
}
