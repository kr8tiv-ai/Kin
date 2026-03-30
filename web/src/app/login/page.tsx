'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { TelegramLoginButton } from '@/components/auth/TelegramLoginButton';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  return (
    <>
      <Navbar />
      <main className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 overflow-hidden">
        {/* Background creature image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/creatures/vortex-1.jpg"
            alt=""
            fill
            className="object-cover object-center opacity-20"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black" />
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 sm:p-10">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="text-3xl" aria-hidden="true">🐙</span>
              <span
                className="font-display text-2xl font-bold tracking-tight text-cyan"
                style={{
                  textShadow: '0 0 7px rgba(0,240,255,0.6), 0 0 20px rgba(0,240,255,0.4)',
                }}
              >
                KIN
              </span>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
                Welcome to KIN
              </h1>
              <p className="text-sm text-white/50">
                Sign in with your Telegram account to get started
              </p>
            </div>

            {/* Telegram Login Widget */}
            <div className="mb-6 flex justify-center">
              <TelegramLoginButton
                onAuth={(token, user) => {
                  login(token, user);
                  router.push('/onboard');
                }}
              />
            </div>

            {/* Alternative: Direct bot link */}
            <div className="text-center mb-6">
              <p className="text-xs text-white/30 mb-3">Or start chatting directly</p>
              <a
                href="https://t.me/KinCompanionBot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-magenta px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,0,170,0.3)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_30px_rgba(255,0,170,0.5)]"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                Open in Telegram
              </a>
            </div>

            {/* Help link */}
            <div className="text-center">
              <p className="text-xs text-white/30">
                Don&apos;t have Telegram?{' '}
                <a
                  href="https://telegram.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan underline underline-offset-2 hover:text-cyan/80"
                >
                  Download it here
                </a>
              </p>
            </div>
          </div>

          {/* Back to home */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-white/30 transition-colors hover:text-white/60"
            >
              &larr; Back to home
            </Link>
          </div>
        </motion.div>
      </main>
      <Footer />
    </>
  );
}
