'use client';

// ============================================================================
// useWakeWord — Wake word detection via Picovoice Porcupine Web SDK.
//
// Enables hands-free voice activation by listening for a keyword (default:
// "Computer"). When no Picovoice access key is configured, the hook degrades
// gracefully to a no-op so the rest of the voice pipeline still works as
// push-to-talk.
//
// The Porcupine WASM bundle (~1-2 MB) is lazy-loaded via dynamic import on
// first call to `start()`, keeping the main chunk clean.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface UseWakeWordOptions {
  /** Picovoice access key. Falls back to NEXT_PUBLIC_PICOVOICE_ACCESS_KEY env var. */
  accessKey?: string;
  /** Built-in keyword name. Default: 'Computer'. */
  keyword?: string;
  /** Callback fired when the wake word is detected. */
  onDetected: () => void;
}

export interface UseWakeWordResult {
  /** Whether Porcupine is configured (access key present) and loaded successfully. */
  isAvailable: boolean;
  /** Whether the engine is actively listening for the wake word. */
  isListening: boolean;
  /** Begin listening for the wake word. No-op if unavailable. */
  start: () => Promise<void>;
  /** Stop listening. */
  stop: () => void;
  /** Last error message, or null. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Noop result returned when Porcupine is not configured
// ---------------------------------------------------------------------------

const NOOP_ASYNC = async () => {};
const NOOP = () => {};

const UNAVAILABLE_RESULT: UseWakeWordResult = {
  isAvailable: false,
  isListening: false,
  start: NOOP_ASYNC,
  stop: NOOP,
  error: null,
};

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

/**
 * React hook for wake word detection using Picovoice Porcupine.
 *
 * Gracefully degrades to a no-op when:
 * - No access key is provided and NEXT_PUBLIC_PICOVOICE_ACCESS_KEY is unset
 * - Porcupine WASM fails to load
 * - Microphone permission is denied
 *
 * In all degraded states, `isAvailable` is `false` and `start`/`stop` are
 * safe to call (they do nothing).
 */
export function useWakeWord(options: UseWakeWordOptions): UseWakeWordResult {
  const {
    accessKey: explicitKey,
    keyword = 'Computer',
    onDetected,
  } = options;

  // Resolve access key: explicit > env var
  const accessKey = explicitKey
    ?? (typeof process !== 'undefined'
      ? process.env?.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
      : undefined)
    ?? '';

  const [isAvailable, setIsAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup — worker and callback must survive re-renders
  const workerRef = useRef<any>(null);
  const onDetectedRef = useRef(onDetected);
  const mountedRef = useRef(true);

  // Keep callback ref current without triggering re-init
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  // Track mounted state for safe async updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── stop() ────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    const worker = workerRef.current;
    if (worker) {
      worker.stop().catch(() => {});
      worker.release().catch(() => {});
      workerRef.current = null;
    }
    if (mountedRef.current) {
      setIsListening(false);
    }
  }, []);

  // ── start() ───────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!accessKey) return;

    // Stop any existing worker
    if (workerRef.current) {
      try {
        await workerRef.current.stop();
        await workerRef.current.release();
      } catch {
        // swallow — old worker may already be released
      }
      workerRef.current = null;
    }

    try {
      // Dynamic import — keeps the WASM bundle out of the main chunk
      const { PorcupineWorker, BuiltInKeyword } = await import(
        '@picovoice/porcupine-web'
      );

      // Resolve keyword: match against BuiltInKeyword enum values
      const builtInKeywords = Object.values(BuiltInKeyword) as string[];
      const resolvedKeyword = builtInKeywords.find(
        (k) => k.toLowerCase() === keyword.toLowerCase(),
      );

      if (!resolvedKeyword) {
        if (mountedRef.current) {
          setError(`Unknown built-in keyword: "${keyword}". Available: ${builtInKeywords.join(', ')}`);
          setIsAvailable(false);
        }
        return;
      }

      // The resolved keyword is a valid BuiltInKeyword string value.
      // Cast through `any` because the enum type from a dynamic import
      // isn't available as a type annotation in this scope.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const worker = await PorcupineWorker.create(
        accessKey,
        [resolvedKeyword as any],
        (_detection) => {
          onDetectedRef.current();
        },
      );

      await worker.start();

      workerRef.current = worker;

      if (mountedRef.current) {
        setIsAvailable(true);
        setIsListening(true);
        setError(null);
      }
    } catch (err) {
      // Graceful degradation: any failure → unavailable, no throw
      if (mountedRef.current) {
        const message =
          err instanceof Error ? err.message : 'Wake word initialization failed';
        setError(message);
        setIsAvailable(false);
        setIsListening(false);
      }
    }
  }, [accessKey, keyword]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const worker = workerRef.current;
      if (worker) {
        worker.stop().catch(() => {});
        worker.release().catch(() => {});
        workerRef.current = null;
      }
    };
  }, []);

  // ── Early return for unconfigured state ───────────────────────────────
  if (!accessKey) {
    return UNAVAILABLE_RESULT;
  }

  return { isAvailable, isListening, start, stop, error };
}
