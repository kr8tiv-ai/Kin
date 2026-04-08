'use client';

// ============================================================================
// Canvas Studio — Split-pane design studio for real-time web generation.
//
// Left panel: CanvasChat for prompt input and history.
// Right panel: LiveCanvasPreview with sandboxed iframe.
// Responsive: stacks vertically on screens < 1024px.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useProject } from '@/hooks/useProjects';
import { useCanvasStream } from '@/hooks/useCanvasStream';
import { LiveCanvasPreview } from '@/components/canvas/LiveCanvasPreview';
import { CanvasChat } from '@/components/canvas/CanvasChat';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { COLORS } from '@/lib/design-tokens';

// ============================================================================
// Component
// ============================================================================

export default function CanvasStudioPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const { project, loading, error, refresh } = useProject(projectId);
  const canvas = useCanvasStream();

  // Track whether we've initialized the preview with existing project HTML
  const initializedRef = useRef(false);

  // If the project has an index.html file, we could initialize preview.
  // Since Project type doesn't carry file contents, we start with an empty canvas.
  // Future enhancement: fetch project files and seed the preview.
  useEffect(() => {
    if (project && !initializedRef.current) {
      initializedRef.current = true;
      // Placeholder for future: load existing project HTML if available
    }
  }, [project]);

  const handleSend = useCallback(
    (prompt: string) => {
      if (!projectId) return;
      // Pass current HTML as context for iterative refinement
      canvas.generate(projectId, prompt, canvas.html || undefined);
    },
    [projectId, canvas],
  );

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col h-full gap-4 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex flex-1 gap-4">
          <Skeleton variant="card" className="flex-[35] h-full min-h-[400px]" />
          <Skeleton variant="card" className="flex-[65] h-full min-h-[400px]" />
        </div>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
        >
          &larr; Back to Projects
        </Button>
        <GlassCard hover={false} className="p-8 text-center max-w-md">
          <p className="text-magenta mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </GlassCard>
      </div>
    );
  }

  // --- Not Found State ---
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Button
          href="/dashboard/projects"
          variant="ghost"
          size="sm"
        >
          &larr; Back to Projects
        </Button>
        <GlassCard hover={false} className="p-8 text-center max-w-md">
          <p className="text-text-muted">Project not found.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col h-full"
    >
      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: COLORS.border }}
      >
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors hover:bg-white/5"
          style={{ color: COLORS.textMuted }}
          title="Back to Projects"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <h1
            className="font-display text-sm font-semibold truncate"
            style={{ color: COLORS.text }}
          >
            {project.name}
          </h1>
          <span
            className="text-xs shrink-0"
            style={{ color: COLORS.textFaint }}
          >
            — Canvas Studio
          </span>
        </div>

        {/* Generation status in header */}
        {canvas.isGenerating && (
          <span
            className="ml-auto text-xs flex items-center gap-1.5 shrink-0"
            style={{ color: COLORS.cyan }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: COLORS.cyan }}
            />
            Generating…
          </span>
        )}

        {canvas.status === 'error' && canvas.error && (
          <span
            className="ml-auto text-xs truncate max-w-[200px] shrink-0"
            style={{ color: COLORS.magenta }}
            title={canvas.error}
          >
            Error: {canvas.error}
          </span>
        )}
      </div>

      {/* ── Split-pane layout ───────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Left panel — Chat (35% on desktop, full width stacked on mobile) */}
        <div
          className="lg:w-[35%] w-full shrink-0 border-b lg:border-b-0 lg:border-r order-2 lg:order-1"
          style={{ borderColor: COLORS.border }}
        >
          <CanvasChat
            onSend={handleSend}
            isGenerating={canvas.isGenerating}
            history={canvas.generationHistory}
            className="h-full"
          />
        </div>

        {/* Right panel — Preview (65% on desktop, full width stacked on mobile) */}
        <div className="lg:flex-1 w-full min-h-[300px] lg:min-h-0 order-1 lg:order-2">
          <LiveCanvasPreview
            html={canvas.html}
            isGenerating={canvas.isGenerating}
            className="h-full"
          />
        </div>
      </div>
    </motion.div>
  );
}
