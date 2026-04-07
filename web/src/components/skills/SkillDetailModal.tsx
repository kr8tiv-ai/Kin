'use client';

import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Skill } from '@/lib/types';

// Match the palette from the skills page
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

const SOURCE_COLORS: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  builtin: 'cyan',
  companion: 'magenta',
  custom: 'gold',
};

interface SkillDetailModalProps {
  skill: Skill | null;
  open: boolean;
  onClose: () => void;
  onToggle: (skillId: string, currentActive: boolean) => void;
  toggling: boolean;
}

export function SkillDetailModal({
  skill,
  open,
  onClose,
  onToggle,
  toggling,
}: SkillDetailModalProps) {
  if (!skill) return null;

  const categoryColor = CATEGORY_COLORS[skill.category] ?? 'muted';
  const sourceColor = SOURCE_COLORS[skill.sourceType] ?? 'muted';

  return (
    <Modal open={open} onClose={onClose} title={skill.displayName} className="max-w-md">
      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={categoryColor}>{skill.category}</Badge>
        <Badge color={sourceColor}>{skill.sourceType}</Badge>
      </div>

      {/* Description */}
      <p className="mt-4 text-sm leading-relaxed text-white/50">
        {skill.description}
      </p>

      {/* Metadata grid */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetaItem label="Author" value={skill.author || '—'} />
        <MetaItem label="Version" value={skill.version || '—'} />
        <MetaItem label="Installs" value={String(skill.installCount)} />
        <MetaItem label="Category" value={skill.category} />
      </div>

      {/* Triggers */}
      {skill.triggers && skill.triggers.length > 0 && (
        <div className="mt-5">
          <span className="text-xs font-medium uppercase tracking-wider text-white/30">
            Triggers
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skill.triggers.map((trigger) => (
              <span
                key={trigger}
                className="inline-flex items-center rounded-pill border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-white/60"
              >
                {trigger}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="my-5 border-t border-white/10" />

      {/* Action button */}
      <Button
        variant={skill.isActive ? 'outline' : 'primary'}
        className="w-full"
        onClick={() => onToggle(skill.id, skill.isActive)}
        disabled={toggling}
      >
        {toggling
          ? '...'
          : skill.isActive
            ? 'Disable'
            : skill.isInstalled
              ? 'Enable'
              : 'Install'}
      </Button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small helper for the metadata grid
// ---------------------------------------------------------------------------

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="block text-[10px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </span>
      <span className="mt-0.5 block text-sm text-white/70">{value}</span>
    </div>
  );
}
