import React from 'react';
import { useSubscription, SubscriptionData } from '../hooks/useSubscription';
import { UsageMeter } from './UsageMeter';
import { BillingHistory } from './BillingHistory';

interface SubscriptionStatusProps {
  /** Show billing history modal */
  showHistory?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// Inline style constants for the KR8TIV design system
const cardStyle: React.CSSProperties = {
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: '1.5rem',
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
};

const headerTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.125rem',
  fontWeight: 600,
  color: 'var(--gold)',
  margin: 0,
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const statusLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tierRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1rem',
};

const metersWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginBottom: '1rem',
};

const renewalSectionStyle: React.CSSProperties = {
  paddingTop: '0.75rem',
  borderTop: '1px solid var(--border)',
};

const renewalRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const renewalLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--text-muted)',
};

const renewalValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'var(--text)',
};

const cancelWarningStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.5rem',
  background: 'rgba(255, 215, 0, 0.1)',
  border: '1px solid rgba(255, 215, 0, 0.2)',
  borderRadius: 'var(--radius-sm)',
};

const cancelWarningTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--gold)',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingTop: '0.75rem',
  borderTop: '1px solid var(--border)',
};

const billingHistoryBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
  transition: 'color 0.2s',
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.75rem',
  color: 'var(--magenta)',
  cursor: 'pointer',
  padding: 0,
  transition: 'opacity 0.2s',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const modalContentStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-lg)',
  maxWidth: '32rem',
  width: '100%',
  margin: '1rem',
  border: '1px solid var(--border)',
};

const loadingSpinnerStyle: React.CSSProperties = {
  width: '1rem',
  height: '1rem',
  borderRadius: '50%',
  border: '2px solid transparent',
  borderBottomColor: 'var(--cyan)',
  animation: 'spin 1s linear infinite',
};

const centeredTextStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '1rem 0',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--text-muted)',
};

const errorTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--magenta)',
  marginBottom: '0.5rem',
};

const retryBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--cyan)',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
};

const upgradeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--cyan)',
  cursor: 'pointer',
  padding: 0,
  transition: 'opacity 0.2s',
};

/** Tier badge styles using KR8TIV accent colors */
const tierBadgeStyles: Record<string, React.CSSProperties> = {
  free: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
  hatchling: {
    background: 'rgba(0, 240, 255, 0.1)',
    color: 'var(--cyan)',
    border: '1px solid rgba(0, 240, 255, 0.2)',
  },
  elder: {
    background: 'rgba(255, 0, 170, 0.1)',
    color: 'var(--magenta)',
    border: '1px solid rgba(255, 0, 170, 0.2)',
  },
  hero: {
    background: 'rgba(255, 215, 0, 0.1)',
    color: 'var(--gold)',
    border: '1px solid rgba(255, 215, 0, 0.2)',
  },
};

const NEXT_TIER: Record<'free' | 'hatchling' | 'elder', { id: 'hatchling' | 'elder' | 'hero'; label: string }> = {
  free: { id: 'hatchling', label: 'Upgrade to Hatchling' },
  hatchling: { id: 'elder', label: 'Go Elder' },
  elder: { id: 'hero', label: 'Go Hero' },
};

/** Status indicator color map */
const statusColors: Record<string, string> = {
  active: 'var(--cyan)',
  trialing: 'var(--cyan)',
  past_due: 'var(--magenta)',
  canceled: 'var(--text-muted)',
  incomplete: 'var(--gold)',
  unpaid: 'var(--magenta)',
};

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
  const [billingHover, setBillingHover] = React.useState(false);
  const nextTier = subscription && subscription.tier !== 'hero' ? NEXT_TIER[subscription.tier] : null;

  // Get tier badge
  const getTierBadge = (tier: string) => {
    const baseStyle: React.CSSProperties = {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      padding: '0.25rem 0.75rem',
      borderRadius: 'var(--radius-pill)',
      display: 'inline-block',
      ...(tierBadgeStyles[tier] || tierBadgeStyles.free),
    };

    return (
      <span style={baseStyle}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </span>
    );
  };

  // Get status indicator
  const getStatusIndicator = (status: string) => {
    const color = statusColors[status] || 'var(--text-muted)';
    return (
      <span
        style={{
          display: 'inline-block',
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: status === 'active' ? `0 0 6px ${color}` : undefined,
        }}
      />
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
      <div className={className} style={cardStyle} data-testid="subscription-status">
        <div style={headerRowStyle}>
          <h3 style={headerTitleStyle}>Subscription</h3>
          <div style={loadingSpinnerStyle} />
        </div>
        <div style={centeredTextStyle}>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className} style={cardStyle} data-testid="subscription-status">
        <div style={headerRowStyle}>
          <h3 style={headerTitleStyle}>Subscription</h3>
        </div>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <p style={errorTextStyle}>{error}</p>
          <button onClick={refresh} style={retryBtnStyle}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No subscription
  if (!subscription) {
    return (
      <div className={className} style={cardStyle} data-testid="subscription-status">
        <div style={headerRowStyle}>
          <h3 style={headerTitleStyle}>Subscription</h3>
        </div>
        <div style={centeredTextStyle}>No subscription found</div>
      </div>
    );
  }

  return (
    <div className={className} style={cardStyle} data-testid="subscription-status">
      {/* Header */}
      <div style={headerRowStyle}>
        <h3 style={headerTitleStyle}>Subscription</h3>
        <div style={statusRowStyle}>
          {getStatusIndicator(subscription.status)}
          <span style={statusLabelStyle}>
            {subscription.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Tier Badge */}
      <div style={tierRowStyle}>
        {getTierBadge(subscription.tier)}
        {nextTier && (
          <button
            onClick={() => upgrade(nextTier.id)}
            disabled={isUpgrading}
            style={{
              ...upgradeBtnStyle,
              opacity: isUpgrading ? 0.5 : 1,
            }}
          >
            {isUpgrading ? 'Upgrading...' : nextTier.label}
          </button>
        )}
      </div>

      {/* Usage Meters */}
      <div style={metersWrapperStyle}>
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
      <div style={renewalSectionStyle}>
        <div style={renewalRowStyle}>
          <span style={renewalLabelStyle}>Renewal Date</span>
          <span style={renewalValueStyle}>
            {formatRenewalDate(subscription.renewal_date)}
          </span>
        </div>

        {subscription.cancel_at_period_end && (
          <div style={cancelWarningStyle}>
            <span style={cancelWarningTextStyle}>
              Subscription will cancel on {formatRenewalDate(subscription.renewal_date)}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={actionsRowStyle}>
        <button
          onClick={() => setShowBillingHistory(true)}
          onMouseEnter={() => setBillingHover(true)}
          onMouseLeave={() => setBillingHover(false)}
          style={{
            ...billingHistoryBtnStyle,
            color: billingHover ? 'var(--cyan)' : 'var(--text-muted)',
          }}
        >
          Billing History
        </button>

        {subscription.tier !== 'free' && (
          <button
            onClick={() => cancel(false)}
            disabled={isCanceling}
            style={{
              ...cancelBtnStyle,
              opacity: isCanceling ? 0.5 : 1,
            }}
          >
            {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
          </button>
        )}
      </div>

      {/* Billing History Modal */}
      {showBillingHistory && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <BillingHistory onClose={() => setShowBillingHistory(false)} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default SubscriptionStatus;
