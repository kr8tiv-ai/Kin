'use client';

// ============================================================================
// useConversations — Hook for fetching the user's conversation list.
// ============================================================================

import { useApi } from './useApi';
import type { Conversation } from '@/lib/types';

interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useConversations(): UseConversationsResult {
  const { data, loading, error, refresh } = useApi<{ conversations: Conversation[] }>(
    '/conversations',
  );

  return {
    conversations: data?.conversations ?? [],
    loading,
    error,
    refresh,
  };
}
