'use client';

// ============================================================================
// FleetInstanceTable — Sortable table showing all fleet instances with
// status badges, resource usage, credit balance, and lifecycle actions.
// ============================================================================

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { FleetInstanceResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InstanceAction = 'start' | 'stop' | 'remove' | 'health';

interface FleetInstanceTableProps {
  instances: FleetInstanceResponse[];
  onAction: (instanceId: string, action: InstanceAction) => Promise<void>;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  running: 'cyan',
  stopped: 'muted',
  error: 'magenta',
  provisioning: 'gold',
  removing: 'gold',
};

const TUNNEL_BADGE: Record<string, 'cyan' | 'magenta' | 'gold' | 'muted'> = {
  connected: 'cyan',
  disconnected: 'magenta',
  provisioned: 'gold',
  unconfigured: 'muted',
};

const HEALTH_BADGE: Record<string, 'cyan' | 'magenta' | 'muted'> = {
  healthy: 'cyan',
  unhealthy: 'magenta',
  unknown: 'muted',
};

// ---------------------------------------------------------------------------
// Relative-time helper (compact: "5m", "2h", "3d")
// ---------------------------------------------------------------------------

function relativeTime(ts: number | null): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - ts;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Percentage display helper
// ---------------------------------------------------------------------------

function pct(value: number | undefined | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FleetInstanceTable({
  instances,
  onAction,
  loading,
}: FleetInstanceTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.1] bg-white/[0.02] px-6 py-12 text-center">
        <p className="text-sm text-white/40">No instances provisioned yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.15] bg-white/[0.02]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-xs uppercase tracking-wider text-white/40">
            <th className="px-4 py-3">Subdomain</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Health</th>
            <th className="px-4 py-3">Tunnel</th>
            <th className="px-4 py-3 text-right">CPU%</th>
            <th className="px-4 py-3 text-right">Mem%</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Last Activity</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {instances.map((inst) => {
            const apiCpu = inst.resourceUsage?.api?.cpuPercent;
            const apiMem = inst.resourceUsage?.api?.memoryPercent;
            const isStopped = inst.status === 'stopped';
            const isRunning = inst.status === 'running';

            return (
              <tr key={inst.id} className="transition-colors hover:bg-white/[0.03]">
                {/* Subdomain */}
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/80">
                  {inst.subdomain}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <Badge color={STATUS_BADGE[inst.status] ?? 'muted'}>
                    {inst.status}
                  </Badge>
                </td>

                {/* Health */}
                <td className="px-4 py-3">
                  <Badge color={HEALTH_BADGE[inst.healthCheck.status] ?? 'muted'}>
                    {inst.healthCheck.status}
                  </Badge>
                </td>

                {/* Tunnel */}
                <td className="px-4 py-3">
                  <Badge color={TUNNEL_BADGE[inst.tunnelStatus] ?? 'muted'}>
                    {inst.tunnelStatus}
                  </Badge>
                </td>

                {/* CPU% */}
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-white/60">
                  {isStopped ? '—' : pct(apiCpu)}
                </td>

                {/* Mem% */}
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-white/60">
                  {isStopped ? '—' : pct(apiMem)}
                </td>

                {/* User */}
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-white/50">
                  {inst.userId.slice(0, 8)}…
                </td>

                {/* Last Activity */}
                <td className="whitespace-nowrap px-4 py-3 text-xs text-white/40">
                  {relativeTime(inst.lastActivityAt)}
                </td>

                {/* Actions */}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {isStopped && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => onAction(inst.id, 'start')}
                      >
                        Wake
                      </Button>
                    )}
                    {isRunning && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => onAction(inst.id, 'stop')}
                      >
                        Sleep
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!px-2.5 !py-1 !text-xs"
                      onClick={() => onAction(inst.id, 'health')}
                    >
                      Check
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!px-2.5 !py-1 !text-xs text-magenta/70 hover:text-magenta"
                      onClick={() => onAction(inst.id, 'remove')}
                    >
                      Remove
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
