'use client';

// ============================================================================
// Project Detail — View and manage a single project.
// ============================================================================

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useProject } from '@/hooks/useProjects';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/utils';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: 'cyan' | 'magenta' | 'gold' | 'muted' }
> = {
  draft: { label: 'Draft', color: 'muted' },
  in_progress: { label: 'Building', color: 'cyan' },
  preview: { label: 'Preview', color: 'gold' },
  deployed: { label: 'Deployed', color: 'gold' },
  archived: { label: 'Archived', color: 'muted' },
};

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const {
    project,
    loading,
    error,
    refresh,
    deploy,
    deploying,
    deleteProject,
    deleting,
  } = useProject(projectId);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleDelete = async () => {
    await deleteProject();
    router.push('/dashboard/projects');
  };

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="space-y-6">
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
        >
          &larr; Back to Projects
        </Button>
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
        >
          &larr; Back to Projects
        </Button>
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-text-muted">Project not found.</p>
        </GlassCard>
      </div>
    );
  }

  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const isDeployable =
    project.status === 'draft' || project.status === 'preview';
  const isDeployed = project.status === 'deployed';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
          className="mb-2"
        >
          &larr; Back to Projects
        </Button>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">
              {project.name}
            </h1>
            <Badge color={status.color}>{status.label}</Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-text-muted">{project.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDeployable && (
            <Button
              variant="primary"
              size="sm"
              onClick={deploy}
              disabled={deploying}
            >
              {deploying ? 'Deploying...' : 'Deploy'}
            </Button>
          )}
          {isDeployed && (
            <Button
              variant="outline"
              size="sm"
              onClick={deploy}
              disabled={deploying}
            >
              {deploying ? 'Redeploying...' : 'Redeploy'}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Project Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <GlassCard hover={false} className="p-6">
          <h2 className="mb-4 font-display text-lg font-semibold text-white">
            Project Details
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">
                Created
              </p>
              <p className="mt-0.5 text-sm text-white">
                {formatDate(project.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">
                Last Updated
              </p>
              <p className="mt-0.5 text-sm text-white">
                {formatDate(project.updatedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">
                Template
              </p>
              <p className="mt-0.5 text-sm text-white capitalize">
                {project.projectType || 'Blank'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">
                Status
              </p>
              <p className="mt-0.5">
                <Badge color={status.color}>{status.label}</Badge>
              </p>
            </div>
          </div>

          {/* Deploy URL */}
          {project.deployUrl && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-wider text-white/40">
                Live URL
              </p>
              <div className="mt-1 flex items-center gap-3">
                <p className="truncate font-mono text-sm text-cyan">
                  {project.deployUrl}
                </p>
                <Button
                  href={project.deployUrl}
                  variant="outline"
                  size="sm"
                >
                  View Site
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Build Log Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <GlassCard hover={false} className="p-6">
          <h2 className="mb-4 font-display text-lg font-semibold text-white">
            Build Log
          </h2>
          <div className="rounded-lg bg-white/[0.03] p-4 font-mono text-xs text-white/40">
            <p>Build logs will appear here when you deploy your project.</p>
          </div>
        </GlassCard>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <GlassCard hover={false} className="border-red-500/20 p-6">
          <h2 className="mb-2 font-display text-lg font-semibold text-red-400">
            Danger Zone
          </h2>
          <p className="mb-4 text-sm text-text-muted">
            Deleting this project is permanent and cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
          >
            Delete Project
          </Button>
        </GlassCard>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Project"
      >
        <p className="text-sm text-text-muted">
          Are you sure you want to delete <strong className="text-white">{project.name}</strong>?
          This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 shadow-none hover:bg-red-700"
          >
            {deleting ? 'Deleting...' : 'Delete Project'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
