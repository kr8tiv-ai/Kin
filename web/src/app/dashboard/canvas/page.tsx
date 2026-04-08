'use client';

// ============================================================================
// Canvas Landing — Lists user projects with 'Open in Canvas' actions.
// ============================================================================

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useProjects } from '@/hooks/useProjects';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const STATUS_COLOR: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  draft: 'muted',
  in_progress: 'cyan',
  preview: 'gold',
  deployed: 'gold',
  archived: 'muted',
};

export default function CanvasLandingPage() {
  const router = useRouter();
  const { projects, loading, error, refresh, createProject, creating } =
    useProjects();

  const handleNewProject = async () => {
    try {
      const project = await createProject({
        name: `Canvas Project ${Date.now().toString(36)}`,
        description: 'Created from Canvas',
      });
      router.push(`/dashboard/canvas/${project.id}`);
    } catch {
      // createProject already surfaces error via the hook
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Canvas
          </h1>
          <p className="mt-1 text-text-muted">
            Build websites with AI — pick a project or start fresh.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleNewProject}
          disabled={creating}
        >
          {creating ? 'Creating…' : '+ New Project'}
        </Button>
      </motion.div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-40" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-magenta">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </GlassCard>
      )}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <GlassCard hover={false} className="p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan/10">
            <svg
              className="h-8 w-8 text-cyan"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="font-display text-lg font-semibold text-white">
            No projects yet
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Create your first project and start building with AI.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={handleNewProject}
            disabled={creating}
            className="mt-6"
          >
            {creating ? 'Creating…' : 'Create Project'}
          </Button>
        </GlassCard>
      )}

      {/* Project Grid */}
      {!loading && !error && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <GlassCard className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-white truncate">
                    {project.name}
                  </h3>
                  <Badge color={STATUS_COLOR[project.status] ?? 'muted'}>
                    {project.status.replace('_', ' ')}
                  </Badge>
                </div>
                {project.description && (
                  <p className="mt-1 text-xs text-text-muted line-clamp-2">
                    {project.description}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-cyan/30 text-cyan hover:bg-cyan/10"
                    onClick={() =>
                      router.push(`/dashboard/canvas/${project.id}`)
                    }
                  >
                    Open in Canvas
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
