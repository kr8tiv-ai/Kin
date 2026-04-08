'use client';

// ============================================================================
// useVoiceIntro — State machine hook for 30-second voice introduction capture.
//
// Lifecycle: idle → permission → recording → processing → done/error
//
// Simpler than useVoiceSession — no wake word, no VAD, no TTS playback.
// Just a timed recording with a countdown, sent to POST /voice/intro for
// transcription and preference extraction.
//
// Falls back to text input when microphone is unavailable (micAvailable=false).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceIntroState =
  | 'idle'
  | 'permission'
  | 'recording'
  | 'processing'
  | 'done'
  | 'error';

export interface ExtractedProfile {
  displayName: string;
  interests: string[];
  goals: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  tone: 'friendly' | 'professional' | 'casual' | 'technical';
}

export interface VoiceIntroResult {
  transcript: string;
  profile: ExtractedProfile;
  confidence: number;
}

export interface UseVoiceIntroOptions {
  /** Maximum recording duration in seconds. */
  maxDurationSec?: number;
}

export interface UseVoiceIntroReturn {
  state: VoiceIntroState;
  /** Whether the browser supports getUserMedia. */
  micAvailable: boolean;
  /** Seconds remaining in the recording countdown. */
  secondsLeft: number;
  /** Start recording. Must be called from a user gesture. */
  startRecording: () => Promise<void>;
  /** Stop recording early (before timer expires). */
  stopRecording: () => void;
  /** The extraction result after processing completes. */
  result: VoiceIntroResult | null;
  /** Last error message, or null. */
  error: string | null;
  /** Reset to idle state for retry. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DURATION_SEC = 30;

/** Pick the best supported MediaRecorder MIME type. */
function getRecorderMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceIntro(
  options: UseVoiceIntroOptions = {},
): UseVoiceIntroReturn {
  const maxDurationSec = options.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;

  // State
  const [state, setState] = useState<VoiceIntroState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(maxDurationSec);
  const [result, setResult] = useState<VoiceIntroResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micAvailable, setMicAvailable] = useState(true);

  // Refs
  const mountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<VoiceIntroState>('idle');

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Check mic availability on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicAvailable(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupResources();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Release all active media resources. */
  const cleanupResources = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      try { recorderRef.current.stop(); } catch { /* may already be stopped */ }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  /** Send the recorded audio blob to the voice intro API. */
  const processAudio = useCallback(async (blob: Blob) => {
    if (!mountedRef.current) return;
    setState('processing');

    try {
      const token = Cookies.get('kin_token');
      const arrayBuffer = await blob.arrayBuffer();

      const res = await fetch('/api/voice/intro', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'audio/webm',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: arrayBuffer,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as any).error ?? `Voice intro failed: ${res.status}`,
        );
      }

      const data = (await res.json()) as VoiceIntroResult;

      if (mountedRef.current) {
        setResult(data);
        setState('done');
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        setError(message);
        setState('error');
      }
    }
  }, []);

  /** Finalize recording chunks into a blob and send for processing. */
  const finishRecording = useCallback((chunks: Blob[], mimeType: string) => {
    cleanupResources();
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      if (mountedRef.current) {
        setError('No audio recorded');
        setState('error');
      }
      return;
    }
    processAudio(blob);
  }, [cleanupResources, processAudio]);

  /** Start the countdown timer. Calls onExpired when time is up. */
  const startCountdown = useCallback((onExpired: () => void) => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
    }
    let remaining = maxDurationSec;
    setSecondsLeft(remaining);

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (mountedRef.current) {
        setSecondsLeft(remaining);
      }
      if (remaining <= 0) {
        if (countdownRef.current !== null) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        onExpired();
      }
    }, 1000);
  }, [maxDurationSec]);

  /** Request microphone permission and start recording. */
  const startRecording = useCallback(async () => {
    if (stateRef.current !== 'idle') return;

    setError(null);
    setResult(null);
    setState('permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      const recorderMime = recorder.mimeType || 'audio/webm';

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        finishRecording(chunks, recorderMime);
      };

      recorder.onerror = () => {
        if (mountedRef.current) {
          cleanupResources();
          setError('Recording failed');
          setState('error');
        }
      };

      recorder.start(250);
      setState('recording');

      // Start the countdown timer
      startCountdown(() => {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      });
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Microphone access denied';
        // If permission was denied, mark mic as unavailable for fallback
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
          setMicAvailable(false);
        }
        setError(message);
        setState('error');
      }
    }
  }, [finishRecording, cleanupResources, startCountdown]);

  /** Stop recording early (before the timer expires). */
  const stopRecording = useCallback(() => {
    if (stateRef.current !== 'recording') return;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop(); // triggers onstop → finishRecording
    }
  }, []);

  /** Reset to idle state for retry. */
  const reset = useCallback(() => {
    cleanupResources();
    setState('idle');
    setSecondsLeft(maxDurationSec);
    setResult(null);
    setError(null);
  }, [cleanupResources, maxDurationSec]);

  return {
    state,
    micAvailable,
    secondsLeft,
    startRecording,
    stopRecording,
    result,
    error,
    reset,
  };
}
