'use client';

// ============================================================================
// New Project — Form to create a new project.
// ============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useProjects } from '@/hooks/useProjects';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const TEMPLATES = [
  { value: 'blank', label: 'Blank', description: 'Start from scratch' },
  {
    value: 'portfolio',
    label: 'Portfolio',
    description: 'Showcase your work and skills',
  },
  {
    value: 'landing',
    label: 'Landing Page',
    description: 'Single-page marketing site',
  },
  {
    value: 'business',
    label: 'Business',
    description: 'Professional business website',
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const { createProject, creating } = useProjects();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('blank');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        template,
      });
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create project.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
          className="mb-4"
        >
          &larr; Back to Projects
        </Button>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Create New Project
        </h1>
        <p className="mt-1 text-text-muted">
          Set up a new project and start building with your companion.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <GlassCard hover={false} className="max-w-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Project Name */}
            <div>
              <label
                htmlFor="project-name"
                className="mb-1.5 block text-sm font-medium text-white"
              >
                Project Name <span className="text-red-400">*</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Website"
                maxLength={100}
                className={cn(
                  'w-full rounded-lg border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30',
                  'border-white/10 focus:border-cyan/40 focus:outline-none focus:ring-1 focus:ring-cyan/30',
                  'transition-colors duration-200',
                )}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="project-desc"
                className="mb-1.5 block text-sm font-medium text-white"
              >
                Description
              </label>
              <textarea
                id="project-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of your project..."
                rows={3}
                maxLength={500}
                className={cn(
                  'w-full resize-none rounded-lg border bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/30',
                  'border-white/10 focus:border-cyan/40 focus:outline-none focus:ring-1 focus:ring-cyan/30',
                  'transition-colors duration-200',
                )}
              />
            </div>

            {/* Template Select */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                Template
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTemplate(t.value)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-all duration-200',
                      template === t.value
                        ? 'border-cyan/40 bg-cyan/5'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                    )}
                  >
                    <p className="text-sm font-medium text-white">{t.label}</p>
                    <p className="text-xs text-text-muted">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {/* Submit */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                href="/dashboard/projects"
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={creating || !name.trim()}
              >
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}
