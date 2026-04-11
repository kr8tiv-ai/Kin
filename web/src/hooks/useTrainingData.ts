'use client';

// ============================================================================
// useTrainingData — Hooks for training curation dashboard data.
// ============================================================================

import { useCallback, useState } from 'react';
import Cookies from 'js-cookie';
import { useApi } from '@/hooks/useApi';
import { kinApi } from '@/lib/api';
import { getApiBase, withAuthHeaders } from '@/lib/auth';
import type {
  TrainingCompanionStats,
  TrainingEntriesResponse,
} from '@/lib/types';

// --------------------------------------------------------------------------
// Companion stats
// --------------------------------------------------------------------------

export function useTrainingCompanions() {
  return useApi<{ companions: TrainingCompanionStats[] }>(
    '/training/companions',
  );
}

// --------------------------------------------------------------------------
// Paginated entries for a companion
// --------------------------------------------------------------------------

export function useTrainingEntries(companionId: string | null, page: number) {
  return useApi<TrainingEntriesResponse>(
    `/training/companions/${companionId}/entries?page=${page}`,
    { skip: !companionId },
  );
}

// --------------------------------------------------------------------------
// Verdict mutation
// --------------------------------------------------------------------------

export function useUpdateVerdict(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateVerdict = useCallback(
    async (entryHash: string, verdict: 'approved' | 'rejected' | 'pending') => {
      setLoading(true);
      setError(null);
      try {
        await kinApi.put(`/training/entries/${entryHash}/verdict`, { verdict });
        onSuccess?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update verdict';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [onSuccess],
  );

  return { updateVerdict, loading, error };
}

// --------------------------------------------------------------------------
// Export approved entries as JSONL download
// --------------------------------------------------------------------------

export function useExportTrainingData() {
  const [loading, setLoading] = useState(false);

  const exportData = useCallback(async (companionId: string, companionName: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${getApiBase()}/training/companions/${companionId}/export`,
        {
          headers: withAuthHeaders(),
        },
      );

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('No approved entries to export');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${companionName.toLowerCase().replace(/\s+/g, '-')}-training.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportData, loading };
}
