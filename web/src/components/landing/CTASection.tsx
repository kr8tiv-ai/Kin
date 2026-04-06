'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';

export function CTASection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Decorative creature images */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 w-72 h-72 sm:w-96 sm:h-96 opacity-15 pointer-events-none">
        <Image
          src="/creatures/forge-1.jpg"
          alt=""
          fill
          className="object-cover rounded-full blur-sm"
          sizes="384px"
        />
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 w-72 h-72 sm:w-96 sm:h-96 opacity-15 pointer-events-none">
        <Image
          src="/creatures/aether-1.jpg"
          alt=""
          fill
          className="object-cover rounded-full blur-sm"
          sizes="384px"
        />
      </div>

      {/* Glow effects */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-magenta/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            <span className="text-white">Ready to meet your</span>{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #00f0ff, #ff00aa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              companion?
            </span>
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 text-lg sm:text-xl text-white/50 max-w-xl mx-auto"
        >
          Join thousands building with their AI friends.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/getting-started"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-magenta px-10 py-4 text-base font-semibold text-white shadow-[0_0_30px_rgba(255,0,170,0.3)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(255,0,170,0.5)]"
          >
            Start for Free
          </Link>
          <a
            href="https://t.me/KinCompanionBot"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-cyan text-cyan px-10 py-4 text-base font-semibold transition-all duration-200 hover:bg-cyan/10"
          >
            Open Telegram Bot
          </a>
          <Link
            href="/demo"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/20 text-white/70 px-10 py-4 text-base font-semibold transition-all duration-200 hover:bg-white/10"
          >
            Try Demo
          </Link>
          <Link
            href="/getting-started"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/20 text-white/70 px-10 py-4 text-base font-semibold transition-all duration-200 hover:bg-white/10"
          >
            Self-Host
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
