'use client';

// ============================================================================
// Dashboard Chat Page - Talk to your KIN companion in real-time.
// Includes a conversation sidebar for browsing and switching past chats.
// ============================================================================

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChatWindow } from '@/components/dashboard/ChatWindow';
import { useCompanions } from '@/hooks/useCompanions';
import { useConversations } from '@/hooks/useConversations';
import { COMPANION_LIST } from '@/lib/companions';
import { resolveInitialChatSelection } from '@/lib/chat-launch';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const { companions, loading: companionsLoading } = useCompanions();
  const { conversations } = useConversations();
  const activeCompanion = companions.find((companion) => companion.isActive);
  const defaultCompanionId = useMemo(
    () => activeCompanion?.companion.id ?? companions[0]?.companion.id ?? 'cipher',
    [activeCompanion?.companion.id, companions],
  );

  const [selectedId, setSelectedId] = useState('cipher');
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatResetKey, setChatResetKey] = useState(0);
  const hasInitializedSelection = useRef(false);

  useEffect(() => {
    if (hasInitializedSelection.current || companionsLoading || typeof window === 'undefined') {
      return;
    }

    const initialSelection = resolveInitialChatSelection(
      window.location.search,
      defaultCompanionId,
    );

    startTransition(() => {
      setSelectedId(initialSelection.companionId);
      setSelectedConvoId(initialSelection.conversationId);
    });

    hasInitializedSelection.current = true;
  }, [companionsLoading, defaultCompanionId]);

  useEffect(() => {
    if (!hasInitializedSelection.current || companions.length === 0) return;

    const selectedStillAvailable = companions.some(
      ({ companion }) => companion.id === selectedId,
    );

    if (!selectedStillAvailable) {
      startTransition(() => {
        setSelectedId(defaultCompanionId);
        setSelectedConvoId(null);
        setChatResetKey((current) => current + 1);
      });
    }
  }, [companions, defaultCompanionId, selectedId]);

  const companionConversations = useMemo(
    () => conversations.filter(
      (conversation) => conversation.companionId === selectedId,
    ),
    [conversations, selectedId],
  );

  const handleSelectConversation = useCallback((convoId: string) => {
    startTransition(() => {
      setSelectedConvoId(convoId);
      setSidebarOpen(false);
    });
  }, []);

  const handleNewChat = useCallback(() => {
    startTransition(() => {
      setSelectedConvoId(null);
      setSidebarOpen(false);
      setChatResetKey((current) => current + 1);
    });

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(`kin_convo_${selectedId}`);
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      {companions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {companions.map(({ companion }) => {
            const data = COMPANION_LIST.find((entry) => entry.id === companion.id);
            if (!data) return null;

            return (
              <button
                key={data.id}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setSelectedId(data.id);
                    setSelectedConvoId(null);
                  });
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
        <div
          className={cn(
            'shrink-0 rounded-xl border border-white/10 bg-surface flex flex-col overflow-hidden transition-all duration-200',
            sidebarOpen ? 'w-64' : 'w-10',
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="flex items-center justify-center h-10 border-b border-white/10 text-white/40 hover:text-white/70 transition-colors"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {sidebarOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
            </svg>
          </button>

          {sidebarOpen && (
            <>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-2 mx-2 mt-2 px-3 py-2 rounded-lg border border-dashed border-white/10 text-xs text-white/50 hover:border-cyan/30 hover:text-cyan transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New conversation
              </button>

              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                {companionConversations.length === 0 && (
                  <p className="text-[11px] text-white/20 px-2 py-4 text-center">
                    No previous conversations
                  </p>
                )}

                {companionConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={cn(
                      'w-full text-left rounded-lg px-3 py-2 transition-colors',
                      selectedConvoId === conversation.id
                        ? 'bg-cyan/10 border border-cyan/20'
                        : 'hover:bg-white/5 border border-transparent',
                    )}
                  >
                    <p className="text-xs text-white/70 truncate">
                      {conversation.title || 'Untitled'}
                    </p>
                    <p className="text-[10px] text-white/30 font-mono mt-0.5">
                      {conversation.messageCount} msgs ·{' '}
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-surface overflow-hidden">
          <ChatWindow
            key={`${selectedId}:${selectedConvoId ?? 'stored'}:${chatResetKey}`}
            companionId={selectedId}
          />
        </div>
      </div>
    </div>
  );
}
