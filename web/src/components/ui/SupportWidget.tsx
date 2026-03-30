'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="24"
      height="24"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const SUPPORT_OPTIONS = [
  {
    label: 'Chat with Support',
    href: 'https://t.me/KinCompanionBot?start=support',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className="shrink-0">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    external: true,
  },
  {
    label: 'Browse FAQ',
    href: '/pricing#faq',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="shrink-0">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    external: false,
  },
  {
    label: 'Send Feedback',
    href: 'mailto:support@meetyourkin.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" className="shrink-0">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    external: true,
  },
];

export function SupportWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Expanded Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-72 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-[20px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-white">
                Need Help?
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
                aria-label="Close support panel"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {SUPPORT_OPTIONS.map((option) => {
                const Tag = option.external ? 'a' : 'a';
                const linkProps = option.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {};

                return (
                  <Tag
                    key={option.label}
                    href={option.href}
                    {...linkProps}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3',
                      'border border-white/[0.06] bg-white/[0.03]',
                      'text-sm font-medium text-white/70',
                      'transition-all duration-200',
                      'hover:border-cyan/20 hover:bg-cyan/[0.05] hover:text-white',
                    )}
                  >
                    <span className="text-cyan">{option.icon}</span>
                    {option.label}
                  </Tag>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Button */}
      <motion.button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full',
          'bg-cyan text-black shadow-[0_4px_20px_rgba(0,240,255,0.4)]',
          'transition-all duration-200 hover:shadow-[0_4px_30px_rgba(0,240,255,0.6)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        )}
        aria-label={open ? 'Close support' : 'Open support'}
        whileTap={{ scale: 0.95 }}
      >
        {/* Pulse ring when collapsed */}
        {!open && (
          <span className="absolute inset-0 animate-ping rounded-full bg-cyan/30" />
        )}
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <CloseIcon className="h-5 w-5" />
            </motion.span>
          ) : (
            <motion.span
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChatBubbleIcon className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
