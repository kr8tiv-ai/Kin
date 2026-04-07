'use client';

// ============================================================================
// useVoiceSession — State machine hook for end-to-end voice conversation.
//
// Lifecycle: idle → listening (wake word) → recording → processing → playing → listening
//
// Composes:
//   - useWakeWord (T02)  — hands-free activation via Picovoice Porcupine
//   - MediaRecorder       — audio capture from getUserMedia
//   - POST /api/voice/conversation (T01) — transcribe → companion → TTS
//   - HTMLAudioElement    — response audio playback
//
// Falls back to push-to-talk when wake word is unavailable.
// Includes simple energy-based VAD for auto-stop on silence.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { useWakeWord } from './useWakeWord';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'recording'
  | 'processing'
  | 'playing';

export interface UseVoiceSessionOptions {
  companionId: string;
  /** Called when user speech is transcribed. */
  onTranscription?: (text: string) => void;
  /** Called when the companion responds. */
  onResponse?: (text: string) => void;
  /** Called on any error during the voice pipeline. */
  onError?: (error: string) => void;
}

export interface UseVoiceSessionResult {
  state: VoiceSessionState;
  /** True when any state other than 'idle'. */
  isActive: boolean;
  /** Whether wake word detection is available (Porcupine configured). */
  wakeWordAvailable: boolean;
  /** Enter listening/recording mode. Must be called from a user gesture. */
  startSession: () => Promise<void>;
  /** Return to idle, releasing all resources. */
  stopSession: () => void;
  /** Manual push-to-talk: start or stop recording. */
  toggleRecording: () => void;
  /** Last error message, or null. */
  error: string | null;
  /** Last transcription from the user's speech. */
  lastTranscription: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RMS energy below this threshold counts as silence. */
const VAD_SILENCE_THRESHOLD = 0.01;
/** Consecutive seconds of silence before auto-stopping recording. */
const VAD_SILENCE_DURATION_S = 1.5;
/** Interval (ms) between VAD energy samples. */
const VAD_SAMPLE_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Fallback — let the browser pick
  return '';
}

