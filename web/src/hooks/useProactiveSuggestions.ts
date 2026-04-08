'use client';

// ============================================================================
// useProactiveSuggestions — Fetch suggestion history and send feedback.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { kinApi } from '@/lib/api';
import type { ProactiveSuggestion } from '@/lib/types';

interface UseProactiveSuggestionsResult {
  suggestions: ProactiveSuggestion[];
  loading: boolean;
  error: string | null;
  sendFeedback: (id: string, feedback: 'helpful' | 'not_helpful') => Promise<void>;
  refresh: () => void;
}

export function useProactiveSuggestions(): UseProactiveSuggestionsResult {
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await kinApi.get<{ suggestions: ProactiveSuggestion[] }>(
        '/proactive/suggestions',
      );
      setSuggestions(result.suggestions);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load suggestions';
      if (message !== 'Unauthorized') {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const sendFeedback = useCallback(
    async (id: string, feedback: 'helpful' | 'not_helpful') => {
      // Optimistic update
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, userFeedback: feedback } : s)),
      );

      try {
        await kinApi.post(`/proactive/suggestions/${id}/feedback`, { feedback });
      } catch {
        // Revert on failure
        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, userFeedback: null } : s)),
        );
      }
    },
    [],
  );

  const refresh = useCallback(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return { suggestions, loading, error, sendFeedback, refresh };
}
