'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  stars: number;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I never thought I'd bond with an AI, but Cipher actually remembers my design preferences. It's like having a creative partner who's always available.",
    name: 'Sarah K.',
    role: 'Freelance Designer',
    stars: 5,
  },
  {
    quote:
      'Mischief helps me plan content for my family blog. The fact that it learns my style over time is genuinely impressive.',
    name: 'James T.',
    role: 'Content Creator',
    stars: 5,
  },
  {
    quote:
      "I was skeptical, but Catalyst's financial tips are actually useful. It's like having a wealth coach in my pocket.",
    name: 'Maria R.',
    role: 'Small Business Owner',
    stars: 5,
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="w-4 h-4 text-gold"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function TestimonialsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8"
    >
      {/* Subtle top border */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full bg-gold/10 border border-gold/20 px-4 py-1.5 text-xs font-mono text-gold mb-4">
            Testimonials
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            What People Are Saying
          </h2>
        </motion.div>

        {/* Testimonial Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, index) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                delay: 0.2 + index * 0.15,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 h-full transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_8px_32px_rgba(255,215,0,0.08)]">
                <StarRating count={t.stars} />

                <blockquote className="mt-5 text-white/70 text-sm sm:text-base leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="font-display font-semibold text-white text-sm">
                    {t.name}
                  </p>
                  <p className="text-xs text-white/40 font-mono mt-0.5">
                    {t.role}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
