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
  pro: 'bg-cyan/10 text-cyan border border-cyan/20',
  enterprise: 'bg-magenta/10 text-magenta border border-magenta/20',
};

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: '\uD83C\uDFE0' },
  { href: '/dashboard/companion', label: 'My Companion', icon: '\uD83D\uDC19' },
  { href: '/dashboard/collection', label: 'Collection', icon: '\u2728' },
  { href: '/dashboard/projects', label: 'Projects', icon: '\uD83D\uDCC1' },
  { href: '/dashboard/progress', label: 'Progress', icon: '\uD83D\uDCCA' },
  { href: '/dashboard/billing', label: 'Billing', icon: '\uD83D\uDCB3' },
  { href: '/dashboard/refer', label: 'Refer', icon: '\uD83C\uDF81' },
  { href: '/dashboard/settings', label: 'Settings', icon: '\u2699\uFE0F' },
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
      {/* User Info */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan/20 text-cyan font-display font-bold text-lg">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {firstName}
          </p>
          <span
            className={cn(
              'mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider',
              TIER_COLORS[tier] ?? TIER_COLORS.free,
            )}
          >
            {tier}
          </span>
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
                  <span className="text-base" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 transition-colors duration-200 hover:bg-white/5 hover:text-red-400"
        >
          <span className="text-base" aria-hidden="true">
            {'\uD83D\uDEAA'}
          </span>
          Log Out
        </button>
      </div>
    </aside>
  );
}
