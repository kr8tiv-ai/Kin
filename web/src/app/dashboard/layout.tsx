'use client';

// ============================================================================
// Dashboard Layout — Sidebar + content shell for all /dashboard/* routes.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';
import { DashboardTopbar } from '@/components/layout/DashboardTopbar';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { useAutoRedeemReferral } from '@/hooks/useAutoRedeemReferral';
import { useSWUpdate } from '@/hooks/useSWUpdate';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auto-redeem any pending referral code from /join?ref=CODE
  useAutoRedeemReferral();
  const { updateAvailable, reloadToUpdate, dismissUpdate } = useSWUpdate();

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-bg">
        {/* Desktop Sidebar — hidden on mobile */}
        <div className="hidden md:block md:fixed md:inset-y-0 md:left-0 md:z-30">
          <DashboardSidebar />
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col md:ml-[260px]">
          {/* Mobile Topbar — visible only on mobile */}
          <DashboardTopbar />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl p-6">
              {/* SW Update Toast */}
              <AnimatePresence>
                {updateAvailable && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gold/20 bg-gold/[0.04] px-4 py-3"
                  >
                    <p className="text-sm text-white">
                      <span className="mr-2">✨</span>
                      New version available
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={reloadToUpdate}
                        className="rounded-full bg-gold/10 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/20 transition-colors"
                      >
                        Reload
                      </button>
                      <button
                        type="button"
                        onClick={dismissUpdate}
                        className="p-1 text-white/30 hover:text-white/60 transition-colors"
                        aria-label="Dismiss update"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* PWA Install Banner */}
              <PWAInstallBanner />

              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
