'use client';

// ============================================================================
// StepQuickIntro — Quick-flow Step 2: compact companion grid + voice intro.
//
// Combines companion selection (compact 2×3 grid) with VoiceIntroRecorder
// in a single step. Once a companion is picked and voice intro completes,
// the user advances to the Ready step.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { COMPANION_LIST, getCompanion } from '@/lib/companions';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { Button } from '@/components/ui/Button';
import { VoiceIntroRecorder } from './VoiceIntroRecorder';
import type { ExtractedProfile } from '@/hooks/useVoiceIntro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepQuickIntroProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onVoiceComplete: (profile: ExtractedProfile) => void;
  onBack: () => void;
  /** When true, skip the voice intro phase (used for child accounts). */
  skipVoice?: boolean;
}

// ---------------------------------------------------------------------------
// Color mappings (same as StepChooseCompanion)
// ---------------------------------------------------------------------------

const COLOR_BORDER: Record<string, string> = {
  cyan: 'border-cyan shadow-[0_0_16px_rgba(0,240,255,0.2)]',
  magenta: 'border-magenta shadow-[0_0_16px_rgba(255,0,170,0.2)]',
  gold: 'border-gold shadow-[0_0_16px_rgba(255,215,0,0.2)]',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepQuickIntro({
  selectedId,
  onSelect,
  onVoiceComplete,
  onBack,
  skipVoice = false,
}: StepQuickIntroProps) {
  // Two phases: pick companion → voice intro (voice skipped for child accounts)
  const [phase, setPhase] = useState<'pick' | 'voice'>(selectedId && !skipVoice ? 'voice' : 'pick');

  function handleCompanionSelect(id: string) {
    onSelect(id);
    if (skipVoice) {
      // Child accounts skip voice intro — advance with default profile
      onVoiceComplete({ displayName: '', interests: [], goals: [], experienceLevel: 'beginner', tone: 'friendly' });
      return;
    }
    setPhase('voice');
  }

  function handleVoiceBack() {
    setPhase('pick');
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center"
    >
      <AnimatePresence mode="wait">
        {/* ── Phase 1: Compact companion picker ──────────────────────────── */}
        {phase === 'pick' && (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center"
          >
            <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
              Pick Your Companion
            </h1>
            <p className="mb-6 text-center text-sm text-white/40">
              Choose someone who matches your vibe.
            </p>

            {/* Compact 2×3 grid */}
            <div className="mb-6 grid w-full max-w-md grid-cols-3 gap-3">
              {COMPANION_LIST.map((companion) => {
                const isSelected = selectedId === companion.id;
                return (
                  <motion.button
                    key={companion.id}
                    type="button"
                    onClick={() => handleCompanionSelect(companion.id)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border bg-white/[0.02] text-center transition-all duration-300',
                      isSelected
                        ? COLOR_BORDER[companion.color]
                        : 'border-white/[0.06] hover:border-white/20',
                    )}
                  >
                    {/* Square image */}
                    <div className="relative aspect-square w-full">
                      <CompanionViewer
                        fallbackImage={companion.images[0]}
                        alt={companion.name}
                        className="h-full w-full"
                        modelReady={false}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs font-semibold text-white truncate">
                          {companion.emoji} {companion.name}
                        </p>
                      </div>
                    </div>

                    {/* Selection check */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan"
                      >
                        <svg className="h-3 w-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Back to welcome */}
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          </motion.div>
        )}

        {/* ── Phase 2: Voice intro recorder ──────────────────────────────── */}
        {phase === 'voice' && selectedId && (
          <motion.div
            key="voice"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            {/* Show which companion was picked */}
            {(() => {
              const companion = getCompanion(selectedId);
              if (!companion) return null;
              return (
                <div className="mb-6 flex items-center justify-center gap-2">
                  <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10">
                    <CompanionViewer
                      fallbackImage={companion.images[0]}
                      alt={companion.name}
                      className="h-full w-full"
                      modelReady={false}
                    />
                  </div>
                  <span className="text-sm text-white/60">
                    {companion.emoji} {companion.name} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhase('pick')}
                    className="ml-1 text-[11px] text-cyan/50 underline underline-offset-2 hover:text-cyan/80 transition-colors"
                  >
                    change
                  </button>
                </div>
              );
            })()}

            <VoiceIntroRecorder
              companionId={selectedId}
              onComplete={onVoiceComplete}
              onBack={handleVoiceBack}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
