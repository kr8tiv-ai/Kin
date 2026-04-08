'use client';

// ============================================================================
// Skills Marketplace — Browse, toggle, and request custom skills.
// ============================================================================

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSkills } from '@/hooks/useSkills';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { SkillDetailModal } from '@/components/skills/SkillDetailModal';
import type { Skill } from '@/lib/types';

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'creative', label: 'Creative' },
  { id: 'developer', label: 'Developer' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'custom', label: 'Custom' },
] as const;

const CATEGORY_COLORS: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  general: 'muted',
  productivity: 'cyan',
  creative: 'magenta',
  developer: 'cyan',
  marketing: 'gold',
  analytics: 'cyan',
  lifestyle: 'magenta',
  custom: 'gold',
};

const STATUS_LABELS: Record<string, { label: string; color: 'cyan' | 'magenta' | 'gold' | 'muted' }> = {
  pending: { label: 'Pending', color: 'muted' },
  payment_required: { label: 'Awaiting Payment', color: 'gold' },
  paid: { label: 'Paid — Under Review', color: 'cyan' },
  reviewing: { label: 'Under Review', color: 'cyan' },
  approved: { label: 'Approved', color: 'cyan' },
  installed: { label: 'Installed', color: 'cyan' },
  rejected: { label: 'Rejected', color: 'magenta' },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const {
    skills,
    requests,
    loading,
    error,
    refresh,
    toggleSkill,
    submitRequest,
    checkoutRequest,
  } = useSkills();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [githubUrl, setGithubUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Filter skills — memoized to avoid recomputing on unrelated re-renders.
  const filtered = useMemo(
    () => skills.filter((s) => {
      const matchesCategory =
        activeCategory === 'all' || s.category === activeCategory;
      const matchesSearch =
        !search ||
        s.displayName.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    }),
    [skills, activeCategory, search],
  );

  const handleToggle = async (skillId: string, currentActive: boolean) => {
    setToggling(skillId);
    try {
      await toggleSkill(skillId, !currentActive);
      // Update selected skill in modal so it reflects the new state
      setSelectedSkill((prev) =>
        prev && prev.id === skillId
          ? { ...prev, isInstalled: true, isActive: !currentActive }
          : prev,
      );
    } finally {
      setToggling(null);
    }
  };

  const handleSubmitRequest = async () => {
    if (!githubUrl.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitRequest(githubUrl.trim());
      setGithubUrl('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="card" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-white/60">{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Skills Marketplace
          </h1>
          <p className="mt-1 text-white/50">
            Enhance your KIN companions with powerful skills.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`rounded-pill border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
              activeCategory === cat.id
                ? 'border-cyan/40 bg-cyan/10 text-cyan'
                : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20 hover:text-white/70'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Skills Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((skill) => (
          <GlassCard
            key={skill.id}
            className="flex cursor-pointer flex-col p-5"
            glow="cyan"
            onClick={() => setSelectedSkill(skill)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base font-semibold text-white">
                  {skill.displayName}
                </h3>
                <Badge
                  color={CATEGORY_COLORS[skill.category] ?? 'muted'}
                  className="mt-1.5"
                >
                  {skill.category}
                </Badge>
              </div>
              <span className="shrink-0 text-xs text-white/30">
                {skill.installCount} installs
              </span>
            </div>

            <p className="mt-3 flex-1 text-sm leading-relaxed text-white/50">
              {skill.description}
            </p>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/20">
                {skill.sourceType}
              </span>
              <Button
                size="sm"
                variant={skill.isActive ? 'outline' : 'primary'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(skill.id, skill.isActive);
                }}
                disabled={toggling === skill.id}
              >
                {toggling === skill.id
                  ? '...'
                  : skill.isActive
                    ? 'Disable'
                    : skill.isInstalled
                      ? 'Enable'
                      : 'Install'}
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Skill Detail Modal */}
      <SkillDetailModal
        skill={selectedSkill}
        open={!!selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onToggle={handleToggle}
        toggling={toggling === selectedSkill?.id}
      />

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-white/40">
            No skills match your search. Try a different filter.
          </p>
        </div>
      )}

      {/* Install from GitHub */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="font-display text-xl font-semibold text-white">
          Request Custom Skill
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Submit a GitHub repository and our team will review and install it as a
          custom skill for your KIN. One-time review fee of $4.99.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="https://github.com/owner/repo"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              error={submitError ?? undefined}
            />
          </div>
          <Button
            onClick={handleSubmitRequest}
            disabled={!githubUrl.trim() || submitting}
          >
            {submitting ? 'Submitting...' : 'Submit ($4.99)'}
          </Button>
        </div>
      </GlassCard>

      {/* Skill Requests */}
      {requests.length > 0 && (
        <GlassCard className="p-6" hover={false}>
          <h2 className="font-display text-lg font-semibold text-white">
            Your Requests
          </h2>
          <div className="mt-4 space-y-3">
            {requests.map((req) => {
              const statusInfo = STATUS_LABELS[req.status] ?? {
                label: req.status,
                color: 'muted' as const,
              };
              return (
                <div
                  key={req.id}
                  className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.01] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/70">
                      {req.githubRepoUrl}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge color={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                      <span className="text-xs text-white/30">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {req.rejectionReason && (
                      <p className="mt-1 text-xs text-magenta/70">
                        {req.rejectionReason}
                      </p>
                    )}
                  </div>
                  {req.status === 'payment_required' && (
                    <Button
                      size="sm"
                      onClick={() => checkoutRequest(req.id)}
                    >
                      Pay $4.99
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}
