'use client';

// ============================================================================
// useCanvasStream — SSE streaming hook for Live Canvas HTML generation.
//
// Mirrors the useChat SSE pattern but parses typed canvas events:
//   code_chunk   — incremental HTML token
//   preview_ready — full accumulated HTML on completion
//   done         — terminal success event
//   error        — terminal error event
//
// Features:
//   - Debounced HTML updates (500ms) to avoid excessive re-renders during streaming
//   - Generation history for iterative refinement tracking
//   - AbortController support for cancelling in-flight generation
//   - Auth via kin_token cookie (same pattern as useChat)
// ============================================================================

import { useCallback, useRef, useState } from 'react';
import Cookies from 'js-cookie';

// ============================================================================
// Types
// ============================================================================

export type CanvasStatus = 'idle' | 'generating' | 'done' | 'error';

export interface GenerationEntry {
  prompt: string;
  html: string;
}

interface CanvasEvent {
  type: 'code_chunk' | 'preview_ready' | 'done' | 'error';
  content?: string;
  html?: string;
  projectId?: string;
  message?: string;
}

export interface UseCanvasStreamResult {
  html: string;
  status: CanvasStatus;
  isGenerating: boolean;
  error: string | null;
  generationHistory: GenerationEntry[];
  generate: (projectId: string, prompt: string, existingCode?: string) => void;
  clear: () => void;
  abort: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useCanvasStream(): UseCanvasStreamResult {
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState<CanvasStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<GenerationEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    abort();
    setHtml('');
    setStatus('idle');
    setError(null);
    setGenerationHistory([]);
  }, [abort]);

  const generate = useCallback(
    (projectId: string, prompt: string, existingCode?: string) => {
      // Cancel any in-flight generation
      abort();

      setError(null);
      setStatus('generating');

      const controller = new AbortController();
      abortRef.current = controller;

      const token = Cookies.get('kin_token');
      const apiBase = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL ?? '/api');

      // Accumulator lives outside React state to avoid stale closures
      let accumulated = '';

      const run = async () => {
        try {
          const response = await fetch(`${apiBase}/canvas/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ projectId, prompt, existingCode }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            let errMsg = `Generation failed: ${response.status}`;
            try {
              const parsed = JSON.parse(text);
              if (parsed.error) errMsg = parsed.error;
            } catch { /* use default */ }
            setError(errMsg);
            setStatus('error');
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const json = line.slice(6).trim();
              if (!json) continue;

              try {
                const event: CanvasEvent = JSON.parse(json);

                switch (event.type) {
                  case 'code_chunk':
                    if (event.content) {
                      accumulated += event.content;
                      // Debounced state update — 500ms
                      const snapshot = accumulated;
                      if (debounceRef.current) clearTimeout(debounceRef.current);
                      debounceRef.current = setTimeout(() => {
                        setHtml(snapshot);
                        debounceRef.current = null;
                      }, 500);
                    }
                    break;

                  case 'preview_ready':
                    // Final HTML — flush immediately, cancel pending debounce
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current);
                      debounceRef.current = null;
                    }
                    if (event.html) {
                      accumulated = event.html;
                      setHtml(event.html);
                    }
                    break;

                  case 'done':
                    setStatus('done');
                    // Record in history
                    setGenerationHistory((prev) => [
                      ...prev,
                      { prompt, html: accumulated },
                    ]);
                    break;

                  case 'error':
                    setError(event.message ?? 'Generation failed');
                    setStatus('error');
                    break;
                }
              } catch {
                // Malformed SSE line — skip
              }
            }
          }

          // If stream ended without a done/error event, flush accumulated HTML
          if (status !== 'error') {
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            setHtml(accumulated);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            // User cancelled — leave status as-is, don't overwrite with error
            setStatus('idle');
            return;
          }
          const message = err instanceof Error ? err.message : 'Generation failed';
          setError(message);
          setStatus('error');
        }
      };

      run();
    },
    [abort, status],
  );

  return {
    html,
    status,
    isGenerating: status === 'generating',
    error,
    generationHistory,
    generate,
    clear,
    abort,
  };
}
