'use client';

// ============================================================================
// Dashboard Chat Page — Talk to your KIN companion in real-time.
// Includes conversation sidebar for browsing/switching past conversations.
// ============================================================================

import { useState, useCallback } from 'react';
import { ChatWindow } from '@/components/dashboard/ChatWindow';
import { useCompanions } from '@/hooks/useCompanions';
import { useConversations } from '@/hooks/useConversations';
import { COMPANION_LIST } from '@/lib/companions';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const { companions } = useCompanions();
  const { conversations, refresh: refreshConversations } = useConversations();
  const activeCompanion = companions.find((c) => c.isActive);
  const [selectedId, setSelectedId] = useState(
    activeCompanion?.companion.id ?? 'cipher',
  );
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter conversations for current companion
  const companionConversations = conversations.filter(
    (c) => c.companionId === selectedId,
  );

  const handleSelectConversation = useCallback((convoId: string) => {
    setSelectedConvoId(convoId);
    setSidebarOpen(false);
    // Store in sessionStorage so useChat picks it up
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`kin_convo_${selectedId}`, convoId);
    }
    // Force re-mount ChatWindow by changing key
  }, [selectedId]);

  const handleNewChat = useCallback(() => {
    setSelectedConvoId(`new-${Date.now()}`);
    setSidebarOpen(false);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(`kin_convo_${selectedId}`);
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      {/* Companion selector — only show if user owns more than one */}
      {companions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {companions.map(({ companion: comp }) => {
            const data = COMPANION_LIST.find((c) => c.id === comp.id);
            if (!data) return null;
            return (
              <button
                key={data.id}
                type="button"
                onClick={() => {
                  setSelectedId(data.id);
                  setSelectedConvoId(null);
                }}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  selectedId === data.id
                    ? 'border-cyan/40 bg-cyan/10 text-cyan'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70',
                )}
              >
                {data.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Conversation sidebar */}
        <div
          className={cn(
            'shrink-0 rounded-xl border border-white/10 bg-surface flex flex-col overflow-hidden transition-all duration-200',
            sidebarOpen ? 'w-64' : 'w-10',
          )}
        >
          {/* Toggle button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center h-10 border-b border-white/10 text-white/40 hover:text-white/70 transition-colors"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? (
                <path d="M15 18l-6-6 6-6" />
              ) : (
                <path d="M9 18l6-6-6-6" />
              )}
            </svg>
          </button>

          {sidebarOpen && (
            <>
              {/* New chat button */}
              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-2 mx-2 mt-2 px-3 py-2 rounded-lg border border-dashed border-white/10 text-xs text-white/50 hover:border-cyan/30 hover:text-cyan transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New conversation
              </button>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {companionConversations.length === 0 && (
                  <p className="text-[11px] text-white/20 px-2 py-4 text-center">
                    No previous conversations
                  </p>
                )}
                {companionConversations.map((convo) => (
                  <button
                    key={convo.id}
                    type="button"
                    onClick={() => handleSelectConversation(convo.id)}
                    className={cn(
                      'w-full text-left rounded-lg px-3 py-2 transition-colors',
                      selectedConvoId === convo.id
                        ? 'bg-cyan/10 border border-cyan/20'
                        : 'hover:bg-white/5 border border-transparent',
                    )}
                  >
                    <p className="text-xs text-white/70 truncate">
                      {convo.title || 'Untitled'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono mt-0.5">
                      {convo.messageCount} msgs · {new Date(convo.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-surface overflow-hidden">
          <ChatWindow key={selectedConvoId ?? selectedId} companionId={selectedId} />
        </div>
      </div>
    </div>
  );
}
