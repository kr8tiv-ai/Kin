'use client';

// ============================================================================
// Dashboard Layout — Sidebar + content shell for all /dashboard/* routes.
// ============================================================================

import { AuthGuard } from '@/components/auth/AuthGuard';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';
import { DashboardTopbar } from '@/components/layout/DashboardTopbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            <div className="mx-auto max-w-6xl p-6">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
