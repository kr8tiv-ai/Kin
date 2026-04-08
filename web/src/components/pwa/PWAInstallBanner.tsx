'use client';

// ============================================================================
// PWAInstallBanner — Dismissible install banner shown at top of dashboard.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/Button';
import { IOSInstallModal } from './IOSInstallModal';

export function PWAInstallBanner() {
  const { canInstall, isInstalled, isIOS, isDismissed, promptInstall, dismissInstall } =
    usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // Don't show when already installed, dismissed, or on desktop with no prompt
  if (isInstalled || isDismissed) return null;
  if (!canInstall && !isIOS) return null;

  function handleInstallClick() {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      promptInstall();
    }
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-cyan/20 bg-cyan/[0.04] px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg shrink-0">📲</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                Add KIN to your home screen
              </p>
              <p className="text-xs text-white/40 truncate">
                Get instant access with offline support
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={handleInstallClick}>
              Install
            </Button>
            <button
              type="button"
              onClick={dismissInstall}
              className="p-1.5 text-white/30 hover:text-white/60 transition-colors"
              aria-label="Dismiss install banner"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 4L4 12M4 4L12 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <IOSInstallModal
        open={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  );
}
