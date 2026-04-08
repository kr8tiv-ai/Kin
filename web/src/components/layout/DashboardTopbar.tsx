'use client';

// ============================================================================
// Dashboard Topbar — Mobile-only top bar with hamburger menu.
// ============================================================================

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { DashboardSidebar } from './DashboardSidebar';
import { cn } from '@/lib/utils';

export function DashboardTopbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();

  const initial = (user?.firstName ?? 'U').charAt(0).toUpperCase();

  // Lock body scroll when the mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      {/* Top Bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-surface px-4 md:hidden">
        {/* Hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <div className="flex flex-col items-center justify-center gap-1.5">
            <span
              className={cn(
                'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                menuOpen && 'translate-y-2 rotate-45',
              )}
            />
            <span
              className={cn(
                'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                menuOpen && 'opacity-0',
              )}
            />
            <span
              className={cn(
                'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                menuOpen && '-translate-y-2 -rotate-45',
              )}
            />
          </div>
        </button>

        {/* Logo — matches kin-by-kr8tiv source */}
        <div className="flex items-center gap-2">
          <span
            className="font-display text-xl font-extrabold tracking-[-0.04em] uppercase"
            style={{ color: '#fff' }}
          >
            KIN
          </span>
          <a href="https://kr8tiv.ai" target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity">
            <Image src="/kr8tiv-logo.png" alt="KR8TIV" width={46} height={16} style={{ height: '16px', width: 'auto', filter: 'brightness(2)' }} />
          </a>
        </div>

        {/* User Avatar + Child indicator */}
        <div className="flex items-center gap-2">
          {user?.authProvider === 'family' && (
            <span className="rounded-full bg-cyan/10 border border-cyan/20 px-2 py-0.5 text-[10px] font-medium text-cyan">
              🛡️ Safe
            </span>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan/20 text-cyan font-display font-bold text-sm">
            {initial}
          </div>
        </div>
      </header>

      {/* Slide-out Sidebar Overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMenuOpen(false)}
            />

            {/* Sidebar Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden"
            >
              <DashboardSidebar
                className="shadow-2xl"
                onNavigate={() => setMenuOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
