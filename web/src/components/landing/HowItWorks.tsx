'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const STEPS = [
  {
    number: '01',
    emoji: '\uD83E\uDD5A',
    title: 'Claim Your Companion',
    description:
      'Choose from six unique AI companions, each with their own personality and specialty.',
  },
  {
    number: '02',
    emoji: '\uD83D\uDCAC',
    title: 'Start Chatting',
    description:
      'Talk to your companion on Telegram. They learn your style and grow with you.',
  },
  {
    number: '03',
    emoji: '\uD83D\uDE80',
    title: 'Build Together',
    description:
      'Create websites, manage projects, and level up with your AI friend.',
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#050505]"
    >
      {/* Subtle top/bottom gradients for visual break */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            How It Works
          </h2>
          <p className="mt-4 text-lg text-white/50 max-w-xl mx-auto">
            Three simple steps to your personalized AI companion experience.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                delay: 0.2 + index * 0.15,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="relative"
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 h-full transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                {/* Number Badge */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-cyan/10 border border-cyan/20 text-cyan font-mono text-sm font-bold">
                    {step.number}
                  </span>
                  <span className="text-2xl">{step.emoji}</span>
                </div>

                <h3 className="font-display text-xl font-bold text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Connector line (desktop only, between cards) */}
              {index < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 lg:-right-5 w-8 lg:w-10 h-px bg-gradient-to-r from-white/20 to-transparent" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
