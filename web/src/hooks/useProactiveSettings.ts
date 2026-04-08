'use client';

// ============================================================================
// useProactiveSettings — Fetch and update proactive companion settings.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { kinApi } from '@/lib/api';
import type { ProactiveSettings } from '@/lib/types';

interface UseProactiveSettingsResult {
  settings: ProactiveSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (patch: Partial<ProactiveSettings>) => Promise<void>;
  refresh: () => void;
}

const DEFAULT_SETTINGS: ProactiveSettings = {
  proactiveEnabled: false,
  quietStart: null,
  quietEnd: null,
  maxDaily: 5,
  channels: [],
  calendarConnected: false,
};

export function useProactiveSettings(): UseProactiveSettingsResult {
  const [settings, setSettings] = useState<ProactiveSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await kinApi.get<ProactiveSettings>('/proactive/settings');
      setSettings(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load proactive settings';
      if (message !== 'Unauthorized') {
        setError(message);
      }
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (patch: Partial<ProactiveSettings>) => {
    // Optimistic update
    setSettings((prev) => (prev ? { ...prev, ...patch } : { ...DEFAULT_SETTINGS, ...patch }));

    // Debounce the API call
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await kinApi.put<ProactiveSettings>('/proactive/settings', patch);
        // Merge response (server may omit calendarConnected on PUT)
        setSettings((prev) => (prev ? { ...prev, ...result } : result));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings';
        setError(message);
        // Revert by re-fetching
        fetchSettings();
      }
    }, 400);
  }, [fetchSettings]);

  const refresh = useCallback(() => {
    fetchSettings();
  }, [fetchSettings]);

  return { settings, loading, error, updateSettings, refresh };
}