/** Convert a base64 audio string to a playable blob URL. */
function base64ToBlobUrl(base64: string, format: string): string {
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    opus: 'audio/opus',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
  };
  const mime = mimeMap[format] ?? 'audio/mpeg';
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  const blob = new Blob([buffer], { type: mime });
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceSession(
  options: UseVoiceSessionOptions,
): UseVoiceSessionResult {
  const { companionId, onTranscription, onResponse, onError } = options;

  // ── State ───────────────────────────────────────────────────────────────
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastTranscription, setLastTranscription] = useState<string | null>(null);

  // ── Refs (survive re-renders, no dependency churn) ──────────────────────
  const mountedRef = useRef(true);
  const stateRef = useRef<VoiceSessionState>('idle');
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const companionIdRef = useRef(companionId);
  const callbacksRef = useRef({ onTranscription, onResponse, onError });

  // Keep refs current
  useEffect(() => {
    companionIdRef.current = companionId;
  }, [companionId]);
  useEffect(() => {
    callbacksRef.current = { onTranscription, onResponse, onError };
  }, [onTranscription, onResponse, onError]);

  // Sync stateRef with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Wake word integration ───────────────────────────────────────────────
  const handleWakeWordDetected = useCallback(() => {
    // Only transition to recording if we're currently listening for wake word
    if (stateRef.current === 'listening') {
      startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wakeWord = useWakeWord({
    onDetected: handleWakeWordDetected,
  });

  // ── Helpers: safe state transitions ─────────────────────────────────────

  const safeSetState = useCallback((next: VoiceSessionState) => {
    if (mountedRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const safeSetError = useCallback((msg: string) => {
    if (mountedRef.current) {
      setError(msg);
      callbacksRef.current.onError?.(msg);
    }
  }, []);

  // ── VAD: energy-based silence detection ─────────────────────────────────

  const stopVad = useCallback(() => {
    if (vadTimerRef.current !== null) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  }, []);

  /** Start sampling RMS energy; calls `onSilence` when silence exceeds threshold duration. */
  const startVad = useCallback(
    (onSilence: () => void) => {
      stopVad();
      const analyser = analyserRef.current;
      if (!analyser) return;

      const dataArray = new Float32Array(analyser.fftSize);
      let silentSamples = 0;
      const silentSamplesNeeded = Math.ceil(
        (VAD_SILENCE_DURATION_S * 1000) / VAD_SAMPLE_INTERVAL_MS,
      );

      vadTimerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);

        // Compute RMS energy
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms < VAD_SILENCE_THRESHOLD) {
          silentSamples++;
          if (silentSamples >= silentSamplesNeeded) {
            onSilence();
          }
        } else {
          silentSamples = 0;
        }
      }, VAD_SAMPLE_INTERVAL_MS);
    },
    [stopVad],
  );

  // ── Audio stream acquisition ────────────────────────────────────────────

  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }, []);

  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── AudioContext + AnalyserNode setup ───────────────────────────────────

  const ensureAudioContext = useCallback((stream: MediaStream) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;
  }, []);

  // ── Recording ───────────────────────────────────────────────────────────

  /** Finalize recording: stop MediaRecorder, stop VAD, send audio for processing. */
  const finishRecording = useCallback(
    (chunks: Blob[]) => {
      stopVad();
      const mimeType = recorderRef.current?.mimeType ?? 'audio/webm';
      recorderRef.current = null;

      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size === 0) {
        safeSetError('No audio recorded');
        safeSetState('idle');
        return;
      }

      // Transition to processing
      safeSetState('processing');
      processAudio(blob);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopVad, safeSetState, safeSetError],
  );

  /** Start capturing audio via MediaRecorder with VAD. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Stop wake word while recording (Porcupine and MediaRecorder
      // can share the stream, but pausing Porcupine avoids contention).
      wakeWord.stop();

      const stream = await acquireStream();
      ensureAudioContext(stream);

      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        finishRecording(chunks);
      };
      recorder.onerror = () => {
        safeSetError('Recording failed');
        safeSetState('idle');
      };

      recorder.start(250); // collect data every 250ms for smoother chunking
      safeSetState('recording');

      // Start VAD for auto-stop on silence
      startVad(() => {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to start recording';
      safeSetError(message);
      safeSetState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquireStream, ensureAudioContext, finishRecording, safeSetError, safeSetState, startVad, wakeWord.stop]);

  // ── Processing: send audio to the conversation API ──────────────────────

  const processAudio = useCallback(
    async (blob: Blob) => {
      try {
        const token = Cookies.get('kin_token');
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('companionId', companionIdRef.current);

        const res = await fetch('/api/voice/conversation', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as any).error ?? `Voice conversation failed: ${res.status}`,
          );
        }

        const data = (await res.json()) as {
          transcription: string;
          response: string;
          audio: string;
          audioFormat: string;
          timings: { transcribeMs: number; inferenceMs: number; synthesizeMs: number };
        };

        if (!mountedRef.current) return;

        // Surface transcription
        setLastTranscription(data.transcription);
        callbacksRef.current.onTranscription?.(data.transcription);
        callbacksRef.current.onResponse?.(data.response);

        // Play the response audio
        playResponseAudio(data.audio, data.audioFormat);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Voice conversation failed';
        safeSetError(message);
        safeSetState('idle');
      }
    },
    [safeSetError, safeSetState],
  );

  // ── Playback ────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playResponseAudio = useCallback(
    (base64Audio: string, format: string) => {
      // Clean up any previous playback
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      const url = base64ToBlobUrl(base64Audio, format);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioElementRef.current = audio;
      safeSetState('playing');

      audio.onended = () => {
        audioElementRef.current = null;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        // If wake word is available, loop back to listening; else idle
        if (wakeWord.isAvailable && mountedRef.current) {
          safeSetState('listening');
          wakeWord.start().catch(() => {});
        } else {
          safeSetState('idle');
        }
      };

      audio.onerror = () => {
        audioElementRef.current = null;
        safeSetError('Audio playback failed');
        safeSetState('idle');
      };

      audio.play().catch(() => {
        safeSetError('Browser blocked audio playback — tap to enable');
        safeSetState('idle');
      });
    },
    [safeSetState, safeSetError, wakeWord.isAvailable, wakeWord.start],
  );

  // ── Public API ──────────────────────────────────────────────────────────

  /** Enter the voice session. Must be triggered by a user gesture (click). */
  const startSession = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    setError(null);

    if (wakeWord.isAvailable) {
      // Acquire mic early (user gesture grants permission)
      try {
        await acquireStream();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Microphone access denied';
        safeSetError(message);
        return;
      }
      safeSetState('listening');
      await wakeWord.start();
    } else {
      // No wake word — wait for manual toggleRecording()
      // Pre-acquire the stream on the user gesture so subsequent
      // toggleRecording calls don't hit permission prompts.
      try {
        await acquireStream();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Microphone access denied';
        safeSetError(message);
        return;
      }
      // Stay idle — the UI should show a push-to-talk button.
      // We keep the stream acquired so toggleRecording is instant.
    }
  }, [acquireStream, safeSetError, safeSetState, wakeWord]);

  /** Return to idle, tearing down all active resources. */
  const stopSession = useCallback(() => {
    // Stop recording
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    // Stop VAD
    stopVad();

    // Stop wake word
    wakeWord.stop();

    // Stop playback
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }

    // Revoke blob URLs
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    // Release mic stream
    releaseStream();

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    safeSetState('idle');
  }, [stopVad, wakeWord, releaseStream, safeSetState]);

  /** Manual push-to-talk toggle. */
  const toggleRecording = useCallback(() => {
    const current = stateRef.current;

    if (current === 'recording') {
      // Stop recording — finishRecording fires via onstop handler
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    } else if (current === 'idle' || current === 'listening') {
      startRecording();
    }
    // In processing/playing states, ignore toggle
  }, [startRecording]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      // Tear down everything
      if (recorderRef.current?.state === 'recording') {
        try {
          recorderRef.current.stop();
        } catch {
          // may already be stopped
        }
      }
      recorderRef.current = null;

      if (vadTimerRef.current !== null) {
        clearInterval(vadTimerRef.current);
        vadTimerRef.current = null;
      }

      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    state,
    isActive: state !== 'idle',
    wakeWordAvailable: wakeWord.isAvailable,
    startSession,
    stopSession,
    toggleRecording,
    error,
    lastTranscription,
  };
}
