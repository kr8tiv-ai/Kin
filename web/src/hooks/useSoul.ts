'use client';

// ============================================================================
// useSoul — Hook for soul config CRUD and drift management.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { kinApi } from '@/lib/api';
import { track } from '@/lib/analytics';
import type { SoulConfig, CompanionSoul } from '@/lib/types';

interface UseSoulReturn {
  soul: CompanionSoul | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  save: (config: SoulConfig) => Promise<void>;
  calibrate: () => Promise<number | null>;
  exportMarkdown: () => Promise<string | null>;
}

export function useSoul(companionId: string | null): UseSoulReturn {
  const [soul, setSoul] = useState<CompanionSoul | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch soul on mount / companionId change
  useEffect(() => {
    if (!companionId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    kinApi.get<{ soul: CompanionSoul | null }>(`/soul/${companionId}`)
      .then((res) => {
        if (!cancelled) setSoul(res.soul);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load soul');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [companionId]);

  // Save soul config
  const save = useCallback(async (config: SoulConfig) => {
    if (!companionId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await kinApi.put<{ success: boolean; soulHash: string }>(
        `/soul/${companionId}`,
        config,
      );

      // Refresh soul data
      const updated = await kinApi.get<{ soul: CompanionSoul | null }>(`/soul/${companionId}`);
      setSoul(updated.soul);

      track('soul_saved', { companionId, traitsCount: config.traits ? Object.keys(config.traits).length : 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save soul';
      setError(message);
      track('soul_save_failed', { companionId, error: message });
      throw err;
    } finally {
      setSaving(false);
    }
  }, [companionId]);

  // Calibrate drift
  const calibrate = useCallback(async (): Promise<number | null> => {
    if (!companionId) return null;

    try {
      const res = await kinApi.post<{ driftScore: number; messageCount: number }>(
        `/soul/${companionId}/calibrate`,
      );

      // Refresh soul
      const updated = await kinApi.get<{ soul: CompanionSoul | null }>(`/soul/${companionId}`);
      setSoul(updated.soul);

      track('soul_calibrated', { companionId, driftScore: res.driftScore, messageCount: res.messageCount });
      return res.driftScore;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calibration failed');
      return null;
    }
  }, [companionId]);

  // Export as markdown
  const exportMarkdown = useCallback(async (): Promise<string | null> => {
    if (!companionId) return null;

    try {
      const res = await fetch(`/api/soul/export/${companionId}`, {
        headers: {
          Authorization: `Bearer ${Cookies.get('kin_token') ?? ''}`,
        },
      });
      if (!res.ok) throw new Error('Export failed');
      return await res.text();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      return null;
    }
  }, [companionId]);

  return { soul, loading, saving, error, save, calibrate, exportMarkdown };
}
