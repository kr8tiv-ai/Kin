'use client';

// ============================================================================
// useProjects — Hook for fetching and managing user projects.
// ============================================================================

import { useCallback, useState } from 'react';
import { useApi } from './useApi';
import { kinApi } from '@/lib/api';
import type { Project } from '@/lib/types';

interface CreateProjectInput {
  name: string;
  description?: string;
  template?: string;
}

interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  creating: boolean;
}

export function useProjects(): UseProjectsResult {
  const { data, loading, error, refresh } = useApi<{ projects: Project[] }>(
    '/projects',
  );
  const [creating, setCreating] = useState(false);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<Project> => {
      setCreating(true);
      try {
        const result = await kinApi.post<{ project: Project }>(
          '/projects',
          input,
        );
        refresh();
        return result.project;
      } finally {
        setCreating(false);
      }
    },
    [refresh],
  );

  return {
    projects: data?.projects ?? [],
    loading,
    error,
    refresh,
    createProject,
    creating,
  };
}

// --- Single Project Hook ---

interface UseProjectResult {
  project: Project | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  deploy: () => Promise<void>;
  deploying: boolean;
  deleteProject: () => Promise<void>;
  deleting: boolean;
}

export function useProject(projectId: string): UseProjectResult {
  const { data, loading, error, refresh } = useApi<{ project: Project }>(
    `/projects/${projectId}`,
    { skip: !projectId },
  );
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deploy = useCallback(async () => {
    setDeploying(true);
    try {
      await kinApi.post(`/projects/${projectId}/deploy`);
      refresh();
    } finally {
      setDeploying(false);
    }
  }, [projectId, refresh]);

  const deleteProject = useCallback(async () => {
    setDeleting(true);
    try {
      await kinApi.delete(`/projects/${projectId}`);
    } finally {
      setDeleting(false);
    }
  }, [projectId]);

  return {
    project: data?.project ?? null,
    loading,
    error,
    refresh,
    deploy,
    deploying,
    deleteProject,
    deleting,
  };
}
