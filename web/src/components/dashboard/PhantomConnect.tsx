'use client';

// ============================================================================
// PhantomConnect — Optional Phantom wallet connection for crypto-native users.
//
// KIN uses auto-generated wallets by default (no crypto knowledge needed).
// This component provides a SECONDARY path for power users who want to:
// 1. Connect their Phantom wallet to view KIN NFTs alongside other assets
// 2. Mint companions directly on-chain (skipping Stripe)
// 3. Transfer companion NFTs to other Solana wallets
//
// Uses raw Phantom provider API — no @solana/wallet-adapter dependency needed.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { truncateAddress } from '@/lib/wallet';

// ── Types ──────────────────────────────────────────────────────────────────

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toString: () => string; toBytes: () => Uint8Array } | null;
  isConnected: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
}

function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const phantom = (window as any)?.solana;
  if (phantom?.isPhantom) return phantom as PhantomProvider;
  return null;
}

// ── Storage ────────────────────────────────────────────────────────────────

const PHANTOM_STORAGE_KEY = 'kin_phantom_wallet';

function getStoredPhantomAddress(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(PHANTOM_STORAGE_KEY);
}

function storePhantomAddress(address: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (address) {
    localStorage.setItem(PHANTOM_STORAGE_KEY, address);
  } else {
    localStorage.removeItem(PHANTOM_STORAGE_KEY);
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function PhantomConnect() {
  const [phantomAvailable, setPhantomAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Detect Phantom and auto-reconnect
  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) return;

    setPhantomAvailable(true);

    // Check if already connected
    if (provider.isConnected && provider.publicKey) {
      const addr = provider.publicKey.toString();
      setAddress(addr);
      setConnected(true);
      storePhantomAddress(addr);
    } else {
      // Try silent reconnect
      const stored = getStoredPhantomAddress();
      if (stored) {
        provider
          .connect({ onlyIfTrusted: true })
          .then((resp) => {
            const addr = resp.publicKey.toString();
            setAddress(addr);
            setConnected(true);
            storePhantomAddress(addr);
          })
          .catch(() => {
            // User revoked trust — clear stored address
            storePhantomAddress(null);
          });
      }
    }

    // Listen for account changes
    const handleAccountChange = (publicKey: unknown) => {
      if (publicKey && typeof (publicKey as any).toString === 'function') {
        const addr = (publicKey as any).toString();
        setAddress(addr);
        storePhantomAddress(addr);
      } else {
        setAddress(null);
        setConnected(false);
        storePhantomAddress(null);
      }
    };

    provider.on('accountChanged', handleAccountChange);
    return () => provider.off('accountChanged', handleAccountChange);
  }, []);

  const handleConnect = useCallback(async () => {
    const provider = getPhantomProvider();
    if (!provider) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    setConnecting(true);
    try {
      const resp = await provider.connect();
      const addr = resp.publicKey.toString();
      setAddress(addr);
      setConnected(true);
      storePhantomAddress(addr);
    } catch (err) {
      console.warn('Phantom connect rejected:', err);
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    const provider = getPhantomProvider();
    if (provider) {
      await provider.disconnect();
    }
    setAddress(null);
    setConnected(false);
    storePhantomAddress(null);
    setShowDetails(false);
  }, []);

  // Don't show if Phantom isn't available and user hasn't tried connecting
  if (!phantomAvailable && !connected) {
    return null;
  }

  return (
    <GlassCard className="p-5" hover={false}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Phantom ghost icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#AB9FF2]/10">
            <svg width="16" height="16" viewBox="0 0 128 128" fill="none">
              <circle cx="64" cy="64" r="64" fill="#AB9FF2" />
              <path
                d="M110.584 64.914H99.142C99.142 41.866 80.173 23.151 56.81 23.151C33.769 23.151 15.001 41.38 14.417 64.083C13.809 87.728 33.624 108 57.287 108H61.143C82.394 108 110.584 88.612 110.584 64.914Z"
                fill="white"
              />
              <circle cx="46" cy="58" r="7" fill="#AB9FF2" />
              <circle cx="72" cy="58" r="7" fill="#AB9FF2" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white">Phantom Wallet</h3>
            <p className="text-[10px] text-white/30">
              {connected ? 'Connected' : 'For crypto-native users'}
            </p>
          </div>
        </div>
        {connected ? (
          <Badge color="purple">Linked</Badge>
        ) : null}
      </div>

      {connected && address ? (
        <>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between rounded-lg border border-[#AB9FF2]/20 bg-[#AB9FF2]/5 px-3 py-2 transition-all hover:bg-[#AB9FF2]/10"
          >
            <span className="font-mono text-xs text-white/70">
              {truncateAddress(address, 6)}
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-white/30 transition-transform ${showDetails ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    Your Phantom wallet is linked. Companion NFTs minted through KIN
                    will appear in your Phantom wallet automatically.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnect}
                    className="text-red-400 border-red-400/20 hover:bg-red-400/10"
                  >
                    Disconnect
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-white/30 leading-relaxed">
            Already have a Solana wallet? Connect Phantom to mint companions
            directly on-chain and manage your NFTs.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={connecting}
            className="border-[#AB9FF2]/30 text-[#AB9FF2] hover:bg-[#AB9FF2]/10"
          >
            {connecting
              ? 'Connecting...'
              : phantomAvailable
                ? 'Connect Phantom'
                : 'Install Phantom'}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
