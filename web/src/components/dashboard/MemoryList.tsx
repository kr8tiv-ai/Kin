'use client';

// ============================================================================
// MemoryList — Display and manage stored memories with delete support.
// ============================================================================

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';
import type { Memory } from '@/lib/types';

interface MemoryListProps {
  memories: Memory[];
  onDelete: (id: string) => Promise<void>;
  deleting: string | null;
}

function getTypeBadgeColor(type: Memory['type']): 'cyan' | 'magenta' | 'gold' | 'muted' {
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

export function MemoryList({ memories, onDelete, deleting }: MemoryListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <svg
          className="mb-3 h-10 w-10 text-white/20"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <p className="text-sm text-white/40">
          No memories stored yet. Your companion will remember things as you
          chat.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-white/5">
        {memories.map((memory) => (
          <div
            key={memory.id}
            className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <Badge color={getTypeBadgeColor(memory.type)}>
                  {memory.type}
                </Badge>
                <span className="text-xs text-white/30">
                  {formatDate(memory.createdAt)}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-white/70">
                {memory.content}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmId(memory.id)}
              disabled={deleting === memory.id}
              className="shrink-0 text-white/40 hover:text-magenta"
            >
              {deleting === memory.id ? (
                'Deleting...'
              ) : (
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
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="Delete Memory"
      >
        <p className="mb-6 text-sm text-white/60">
          Are you sure you want to delete this memory? Your companion will no
          longer remember this information. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmId(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="bg-magenta"
            onClick={async () => {
              if (confirmId) {
                await onDelete(confirmId);
                setConfirmId(null);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}
