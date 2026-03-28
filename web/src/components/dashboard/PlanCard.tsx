'use client';

// ============================================================================
// PlanCard — Shows current plan details with upgrade/manage CTA.
// ============================================================================

import { GlassCard } from '@/components/ui/GlassCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface PlanCardProps {
  planName: string;
  price: number;
  features: string[];
  isCurrent: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
  highlighted?: boolean;
}

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

export function PlanCard({
  planName,
  price,
  features,
  isCurrent,
  onAction,
  actionLabel,
  actionLoading,
  highlighted,
}: PlanCardProps) {
  return (
    <GlassCard
      className={`relative p-6 ${highlighted ? 'border-magenta/30' : ''}`}
      glow={highlighted ? 'magenta' : 'none'}
    >
      {isCurrent && (
        <div className="absolute right-4 top-4">
          <Badge color="cyan">Current Plan</Badge>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-xl font-semibold text-white">
            {planName}
          </h3>
          <Badge color={getPlanBadgeColor(planName)}>{planName}</Badge>
        </div>
        <div className="mt-2">
          {price === 0 ? (
            <span className="font-display text-3xl font-bold text-white">Free</span>
          ) : (
            <>
              <span className="font-display text-3xl font-bold text-white">
                ${price.toFixed(2)}
              </span>
              <span className="text-sm text-white/50">/month</span>
            </>
          )}
        </div>
      </div>

      <ul className="mb-6 space-y-2">
        {features.map((feature) => (
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

      {onAction && actionLabel && (
        <Button
          variant={isCurrent ? 'outline' : 'primary'}
          onClick={onAction}
          disabled={actionLoading}
          className="w-full"
        >
          {actionLoading ? 'Loading...' : actionLabel}
        </Button>
      )}
    </GlassCard>
  );
}
