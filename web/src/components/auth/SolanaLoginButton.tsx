'use client';

// ============================================================================
// Solana Wallet Sign-In — Supports Phantom, Solflare, and MetaMask (Snaps).
// ============================================================================

import { useState, useCallback } from 'react';
import type { User } from '@/lib/types';
import { kinApi } from '@/lib/api';

interface SolanaLoginButtonProps {
  onAuth: (token: string, user: User) => void;
}

interface WalletProvider {
  name: string;
  icon: React.ReactNode;
  color: string;
  getProvider: () => any | null;
  installUrl: string;
}

const WALLETS: WalletProvider[] = [
  {
    name: 'Phantom',
    color: '#AB6DFE',
    installUrl: 'https://phantom.app/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 128 128" fill="currentColor">
        <path d="M110.584 64.914h-4.986c0-27.742-22.788-50.254-50.86-50.254C27.084 14.66 4.605 36.672 4.849 64.157c.24 26.935 22.507 48.843 49.441 48.843h6.065a12.36 12.36 0 006.198-1.666 12.36 12.36 0 006.198 1.666h37.833c6.826 0 12.36-5.534 12.36-12.36V77.275c0-6.826-5.534-12.36-12.36-12.36zM44.04 81.884a6.75 6.75 0 110-13.5 6.75 6.75 0 010 13.5zm27 0a6.75 6.75 0 110-13.5 6.75 6.75 0 010 13.5z"/>
      </svg>
    ),
    getProvider: () => {
      if (typeof window === 'undefined') return null;
      return (window as any)?.phantom?.solana?.isPhantom ? (window as any).phantom.solana : null;
    },
  },
  {
    name: 'Solflare',
    color: '#FC822B',
    installUrl: 'https://solflare.com/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L1 21h22L12 2zm0 4.5L19.5 19h-15L12 6.5z"/>
        <circle cx="12" cy="15" r="2"/>
      </svg>
    ),
    getProvider: () => {
      if (typeof window === 'undefined') return null;
      return (window as any)?.solflare?.isSolflare ? (window as any).solflare : null;
    },
  },
  {
    name: 'MetaMask',
    color: '#F6851B',
    installUrl: 'https://metamask.io/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.3 2L13 8.2l1.5-3.6L21.3 2zM2.7 2l8.2 6.3-1.4-3.7L2.7 2zm15.8 14.3l-2.2 3.4 4.7 1.3 1.3-4.6-3.8-.1zM1.7 16.4L3 21l4.7-1.3-2.2-3.4-3.8.1zm11-5.6l-1 2.9 5 .2-.2-4.5-3.8 1.4zM7.3 9.4l-.2 4.5 5-.2-1-2.9-3.8-1.4z"/>
      </svg>
    ),
    getProvider: () => {
      if (typeof window === 'undefined') return null;
      const eth = (window as any)?.ethereum;
      if (eth?.isMetaMask && eth?.request) return eth;
      return null;
    },
  },
];

async function connectAndSign(provider: any, walletName: string) {
  if (walletName === 'MetaMask') {
    throw new Error('MetaMask Solana Snap support coming soon. Use Phantom or Solflare.');
  }

  let resp: any;
  try {
    resp = await provider.connect();
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (msg.includes('User rejected') || msg.includes('cancelled')) throw e;
    throw new Error(`Could not connect to ${walletName}. Make sure it is installed and unlocked.`);
  }

  const publicKey = resp?.publicKey;
  if (!publicKey) {
    throw new Error(`${walletName} connected but returned no public key. Try again.`);
  }
  const walletAddress = publicKey.toString();

  return { walletAddress, publicKey, sign: async (msg: Uint8Array) => {
    const result = await provider.signMessage(msg, 'utf8');
    return result.signature as Uint8Array;
  }};
}

