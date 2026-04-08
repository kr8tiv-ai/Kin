'use client';

// ============================================================================
// CanvasChat — Prompt input with generation history for Live Canvas.
//
// Renders a scrollable history of user prompts above a fixed-bottom input
// area with a send button. Styled with KIN design tokens.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { COLORS, RADII } from '@/lib/design-tokens';

// ============================================================================
// Types
// ============================================================================

interface CanvasChatProps {
  onSend: (prompt: string) => void;
  isGenerating: boolean;
  history: Array<{ prompt: string; html: string }>;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CanvasChat({
  onSend,
  isGenerating,
  history,
  className,
}: CanvasChatProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history when new entries appear
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  // Auto-focus input after generation completes
  const prevGenerating = useRef(isGenerating);
  useEffect(() => {
    if (prevGenerating.current && !isGenerating) {
      textareaRef.current?.focus();
    }
    prevGenerating.current = isGenerating;
  }, [isGenerating]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    onSend(trimmed);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isGenerating, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      style={{ background: COLORS.surface }}
    >
      {/* ── History ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-sm" style={{ color: COLORS.textMuted }}>
                Describe what you want to build
              </p>
              <p className="text-xs" style={{ color: COLORS.textFaint }}>
                e.g. &ldquo;Build me a portfolio site with a dark theme&rdquo;
              </p>
            </div>
          </div>
        )}

        {history.map((entry, i) => (
          <div key={i} className="flex justify-end">
            <div
              className="max-w-[85%] px-3 py-2 text-sm"
              style={{
                background: 'rgba(0,240,255,0.08)',
                border: `1px solid rgba(0,240,255,0.15)`,
                borderRadius: RADII.sm,
                color: COLORS.text,
              }}
            >
              {entry.prompt}
            </div>
          </div>
        ))}

        <div ref={historyEndRef} />
      </div>

      {/* ── Input area ──────────────────────────────────────────────── */}
      <div
        className="shrink-0 p-3 border-t"
        style={{ borderColor: COLORS.border }}
      >
        <div
          className="flex items-end gap-2 p-2 rounded-lg border"
          style={{
            background: COLORS.glassBg,
            borderColor: COLORS.border,
            borderRadius: RADII.sm,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build or change…"
            rows={1}
            disabled={isGenerating}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm outline-none',
              'placeholder:text-white/30',
              isGenerating && 'opacity-50 cursor-not-allowed',
            )}
            style={{
              color: COLORS.text,
              minHeight: '36px',
              maxHeight: '120px',
            }}
          />

          <button
            onClick={handleSend}
            disabled={isGenerating || !input.trim()}
            className={cn(
              'shrink-0 w-8 h-8 flex items-center justify-center rounded-md',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50',
              isGenerating || !input.trim()
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-white/10 active:scale-95',
            )}
            style={{ color: COLORS.cyan }}
            title={isGenerating ? 'Generating…' : 'Send prompt'}
          >
            {isGenerating ? (
              // Spinner
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity="0.3"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              // Send arrow
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
