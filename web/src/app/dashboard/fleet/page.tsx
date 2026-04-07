'use client';

// ============================================================================
// Fleet Operator Dashboard — Admin-only page showing all provisioned instances
// with live health, resource usage, credit summary, and lifecycle actions.
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useApi } from '@/hooks/useApi';
import { kinApi } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { FleetOverview } from '@/components/fleet/FleetOverview';
import { FleetResourceBar } from '@/components/fleet/FleetResourceBar';
import { FleetInstanceTable } from '@/components/fleet/FleetInstanceTable';
import type {
  FleetStatusResponse,
  FleetCreditSummaryResponse,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FleetDashboardPage() {
  const {
    data: fleetData,
    loading: fleetLoading,
    error: fleetError,
    refresh: refreshFleet,
  } = useApi<FleetStatusResponse>('/fleet/status');

  const {
    data: creditData,
    loading: creditLoading,
    refresh: refreshCredits,
  } = useApi<FleetCreditSummaryResponse>('/fleet/credits/summary');

  // Auto-refresh every 10 seconds
  const refreshFleetRef = useRef(refreshFleet);
  refreshFleetRef.current = refreshFleet;
  const refreshCreditsRef = useRef(refreshCredits);
  refreshCreditsRef.current = refreshCredits;

  useEffect(() => {
    const id = setInterval(() => {
      refreshFleetRef.current();
      refreshCreditsRef.current();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Instance lifecycle actions
  const handleAction = useCallback(
    async (instanceId: string, action: 'start' | 'stop' | 'remove' | 'health') => {
      try {
        switch (action) {
          case 'start':
            await kinApi.post(`/fleet/instances/${instanceId}/start`);
            break;
          case 'stop':
            await kinApi.post(`/fleet/instances/${instanceId}/stop`);
            break;
          case 'remove':
            await kinApi.delete(`/fleet/instances/${instanceId}`);
            break;
          case 'health':
            await kinApi.post(`/fleet/instances/${instanceId}/health`);
            break;
        }
      } catch (err) {
        // Actions can fail if the instance is transitioning — silently refresh
        console.error(`Fleet action "${action}" failed for ${instanceId}:`, err);
      }
      // Always refresh after action
      refreshFleet();
      refreshCredits();
    },
    [refreshFleet, refreshCredits],
  );

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Fleet Control
          </h1>
          <p className="mt-1 text-white/50">
            Monitor and manage all provisioned KIN instances.
          </p>
        </div>
        {fleetData && (
          <p className="text-xs text-white/30">
            Updated {new Date(fleetData.lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Error banner */}
      {fleetError && (
        <div className="rounded-lg border border-magenta/30 bg-magenta/10 px-4 py-3 text-sm text-magenta">
          {fleetError}
        </div>
      )}

      {/* Overview stat cards */}
      <FleetOverview data={fleetData} loading={fleetLoading} />

      {/* Resource capacity bar */}
      <FleetResourceBar
        running={fleetData?.running ?? 0}
        total={fleetData?.totalInstances ?? 0}
      />

      {/* Credit summary */}
      {(creditLoading || creditData) && (
        <GlassCard className="p-5" hover={false}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
            Credit Summary
          </h2>
          {creditLoading && !creditData ? (
            <div className="flex gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="h-6 w-20 animate-pulse rounded bg-white/5" />
                  <div className="mt-1 h-3 w-28 animate-pulse rounded bg-white/5" />
                </div>
              ))}
            </div>
          ) : creditData ? (
            <div className="flex flex-wrap gap-8 text-sm">
              <div>
                <p className="font-display text-xl font-bold text-white">
                  {creditData.totalUsers}
                </p>
                <p className="text-xs text-white/40">Users with Credits</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold text-gold">
                  ${creditData.totalBalanceUsd.toFixed(2)}
                </p>
                <p className="text-xs text-white/40">Total Balance</p>
              </div>
              {Object.entries(creditData.byTier).map(([tier, info]) => (
                <div key={tier}>
                  <p className="font-display text-lg font-bold text-white/80">
                    {info.count}
                  </p>
                  <p className="text-xs text-white/40 capitalize">
                    {tier} (${info.totalBalanceUsd.toFixed(2)})
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </GlassCard>
      )}

      {/* Instance table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
          Instances
        </h2>
        <FleetInstanceTable
          instances={fleetData?.instances ?? []}
          onAction={handleAction}
          loading={fleetLoading}
        />
      </div>
    </motion.div>
  );
}
