import { useSubscription, SubscriptionData } from '../hooks/useSubscription';
import { UsageMeter } from './UsageMeter';
import { BillingHistory } from './BillingHistory';

interface SubscriptionStatusProps {
  /** Show billing history modal */
  showHistory?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SubscriptionStatus - Displays subscription tier, usage, and billing info
 *
 * Features:
 * - Current tier badge with upgrade option
 * - Usage meters for kin count, API calls, storage
 * - Renewal date display
 * - Quick actions (upgrade, cancel)
 * - Billing history access
 */
export function SubscriptionStatus({
  showHistory = false,
  className = '',
}: SubscriptionStatusProps) {
  const {
    subscription,
    loading,
    error,
    refresh,
    upgrade,
    cancel,
    isUpgrading,
    isCanceling,
  } = useSubscription();

  const [showBillingHistory, setShowBillingHistory] = React.useState(showHistory);

  // Get tier badge styling
  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      free: 'bg-gray-100 text-gray-700 border-gray-200',
      starter: 'bg-blue-100 text-blue-800 border-blue-200',
      pro: 'bg-purple-100 text-purple-800 border-purple-200',
      enterprise: 'bg-amber-100 text-amber-800 border-amber-200',
    };

    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full border ${styles[tier] || styles.free}`}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </span>
    );
  };

  // Get status indicator
  const getStatusIndicator = (status: string) => {
    const colors: Record<string, string> = {
      active: 'text-green-500',
      trialing: 'text-blue-500',
      past_due: 'text-red-500',
      canceled: 'text-gray-500',
      incomplete: 'text-orange-500',
      unpaid: 'text-red-500',
    };

    return (
      <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || 'text-gray-500'}`}
            style={{ backgroundColor: 'currentColor' }} />
    );
  };

  // Format renewal date
  const formatRenewalDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Loading state
  if (loading && !subscription) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="subscription-status">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Subscription</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-kin-primary"></div>
        </div>
        <div className="text-center py-4 text-gray-500">Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="subscription-status">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Subscription</h3>
          <span className="text-red-500">⚠️</span>
        </div>
        <div className="text-center py-4">
          <p className="text-red-500 text-sm mb-2">{error}</p>
          <button onClick={refresh} className="text-sm text-kin-primary hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No subscription (shouldn't happen with mock data)
  if (!subscription) {
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="subscription-status">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Subscription</h3>
        </div>
        <div className="text-center py-4">
          <p className="text-gray-500 text-sm">No subscription found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} data-testid="subscription-status">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Subscription</h3>
        <div className="flex items-center space-x-2">
          {getStatusIndicator(subscription.status)}
          <span className="text-xs text-gray-500 capitalize">{subscription.status.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Tier Badge */}
      <div className="flex items-center justify-between mb-4">
        {getTierBadge(subscription.tier)}
        {subscription.tier !== 'enterprise' && (
          <button
            onClick={() => upgrade('pro')}
            disabled={isUpgrading}
            className="text-xs text-kin-primary hover:underline disabled:opacity-50"
          >
            {isUpgrading ? 'Upgrading...' : 'Upgrade'}
          </button>
        )}
      </div>

      {/* Usage Meters */}
      <div className="space-y-3 mb-4">
        <UsageMeter
          label="Kin Companions"
          current={subscription.usage.kin_count}
          limit={subscription.usage.kin_limit}
          unit=""
        />
        <UsageMeter
          label="API Calls"
          current={subscription.usage.api_calls_current}
          limit={subscription.usage.api_calls_limit}
          unit=""
          format="number"
        />
        <UsageMeter
          label="Storage"
          current={subscription.usage.storage_used_mb}
          limit={subscription.usage.storage_limit_mb}
          unit="MB"
        />
        {subscription.usage.voice_minutes_limit !== undefined && (
          <UsageMeter
            label="Voice Minutes"
            current={subscription.usage.voice_minutes_current || 0}
            limit={subscription.usage.voice_minutes_limit}
            unit="min"
          />
        )}
      </div>

      {/* Renewal Date */}
      <div className="py-3 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Renewal Date</span>
          <span className="text-sm font-medium text-gray-800">
            {formatRenewalDate(subscription.renewal_date)}
          </span>
        </div>

        {subscription.cancel_at_period_end && (
          <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
            <span className="text-xs text-yellow-800">
              ⚠️ Subscription will cancel on {formatRenewalDate(subscription.renewal_date)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <button
          onClick={() => setShowBillingHistory(true)}
          className="text-xs text-gray-600 hover:text-gray-800"
        >
          Billing History
        </button>

        {subscription.tier !== 'free' && (
          <button
            onClick={() => cancel(false)}
            disabled={isCanceling}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
          </button>
        )}
      </div>

      {/* Billing History Modal */}
      {showBillingHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full m-4">
            <BillingHistory onClose={() => setShowBillingHistory(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
export default SubscriptionStatus;
