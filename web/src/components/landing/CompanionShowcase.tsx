'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { COMPANION_LIST } from '@/lib/companions';
import { cn } from '@/lib/utils';

const colorStyles: Record<string, { border: string; glow: string; badge: string }> = {
  cyan: {
    border: 'border-cyan/20',
    glow: '0 8px 32px rgba(0, 240, 255, 0.15)',
    badge: 'bg-cyan/10 text-cyan border-cyan/20',
  },
  magenta: {
    border: 'border-magenta/20',
    glow: '0 8px 32px rgba(255, 0, 170, 0.15)',
    badge: 'bg-magenta/10 text-magenta border-magenta/20',
  },
  gold: {
    border: 'border-gold/20',
    glow: '0 8px 32px rgba(255, 215, 0, 0.15)',
    badge: 'bg-gold/10 text-gold border-gold/20',
  },
};

export function CompanionShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full bg-magenta/10 border border-magenta/20 px-4 py-1.5 text-xs font-mono text-magenta mb-4">
            Genesis Collection
          </span>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Meet the Genesis Six
          </h2>
          <p className="mt-4 text-lg text-white/50 max-w-2xl mx-auto">
            Six unique AI companions, each with their own personality, skills, and style.
          </p>
        </motion.div>

        {/* Companion Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {COMPANION_LIST.map((companion, index) => {
            const style = colorStyles[companion.color] || colorStyles.cyan;
            return (
              <motion.div
                key={companion.id}
                initial={{ opacity: 0, y: 40 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
              >
                <Link href="/companions" className="block group">
                  <div
                    className={cn(
                      'rounded-xl border bg-white/[0.02] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:-translate-y-1',
                      style.border,
                    )}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = style.glow;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                    }}
                  >
                    {/* Image */}
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={companion.images[0]}
                        alt={companion.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Emoji overlay */}
                      <div className="absolute top-4 right-4">
                        <span className="text-2xl drop-shadow-lg">{companion.emoji}</span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-display text-lg font-bold text-white">
                          {companion.name}
                        </h3>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono',
                            style.badge,
                          )}
                        >
                          {companion.species}
                        </span>
                      </div>
                      <p className="text-sm text-white/50 leading-relaxed">
                        {companion.tagline}
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
