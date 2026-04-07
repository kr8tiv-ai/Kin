import { useEffect, useRef } from 'react';
import { kinApi } from '@/lib/api';
import { useToast } from '@/providers/ToastProvider';

const REFERRAL_STORAGE_KEY = 'kin-referral-code';
const REDEEMED_KEY = 'kin-referral-redeemed';

/**
 * Auto-redeems a stored referral code after login.
 *
 * Call this hook once in the dashboard layout. It will:
 * 1. Check localStorage for a pending referral code
 * 2. If found (and not already redeemed), POST to `/referral/redeem`
 * 3. On success: remove the code, mark as redeemed, show success toast
 * 4. On terminal error (409 already redeemed, 400 self-referral): remove the code, show error toast
 * 5. On transient error (network, 500): leave the code for retry on next load (no toast)
 *
 * Fire-and-forget -- never blocks dashboard rendering.
 */
export function useAutoRedeemReferral(): void {
  const attempted = useRef(false);
  const { success, error: showError } = useToast();

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!code) return;

    // Already redeemed in this browser -- clean up stale code
    if (localStorage.getItem(REDEEMED_KEY) === 'true') {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      return;
    }

    // Fire-and-forget redemption
    kinApi
      .post('/referral/redeem', { code })
      .then(() => {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        localStorage.setItem(REDEEMED_KEY, 'true');
        success('Referral code redeemed! You earned 3 free days.');
      })
      .catch((err: Error) => {
        // 409 (already redeemed) and 400 (self-referral) are terminal --
        // remove the code so we never retry.
        const isTerminal =
          err.message.includes('409') ||
          err.message.includes('400') ||
          err.message.includes('already') ||
          err.message.includes('self');

        if (isTerminal) {
          localStorage.removeItem(REFERRAL_STORAGE_KEY);
          showError('Referral could not be redeemed.');
        }
        // Non-terminal errors (network, 500) leave the code in place
        // so it can be retried on next page load. No toast — silent retry.
      });
  }, [success, showError]);
}
