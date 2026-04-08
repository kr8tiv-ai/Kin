'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';

interface StatItem {
  value: string;
  numericEnd: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

const STATS: StatItem[] = [
  { value: '10,000+', numericEnd: 10000, suffix: '+', label: 'Companions Claimed' },
  { value: '1M+', numericEnd: 1, suffix: 'M+', label: 'Messages Exchanged' },
  { value: '6', numericEnd: 6, label: 'Unique AI Personalities' },
  { value: '99.9%', numericEnd: 99.9, suffix: '%', label: 'Uptime' },
];

function AnimatedCounter({
  end,
  suffix = '',
  prefix = '',
  isInView,
}: {
  end: number;
  suffix?: string;
  prefix?: string;
  isInView: boolean;
}) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isInView) return;

    const duration = 2000; // ms

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const rawProgress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const progress = 1 - Math.pow(1 - rawProgress, 3);

      setCount(end * progress);

      if (rawProgress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isInView, end]);

  // Format the displayed number
  const formatDisplay = (n: number): string => {
    if (end >= 1000 && end < 1000000) {
      return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    if (end < 10) {
      return Math.round(n).toString();
    }
    if (end < 100) {
      return n.toFixed(1);
    }
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  return (
    <span>
      {prefix}
      {formatDisplay(count)}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section
      ref={sectionRef}
      className="relative py-20 sm:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan/5 via-magenta/5 to-cyan/5" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />

      {/* Top/bottom glass borders */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-magenta/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.5,
                delay: 0.1 + index * 0.1,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/20">
                <div className="font-display text-4xl sm:text-5xl font-bold text-white mb-2">
                  <AnimatedCounter
                    end={stat.numericEnd}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                    isInView={isInView}
                  />
                </div>
                <p className="text-xs sm:text-sm text-white/40 font-mono uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
