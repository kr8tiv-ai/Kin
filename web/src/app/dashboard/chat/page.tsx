'use client';

// ============================================================================
// Dashboard Chat Page — Talk to your KIN companion in real-time.
// ============================================================================

import { useState } from 'react';
import { ChatWindow } from '@/components/dashboard/ChatWindow';
import { useCompanions } from '@/hooks/useCompanions';
import { COMPANION_LIST } from '@/lib/companions';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const { companions } = useCompanions();
  const activeCompanion = companions.find((c) => c.isActive);
  const [selectedId, setSelectedId] = useState(
    activeCompanion?.companion.id ?? 'cipher',
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-6rem)]">
      {/* Companion selector */}
      <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
        {COMPANION_LIST.map((comp) => (
          <button
            key={comp.id}
            type="button"
            onClick={() => setSelectedId(comp.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
              selectedId === comp.id
                ? 'border-cyan/40 bg-cyan/10 text-cyan'
                : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70',
            )}
          >
            <span aria-hidden="true">{comp.emoji}</span>
            {comp.name}
          </button>
        ))}
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-surface overflow-hidden">
        <ChatWindow companionId={selectedId} />
      </div>
    </div>
  );
}
