import { useState, useEffect } from 'react';

interface NFTOwnershipBadgeProps {
  /** Kin ID to check ownership for */
  kinId: string;
  /** Owner wallet address */
  ownerWallet?: string;
  /** Show verification button */
  showVerifyButton?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Callback when verification completes */
  onVerified?: (verified: boolean) => void;
}

interface VerificationStatus {
  verified: boolean;
  kin_id: string;
  owner_wallet: string;
  verified_at: string | null;
}

/**
 * NFTOwnershipBadge - Shows NFT ownership verification status
 * 
 * Features:
 * - Shows verification status (verified/unverified/pending)
 * - Displays wallet address
 * - Links to Solana explorer
 * - Allows re-verification
 */
export function NFTOwnershipBadge({
  kinId,
  ownerWallet,
  showVerifyButton = true,
  className = '',
  onVerified,
}: NFTOwnershipBadgeProps): JSX.Element {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetchVerificationStatus();
  }, [kinId]);

  const fetchVerificationStatus = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ownerWallet) {
        params.append('wallet', ownerWallet);
      }

      const response = await fetch(`/api/nft/${kinId}/verify?${params}`);
      const data = await response.json();

      setStatus(data);
      onVerified?.(data.verified);
    } catch (error) {
      console.error('Failed to fetch verification status:', error);
      setStatus({
        verified: false,
        kin_id: kinId,
        owner_wallet: '',
        verified_at: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await fetchVerificationStatus();
    } finally {
      setVerifying(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400"></div>
        <span className="text-xs text-gray-400">Checking...</span>
      </div>
    );
  }

  // No status
  if (!status) {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <span className="text-xs text-gray-400">No NFT</span>
      </div>
    );
  }

  // Verified badge
  if (status.verified) {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <span className="mr-1">✓</span>
          NFT Verified
        </span>
        {ownerWallet && (
          <span className="text-xs text-gray-400 font-mono">
            {ownerWallet.slice(0, 8)}...{ownerWallet.slice(-4)}
          </span>
        )}
        <a
          href={`https://explorer.solana.com/address/${kinId}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline"
        >
          View
        </a>
      </div>
    );
  }

  // Unverified badge
  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <span className="mr-1">⚠</span>
        Unverified
      </span>
      {showVerifyButton && (
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="text-xs text-blue-500 hover:underline disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
      )}
    </div>
  );
}

export default NFTOwnershipBadge;
