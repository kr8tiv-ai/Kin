'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { SolanaLoginButton } from '@/components/auth/SolanaLoginButton';
import { EmailLoginButton } from '@/components/auth/EmailLoginButton';
import { XLoginButton } from '@/components/auth/XLoginButton';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  return (
    <main className="relative min-h-screen flex flex-col overflow-hidden bg-black">
      {/* Video background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          poster="/creatures/vortex-1.jpg"
        >
          <source src="/videos/login-bg2.mp4" type="video/mp4" />
        </video>
        {/* Top and bottom fade to black — no vignette, let the art breathe */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90" />
      </div>

      {/* Grain overlay */}
      <div className="grain-overlay" aria-hidden="true" />

      {/* Navigation — matches kin-by-kr8tiv/index.html nav exactly */}
      <nav className="relative z-20 w-full px-6 sm:px-10 lg:px-16 py-6 sm:py-8 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <Link href="/">
              <span
                className="font-display font-extrabold tracking-[-0.04em] uppercase"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', color: '#fff' }}
              >
                KIN
              </span>
            </Link>
            <div className="hidden sm:flex items-center gap-1.5 pt-1">
              <a href="https://bags.fm/U1zc8QpnrQ3HBJUBrWFYWbQTLzNsCpPgZNegWXdBAGS" target="_blank" rel="noopener noreferrer" title="$KR8TIV on Bags" className="opacity-35 hover:opacity-100 transition-opacity duration-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 8h-3V6c0-1.1-.9-2-2-2H9C7.9 4 7 4.9 7 6v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm11 14H4V10h16v10zm-5-4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/></svg>
              </a>
              <a href="https://x.com/kr8tivai" target="_blank" rel="noopener noreferrer" title="X / Twitter" className="opacity-35 hover:opacity-100 transition-opacity duration-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://t.me/kr8tivai" target="_blank" rel="noopener noreferrer" title="Telegram" className="opacity-35 hover:opacity-100 transition-opacity duration-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </a>
              <a href="https://linkedin.com/company/kr8tivai" target="_blank" rel="noopener noreferrer" title="LinkedIn" className="opacity-35 hover:opacity-100 transition-opacity duration-300">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
            </div>
          </div>
          <a href="https://kr8tiv.ai" target="_blank" rel="noopener noreferrer" className="hidden sm:block">
            <Image src="/kr8tiv-logo.png" alt="KR8TIV" width={80} height={28} style={{ height: '28px', width: 'auto', opacity: 0.6, filter: 'brightness(2)', transition: 'opacity 0.3s' }} />
          </a>
        </div>
        <div className="hidden sm:flex items-center gap-8">
          <a href="https://www.meetyourkin.com/#capabilities" className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/35 transition-colors duration-300 hover:text-white">Features</a>
          <a href="https://www.meetyourkin.com/#bloodlines" className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/35 transition-colors duration-300 hover:text-white">Genesis Six</a>
          <a href="https://www.meetyourkin.com/#how-it-works" className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/35 transition-colors duration-300 hover:text-white">How It Works</a>
          <a href="https://www.meetyourkin.com/#mint" className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/35 transition-colors duration-300 hover:text-white">Mint</a>
          <a href="https://www.meetyourkin.com/#faq" className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-white/35 transition-colors duration-300 hover:text-white">About</a>
        </div>
      </nav>

      {/* Hero Content — centered, bold, matches meetyourkin.com */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center">
        {/* Big title — matches meetyourkin.com hero style */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1
            className="font-display font-extrabold uppercase leading-[0.9] tracking-[-0.04em] text-white"
            style={{
              fontSize: 'clamp(4rem, 10vw, 9rem)',
            }}
          >
            Meet Your{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #00f0ff 0%, #ff00aa 50%, #ffd700 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              KIN
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-lg text-white/70 leading-relaxed"
          style={{ fontSize: 'clamp(1rem, 1.8vw, 1.25rem)' }}
        >
          Your AI companion that grows with you.
          <br />
          Sign in to begin.
        </motion.p>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 w-full max-w-sm"
        >
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-7 py-8 sm:px-9 sm:py-10 space-y-4">
            {/* Google Sign-In */}
            <div className="flex justify-center">
              <GoogleLoginButton
                onAuth={(token, user) => {
                  login(token, user);
                  router.push('/onboard');
                }}
              />
            </div>

            {/* X (Twitter) Sign-In */}
            <XLoginButton />

            {/* Solana Wallet Sign-In */}
            <SolanaLoginButton
              onAuth={(token, user) => {
                login(token, user);
                router.push('/onboard');
              }}
            />

            {/* Email Sign-In */}
            <EmailLoginButton
              onAuth={(token, user) => {
                login(token, user);
                router.push('/onboard');
              }}
            />

            {/* Divider */}
            <div className="flex items-center gap-3 !my-5">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-white/20 select-none">
                or
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            {/* Telegram Login Widget */}
            <div className="flex justify-center">
              <TelegramLoginButton
                onAuth={(token, user) => {
                  login(token, user);
                  router.push('/onboard');
                }}
              />
            </div>

            {/* Open in Telegram — outline style, consistent with Solana button */}
            <a
              href="https://t.me/KinCompanionBot"
              target="_blank"
              rel="noopener noreferrer"
              className="login-btn login-btn--telegram flex w-full items-center justify-center gap-2.5 rounded-full border border-[#ff00aa]/40 px-8 py-3 font-display text-sm font-medium uppercase tracking-wide text-[#ff00aa] transition-all duration-300 hover:bg-[#ff00aa] hover:text-white hover:border-[#ff00aa] hover:shadow-[0_0_30px_rgba(255,0,170,0.3)]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Open in Telegram
            </a>
          </div>

          {/* Links below card */}
          <div className="mt-5 flex items-center justify-center gap-4 text-[0.7rem]">
            <a
              href="https://www.meetyourkin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/30 hover:text-[#00f0ff] transition-colors duration-300"
            >
              Learn More
            </a>
            <span className="text-white/10">|</span>
            <a
              href="https://telegram.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/30 hover:text-[#00f0ff] transition-colors duration-300"
            >
              Get Telegram
            </a>
          </div>
        </motion.div>
      </div>

      {/* Footer strip — matches kin-by-kr8tiv source */}
      <div className="relative z-10 w-full border-t border-white/10 px-6 sm:px-10 lg:px-16 py-6 flex items-center justify-between">
        <span className="text-[0.8rem] text-white/50">
          &copy; 2026 KR8TIV AI
        </span>
        <div className="flex items-center gap-6">
          <a
            href="https://www.meetyourkin.com/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 text-[0.8rem] transition-colors hover:text-[#00f0ff]"
          >
            Terms
          </a>
          <a
            href="https://www.meetyourkin.com/terms.html#privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 text-[0.8rem] transition-colors hover:text-[#00f0ff]"
          >
            Privacy
          </a>
        </div>
      </div>
    </main>
  );
}
