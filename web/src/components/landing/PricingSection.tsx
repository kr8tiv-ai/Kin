'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { PRICING_TIERS, type PricingTier } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

function PricingCard({ tier, index, isInView }: { tier: PricingTier; index: number; isInView: boolean }) {
  const isHighlighted = tier.highlighted;

  const ctaMap: Record<string, { label: string; href: string }> = {
    free: { label: 'Get Started', href: '/login' },
    pro: { label: 'Upgrade to Pro', href: '/login' },
    enterprise: { label: 'Contact Us', href: '/login' },
  };

  const cta = ctaMap[tier.id] || ctaMap.free;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: 0.1 + index * 0.12,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={cn(
        'relative rounded-xl border bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 flex flex-col',
        isHighlighted
          ? 'border-magenta/40 shadow-[0_0_40px_rgba(255,0,170,0.12)] scale-[1.02] lg:scale-105'
          : 'border-white/10',
      )}
    >
      {/* Popular badge */}
      {isHighlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-magenta/20 border border-magenta/30 px-4 py-1 text-xs font-mono font-bold text-magenta">
            Most Popular
          </span>
        </div>
      )}

      {/* Tier Name */}
      <h3 className="font-display text-xl font-bold text-white mb-1">
        {tier.name}
      </h3>

      {/* Price */}
      <div className="mb-6">
        <span className="font-display text-4xl sm:text-5xl font-bold text-white">
          {tier.price === 0 ? 'Free' : `$${tier.price}`}
        </span>
        {tier.price > 0 && (
          <span className="text-sm text-white/40 ml-1">/month</span>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-white/60">
            <svg
              className={cn(
                'w-4 h-4 mt-0.5 shrink-0',
                isHighlighted ? 'text-magenta' : 'text-cyan',
              )}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        href={cta.href}
        onClick={() => track('pricing_cta_clicked', { tier: tier.id, price: tier.price })}
        className={cn(
          'block w-full text-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200',
          isHighlighted
            ? 'bg-magenta text-white shadow-[0_0_20px_rgba(255,0,170,0.3)] hover:brightness-110 hover:shadow-[0_0_30px_rgba(255,0,170,0.5)]'
            : 'border border-cyan text-cyan hover:bg-cyan/10',
        )}
      >
        {cta.label}
      </Link>
    </motion.div>
  );
}

export function PricingSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Simple Pricing
          </h2>
          <p className="mt-4 text-lg text-white/50 max-w-xl mx-auto">
            Start free. Upgrade when you are ready.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {PRICING_TIERS.map((tier, index) => (
            <PricingCard key={tier.id} tier={tier} index={index} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}
