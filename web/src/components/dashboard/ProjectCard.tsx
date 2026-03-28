'use client';

// ============================================================================
// ProjectCard — Glass card for a single project in the projects grid.
// ============================================================================

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/utils';
import type { Project } from '@/lib/types';

interface ProjectCardProps {
  project: Project;
  index?: number;
}

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

export function ProjectCard({ project, index = 0 }: ProjectCardProps) {
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link href={`/dashboard/projects/${project.id}`}>
        <GlassCard glow="none" className="p-5 transition-all duration-200 hover:border-white/15">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-white truncate">
              {project.name}
            </h3>
            <Badge color={status.color}>{status.label}</Badge>
          </div>

          {project.description && (
            <p className="mt-2 line-clamp-2 text-sm text-text-muted">
              {project.description}
            </p>
          )}

          {project.deployUrl && (
            <p className="mt-3 truncate text-xs font-mono text-cyan">
              {project.deployUrl}
            </p>
          )}

          <p className="mt-3 text-xs text-white/40">
            Updated {formatRelativeTime(project.updatedAt)}
          </p>
        </GlassCard>
      </Link>
    </motion.div>
  );
}
