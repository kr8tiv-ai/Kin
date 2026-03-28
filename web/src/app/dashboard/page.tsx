'use client';

// ============================================================================
// Dashboard Overview — Main landing page after login.
// ============================================================================

import { useAuth } from '@/providers/AuthProvider';
import { useCompanions } from '@/hooks/useCompanions';
import { useConversations } from '@/hooks/useConversations';
import { OverviewStats } from '@/components/dashboard/OverviewStats';
import { ActiveCompanion } from '@/components/dashboard/ActiveCompanion';
import { RecentConversations } from '@/components/dashboard/RecentConversations';

export default function DashboardPage() {
  const { user } = useAuth();
  const { companions, loading: companionsLoading } = useCompanions();
  const { conversations, loading: conversationsLoading } = useConversations();

  const firstName = user?.firstName ?? 'there';
  const isLoading = companionsLoading || conversationsLoading;

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-text-muted">
          Here is what is happening with your KIN companion.
        </p>
      </div>

      {/* Stats Row */}
      <OverviewStats
        conversations={conversations}
        projectCount={0}
        streak={0}
        level={1}
        loading={isLoading}
      />

      {/* Two-column Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveCompanion
          companions={companions}
          loading={companionsLoading}
        />
        <RecentConversations
          conversations={conversations}
          loading={conversationsLoading}
        />
      </div>
    </div>
  );
}
