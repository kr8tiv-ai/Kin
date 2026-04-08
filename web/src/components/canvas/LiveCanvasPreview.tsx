'use client';

// ============================================================================
// LiveCanvasPreview — Sandboxed iframe preview for generated HTML.
//
// Security: sandbox="allow-scripts" WITHOUT allow-same-origin prevents
// generated code from accessing parent page cookies, localStorage, or DOM.
//
// Features:
//   - Device toggle (mobile 375px / tablet 768px / desktop 100%)
//   - Loading overlay with pulse animation when generating without content
//   - Translucent "Updating..." overlay when regenerating with existing content
// ============================================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { COLORS, RADII } from '@/lib/design-tokens';

// ============================================================================
// Types
// ============================================================================

type DeviceMode = 'mobile' | 'tablet' | 'desktop';

interface LiveCanvasPreviewProps {
  html: string;
  isGenerating: boolean;
  className?: string;
}

// ============================================================================
// Device presets
// ============================================================================

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  mobile: '375px',
  tablet: '768px',
  desktop: '100%',
};

const DEVICE_LABELS: Record<DeviceMode, { label: string; icon: string }> = {
  mobile: { label: 'Mobile', icon: '📱' },
  tablet: { label: 'Tablet', icon: '📋' },
  desktop: { label: 'Desktop', icon: '🖥️' },
};

// ============================================================================
// Component
// ============================================================================

export function LiveCanvasPreview({
  html,
  isGenerating,
  className,
}: LiveCanvasPreviewProps) {
  const [device, setDevice] = useState<DeviceMode>('desktop');

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      style={{ background: COLORS.surface }}
    >
      {/* ── Device toggle toolbar ──────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-3 py-2 border-b shrink-0"
        style={{ borderColor: COLORS.border }}
      >
        <span
          className="text-xs font-medium mr-2 select-none"
          style={{ color: COLORS.textMuted }}
        >
          Preview
        </span>

        {(Object.keys(DEVICE_WIDTHS) as DeviceMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setDevice(mode)}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              device === mode
                ? 'font-medium'
                : 'hover:bg-white/5',
            )}
            style={{
              color: device === mode ? COLORS.cyan : COLORS.textMuted,
              background: device === mode ? 'rgba(0,240,255,0.1)' : 'transparent',
              borderRadius: RADII.sm,
            }}
            title={DEVICE_LABELS[mode].label}
          >
            <span className="mr-1">{DEVICE_LABELS[mode].icon}</span>
            {DEVICE_LABELS[mode].label}
          </button>
        ))}

        {/* Generating indicator */}
        {isGenerating && (
          <span
            className="ml-auto text-xs flex items-center gap-1.5"
            style={{ color: COLORS.cyan }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: COLORS.cyan }} />
            Generating…
          </span>
        )}
      </div>

      {/* ── Preview area ───────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-auto flex items-start justify-center p-4">
        {/* Loading state — no HTML yet */}
        {isGenerating && !html && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-10 h-10 rounded-full animate-pulse"
                style={{
                  background: `linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.magenta})`,
                  opacity: 0.6,
                }}
              />
              <span className="text-sm" style={{ color: COLORS.textMuted }}>
                Generating preview…
              </span>
            </div>
          </div>
        )}

        {/* Iframe container with device width */}
        {html && (
          <div
            className="relative h-full transition-all duration-300"
            style={{
              width: DEVICE_WIDTHS[device],
              maxWidth: '100%',
            }}
          >
            {/* Updating overlay — content visible underneath */}
            {isGenerating && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(1px)',
                  borderRadius: RADII.sm,
                }}
              >
                <span
                  className="text-sm font-medium px-3 py-1.5 rounded-full"
                  style={{
                    background: 'rgba(0,0,0,0.7)',
                    color: COLORS.cyan,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  Updating…
                </span>
              </div>
            )}

            <iframe
              sandbox="allow-scripts"
              srcDoc={html}
              title="Canvas preview"
              className="w-full h-full border"
              style={{
                borderColor: COLORS.border,
                borderRadius: RADII.sm,
                background: '#ffffff',
                minHeight: '400px',
              }}
            />
          </div>
        )}

        {/* Empty state — no HTML, not generating */}
        {!html && !isGenerating && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: COLORS.textFaint }}>
              Tell Cipher what to build to see a preview here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
