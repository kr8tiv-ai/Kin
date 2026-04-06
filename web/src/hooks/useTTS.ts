'use client';

// ============================================================================
// useTTS — Hook for text-to-speech playback of companion messages.
//
// Calls POST /voice/tts and plays the returned audio buffer via Web Audio API.
// Supports play/pause/stop and caches audio per message ID.
// ============================================================================

import { useCallback, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { track } from '@/lib/analytics';

interface UseTTSResult {
  /** Play TTS for a message */
  speak: (messageId: string, text: string, companionId: string) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Currently playing message ID */
  playingId: string | null;
  /** Loading state (synthesizing) */
  loading: boolean;
  /** Error message */
  error: string | null;
}

// In-memory audio cache: messageId -> audio blob URL
const audioCache = new Map<string, string>();

export function useTTS(): UseTTSResult {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const speak = useCallback(
    async (messageId: string, text: string, companionId: string) => {
      // If already playing this message, stop it
      if (playingId === messageId) {
        stop();
        return;
      }

      // Stop any current playback
      stop();
      setError(null);

      // Check cache first
      let blobUrl = audioCache.get(messageId);

      if (!blobUrl) {
        setLoading(true);

        try {
          const token = Cookies.get('kin_token');
          const apiBase = typeof window !== 'undefined' ? '/api' : '/api';

          const response = await fetch(`${apiBase}/voice/tts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              text: text.slice(0, 5000), // API max
              companionId,
            }),
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(
              (errBody as any).error ?? (errBody as any).hint ?? `TTS failed: ${response.status}`,
            );
          }

          const audioBlob = await response.blob();
          blobUrl = URL.createObjectURL(audioBlob);
          audioCache.set(messageId, blobUrl);

          track('tts_synthesized', { companionId, textLength: text.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'TTS failed';
          setError(message);
          setLoading(false);
          return;
        } finally {
          setLoading(false);
        }
      }

      // Play audio
      const audio = new Audio(blobUrl);
      audioRef.current = audio;
      setPlayingId(messageId);

      audio.onended = () => {
        setPlayingId(null);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setError('Audio playback failed');
        setPlayingId(null);
        audioRef.current = null;
      };

      try {
        await audio.play();
      } catch {
        setError('Browser blocked audio playback');
        setPlayingId(null);
        audioRef.current = null;
      }
    },
    [playingId, stop],
  );

  return { speak, stop, playingId, loading, error };
}
