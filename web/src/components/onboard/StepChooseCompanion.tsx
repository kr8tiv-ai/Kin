'use client';

// ============================================================================
// StepChooseCompanion — Onboarding Step 2: Pick your companion.
// Enhanced with strength bars, staggered animations, particle burst on
// selection, and a typing preview of the selected companion's tagline.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
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
  /** Skip preferences/soul/memory → go straight to Ready */
  onQuickSetup?: () => void;
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

// ============================================================================
// ParticleBurst — 12 radial particles that explode from a point then fade out
// ============================================================================

interface BurstState {
  key: number;
  x: number;
  y: number;
  color: string;
}

function ParticleBurst({ burst }: { burst: BurstState }) {
  const PARTICLE_COUNT = 12;

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: burst.x, top: burst.y }}
    >
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const angle = (i / PARTICLE_COUNT) * 2 * Math.PI;
        const distance = 40 + Math.random() * 30;
        const size = 3 + Math.random() * 3;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: burst.color,
              top: -size / 2,
              left: -size / 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// TypingPreview — Shows companion typing then reveals their tagline
// ============================================================================

interface TypingPreviewProps {
  text: string;
  emoji: string;
  name: string;
  color: string;
}

function TypingPreview({ text, emoji, name, color }: TypingPreviewProps) {
  const [isTyping, setIsTyping] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset on companion change
    setIsTyping(true);
    setDisplayedText('');

    // After 1.5s, stop typing indicator and start typewriter
    timerRef.current = setTimeout(() => {
      setIsTyping(false);
      let index = 0;
      const charsPerSecond = 30;
      const intervalMs = 1000 / charsPerSecond;

      intervalRef.current = setInterval(() => {
        index += 1;
        setDisplayedText(text.slice(0, index));
        if (index >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, intervalMs);
    }, 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 w-full"
    >
      {/* Sender label */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <span className="text-xs" style={{ color }}>{emoji}</span>
        <span className="text-[11px] font-medium" style={{ color }}>{name}</span>
      </div>

      {/* Chat bubble */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs">
        {isTyping ? (
          <div className="flex items-center gap-1 h-4">
            {[0, 0.15, 0.3].map((delay, i) => (
              <span
                key={i}
                className="inline-block h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/70 leading-relaxed">
            {displayedText}
            {displayedText.length < text.length && (
              <span className="animate-pulse">|</span>
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// StepChooseCompanion
// ============================================================================

export function StepChooseCompanion({
  selectedId,
  onSelect,
  onNext,
  onBack,
  onQuickSetup,
}: StepChooseCompanionProps) {
  const t = useTranslations('onboard.chooseCompanion');
  const tc = useTranslations('common');
  const selectedCompanion = selectedId ? getCompanion(selectedId) : null;
  const strengths = selectedId ? STRENGTHS[selectedId] : null;

  const [burst, setBurst] = useState<BurstState | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCardClick(
    e: React.MouseEvent<HTMLButtonElement>,
    companionId: string,
  ) {
    onSelect(companionId);

    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const companion = getCompanion(companionId);
    const color = companion ? COLOR_ACCENT[companion.color] : '#00f0ff';

    // Clear any pending auto-clear
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);

    setBurst({ key: Date.now(), x: cx, y: cy, color });

    burstTimerRef.current = setTimeout(() => {
      setBurst(null);
    }, 600);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* Particle burst portal — rendered outside the scroll container */}
      <AnimatePresence>
        {burst && <ParticleBurst key={burst.key} burst={burst} />}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center"
      >
        <h1 className="mb-2 text-center font-display text-2xl font-bold text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="mb-8 text-center text-sm text-white/40">
          {t('subtitle')}
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
                onClick={(e) => handleCardClick(e, companion.id)}
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
            className="mb-4 w-full"
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

        {/* Typing preview — companion says their tagline */}
        {selectedCompanion && (
          <TypingPreview
            key={selectedCompanion.id}
            text={selectedCompanion.tagline}
            emoji={selectedCompanion.emoji}
            name={selectedCompanion.name}
            color={COLOR_ACCENT[selectedCompanion.color]}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            {tc('back')}
          </Button>
          <Button onClick={onNext} disabled={!selectedId}>
            {tc('continue')}
          </Button>
        </div>

        {/* Quick-start skip */}
        {onQuickSetup && selectedId && (
          <button
            type="button"
            onClick={onQuickSetup}
            className="mt-2 text-[11px] text-white/30 underline underline-offset-2 transition-colors hover:text-white/50"
          >
            {t('quickSetup')}
          </button>
        )}
      </motion.div>
    </>
  );
}
