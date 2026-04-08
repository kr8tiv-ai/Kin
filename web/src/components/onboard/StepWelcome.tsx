'use client';

// ============================================================================
// StepWelcome - Onboarding Step 1: Introduction to KIN.
// ============================================================================

import { motion } from 'framer-motion';
import Image from 'next/image';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface StepWelcomeProps {
  onNext: () => void;
  onSkip?: () => void;
}

const FEATURES = [
  {
    title: 'Understands You',
    description:
      'Your KIN starts with your goals, context, and style so it feels useful from the very first reply.',
    icon: (
      <svg
        className="h-6 w-6 text-cyan"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
        />
      </svg>
    ),
  },
  {
    title: 'Handles Complexity Quietly',
    description:
      'Memory, model routing, and advanced AI stay behind the curtain while the experience stays calm and clear.',
    icon: (
      <svg
        className="h-6 w-6 text-magenta"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
        />
      </svg>
    ),
  },
  {
    title: 'Shows Up Where You Are',
    description:
      'Meet your KIN in the dashboard now, then keep the relationship going across channels as your world moves.',
    icon: (
      <svg
        className="h-6 w-6 text-gold"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
        />
      </svg>
    ),
  },
];

export function StepWelcome({ onNext, onSkip }: StepWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center"
    >
      <h1 className="mb-3 text-center font-display text-3xl font-bold sm:text-4xl">
        <span className="bg-gradient-to-r from-cyan via-magenta to-gold bg-clip-text text-transparent">
          Welcome to KIN
        </span>
      </h1>
      <p className="mb-8 max-w-md text-center text-sm text-white/50 leading-relaxed">
        KIN gives you a deeply capable AI companion that feels personal from the
        first conversation. We handle the intelligence behind the curtain so you
        can stay focused on what matters.
      </p>

      <div className="mb-10 flex items-center justify-center gap-4">
        {['/creatures/cipher-1.jpg', '/creatures/mischief-1.jpg', '/creatures/vortex-1.jpg'].map(
          (src, index) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.15 }}
              className="relative h-20 w-20 overflow-hidden rounded-full border border-white/10"
            >
              <Image src={src} alt="" fill className="object-cover" sizes="80px" />
            </motion.div>
          ),
        )}
      </div>

      <div className="mb-10 grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
          >
            <GlassCard className="p-5 text-center" hover={false}>
              <div className="mb-3 flex justify-center">{feature.icon}</div>
              <h3 className="mb-1.5 text-sm font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-xs text-white/40 leading-relaxed">
                {feature.description}
              </p>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <Button size="lg" onClick={onNext}>
        Build My KIN
      </Button>

      <motion.button
        type="button"
        onClick={() => onSkip?.()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-4 text-[11px] text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
      >
        Already know which KIN you want? Jump to companions -&gt;
      </motion.button>
    </motion.div>
  );
}
