'use client';

// ============================================================================
// CommandPaletteWrapper -- Manages global Cmd+K listener and conversation data.
// Renders the CommandPalette overlay on all dashboard pages.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CommandPalette, type CommandPaletteConversation } from './CommandPalette';
import { kinApi } from '@/lib/api';

export function CommandPaletteWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<CommandPaletteConversation[]>([]);
  const router = useRouter();

  // Listen for Cmd+K / Ctrl+K globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch conversations when the palette opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function fetchConversations() {
      try {
        const data = await kinApi.get<{ conversations: Array<{ id: string; companionId: string; title: string; updatedAt: string; messagePreview?: string }> }>('/conversations');

        if (cancelled) return;

        // Map API response to the shape CommandPalette expects
        const mapped: CommandPaletteConversation[] = (
          data.conversations ?? data ?? []
        ).map(
          (c: {
            id: string;
            companionId: string;
            title: string;
            updatedAt: string;
            messagePreview?: string;
          }) => ({
            id: c.id,
            companionId: c.companionId,
            title: c.title,
            updatedAt: c.updatedAt,
            messagePreview: c.messagePreview,
          }),
        );

        setConversations(mapped);
      } catch {
        // Silently handle fetch errors -- the palette gracefully shows empty state
      }
    }

    fetchConversations();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleSelect = useCallback(
    (conversationId: string) => {
      setIsOpen(false);
      router.push(`/dashboard/chat/${conversationId}`);
    },
    [router],
  );

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={handleClose}
      conversations={conversations}
      onSelect={handleSelect}
    />
  );
}
