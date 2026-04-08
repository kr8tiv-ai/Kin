'use client';

// ============================================================================
// Navbar — Matches kin-by-kr8tiv/index.html nav exactly.
// Logo left (KIN + social icons + KR8TIV logo), nav links top-right.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: 'https://www.meetyourkin.com/#capabilities', label: 'Features' },
  { href: 'https://www.meetyourkin.com/#bloodlines', label: 'Genesis Six' },
  { href: 'https://www.meetyourkin.com/#how-it-works', label: 'How It Works' },
  { href: 'https://www.meetyourkin.com/#mint', label: 'Mint' },
  { href: 'https://www.meetyourkin.com/#faq', label: 'About' },
];

// Exact SVG paths from kin-by-kr8tiv/index.html
const SOCIAL_ICONS = {
  bags: 'M20 8h-3V6c0-1.1-.9-2-2-2H9C7.9 4 7 4.9 7 6v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm11 14H4V10h16v10zm-5-4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z',
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

const SOCIAL_LINKS = [
  { href: 'https://bags.fm/U1zc8QpnrQ3HBJUBrWFYWbQTLzNsCpPgZNegWXdBAGS', label: '$KR8TIV on Bags', icon: 'bags', size: 16 },
  { href: 'https://x.com/kr8tivai', label: 'X / Twitter', icon: 'x', size: 14 },
  { href: 'https://t.me/kr8tivai', label: 'Telegram', icon: 'telegram', size: 14 },
  { href: 'https://linkedin.com/company/kr8tivai', label: 'LinkedIn', icon: 'linkedin', size: 14 },
];

function SocialIcon({ icon, size }: { icon: string; size: number }) {
  const path = SOCIAL_ICONS[icon as keyof typeof SOCIAL_ICONS];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
      <path d={path} />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    function handleScroll() {
      const isScrolled = window.scrollY > 20;
      if (scrolledRef.current !== isScrolled) {
        scrolledRef.current = isScrolled;
        setScrolled(isScrolled);
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-white/[0.02] backdrop-blur-[20px] border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.3)]'
          : 'bg-transparent',
      )}
      style={{ mixBlendMode: 'difference', color: '#fff' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-16">
        <div className="flex h-16 items-center justify-between sm:h-20">
          {/* Logo area — KIN + social icons + KR8TIV logo below */}
          <div className="flex flex-col gap-1 shrink-0">
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
                {SOCIAL_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.label}
                    className="opacity-35 hover:opacity-100 transition-opacity duration-300"
                  >
                    <SocialIcon icon={link.icon} size={link.size} />
                  </a>
                ))}
              </div>
            </div>
            <a
              href="https://kr8tiv.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:block"
            >
              <img
                src="/kr8tiv-logo.png"
                alt="KR8TIV"
                style={{ height: '28px', width: 'auto', opacity: 0.6, filter: 'brightness(2)', transition: 'opacity 0.3s' }}
                onMouseEnter={(e) => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.target as HTMLImageElement).style.opacity = '0.6'; }}
              />
            </a>
          </div>

          {/* Desktop Links — right side */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-[0.65rem] uppercase tracking-[0.1em] transition-colors duration-300"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
              >
                {link.label}
              </a>
            ))}
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
              <span className={cn('block h-0.5 w-5 rounded-full bg-white transition-all duration-300', mobileOpen && 'translate-y-2 rotate-45')} />
              <span className={cn('block h-0.5 w-5 rounded-full bg-white transition-all duration-300', mobileOpen && 'opacity-0')} />
              <span className={cn('block h-0.5 w-5 rounded-full bg-white transition-all duration-300', mobileOpen && '-translate-y-2 -rotate-45')} />
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
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-3 text-base font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
              <div className="flex items-center gap-4 px-4 pt-4">
                {SOCIAL_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <SocialIcon icon={link.icon} size={link.size} />
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
