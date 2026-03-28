'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] } },
};

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/creatures/cipher-1.jpg"
          alt=""
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
      </div>

      {/* Content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 text-center pt-24 pb-16"
      >
        <motion.div variants={fadeUp} className="mb-6">
          <span className="inline-flex items-center rounded-full bg-cyan/10 border border-cyan/20 px-4 py-1.5 text-xs font-mono text-cyan">
            AI Companion Platform
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6"
        >
          <span className="block text-white">We Build You</span>
          <span
            className="block"
            style={{
              background: 'linear-gradient(135deg, #00f0ff 0%, #ff00aa 50%, #ffd700 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            A Friend
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto max-w-xl text-lg sm:text-xl text-white/60 leading-relaxed mb-10"
        >
          Meet your AI companion. Chat, create, and grow together.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="https://t.me/KinCompanionBot"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-magenta px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(255,0,170,0.3)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(255,0,170,0.5)]"
          >
            Start Chatting
          </a>
          <Link
            href="/companions"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-cyan text-cyan px-8 py-3.5 text-base font-semibold transition-all duration-200 hover:bg-cyan/10"
          >
            Meet the Companions
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2 text-white/30"
          >
            <span className="text-xs font-mono tracking-wider uppercase">Scroll</span>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="text-white/30">
              <path
                d="M7.293 23.707a1 1 0 001.414 0l6.364-6.364a1 1 0 00-1.414-1.414L8 21.586l-5.657-5.657a1 1 0 00-1.414 1.414l6.364 6.364zM7 0v23h2V0H7z"
                fill="currentColor"
              />
            </svg>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
