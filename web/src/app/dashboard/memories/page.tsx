'use client';

// ============================================================================
// Memory Timeline — Browse, filter, and forget companion memories.
// ============================================================================

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemoryTimeline } from '@/hooks/useMemoryTimeline';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/utils';
import type { Memory } from '@/lib/types';

// ── Type filter tabs ────────────────────────────────────────────────────────

type TypeFilter = 'all' | Memory['type'];

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'preference', label: 'Preference' },
  { value: 'context', label: 'Context' },
  { value: 'event', label: 'Event' },
];

function getTypeBadgeColor(
  type: Memory['type'],
): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (type) {
    case 'personal':
      return 'cyan';
    case 'preference':
      return 'magenta';
    case 'context':
      return 'gold';
    case 'event':
      return 'muted';
    default:
      return 'muted';
  }
}

// ── Time grouping ───────────────────────────────────────────────────────────

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Older';
}

function groupMemoriesByTime(
  memories: Memory[],
): { label: string; items: Memory[] }[] {
  const order = ['Today', 'This Week', 'This Month', 'Older'];
  const groups = new Map<string, Memory[]>();

  for (const m of memories) {
    const label = getTimeGroup(m.createdAt);
    const list = groups.get(label) ?? [];
    list.push(m);
    groups.set(label, list);
  }

  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }));
}

// ── Page component ──────────────────────────────────────────────────────────

export default function MemoriesPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);

  const {
    memories,
    loading,
    error,
    refresh,
    deleteMemory,
    batchDelete,
    deleting,
    loadMore,
    hasMore,
    loadingMore,
  } = useMemoryTimeline({
    sort: 'created_at_desc',
    type: typeFilter === 'all' ? undefined : typeFilter,
  });

  // Group memories chronologically
  const grouped = useMemo(() => groupMemoriesByTime(memories), [memories]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleSingleDelete = useCallback(
    async (id: string) => {
      await deleteMemory(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setConfirmDeleteId(null);
    },
    [deleteMemory],
  );

  const handleBatchDelete = useCallback(async () => {
    await batchDelete(Array.from(selectedIds));
    clearSelection();
    setConfirmBatch(false);
  }, [batchDelete, selectedIds, clearSelection]);

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton variant="card" className="h-64" />
        <Skeleton variant="card" className="h-40" />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Memory Timeline
        </h1>
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-magenta">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Memory Timeline
        </h1>
        <p className="mt-1 text-text-muted">
          Browse and manage what your companion remembers.
        </p>
      </motion.div>

      {/* Type filter tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex flex-wrap gap-2"
      >
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setTypeFilter(tab.value);
              clearSelection();
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
              typeFilter === tab.value
                ? 'bg-cyan/15 text-cyan border border-cyan/30'
                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Empty state */}
      {memories.length === 0 && (
        <EmptyState
          icon="🧠"
          title="No memories yet"
          description={
            typeFilter === 'all'
              ? 'Your companion will remember things as you chat. Memories appear here over time.'
              : `No ${typeFilter} memories found. Try a different filter or keep chatting!`
          }
        />
      )}

      {/* Timeline groups */}
      <AnimatePresence mode="popLayout">
        {grouped.map((group) => (
          <motion.div
            key={group.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            {/* Group header */}
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-white/40">
              {group.label}
            </h2>

            {/* Memory cards */}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {group.items.map((memory) => (
                  <motion.div
                    key={memory.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <GlassCard
                      hover={false}
                      className={`p-4 transition-colors duration-150 ${
                        selectedIds.has(memory.id)
                          ? 'ring-1 ring-cyan/40 bg-cyan/5'
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <label className="mt-0.5 flex shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(memory.id)}
                            onChange={() => toggleSelect(memory.id)}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 text-cyan accent-cyan"
                          />
                        </label>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge color={getTypeBadgeColor(memory.type)}>
                              {memory.type}
                            </Badge>
                            <span className="text-xs text-white/30">
                              {formatRelativeTime(memory.createdAt)}
                            </span>
                            {/* Importance indicator */}
                            {memory.importance >= 8 && (
                              <span className="text-xs text-gold/70">
                                ★ High importance
                              </span>
                            )}
                          </div>
                          <p
                            className="line-clamp-3 text-sm text-white/70"
                            style={{
                              opacity: 0.5 + (memory.importance / 10) * 0.5,
                            }}
                          >
                            {memory.content}
                          </p>
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(memory.id)}
                          disabled={deleting}
                          className="shrink-0 rounded p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-magenta disabled:opacity-50"
                          aria-label="Delete memory"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {/* Batch action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-surface/95 px-6 py-3 shadow-2xl backdrop-blur-[20px]">
              <span className="text-sm text-white/60">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-white/40 hover:text-white transition-colors"
              >
                Clear
              </button>
              <Button
                variant="primary"
                size="sm"
                className="bg-magenta"
                onClick={() => setConfirmBatch(true)}
                disabled={deleting}
              >
                Forget Selected ({selectedIds.size})
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single delete confirmation */}
      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Forget Memory"
      >
        <p className="mb-6 text-sm text-white/60">
          Are you sure you want to forget this memory? Your companion will no
          longer remember this information. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="bg-magenta"
            disabled={deleting}
            onClick={() => {
              if (confirmDeleteId) handleSingleDelete(confirmDeleteId);
            }}
          >
            {deleting ? 'Forgetting...' : 'Forget'}
          </Button>
        </div>
      </Modal>

      {/* Batch delete confirmation */}
      <Modal
        open={confirmBatch}
        onClose={() => setConfirmBatch(false)}
        title="Forget Selected Memories"
      >
        <p className="mb-6 text-sm text-white/60">
          Are you sure you want to forget {selectedIds.size} memor
          {selectedIds.size === 1 ? 'y' : 'ies'}? Your companion will no longer
          remember this information. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmBatch(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="bg-magenta"
            disabled={deleting}
            onClick={handleBatchDelete}
          >
            {deleting
              ? 'Forgetting...'
              : `Forget ${selectedIds.size} Memor${selectedIds.size === 1 ? 'y' : 'ies'}`}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
