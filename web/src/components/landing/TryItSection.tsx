'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SamplePrompt {
  companionId: string;
  companionName: string;
  emoji: string;
  species: string;
  prompt: string;
  accent: 'cyan' | 'gold' | 'magenta';
}

const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    companionId: 'cipher',
    companionName: 'Cipher',
    emoji: '\uD83D\uDC19',
    species: 'Code Kraken',
    prompt: 'Help me design a portfolio website',
    accent: 'cyan',
  },
  {
    companionId: 'mischief',
    companionName: 'Mischief',
    emoji: '\uD83D\uDC15',
    species: 'Glitch Pup',
    prompt: 'Write a birthday post for my family blog',
    accent: 'gold',
  },
  {
    companionId: 'catalyst',
    companionName: 'Catalyst',
    emoji: '\uD83E\uDEE7',
    species: 'Cosmic Blob',
    prompt: 'Review my monthly budget',
    accent: 'magenta',
  },
];

const ACCENT_STYLES = {
  cyan: {
    text: 'text-cyan',
    glow: 'rgba(0, 240, 255, 0.15)',
    border: 'border-cyan/20',
    bg: 'bg-cyan/10',
    hover: 'hover:border-cyan/40 hover:shadow-[0_8px_32px_rgba(0,240,255,0.15)]',
    btnBorder: 'border-cyan',
    btnHover: 'hover:bg-cyan/10',
  },
  gold: {
    text: 'text-gold',
    glow: 'rgba(255, 215, 0, 0.15)',
    border: 'border-gold/20',
    bg: 'bg-gold/10',
    hover: 'hover:border-gold/40 hover:shadow-[0_8px_32px_rgba(255,215,0,0.15)]',
    btnBorder: 'border-gold',
    btnHover: 'hover:bg-gold/10',
  },
  magenta: {
    text: 'text-magenta',
    glow: 'rgba(255, 0, 170, 0.15)',
    border: 'border-magenta/20',
    bg: 'bg-magenta/10',
    hover: 'hover:border-magenta/40 hover:shadow-[0_8px_32px_rgba(255,0,170,0.15)]',
    btnBorder: 'border-magenta',
    btnHover: 'hover:bg-magenta/10',
  },
};

function PromptCard({
  sample,
  index,
}: {
  sample: SamplePrompt;
  index: number;
}) {
  const styles = ACCENT_STYLES[sample.accent];
  const telegramUrl = `https://t.me/KinCompanionBot?start=${sample.companionId}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: 0.15 * index }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{
          duration: 4 + index * 0.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn(
          'flex flex-col rounded-2xl border bg-white/[0.02] backdrop-blur-[20px] p-6',
          'transition-all duration-300',
          styles.border,
          styles.hover,
        )}
      >
        {/* Companion Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl text-lg',
              styles.bg,
            )}
          >
            {sample.emoji}
          </div>
          <div>
            <p className="font-display text-sm font-bold text-white">
              {sample.companionName}
            </p>
            <p className={cn('text-xs font-mono', styles.text)}>
              {sample.species}
            </p>
          </div>
        </div>

        {/* Sample Prompt */}
        <div className="flex-1 mb-5">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-sm text-white/60 italic leading-relaxed">
              &ldquo;{sample.prompt}&rdquo;
            </p>
          </div>
        </div>

        {/* CTA */}
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center justify-center rounded-full border px-5 py-2.5',
            'text-sm font-medium transition-all duration-200',
            styles.btnBorder,
            styles.text,
            styles.btnHover,
          )}
        >
          Try This
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            width="16"
            height="16"
            className="ml-1.5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </motion.div>
    </motion.div>
  );
}

export function TryItSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8"
    >
      {/* Top divider */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Try It Now
          </h2>
          <p className="mt-4 text-lg text-white/50 max-w-md mx-auto">
            Pick a conversation starter and meet your companion on Telegram.
          </p>
        </motion.div>

        {/* Prompt Cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_PROMPTS.map((sample, index) => (
            <PromptCard key={sample.companionId} sample={sample} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
