'use client';

// ============================================================================
// Admin Page — Embeds the KIN Mission Control admin dashboard.
// Only accessible to hero-tier users (enforced by sidebar visibility + API guard).
// ============================================================================

import { useAuth } from '@/providers/AuthProvider';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3002';

export default function AdminPage() {
  const { user } = useAuth();
  const tier = user?.tier ?? 'free';

  if (tier !== 'hero') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <GlassCard className="p-8 text-center max-w-md" hover={false}>
          <span className="text-4xl mb-4 block">{'\uD83D\uDD12'}</span>
          <h1 className="font-display text-2xl font-bold text-white mb-2">
            Access Restricted
          </h1>
          <p className="text-white/50 text-sm">
            The admin panel is only available to Hero-tier users.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">
            Mission Control
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Platform administration and user management
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.open(`${API_BASE}/admin`, '_blank')}
        >
          Open Full Dashboard
        </Button>
      </div>

      <GlassCard className="overflow-hidden p-0" hover={false}>
        <iframe
          src={`${API_BASE}/admin`}
          className="w-full border-0 rounded-[24px]"
          style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}
          title="KIN Mission Control"
        />
      </GlassCard>
    </div>
  );
}
