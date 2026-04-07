'use client';

// ============================================================================
// Billing Page — Genesis Mint tiers + Monthly Hosting plans.
// Aligned with meetyourkin.com pricing (source of truth).
// ============================================================================

import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import { useBilling } from '@/hooks/useBilling';
import { useMyDistributions } from '@/hooks/useRevenue';
import { useToast } from '@/providers/ToastProvider';
import { track } from '@/lib/analytics';
import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { UsageMeter } from '@/components/dashboard/UsageMeter';
import { PRICING_TIERS, GENESIS_TIERS } from '@/lib/constants';

function getPlanBadgeColor(plan: string): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (plan.toLowerCase()) {
    case 'hatchling':
    case 'hatchling-monthly':
      return 'cyan';
    case 'elder':
    case 'elder-monthly':
      return 'magenta';
    case 'hero':
    case 'hero-monthly':
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
  const { success: toastSuccess, error: toastError } = useToast();

  const currentPlan = billing?.plan ?? user?.tier ?? 'free';
  const limits = getPlanLimits(currentPlan);
  const isFree = currentPlan.toLowerCase() === 'free';
  const hasPaidPlan = !isFree;

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
          Plans & Billing
        </h1>
        <p className="mt-1 text-white/50">
          Your KIN companion plan, usage, and upgrade options.
        </p>
      </div>

      {/* Current Plan Summary */}
      <GlassCard className="p-6" hover={false}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                Your Plan
              </h2>
              <Badge color={getPlanBadgeColor(currentPlan)}>
                {currentPlan === 'free' ? 'Free Trial' : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
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
            {isFree && (
              <p className="mt-1 text-sm text-white/40">
                You are on the free trial. Mint a Genesis KIN or subscribe to unlock all features!
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {hasPaidPlan && (
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
          Usage Today
        </h2>
        <UsageMeter
          label="Messages"
          current={billing?.usage?.messagesToday ?? 0}
          max={limits.messagesPerDay}
        />
        <UsageMeter
          label="Active Companions"
          current={billing?.usage?.activeCompanions ?? 1}
          max={limits.companions}
        />
      </GlassCard>

      {/* Genesis Revenue Share — shown only for holders */}
      <GenesisRevenueShare />

      {/* Genesis Mint Section */}
      <div>
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Genesis Mint (Limited to 60)
          </h2>
          <p className="mt-1 text-sm text-white/40">
            Own your KIN forever. Genesis holders get 25% off all plans for life + Solana rewards.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {GENESIS_TIERS.map((tier, index) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
            >
              <GlassCard
                className={`relative p-6 ${tier.id === 'elder' ? 'border-gold/30' : ''}`}
                glow={tier.id === 'elder' ? 'gold' : tier.id === 'hatchling' ? 'cyan' : 'none'}
              >
                {tier.id === 'elder' && (
                  <div className="absolute right-4 top-4">
                    <Badge color="gold">Best Value</Badge>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{tier.emoji}</span>
                    <h3 className="font-display text-xl font-semibold text-white">
                      {tier.name}
                    </h3>
                  </div>
                  <div className="mt-2">
                    <span className="font-display text-3xl font-bold text-white">
                      {tier.priceSol}
                    </span>
                    <span className="ml-1 text-sm text-white/50">SOL</span>
                  </div>
                  <p className="mt-1 text-xs text-white/30">One-time mint price</p>
                </div>

                <ul className="mb-6 space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan"
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
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    track('genesis_mint_clicked', { tier: tier.id });
                    window.open('https://meetyourkin.com', '_blank');
                  }}
                >
                  Mint {tier.name}
                </Button>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Monthly Hosting Plans */}
      <div>
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Monthly Hosting Plans
          </h2>
          <p className="mt-1 text-sm text-white/40">
            Keep your KIN running after your Genesis free months. All plans include Supermemory Pro, frontier AI, and full platform access.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((tier, index) => {
            const isCurrent = tier.id === currentPlan.toLowerCase();
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
              >
                <GlassCard
                  className={`relative p-6 h-full flex flex-col ${tier.highlighted ? 'border-cyan/30' : ''}`}
                  glow={tier.highlighted ? 'cyan' : 'none'}
                >
                  {isCurrent && (
                    <div className="absolute right-4 top-4">
                      <Badge color="cyan">Current</Badge>
                    </div>
                  )}
                  {tier.highlighted && !isCurrent && (
                    <div className="absolute right-4 top-4">
                      <Badge color="cyan">Popular</Badge>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="font-display text-xl font-semibold text-white">
                      {tier.name}
                    </h3>
                    <div className="mt-2">
                      {tier.price === 0 ? (
                        <span className="font-display text-3xl font-bold text-white">Free</span>
                      ) : (
                        <>
                          <span className="font-display text-3xl font-bold text-white">
                            ${tier.price}
                          </span>
                          <span className="text-sm text-white/50">{tier.priceLabel}</span>
                        </>
                      )}
                    </div>
                    {tier.price > 0 && (
                      <p className="mt-0.5 text-xs text-gold/60">
                        Genesis holders: ${Math.round(tier.price * 0.75)}/mo (25% off)
                      </p>
                    )}
                  </div>

                  <ul className="mb-6 space-y-2 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-white/70">
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-cyan"
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
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {!isCurrent && tier.id !== 'free' && (
                    <Button
                      variant={tier.highlighted ? 'primary' : 'outline'}
                      className="w-full"
                      onClick={() => {
                        track('upgrade_clicked', { from: currentPlan, to: tier.id });
                        checkout(tier.id.replace('-monthly', '')).catch(() => toastError('Checkout not available yet. Coming soon!'));
                      }}
                      disabled={checkingOut}
                    >
                      {checkingOut ? 'Loading...' : `Choose ${tier.name}`}
                    </Button>
                  )}
                  {isCurrent && (
                    <div className="rounded-lg bg-cyan/5 border border-cyan/10 px-4 py-2 text-center text-sm text-cyan/70">
                      Your current plan
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <GlassCard className="overflow-hidden p-0" hover={false}>
        <div className="p-6 pb-0">
          <h2 className="font-display text-lg font-semibold text-white">
            What You Get
          </h2>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-3 text-left font-medium text-white/50">Feature</th>
                <th className="px-6 py-3 text-center font-medium text-white/50">Free Trial</th>
                <th className="px-6 py-3 text-center font-medium text-white/50">Hatchling</th>
                <th className="px-6 py-3 text-center font-medium text-white/50">Elder</th>
                <th className="px-6 py-3 text-center font-medium text-white/50">Hero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <FeatureRow feature="Companions" values={['1', '1', '3', 'All 6']} />
              <FeatureRow feature="Messages / Day" values={['50', 'Unlimited', 'Unlimited', 'Unlimited']} />
              <FeatureRow feature="AI Model" values={['Qwen 3 32B', 'Frontier (per KIN)', 'Frontier (per KIN)', 'Frontier (per KIN)']} />
              <FeatureRow feature="Supermemory Pro" values={[false, true, true, true]} />
              <FeatureRow feature="Telegram + WhatsApp" values={[false, true, true, true]} />
              <FeatureRow feature="Voice Chat" values={[false, true, true, true]} />
              <FeatureRow feature="Computer Control" values={[false, true, true, true]} />
              <FeatureRow feature="VPS Hosting" values={[false, true, true, true]} />
              <FeatureRow feature="Priority Support" values={[false, false, true, true]} />
              <FeatureRow feature="Dedicated Manager" values={[false, false, false, true]} />
              <FeatureRow feature="API Access" values={[false, false, false, true]} />
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Genesis Discount Banner */}
      <GlassCard className="p-6 text-center" hover={false} glow="gold">
        <span className="text-4xl mb-3 block">{'\uD83D\uDC32'}</span>
        <h2 className="font-display text-lg font-semibold text-white mb-2">
          Genesis Holders Save 25% Forever
        </h2>
        <p className="text-sm text-white/50 max-w-lg mx-auto mb-4">
          Mint a Genesis KIN to lock in a lifetime 25% discount on every hosting plan, plus earn passive Solana rewards. Only 60 will ever exist.
        </p>
        <Button
          variant="primary"
          onClick={() => window.open('https://meetyourkin.com', '_blank')}
        >
          View Genesis Mint
        </Button>
      </GlassCard>

      {/* Billing History */}
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
            No billing history yet. Your invoices will appear here after your first payment.
          </p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// --- Feature comparison row ---

// --- Genesis Revenue Share section ---

function tierBadgeColor(tier: string): 'cyan' | 'magenta' | 'gold' | 'muted' {
  switch (tier) {
    case 'egg': return 'cyan';
    case 'hatchling': return 'magenta';
    case 'elder': return 'gold';
    default: return 'muted';
  }
}

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatEpochDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function GenesisRevenueShare() {
  const { data, loading } = useMyDistributions();

  // Loading state — render a small skeleton
  if (loading) {
    return <Skeleton variant="card" />;
  }

  const distributions = data?.distributions ?? [];

  // No distributions — user is either not Genesis or hasn't received any yet.
  // We still don't know for certain they're Genesis without a separate genesis_tier
  // field on the user. But we can show the section only when there are distributions,
  // keeping it invisible for non-Genesis users (who get an empty array from the API).
  if (distributions.length === 0) {
    return null;
  }

  // Derive tier info from the first distribution
  const tier = distributions[0].genesisTier;
  const rewardPercent = distributions[0].rewardPercent;
  const genesisTierInfo = GENESIS_TIERS.find((t) => t.id === tier);
  const totalEarned = distributions.reduce((sum, d) => sum + d.amount, 0);

  return (
    <GlassCard className="p-6" hover={false} glow="gold">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{genesisTierInfo?.emoji ?? '🐲'}</span>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Your Revenue Share
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge color={tierBadgeColor(tier)}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)} Genesis
              </Badge>
              <span className="text-sm text-white/50">{rewardPercent}% surplus allocation</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/40">Total earned</p>
          <p className="font-display text-xl font-bold text-gold">{centsToUsd(totalEarned)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-2 text-left font-medium text-white/50">Date</th>
              <th className="px-4 py-2 text-right font-medium text-white/50">Reward %</th>
              <th className="px-4 py-2 text-right font-medium text-white/50">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {distributions.slice(0, 12).map((dist) => (
              <tr key={dist.id}>
                <td className="px-4 py-2 text-white/70">{formatEpochDate(dist.createdAt)}</td>
                <td className="px-4 py-2 text-right text-white/70">{dist.rewardPercent}%</td>
                <td className="px-4 py-2 text-right text-white font-medium">{centsToUsd(dist.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {distributions.length > 12 && (
        <p className="text-xs text-white/30 mt-2 text-center">
          Showing latest 12 of {distributions.length} distributions.
        </p>
      )}
    </GlassCard>
  );
}

// --- Feature comparison row ---

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
