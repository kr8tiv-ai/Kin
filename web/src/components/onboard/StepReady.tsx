'use client';

// ============================================================================
// StepReady — Onboarding Step 5: Completion + launch.
// ============================================================================

import { motion } from 'framer-motion';
import { getCompanion, getCompanionColor } from '@/lib/companions';
import { track } from '@/lib/analytics';
import { CompanionViewer } from '@/components/3d/CompanionViewer';
import { Button } from '@/components/ui/Button';

interface StepReadyProps {
  selectedCompanionId: string | null;
  completing: boolean;
  error: string | null;
  onComplete: () => void;
}

// Decorative dots with companion-accent coloring
function ConfettiDots({ color }: { color: string }) {
  const dots = [
    { size: 6, x: '10%', y: '20%', delay: 0 },
    { size: 4, x: '85%', y: '15%', delay: 0.2 },
    { size: 8, x: '75%', y: '70%', delay: 0.4 },
    { size: 5, x: '15%', y: '75%', delay: 0.1 },
    { size: 3, x: '90%', y: '45%', delay: 0.3 },
    { size: 7, x: '5%', y: '50%', delay: 0.5 },
    { size: 4, x: '50%', y: '5%', delay: 0.15 },
    { size: 6, x: '60%', y: '90%', delay: 0.35 },
  ];

  return (
    <>
      {dots.map((dot, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: dot.size,
            height: dot.size,
            left: dot.x,
            top: dot.y,
            backgroundColor: color,
            opacity: 0.3,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.2, 1],
            opacity: [0, 0.5, 0.3],
          }}
          transition={{
            duration: 0.6,
            delay: 0.4 + dot.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  );
}

export function StepReady({
  selectedCompanionId,
  completing,
  error,
  onComplete,
}: StepReadyProps) {
  const companion = selectedCompanionId ? getCompanion(selectedCompanionId) : null;
  const companionColor = selectedCompanionId
    ? getCompanionColor(selectedCompanionId)
    : '#00f0ff';

  function handleComplete() {
    track('onboarding_completed', { companionId: selectedCompanionId ?? 'unknown' });
    onComplete();
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35 }}
      className="relative flex flex-col items-center"
    >
      {/* Confetti decoration */}
      <ConfettiDots color={companionColor} />

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-2 text-center font-display text-3xl font-bold sm:text-4xl"
      >
        <span
          className="bg-gradient-to-r from-cyan via-magenta to-gold bg-clip-text text-transparent"
        >
          You&apos;re All Set!
        </span>
      </motion.h1>

      {/* Companion viewer */}
      {companion && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="my-8"
        >
          <div className="relative mx-auto h-48 w-48 overflow-hidden rounded-2xl border border-white/10">
            <CompanionViewer
              fallbackImage={companion.images[0]}
              alt={companion.name}
              className="h-full w-full"
              modelReady={false}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-center text-base font-medium text-white"
          >
            {companion.emoji} {companion.name} is ready to meet you!
          </motion.p>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 w-full rounded-lg border border-magenta/30 bg-magenta/10 px-4 py-3 text-center text-sm text-magenta">
          {error}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={completing}
        >
          {completing ? 'Setting up...' : 'Start Chatting'}
        </Button>
        <Button
          variant="outline"
          size="lg"
          href="/dashboard"
          disabled={completing}
        >
          Explore Dashboard
        </Button>
      </div>

      <p className="mt-6 text-center text-[11px] text-white/20">
        Chat with your companion on Telegram anytime at{' '}
        <a
          href="https://t.me/KinCompanionBot"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan/50 underline underline-offset-2 hover:text-cyan/70"
        >
          @KinCompanionBot
        </a>
      </p>
    </motion.div>
  );
}
