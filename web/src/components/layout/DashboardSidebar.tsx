'use client';

// ============================================================================
// Dashboard Sidebar — Fixed left navigation for the dashboard.
// ============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { cn } from '@/lib/utils';

const TIER_COLORS: Record<string, string> = {
  free: 'bg-white/10 text-white/70',
  hatchling: 'bg-cyan/10 text-cyan border border-cyan/20',
  elder: 'bg-magenta/10 text-magenta border border-magenta/20',
  hero: 'bg-gold/10 text-gold border border-gold/20',
};

// SVG icon paths — clean, soulful line art that matches the dark premium theme
const ADMIN_TIERS = new Set(['hero']);

const ICONS: Record<string, string> = {
  fleet: 'M5 12H3v8h2v-8zm4-4H7v12h2V8zm4-4h-2v16h2V4zm4 8h-2v8h2v-8zm4-2h-2v10h2V10z',
  admin: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  training: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  overview: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  companion: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9 5.197V21',
  soul: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  collection: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  projects: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  canvas: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  progress: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  skills: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  setup: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  health: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  billing: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  family: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  refer: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  help: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  settings: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg className={cn('w-[18px] h-[18px] shrink-0', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', iconKey: 'overview' },
  { href: '/dashboard/chat', label: 'Chat', iconKey: 'chat' },
  { href: '/dashboard/companion', label: 'My Companion', iconKey: 'companion' },
  { href: '/dashboard/soul', label: 'Soul', iconKey: 'soul' },
  { href: '/dashboard/collection', label: 'Collection', iconKey: 'collection' },
  { href: '/dashboard/projects', label: 'Projects', iconKey: 'projects' },
  { href: '/dashboard/canvas', label: 'Canvas', iconKey: 'canvas' },
  { href: '/dashboard/progress', label: 'Progress', iconKey: 'progress' },
  { href: '/dashboard/skills', label: 'Skills', iconKey: 'skills' },
  { href: '/dashboard/memories', label: 'Memories', iconKey: 'collection' },
  { href: '/dashboard/family', label: 'Family', iconKey: 'family' },
  { href: '/dashboard/setup', label: 'Setup', iconKey: 'setup' },
  { href: '/dashboard/health', label: 'Health', iconKey: 'health' },
  { href: '/dashboard/billing', label: 'Billing', iconKey: 'billing' },
  { href: '/dashboard/refer', label: 'Refer', iconKey: 'refer' },
  { href: '/dashboard/help', label: 'Help', iconKey: 'help' },
  { href: '/dashboard/settings', label: 'Settings', iconKey: 'settings' },
];

interface DashboardSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function DashboardSidebar({ className, onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const firstName = user?.firstName ?? 'User';
  const initial = firstName.charAt(0).toUpperCase();
  const tier = user?.tier ?? 'free';

  function isActive(href: string): boolean {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        'flex h-full w-[260px] flex-col border-r border-white/10 bg-surface',
        className,
      )}
    >
      {/* Logo — matches kin-by-kr8tiv source */}
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <span
            className="font-display text-xl font-extrabold tracking-[-0.04em] uppercase"
            style={{ color: '#fff' }}
          >
            KIN
          </span>
          <div className="flex items-center gap-1 pt-0.5">
            <a href="https://bags.fm/U1zc8QpnrQ3HBJUBrWFYWbQTLzNsCpPgZNegWXdBAGS" target="_blank" rel="noopener noreferrer" title="$KR8TIV on Bags" className="opacity-35 hover:opacity-100 transition-opacity">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20 8h-3V6c0-1.1-.9-2-2-2H9C7.9 4 7 4.9 7 6v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6h6v2H9V6zm11 14H4V10h16v10zm-5-4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/></svg>
            </a>
            <a href="https://x.com/kr8tivai" target="_blank" rel="noopener noreferrer" title="X" className="opacity-35 hover:opacity-100 transition-opacity">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://t.me/kr8tivai" target="_blank" rel="noopener noreferrer" title="Telegram" className="opacity-35 hover:opacity-100 transition-opacity">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
            <a href="https://linkedin.com/company/kr8tivai" target="_blank" rel="noopener noreferrer" title="LinkedIn" className="opacity-35 hover:opacity-100 transition-opacity">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
        <a href="https://kr8tiv.ai" target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img src="/kr8tiv-logo.png" alt="KR8TIV" style={{ height: '18px', width: 'auto', opacity: 0.6, filter: 'brightness(2)', transition: 'opacity 0.3s' }} />
        </a>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan/20 text-cyan font-display font-bold text-lg">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {firstName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider',
                TIER_COLORS[tier] ?? TIER_COLORS.free,
              )}
            >
              {tier}
            </span>
            {user?.authProvider === 'family' && (
              <span className="inline-flex items-center rounded-full bg-cyan/10 border border-cyan/20 px-1.5 py-0.5 text-[10px] font-medium text-cyan">
                🛡️ Safe
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    active
                      ? 'border-l-2 border-cyan bg-cyan/5 text-cyan'
                      : 'border-l-2 border-transparent text-white/60 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <NavIcon name={item.iconKey} />
                  {item.label}
                </Link>
              </li>
            );
          })}

          {/* Fleet — only visible to hero-tier users */}
          {ADMIN_TIERS.has(tier) && (
            <li>
              <Link
                href="/dashboard/fleet"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive('/dashboard/fleet')
                    ? 'border-l-2 border-gold bg-gold/5 text-gold'
                    : 'border-l-2 border-transparent text-gold/60 hover:bg-gold/5 hover:text-gold',
                )}
              >
                <NavIcon name="fleet" />
                Fleet
              </Link>
            </li>
          )}

          {/* Training — only visible to hero-tier users */}
          {ADMIN_TIERS.has(tier) && (
            <li>
              <Link
                href="/dashboard/training"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive('/dashboard/training')
                    ? 'border-l-2 border-cyan bg-cyan/5 text-cyan'
                    : 'border-l-2 border-transparent text-white/60 hover:bg-white/5 hover:text-white',
                )}
              >
                <NavIcon name="training" />
                Training
              </Link>
            </li>
          )}

          {/* Admin — only visible to hero-tier users */}
          {ADMIN_TIERS.has(tier) && (
            <li>
              <Link
                href="/dashboard/admin"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive('/dashboard/admin')
                    ? 'border-l-2 border-gold bg-gold/5 text-gold'
                    : 'border-l-2 border-transparent text-gold/60 hover:bg-gold/5 hover:text-gold',
                )}
              >
                <NavIcon name="admin" />
                Admin
              </Link>
            </li>
          )}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 transition-colors duration-200 hover:bg-white/5 hover:text-magenta"
        >
          <NavIcon name="logout" />
          Log Out
        </button>
      </div>
    </aside>
  );
}
