'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { COMPANION_LIST, type CompanionData } from '@/lib/companions';
import { cn } from '@/lib/utils';

const colorMap: Record<string, { accent: string; border: string; glow: string; badge: string; btn: string }> = {
  cyan: {
    accent: 'text-cyan',
    border: 'border-cyan/20',
    glow: '0 8px 40px rgba(0, 240, 255, 0.12)',
    badge: 'bg-cyan/10 text-cyan border-cyan/20',
    btn: 'border-cyan text-cyan hover:bg-cyan/10',
  },
  magenta: {
    accent: 'text-magenta',
    border: 'border-magenta/20',
    glow: '0 8px 40px rgba(255, 0, 170, 0.12)',
    badge: 'bg-magenta/10 text-magenta border-magenta/20',
    btn: 'border-magenta text-magenta hover:bg-magenta/10',
  },
  gold: {
    accent: 'text-gold',
    border: 'border-gold/20',
    glow: '0 8px 40px rgba(255, 215, 0, 0.12)',
    badge: 'bg-gold/10 text-gold border-gold/20',
    btn: 'border-gold text-gold hover:bg-gold/10',
  },
};

function CompanionCard({ companion, index }: { companion: CompanionData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const isReversed = index % 2 === 1;
  const style = colorMap[companion.color] || colorMap.cyan;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div
        className={cn(
          'rounded-2xl border bg-white/[0.02] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:shadow-lg',
          style.border,
        )}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = style.glow;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        <div
          className={cn(
            'flex flex-col lg:flex-row',
            isReversed && 'lg:flex-row-reverse',
          )}
        >
          {/* Images */}
          <div className="lg:w-1/2 shrink-0">
            <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full">
              <Image
                src={companion.images[0]}
                alt={companion.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div
                className={cn(
                  'absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-black/40 to-transparent',
                  isReversed && 'lg:bg-gradient-to-l',
                )}
              />
            </div>
          </div>

          {/* Content */}
          <div className="lg:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{companion.emoji}</span>
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {companion.name}
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-mono mt-1',
                    style.badge,
                  )}
                >
                  {companion.species}
                </span>
              </div>
            </div>

            <p className={cn('text-sm font-medium mb-3', style.accent)}>
              {companion.tagline}
            </p>

            <p className="text-sm sm:text-base text-white/50 leading-relaxed mb-6">
              {companion.description}
            </p>

            {/* Creature image thumbnails */}
            <div className="flex gap-2 mb-6">
              {companion.images.slice(0, 4).map((img, i) => (
                <div
                  key={i}
                  className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border border-white/10"
                >
                  <Image
                    src={img}
                    alt={`${companion.name} variant ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              ))}
            </div>

            <Link
              href="/login"
              className={cn(
                'inline-flex items-center justify-center rounded-full border px-6 py-2.5 text-sm font-semibold transition-all duration-200 self-start',
                style.btn,
              )}
            >
              Claim {companion.name}
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function CompanionsContent() {
  const headerRef = useRef<HTMLDivElement>(null);
  const headerInView = useInView(headerRef, { once: true });

  return (
    <>
      <Navbar />
      <main className="pt-20 sm:pt-24 pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 20 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center rounded-full bg-magenta/10 border border-magenta/20 px-4 py-1.5 text-xs font-mono text-magenta mb-4">
              Genesis Collection
            </span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
              The Genesis Six
            </h1>
            <p className="mt-4 text-lg text-white/50 max-w-2xl mx-auto">
              Six AI companions, each with their own personality, skills, and style.
              Choose the one that resonates with you.
            </p>
          </motion.div>

          {/* Companion Cards */}
          <div className="space-y-8">
            {COMPANION_LIST.map((companion, index) => (
              <CompanionCard key={companion.id} companion={companion} index={index} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
