'use client';

// ============================================================================
// Admin Revenue Dashboard — View and generate revenue reports, inspect
// Genesis holder surplus distributions.
// ============================================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useRevenueReports, useRevenueReport, generateReport } from '@/hooks/useRevenue';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import type { RevenueReport } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function tierColor(tier: string): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (tier) {
    case 'egg': return 'cyan';
    case 'hatchling': return 'magenta';
    case 'elder': return 'gold';
    default: return 'muted';
  }
}

// ---------------------------------------------------------------------------
// Generate Report Modal
// ---------------------------------------------------------------------------

function GenerateReportModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handleGenerate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const periodStart = new Date(year, month, 1).getTime();
      const periodEnd = new Date(year, month + 1, 1).getTime();
      await generateReport(periodStart, periodEnd);
      onGenerated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="p-6" hover={false}>
          <h2 className="font-display text-xl font-semibold text-white mb-4">
            Generate Revenue Report
          </h2>

          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-sm text-white/50 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
              >
                {months.map((m, i) => (
                  <option key={m} value={i} className="bg-[#0a0a1a]">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-sm text-white/50 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y} className="bg-[#0a0a1a]">
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 mb-4">{error}</p>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGenerate} disabled={submitting}>
              {submitting ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Report Detail (expanded row)
// ---------------------------------------------------------------------------

function ReportDetail({ reportId }: { reportId: string }) {
  const { data: report, loading, error } = useRevenueReport(reportId);

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error) return <p className="text-sm text-red-400 px-4 py-3">{error}</p>;
  if (!report?.distributions?.length) {
    return (
      <p className="text-sm text-white/40 px-4 py-3">
        No distributions for this report.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-4 py-2 text-left text-white/50 font-medium">User</th>
            <th className="px-4 py-2 text-left text-white/50 font-medium">Tier</th>
            <th className="px-4 py-2 text-right text-white/50 font-medium">Reward %</th>
            <th className="px-4 py-2 text-right text-white/50 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {report.distributions.map((dist) => (
            <tr key={dist.id}>
              <td className="px-4 py-2 text-white/70 font-mono text-xs">
                {dist.userId.slice(0, 8)}…
              </td>
              <td className="px-4 py-2">
                <Badge color={tierColor(dist.genesisTier)}>
                  {dist.genesisTier}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right text-white/70">{dist.rewardPercent}%</td>
              <td className="px-4 py-2 text-right text-white font-medium">{centsToUsd(dist.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminRevenuePage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useRevenueReports();
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tier = user?.tier ?? 'free';
  if (tier !== 'hero') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <GlassCard className="p-8 text-center max-w-md" hover={false}>
          <span className="text-4xl mb-4 block">🔒</span>
          <h1 className="font-display text-2xl font-bold text-white mb-2">
            Access Restricted
          </h1>
          <p className="text-white/50 text-sm">
            Revenue reports are only available to admin users.
          </p>
        </GlassCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-white/60">{error}</p>
        <Button variant="outline" onClick={refresh}>Retry</Button>
      </div>
    );
  }

  const reports: RevenueReport[] = data?.reports ?? [];

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Revenue Reports
          </h1>
          <p className="mt-1 text-white/50">
            Platform revenue and Genesis holder surplus distributions.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          Generate Report
        </Button>
      </div>

      {/* Reports table */}
      {reports.length === 0 ? (
        <GlassCard className="p-8 text-center" hover={false}>
          <svg
            className="mx-auto mb-3 h-10 w-10 text-white/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
            />
          </svg>
          <p className="text-sm text-white/40">
            No revenue reports yet. Click &ldquo;Generate Report&rdquo; to create the first one.
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-0" hover={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-3 text-left font-medium text-white/50">Period</th>
                  <th className="px-6 py-3 text-right font-medium text-white/50">Subscriptions</th>
                  <th className="px-6 py-3 text-right font-medium text-white/50">Mints</th>
                  <th className="px-6 py-3 text-right font-medium text-white/50">Rebinding</th>
                  <th className="px-6 py-3 text-right font-medium text-white/50">Total</th>
                  <th className="px-6 py-3 text-right font-medium text-white/50">Surplus</th>
                  <th className="px-6 py-3 text-left font-medium text-white/50">Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reports.map((r) => (
                  <motion.tr
                    key={r.id}
                    className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    layout
                  >
                    <td className="px-6 py-3 text-white/70">
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </td>
                    <td className="px-6 py-3 text-right text-white/70">{centsToUsd(r.subscriptionRevenue)}</td>
                    <td className="px-6 py-3 text-right text-white/70">{centsToUsd(r.mintRevenue)}</td>
                    <td className="px-6 py-3 text-right text-white/70">{centsToUsd(r.rebindingRevenue)}</td>
                    <td className="px-6 py-3 text-right text-white font-medium">{centsToUsd(r.totalRevenue)}</td>
                    <td className="px-6 py-3 text-right text-cyan">{centsToUsd(r.surplusAllocated)}</td>
                    <td className="px-6 py-3 text-white/40 text-xs">{formatDate(r.createdAt)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded distribution detail */}
          <AnimatePresence>
            {expandedId && (
              <motion.div
                key={expandedId}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="border-t border-white/10 bg-white/[0.02] overflow-hidden"
              >
                <div className="p-4">
                  <h3 className="text-sm font-medium text-white/60 mb-3">
                    Distributions
                  </h3>
                  <ReportDetail reportId={expandedId} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      )}

      {/* Generate Modal */}
      <AnimatePresence>
        {showModal && (
          <GenerateReportModal
            onClose={() => setShowModal(false)}
            onGenerated={refresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
