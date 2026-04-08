'use client';

// ============================================================================
// useFamily — Hook for family group CRUD operations.
// ============================================================================

import { useCallback, useState } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type {
  FamilyGroup,
  FamilyCreateResponse,
  FamilyInviteResponse,
  ChildAccountResponse,
  SharedMemoriesResponse,
  FamilyActivityResponse,
} from '@/lib/types';

/** Fetches the user's family group and member list. */
export function useFamily() {
  const { data, loading, error, refresh, mutate } = useApi<FamilyGroup>('/family');
  return { family: data, loading, error, refresh, mutate };
}

/** Fetches parent-visible shared memories across the family. */
export function useSharedMemories() {
  const { data, loading, error, refresh } = useApi<SharedMemoriesResponse>('/family/shared-memories');
  return { data, memories: data?.memories ?? [], loading, error, refresh };
}

/** Fetches per-member activity summary (parent-only). */
export function useFamilyActivity() {
  const { data, loading, error, refresh } = useApi<FamilyActivityResponse>('/family/activity');
  return { activity: data?.members ?? [], loading, error, refresh };
}

/** Mutation helpers for family write operations. */
export function useFamilyActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createFamily = useCallback(async (name: string): Promise<FamilyCreateResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await kinApi.post<FamilyCreateResponse>('/family/create', { name });
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create family');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateInvite = useCallback(async (familyGroupId: string): Promise<FamilyInviteResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await kinApi.post<FamilyInviteResponse>('/family/invite', { familyGroupId });
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const addChild = useCallback(async (
    firstName: string,
    ageBracket: 'under_13' | 'teen',
    familyGroupId?: string,
  ): Promise<ChildAccountResponse | null> => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = { firstName, ageBracket };
      if (familyGroupId) body.familyGroupId = familyGroupId;
      const result = await kinApi.post<ChildAccountResponse>('/family/child-account', body);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add child');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const removeMember = useCallback(async (memberId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await kinApi.delete(`/family/members/${memberId}`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createFamily, generateInvite, addChild, removeMember, loading, error };
}
