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

  // Get status badge
  const getStatusBadge = (status: Invoice['status']) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      open: 'bg-blue-100 text-blue-700',
      paid: 'bg-green-100 text-green-700',
      void: 'bg-gray-100 text-gray-500',
      uncollectible: 'bg-red-100 text-red-700',
    };

    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const content = (
    <div className={className} data-testid="billing-history">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Billing History</h3>
        {asModal && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-4">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && invoices.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          Loading invoices...
        </div>
      )}

      {/* Empty state */}
      {!loading && invoices.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📄</div>
          <p className="text-gray-500 text-sm">No invoices yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Invoices will appear here once you have billing activity
          </p>
        </div>
      )}

      {/* Invoice list */}
      {invoices.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {invoices.map((invoice) => (
            <div
              key={invoice.invoice_id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {/* Left side - date and number */}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-800">
                    {formatDate(invoice.created_at)}
                  </span>
                  <span className="text-xs text-gray-500">
                    #{invoice.number}
                  </span>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  {getStatusBadge(invoice.status)}
                  {invoice.paid_at && (
                    <span className="text-xs text-gray-500">
                      Paid {formatDate(invoice.paid_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side - amount and actions */}
              <div className="flex items-center space-x-3">
                <span className="text-sm font-semibold text-gray-800">
                  {formatAmount(invoice.amount, invoice.currency)}
                </span>

                {/* Download buttons */}
                {invoice.invoice_pdf && (
                  <a
                    href={invoice.invoice_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-kin-primary hover:underline"
                    title="Download PDF"
                  >
                    PDF
                  </a>
                )}
                {invoice.invoice_url && (
                  <a
                    href={invoice.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-700"
                    title="View invoice"
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
        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <span className="text-xs text-gray-500">
            Showing last {invoices.length} invoices
          </span>
        </div>
      )}
    </div>
  );

  // Wrap in modal container if asModal
  if (asModal) {
    return (
      <div className="p-6 bg-white rounded-lg">
        {content}
      </div>
    );
  }

  return content;
}

export default BillingHistory;
