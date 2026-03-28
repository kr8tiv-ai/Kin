'use client';

// ============================================================================
// Projects List — Grid of user projects with create button.
// ============================================================================

import { motion } from 'framer-motion';
import { useProjects } from '@/hooks/useProjects';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProjectsPage() {
  const { projects, loading, error, refresh } = useProjects();

  // --- Loading State ---
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Projects
        </h1>
        <GlassCard hover={false} className="p-8 text-center">
          <p className="text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-4">
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

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
            Projects
          </h1>
          <p className="mt-1 text-text-muted">
            Build and deploy websites with your AI companion.
          </p>
        </div>
        <Button href="/dashboard/projects/new" variant="primary" size="md">
          Create Project
        </Button>
      </motion.div>

      {/* Projects Grid or Empty State */}
      {projects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <GlassCard hover={false} className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="text-5xl">🏗️</span>
              <h3 className="font-display text-lg font-semibold text-white">
                No Projects Yet
              </h3>
              <p className="max-w-sm text-sm text-text-muted">
                Create your first project and let your AI companion help you
                build something amazing.
              </p>
              <Button
                href="/dashboard/projects/new"
                variant="primary"
                size="md"
              >
                Create Your First Project
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
