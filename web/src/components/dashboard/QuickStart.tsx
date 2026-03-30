'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kin-quickstart-dismissed';

interface QuickStartProps {
  conversationCount: number;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const STEPS = [
  {
    number: 1,
    title: 'Chat with your companion',
    description: 'Start a conversation on Telegram and get to know your AI companion.',
    ctaLabel: 'Open Telegram',
    ctaHref: 'https://t.me/KinCompanionBot',
    external: true,
    accent: 'cyan' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    number: 2,
    title: 'Build a website',
    description: 'Use the web builder to create your portfolio or personal site.',
    ctaLabel: 'Create Project',
    ctaHref: '/dashboard/projects',
    external: false,
    accent: 'magenta' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    number: 3,
    title: 'Invite friends',
    description: 'Share your referral code and earn rewards when friends join.',
    ctaLabel: 'Get Referral Code',
    ctaHref: '/dashboard/refer',
    external: false,
    accent: 'gold' as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
];

const ACCENT_COLORS = {
  cyan: { text: 'text-cyan', bg: 'bg-cyan/10', border: 'border-cyan/20', hover: 'hover:bg-cyan/20' },
  magenta: { text: 'text-magenta', bg: 'bg-magenta/10', border: 'border-magenta/20', hover: 'hover:bg-magenta/20' },
  gold: { text: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20', hover: 'hover:bg-gold/20' },
};

export function QuickStart({ conversationCount }: QuickStartProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === 'true');
  }, []);

  // Only show for users with fewer than 3 conversations
  if (conversationCount >= 3 || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-[20px] p-6">
            {/* Close Button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
              aria-label="Dismiss quick start guide"
            >
              <CloseIcon />
            </button>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-white">
                Get Started
              </h2>
              <p className="mt-1 text-sm text-white/50">
                Three steps to make the most of KIN.
              </p>
            </div>

            {/* Steps Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, index) => {
                const colors = ACCENT_COLORS[step.accent];
                const Tag = step.external ? 'a' : 'a';
                const linkProps = step.external
                  ? { target: '_blank', rel: 'noopener noreferrer' as const }
                  : {};

                return (
                  <motion.div
                    key={step.number}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 * (index + 1) }}
                    className="flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-xl mb-4',
                        colors.bg,
                        colors.text,
                      )}
                    >
                      {step.icon}
                    </div>

                    {/* Step Number + Title */}
                    <p className={cn('text-xs font-mono font-medium mb-1', colors.text)}>
                      Step {step.number}
                    </p>
                    <h3 className="font-display text-sm font-semibold text-white mb-1">
                      {step.title}
                    </h3>
                    <p className="text-xs text-white/40 leading-relaxed mb-4 flex-1">
                      {step.description}
                    </p>

                    {/* CTA */}
                    <Tag
                      href={step.ctaHref}
                      {...linkProps}
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg px-4 py-2',
                        'text-xs font-medium transition-all duration-200',
                        'border',
                        colors.border,
                        colors.text,
                        colors.hover,
                      )}
                    >
                      {step.ctaLabel}
                    </Tag>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
