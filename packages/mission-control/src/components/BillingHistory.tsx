import React from 'react';
import { useSubscription, Invoice } from '../hooks/useSubscription';

interface BillingHistoryProps {
  /** Close callback */
  onClose?: () => void;
  /** Show as modal */
  asModal?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * BillingHistory - Displays past invoices and payments
 *
 * Features:
 * - Lists invoices with dates and amounts
 * - Shows payment status
 * - Download links for PDF invoices
 * - Handles empty state
 */
export function BillingHistory({
  onClose,
  asModal = true,
  className = '',
}: BillingHistoryProps) {
  const { invoices, loading, error } = useSubscription();

  // Format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format amount
  const formatAmount = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  // Status badge style mapping
  const statusStyles: Record<string, React.CSSProperties> = {
    draft: {
      background: 'rgba(255,255,255,0.05)',
      color: 'var(--text-muted)',
    },
    open: {
      background: 'rgba(0,240,255,0.1)',
      color: 'var(--cyan)',
    },
    paid: {
      background: 'rgba(0,240,255,0.1)',
      color: 'var(--cyan)',
    },
    void: {
      background: 'rgba(255,255,255,0.05)',
      color: 'var(--text-muted)',
    },
    uncollectible: {
      background: 'rgba(255,0,170,0.1)',
      color: 'var(--magenta)',
    },
  };

  // Get status badge
  const getStatusBadge = (status: Invoice['status']) => {
    const style = statusStyles[status] || statusStyles.draft;

    return (
      <span
        style={{
          ...style,
          padding: '2px 8px',
          fontSize: '11px',
          borderRadius: 'var(--radius-pill)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const content = (
    <div className={className} data-testid="billing-history">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 800,
          color: 'var(--gold)',
          margin: 0,
        }}>
          Billing History
        </h3>
        {asModal && onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            &#x2715;
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ color: 'var(--magenta)', fontSize: '14px', fontFamily: 'var(--font-body)', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && invoices.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '16px 0',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
        }}>
          Loading invoices...
        </div>
      )}

      {/* Empty state */}
      {!loading && invoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>&#x1F4C4;</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontFamily: 'var(--font-body)', margin: '0 0 4px 0' }}>
            No invoices yet
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-body)', margin: 0, opacity: 0.7 }}>
            Invoices will appear here once you have billing activity
          </p>
        </div>
      )}

      {/* Invoice list */}
      {invoices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
          {invoices.map((invoice) => (
            <div
              key={invoice.invoice_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius-sm)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
            >
              {/* Left side - date and number */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--text)',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {formatDate(invoice.created_at)}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    #{invoice.number}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  {getStatusBadge(invoice.status)}
                  {invoice.paid_at && (
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      Paid {formatDate(invoice.paid_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side - amount and actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {formatAmount(invoice.amount, invoice.currency)}
                </span>

                {/* Download buttons */}
                {invoice.invoice_pdf && (
                  <a
                    href={invoice.invoice_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download PDF"
                    style={{
                      fontSize: '12px',
                      color: 'var(--cyan)',
                      fontFamily: 'var(--font-mono)',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none'; }}
                  >
                    PDF
                  </a>
                )}
                {invoice.invoice_url && (
                  <a
                    href={invoice.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View invoice"
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      textDecoration: 'none',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--cyan)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
                  >
                    View
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {invoices.length > 0 && (
        <div style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <span style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            Showing last {invoices.length} invoices
          </span>
        </div>
      )}
    </div>
  );

  // Wrap in modal container if asModal
  if (asModal) {
    return (
      <div style={{
        padding: '24px',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
      }}>
        {content}
      </div>
    );
  }

  return content;
}

export default BillingHistory;
