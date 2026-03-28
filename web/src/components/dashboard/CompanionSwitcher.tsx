'use client';

// ============================================================================
// CompanionSwitcher — Modal to browse and switch between all 6 companions.
// ============================================================================

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { COMPANION_LIST, getCompanionColor } from '@/lib/companions';
import type { CompanionData } from '@/lib/companions';
import { cn } from '@/lib/utils';

interface CompanionSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentCompanionId?: string;
  onSwitch: (companionId: string) => Promise<void>;
  switching: boolean;
}

export function CompanionSwitcher({
  open,
  onClose,
  currentCompanionId,
  onSwitch,
  switching,
}: CompanionSwitcherProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected || selected === currentCompanionId) return;
    await onSwitch(selected);
    setSelected(null);
    onClose();
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Switch Companion"
      className="max-w-2xl"
    >
      <p className="mb-4 text-sm text-text-muted">
        Choose a companion to switch to. Your conversation history is preserved.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {COMPANION_LIST.map((companion, i) => (
          <CompanionOption
            key={companion.id}
            companion={companion}
            isCurrent={companion.id === currentCompanionId}
            isSelected={companion.id === selected}
            onSelect={() => setSelected(companion.id)}
            index={i}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleConfirm}
          disabled={!selected || selected === currentCompanionId || switching}
        >
          {switching ? 'Switching...' : 'Confirm Switch'}
        </Button>
      </div>
    </Modal>
  );
}

// --- Individual companion option card ---

function CompanionOption({
  companion,
  isCurrent,
  isSelected,
  onSelect,
  index,
}: {
  companion: CompanionData;
  isCurrent: boolean;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const color = getCompanionColor(companion.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full rounded-xl border p-3 text-left transition-all duration-200',
          'bg-white/[0.02] backdrop-blur-[20px]',
          isSelected
            ? 'border-white/30 ring-1 ring-white/20'
            : isCurrent
              ? 'border-white/15 opacity-60'
              : 'border-white/[0.06] hover:border-white/15',
        )}
        style={
          isSelected
            ? { borderColor: `${color}60`, boxShadow: `0 0 20px ${color}20` }
            : undefined
        }
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-white/10">
            <Image
              src={companion.images[0]}
              alt={companion.name}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {companion.emoji} {companion.name}
            </p>
            <p className="text-xs text-text-muted">{companion.species}</p>
          </div>
          {isCurrent && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-cyan">
              Current
            </span>
          )}
        </div>
      </button>
    </motion.div>
  );
}
