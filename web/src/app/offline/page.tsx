'use client';

import { motion } from 'framer-motion';

/**
 * Static offline fallback page served by the service worker when
 * the user has no network connection. Must be statically generated
 * (no dynamic data fetching) for SW precaching to work.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full text-center"
      >
        {/* Offline icon */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-cyan"
          >
            {/* Wi-Fi off icon */}
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        {/* Branding */}
        <h1 className="text-3xl font-display font-bold text-white mb-3">
          You&apos;re Offline
        </h1>
        <p className="text-white/60 font-body text-base leading-relaxed mb-8">
          KIN needs an internet connection to chat with your companions.
          Check your connection and try again.
        </p>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
            bg-gradient-to-r from-[#00F0FF]/20 to-[#FF00AA]/20
            border border-[#00F0FF]/30 text-[#00F0FF]
            hover:border-[#00F0FF]/50 hover:bg-[#00F0FF]/10
            transition-all duration-200 font-body font-medium"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Try Again
        </button>

        {/* KIN footer */}
        <p className="mt-12 text-white/20 text-xs font-body">
          KIN — We Build You A Friend
        </p>
      </motion.div>
    </div>
  );
}
