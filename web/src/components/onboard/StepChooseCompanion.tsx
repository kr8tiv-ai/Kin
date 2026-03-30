'use client';

// ============================================================================
// StepChooseCompanion — Onboarding Step 2: Pick your companion.
// Enhanced with strength bars and staggered animations.
// ============================================================================

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { COMPANION_LIST, getCompanion } from '@/lib/companions';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface StepChooseCompanionProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const COLOR_BORDER: Record<string, string> = {
  cyan: 'border-cyan shadow-[0_0_20px_rgba(0,240,255,0.25)]',
  magenta: 'border-magenta shadow-[0_0_20px_rgba(255,0,170,0.25)]',
  gold: 'border-gold shadow-[0_0_20px_rgba(255,215,0,0.25)]',
};

const COLOR_ACCENT: Record<string, string> = {
  cyan: '#00f0ff',
  magenta: '#ff00aa',
  gold: '#ffd700',
};

// Companion strengths for the personality-quiz feel
const STRENGTHS: Record<string, { label: string; value: number }[]> = {
  cipher: [
    { label: 'Creativity', value: 95 },
    { label: 'Technical', value: 85 },
    { label: 'Communication', value: 70 },
  ],
  mischief: [
    { label: 'Social', value: 95 },
    { label: 'Creativity', value: 80 },
    { label: 'Energy', value: 90 },
  ],
  vortex: [
    { label: 'Strategy', value: 95 },
    { label: 'Analytics', value: 90 },
    { label: 'Communication', value: 85 },
  ],
  forge: [
    { label: 'Technical', value: 98 },
    { label: 'Precision', value: 95 },
    { label: 'Problem Solving', value: 90 },
  ],
  aether: [
    { label: 'Creativity', value: 98 },
    { label: 'Language', value: 95 },
    { label: 'Empathy', value: 85 },
  ],
  catalyst: [
    { label: 'Organization', value: 95 },
    { label: 'Motivation', value: 90 },
    { label: 'Analytical', value: 85 },
  ],
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35 } },
};

export function StepChooseCompanion({
  selectedId,
  onSelect,
  onNext,
  onBack,
}: StepChooseCompanionProps) {
  const selectedCompanion = selectedId ? getCompanion(selectedId) : null;
  const strengths = selectedId ? STRENGTHS[selectedId] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
        Choose Your Companion
      </h1>
      <p className="mb-8 text-center text-sm text-white/40">
        Each companion has unique strengths. Pick the one that fits your needs.
      </p>

      {/* Companion grid with staggered animations */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mb-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {COMPANION_LIST.map((companion) => {
          const isSelected = selectedId === companion.id;

          return (
            <motion.button
              key={companion.id}
              variants={cardVariant}
              type="button"
              onClick={() => onSelect(companion.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'group relative overflow-hidden rounded-xl border bg-white/[0.02] p-0 text-left transition-all duration-300',
                isSelected
                  ? COLOR_BORDER[companion.color]
                  : 'border-white/[0.06] hover:border-white/20',
              )}
            >
              {/* Image */}
              <div className="relative aspect-square w-full">
                <CompanionViewer
                  fallbackImage={companion.images[0]}
                  alt={companion.name}
                  className="h-full w-full"
                  modelReady={false}
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                {/* Name + species badge */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-sm font-semibold text-white">
                    {companion.emoji} {companion.name}
                  </p>
                  <p className="text-[10px] text-white/40">{companion.species}</p>
                </div>
              </div>

              {/* Tagline */}
              <div className="px-3 py-2">
                <p className="text-[11px] text-white/40 leading-snug line-clamp-2">
                  {companion.tagline}
                </p>
              </div>

              {/* Selection check */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cyan"
                >
                  <svg
                    className="h-3.5 w-3.5 text-black"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Selected companion detail with strengths */}
      {selectedCompanion && (
        <motion.div
          key={selectedCompanion.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 w-full"
        >
          <GlassCard className="p-5" hover={false}>
            <div className="flex items-start gap-4">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                <CompanionViewer
                  fallbackImage={selectedCompanion.images[0]}
                  alt={selectedCompanion.name}
                  className="h-full w-full"
                  modelReady={false}
                />
              </div>
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">
                    {selectedCompanion.emoji} {selectedCompanion.name}
                  </h3>
                  <Badge color={selectedCompanion.color}>{selectedCompanion.species}</Badge>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  {selectedCompanion.description}
                </p>
              </div>
            </div>

            {/* Strength bars */}
            {strengths && (
              <div className="mt-4 space-y-2">
                {strengths.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="w-24 text-[11px] text-white/40 text-right">{s.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: COLOR_ACCENT[selectedCompanion.color] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${s.value}%` }}
                        transition={{ duration: 0.6, delay: i * 0.1, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="w-8 text-[10px] font-mono text-white/30">{s.value}%</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!selectedId}>
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
