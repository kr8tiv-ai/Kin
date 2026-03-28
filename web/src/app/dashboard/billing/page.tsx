'use client';

// ============================================================================
// Billing Page — Plan overview, usage meters, and subscription management.
// ============================================================================

import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useBilling } from '@/hooks/useBilling';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { UsageMeter } from '@/components/dashboard/UsageMeter';
import { PlanCard } from '@/components/dashboard/PlanCard';
import { PRICING_TIERS } from '@/lib/constants';

function getPlanBadgeColor(plan: string): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (plan.toLowerCase()) {
    case 'pro':
      return 'magenta';
    case 'enterprise':
      return 'gold';
    default:
      return 'muted';
  }
}

function getPlanLimits(plan: string) {
  const tier = PRICING_TIERS.find((t) => t.id === plan.toLowerCase());
  return {
    messagesPerDay: tier?.messagesPerDay ?? 50,
    companions: tier?.companionLimit ?? 1,
  };
}

export default function BillingPage() {
  const { user } = useAuth();
  const {
    billing,
    loading,
    error,
    refresh,
    checkout,
    checkingOut,
    openPortal,
    openingPortal,
  } = useBilling();

  const currentPlan = billing?.plan ?? user?.tier ?? 'free';
  const limits = getPlanLimits(currentPlan);
  const isFree = currentPlan.toLowerCase() === 'free';
  const isPro = currentPlan.toLowerCase() === 'pro';
  const isEnterprise = currentPlan.toLowerCase() === 'enterprise';

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-white/60">{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Billing & Subscription
        </h1>
        <p className="mt-1 text-white/50">
          Manage your plan, usage, and payment details.
        </p>
      </div>

      {/* Current Plan Summary */}
      <GlassCard className="p-6" hover={false}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                Current Plan
              </h2>
              <Badge color={getPlanBadgeColor(currentPlan)}>
                {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
              </Badge>
            </div>
            {billing?.currentPeriodEnd && (
              <p className="mt-1 text-sm text-white/50">
                {billing.cancelAtPeriodEnd
                  ? 'Cancels on '
                  : 'Renews on '}
                {new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {isFree && (
              <Button onClick={() => checkout()} disabled={checkingOut}>
                {checkingOut ? 'Redirecting...' : 'Upgrade to Pro'}
              </Button>
            )}
            {(isPro || isEnterprise) && (
              <Button
                variant="outline"
                onClick={openPortal}
                disabled={openingPortal}
              >
                {openingPortal ? 'Redirecting...' : 'Manage Subscription'}
              </Button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Usage Meters */}
      <GlassCard className="space-y-6 p-6" hover={false}>
        <h2 className="font-display text-lg font-semibold text-white">
          Usage This Period
        </h2>
        <UsageMeter
          label="Messages Today"
          current={32}
          max={isEnterprise ? null : limits.messagesPerDay}
        />
        <UsageMeter
          label="Active Companions"
          current={1}
          max={isEnterprise ? null : limits.companions}
        />
        <UsageMeter
          label="API Calls"
          current={142}
          max={isEnterprise ? null : 500}
        />
      </GlassCard>

      {/* Plan Comparison */}
      <div>
        <h2 className="mb-4 font-display text-lg font-semibold text-white">
          Compare Plans
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PlanCard
              key={tier.id}
              planName={tier.name}
              price={tier.price}
              features={tier.features}
              isCurrent={tier.id === currentPlan.toLowerCase()}
              highlighted={tier.highlighted}
              onAction={
                tier.id === currentPlan.toLowerCase()
                  ? undefined
                  : tier.id === 'free'
                    ? undefined
                    : () => checkout()
              }
              actionLabel={
                tier.id === currentPlan.toLowerCase()
                  ? undefined
                  : tier.id === 'free'
                    ? undefined
                    : `Upgrade to ${tier.name}`
              }
              actionLoading={checkingOut}
            />
          ))}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <GlassCard className="overflow-hidden p-0" hover={false}>
        <div className="p-6 pb-0">
          <h2 className="font-display text-lg font-semibold text-white">
            Feature Comparison
          </h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-3 text-left font-medium text-white/50">
                  Feature
                </th>
                {PRICING_TIERS.map((tier) => (
                  <th
                    key={tier.id}
                    className="px-6 py-3 text-center font-medium text-white/50"
                  >
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <FeatureRow
                feature="Companions"
                values={['1', '3', 'All 6']}
              />
              <FeatureRow
                feature="Messages / Day"
                values={['50', 'Unlimited', 'Unlimited']}
              />
              <FeatureRow
                feature="Web Builder"
                values={['Basic', 'Full', 'Full']}
              />
              <FeatureRow
                feature="Memory & Context"
                values={[false, true, true]}
              />
              <FeatureRow
                feature="Project Export"
                values={[false, true, true]}
              />
              <FeatureRow
                feature="API Access"
                values={[false, false, true]}
              />
              <FeatureRow
                feature="Team Collaboration"
                values={[false, false, true]}
              />
              <FeatureRow
                feature="Support"
                values={['Community', 'Priority', 'Dedicated']}
              />
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Billing History Placeholder */}
      <GlassCard className="p-6" hover={false}>
        <h2 className="font-display text-lg font-semibold text-white">
          Billing History
        </h2>
        <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
          <svg
            className="mb-3 h-10 w-10 text-white/20"
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
            No billing history yet. Your invoices will appear here after your
            first payment.
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// --- Internal component for feature comparison rows -------------------------

function FeatureRow({
  feature,
  values,
}: {
  feature: string;
  values: (string | boolean)[];
}) {
  return (
    <tr>
      <td className="px-6 py-3 text-white/70">{feature}</td>
      {values.map((value, i) => (
        <td key={i} className="px-6 py-3 text-center">
          {typeof value === 'boolean' ? (
            value ? (
              <svg
                className="mx-auto h-5 w-5 text-cyan"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <span className="text-white/20">--</span>
            )
          ) : (
            <span className="text-white/70">{value}</span>
          )}
        </td>
      ))}
    </tr>
  );
}
