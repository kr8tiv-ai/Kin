'use client';

// ============================================================================
// IOSInstallModal — Step-by-step instructions for iOS Add to Home Screen.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';

interface IOSInstallModalProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 5V15M12 5L8 9M12 5L16 9" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Tap the Share button',
    description: 'Find the share icon in Safari\'s bottom toolbar (the square with an arrow pointing up).',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="#00F0FF" strokeWidth="2"/>
        <path d="M12 8V16M8 12H16" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Tap "Add to Home Screen"',
    description: 'Scroll down in the share menu and tap "Add to Home Screen".',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="#00F0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Tap "Add"',
    description: 'Confirm by tapping "Add" in the top right corner. KIN will appear on your home screen!',
  },
];

export function IOSInstallModal({ open, onClose }: IOSInstallModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-white/10 bg-[#0A0A0A] p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">
                Install KIN on iOS
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-white/30 hover:text-white/60 transition-colors"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/[0.06]">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      <span className="mr-2 text-cyan">{i + 1}.</span>
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-xs text-white/40 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-cyan/10 py-2.5 text-sm font-medium text-cyan transition-colors hover:bg-cyan/20"
            >
              Got it
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
