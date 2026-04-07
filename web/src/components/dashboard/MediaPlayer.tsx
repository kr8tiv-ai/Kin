'use client';

// ============================================================================
// MediaPlayer — Inline video/audio player for chat messages.
// Renders HTML5 <video> or <audio> with loading/error states,
// styled to match the KIN dark-premium design system.
// ============================================================================

import { useState, useCallback, type SyntheticEvent } from 'react';
import { cn } from '@/lib/utils';

interface MediaPlayerProps {
  url: string;
  type: 'video' | 'audio';
  className?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

export function MediaPlayer({ url, type, className }: MediaPlayerProps) {
  const [state, setState] = useState<LoadState>('loading');

  const handleLoadedData = useCallback(() => setState('ready'), []);
  const handleError = useCallback(() => setState('error'), []);
  const handleCanPlay = useCallback(
    (e: SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
      // Some browsers fire canplay before loadeddata — handle both
      if (state === 'loading') setState('ready');
    },
    [state],
  );

  if (type === 'video') {
    return (
      <div className={cn('relative w-full max-w-lg', className)}>
        {/* Loading skeleton */}
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-2 text-white/30 text-xs">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="animate-spin"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Loading video…
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="flex items-center gap-2 rounded-xl bg-magenta/5 border border-magenta/10 px-4 py-3 text-xs text-magenta/70">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Video failed to load
          </div>
        )}

        {/* Video element */}
        <video
          src={url}
          controls
          preload="metadata"
          onLoadedData={handleLoadedData}
          onCanPlay={handleCanPlay}
          onError={handleError}
          className={cn(
            'w-full rounded-xl border border-white/5 bg-black/40',
            state === 'loading' && 'invisible h-0',
            state === 'error' && 'hidden',
          )}
        />
      </div>
    );
  }

  // Audio player
  return (
    <div
      className={cn(
        'w-full max-w-lg rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm px-4 py-3',
        className,
      )}
    >
      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-white/30 text-xs mb-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-spin"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Loading audio…
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex items-center gap-2 text-xs text-magenta/70">
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Audio failed to load
        </div>
      )}

      {/* Waveform-like visual hint row */}
      {state !== 'error' && (
        <div className="flex items-center gap-1.5 mb-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-cyan/50 shrink-0"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <div className="flex items-end gap-[2px] h-4">
            {[3, 5, 8, 4, 7, 6, 9, 5, 3, 6, 8, 4, 7, 5, 3].map((h, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-cyan/20"
                style={{ height: `${h * 1.5}px` }}
              />
            ))}
          </div>
          <span className="ml-auto text-[10px] font-mono text-white/20">audio</span>
        </div>
      )}

      {/* Audio element */}
      <audio
        src={url}
        controls
        preload="metadata"
        onLoadedData={handleLoadedData}
        onCanPlay={handleCanPlay}
        onError={handleError}
        className={cn(
          'w-full h-8 [&::-webkit-media-controls-panel]:bg-transparent',
          state === 'error' && 'hidden',
        )}
      />
    </div>
  );
}
