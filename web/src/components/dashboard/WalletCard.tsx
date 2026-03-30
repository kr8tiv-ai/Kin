'use client';

// ============================================================================
// WalletCard — Simple wallet display for non-crypto users.
// Shows wallet address, token balance, and secure key export.
// No jargon — everything labeled in plain English.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  getStoredWallet,
  createWallet,
  exportPrivateKey,
  downloadKeyFile,
  truncateAddress,
  type KinWallet,
} from '@/lib/wallet';
import { getTokenBalance, BAGS_APP_URL } from '@/lib/bags';

export function WalletCard() {
  const [wallet, setWallet] = useState<KinWallet | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load or create wallet on mount
  useEffect(() => {
    const stored = getStoredWallet();
    if (stored) {
      setWallet(stored);
      // Fetch balance
      getTokenBalance(stored.publicKey).then(setBalance);
    }
  }, []);

  const handleCreateWallet = useCallback(async () => {
    setCreating(true);
    try {
      const newWallet = await createWallet();
      setWallet(newWallet);
    } catch (error) {
      console.error('Failed to create wallet:', error);
    } finally {
      setCreating(false);
    }
  }, []);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [wallet]);

  const handleExport = useCallback(async () => {
    if (!wallet || !exportPassword) return;
    setExporting(true);
    try {
      const encrypted = await exportPrivateKey(exportPassword);
      downloadKeyFile(encrypted, wallet.publicKey);
      setShowExport(false);
      setExportPassword('');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  }, [wallet, exportPassword]);

  // No wallet yet — show creation prompt
  if (!wallet) {
    return (
      <GlassCard className="p-6" hover={false}>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold">
              <path d="M21 12V7H5a2 2 0 010-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 5v14a2 2 0 002 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-1">
              Your Companion Wallet
            </h3>
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              We&apos;ll create a secure wallet for you automatically. This stores your companion ownership — no crypto knowledge needed.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateWallet}
              disabled={creating}
            >
              {creating ? 'Setting up...' : 'Set Up Wallet'}
            </Button>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Wallet exists — show info
  return (
    <GlassCard className="p-6" hover={false}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold">
            <path d="M21 12V7H5a2 2 0 010-4h14v4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 5v14a2 2 0 002 2h16v-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 12a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <h3 className="text-sm font-semibold text-white">
            Your Companion Wallet
          </h3>
        </div>
        <Badge color="cyan">Active</Badge>
      </div>

      {/* Address */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={handleCopyAddress}
          className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 font-mono text-xs text-white/60 transition-all hover:bg-white/5 hover:text-white/80"
          title="Click to copy full address"
        >
          {truncateAddress(wallet.publicKey, 6)}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30">
            {copied ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </>
            )}
          </svg>
        </button>
        {copied && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-cyan"
          >
            Copied!
          </motion.span>
        )}
      </div>

      {/* Balance */}
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-lg font-bold text-white">{balance.toLocaleString()}</span>
        <span className="text-xs text-white/40">KIN tokens</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={`${BAGS_APP_URL}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/5 hover:text-white/70"
        >
          View on Bags
        </a>
        <button
          type="button"
          onClick={() => setShowExport(!showExport)}
          className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/5 hover:text-white/70"
        >
          Backup Key
        </button>
      </div>

      {/* Export Panel */}
      <AnimatePresence>
        {showExport && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-white/40 mb-2">
                Choose a password to protect your backup file. Keep this file safe — it proves you own your companions.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="Create a password"
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-cyan/50 focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExport}
                  disabled={exporting || exportPassword.length < 4}
                >
                  {exporting ? 'Saving...' : 'Download'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
