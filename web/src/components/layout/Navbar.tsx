'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/companions', label: 'Companions' },
  { href: '/pricing', label: 'Pricing' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/[0.02] backdrop-blur-[20px] border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.3)]'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between sm:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl" aria-hidden="true">
              🐙
            </span>
            <span
              className="font-display text-xl font-bold tracking-tight text-cyan"
              style={{
                textShadow:
                  '0 0 7px rgba(0,240,255,0.6), 0 0 20px rgba(0,240,255,0.4)',
              }}
            >
              KIN
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-cyan text-cyan px-5 py-2 text-sm font-semibold transition-all duration-200 hover:bg-cyan/10"
            >
              Login
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            type="button"
            className="md:hidden relative z-50 flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <div className="flex flex-col items-center justify-center gap-1.5">
              <span
                className={cn(
                  'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                  mobileOpen && 'translate-y-2 rotate-45',
                )}
              />
              <span
                className={cn(
                  'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                  mobileOpen && 'opacity-0',
                )}
              />
              <span
                className={cn(
                  'block h-0.5 w-5 rounded-full bg-white transition-all duration-300',
                  mobileOpen && '-translate-y-2 -rotate-45',
                )}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="md:hidden overflow-hidden border-b border-white/10 bg-black/95 backdrop-blur-xl"
          >
            <div className="px-4 py-6 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-base font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 px-4">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center rounded-full border border-cyan text-cyan px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-cyan/10"
                >
                  Login
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