export function SolanaLoginButton({ onAuth }: SolanaLoginButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const handleWalletLogin = useCallback(async (wallet: WalletProvider) => {
    setLoading(true);
    setError(null);
    setShowPicker(false);

    try {
      const provider = wallet.getProvider();
      if (!provider) {
        window.open(wallet.installUrl, '_blank');
        setError(`${wallet.name} not found. Install it and try again.`);
        setLoading(false);
        return;
      }

      const { walletAddress, sign } = await connectAndSign(provider, wallet.name);

      const { nonce, message } = await kinApi.post<{ nonce: string; message: string }>(
        '/auth/solana/nonce',
        { walletAddress },
      );

      const encodedMessage = new TextEncoder().encode(message);
      const signature = await sign(encodedMessage);

      const signatureBase64 = btoa(String.fromCharCode(...signature));
      const result = await kinApi.post<{ token: string; user: User }>(
        '/auth/solana',
        { walletAddress, nonce, signature: signatureBase64 },
      );

      onAuth(result.token, result.user);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('User rejected') || err.message.includes('cancelled'))) {
        setError('Sign-in cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Wallet sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  }, [onAuth]);

  const handleClick = useCallback(() => {
    const available = WALLETS.filter(w => w.getProvider() !== null);
    if (available.length === 1) {
      handleWalletLogin(available[0]!);
    } else if (available.length > 1) {
      setShowPicker(true);
    } else {
      handleWalletLogin(WALLETS[0]!);
    }
  }, [handleWalletLogin]);

  return (
    <div className="flex flex-col items-center gap-2 w-full relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="kin-login-btn group flex w-full items-center justify-center gap-3 rounded-full px-8 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white/80 transition-all duration-500 ease-out hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{ '--btn-accent': '#AB6DFE', '--btn-glow': 'rgba(171,109,254,0.4)' } as React.CSSProperties}
      >
        <svg width="18" height="18" viewBox="0 0 128 128" fill="currentColor" className="flex-shrink-0 transition-transform duration-500 group-hover:scale-110">
          <path d="M110.584 64.914h-4.986c0-27.742-22.788-50.254-50.86-50.254C27.084 14.66 4.605 36.672 4.849 64.157c.24 26.935 22.507 48.843 49.441 48.843h6.065a12.36 12.36 0 006.198-1.666 12.36 12.36 0 006.198 1.666h37.833c6.826 0 12.36-5.534 12.36-12.36V77.275c0-6.826-5.534-12.36-12.36-12.36zM44.04 81.884a6.75 6.75 0 110-13.5 6.75 6.75 0 010 13.5zm27 0a6.75 6.75 0 110-13.5 6.75 6.75 0 010 13.5z"/>
        </svg>
        <span>{loading ? 'Connecting...' : 'Continue with Solana'}</span>
      </button>

      {/* Wallet picker dropdown */}
      {showPicker && (
        <div className="absolute top-full mt-2 w-full rounded-2xl border border-white/[0.08] bg-black/95 backdrop-blur-2xl p-1.5 z-50 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[9px] text-white/25 uppercase tracking-[0.15em] px-3 pt-2 pb-1 select-none">Choose wallet</p>
          {WALLETS.map((wallet) => {
            const available = wallet.getProvider() !== null;
            return (
              <button
                key={wallet.name}
                type="button"
                onClick={() => handleWalletLogin(wallet)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/[0.06] transition-colors duration-200"
              >
                <span className="flex-shrink-0" style={{ color: wallet.color }}>{wallet.icon}</span>
                <span className="font-medium">{wallet.name}</span>
                {!available && (
                  <span className="ml-auto text-[9px] text-white/20 uppercase tracking-wider">Install</span>
                )}
              </button>
            );
          })}
          <div className="h-px mx-2 my-1 bg-white/[0.06]" />
          <button
            type="button"
            onClick={() => setShowPicker(false)}
            className="flex w-full items-center justify-center rounded-xl px-3 py-1.5 text-[11px] text-white/25 hover:text-white/40 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-magenta text-center animate-pulse" role="alert">{error}</p>
      )}
    </div>
  );
}
