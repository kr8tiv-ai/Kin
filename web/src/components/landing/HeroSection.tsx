'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';
import { track } from '@/lib/analytics';

const HERO_VIDEO_SRC = '/video/hero-bg.mp4';

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
  const sectionRef = useRef<HTMLElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax: background image shifts down slowly as user scrolls
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);

  return (
    <section ref={sectionRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background: Video with image fallback + parallax */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        {/* Video background — falls back to image on error or when no video file present */}
        {!videoFailed && (
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover scale-110"
            onError={() => setVideoFailed(true)}
          >
            <source src={HERO_VIDEO_SRC} type="video/mp4" />
          </video>
        )}
        {/* Static image fallback (always rendered behind video, shows when video fails) */}
        <Image
          src="/creatures/cipher-1.jpg"
          alt=""
          fill
          className="object-cover object-center scale-110"
          priority
          sizes="100vw"
        />
        {/* Darker gradient overlays for dramatic effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/70" />
        <div className="absolute inset-0 bg-black/20" />
      </motion.div>

      {/* Animated gradient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Large cyan orb - top left */}
        <div
          className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, rgba(0,240,255,0.4) 0%, transparent 70%)',
            filter: 'blur(120px)',
            animation: 'orb-float 8s ease-in-out infinite',
          }}
        />
        {/* Large magenta orb - bottom right */}
        <div
          className="absolute -bottom-20 -right-20 w-[350px] h-[350px] rounded-full opacity-[0.12]"
          style={{
            background: 'radial-gradient(circle, rgba(255,0,170,0.4) 0%, transparent 70%)',
            filter: 'blur(100px)',
            animation: 'orb-float 10s ease-in-out infinite 2s',
          }}
        />
        {/* Small gold orb - center right */}
        <div
          className="absolute top-1/3 right-1/4 w-[200px] h-[200px] rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'orb-float 12s ease-in-out infinite 4s',
          }}
        />
      </div>

      {/* Floating companion images flanking hero */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Left companion */}
        <div
          className="hidden md:block absolute left-6 lg:left-12 top-1/2 -translate-y-1/2 w-48 lg:w-64 h-48 lg:h-64 opacity-20"
          style={{ animation: 'float 6s ease-in-out infinite' }}
        >
          <Image
            src="/creatures/cipher-2.jpg"
            alt=""
            fill
            className="object-cover rounded-2xl"
            style={{ filter: 'blur(1px)' }}
            sizes="256px"
          />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-black/40 via-transparent to-black/60" />
        </div>
        {/* Right companion */}
        <div
          className="hidden md:block absolute right-6 lg:right-12 top-1/2 -translate-y-1/2 w-48 lg:w-64 h-48 lg:h-64 opacity-20"
          style={{ animation: 'float 6s ease-in-out infinite 2s' }}
        >
          <Image
            src="/creatures/forge-2.jpg"
            alt=""
            fill
            className="object-cover rounded-2xl"
            style={{ filter: 'blur(1px)' }}
            sizes="256px"
          />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-l from-black/40 via-transparent to-black/60" />
        </div>
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
            AI Companion Platform &middot; Bags.fm
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
            onClick={() => track('cta_clicked', { label: 'start_chatting', location: 'hero' })}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-magenta px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(255,0,170,0.3)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_rgba(255,0,170,0.5)]"
          >
            Start Chatting
          </a>
          <Link
            href="/companions"
            onClick={() => track('cta_clicked', { label: 'meet_companions', location: 'hero' })}
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
