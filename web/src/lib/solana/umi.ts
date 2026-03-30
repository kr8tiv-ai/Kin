'use client';

// ============================================================================
// Umi Setup — Metaplex Umi instance for client-side Solana operations.
// Adapted from 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
// ============================================================================

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCandyMachine } from '@metaplex-foundation/mpl-candy-machine';
import type { Umi } from '@metaplex-foundation/umi';
import type { WalletContextState } from '@solana/wallet-adapter-react';

import { SOLANA_RPC_URL } from './constants';

let _umi: Umi | null = null;

/**
 * Get a shared read-only Umi instance (no wallet — for DAS queries, fetching state).
 */
export function getReadOnlyUmi(): Umi {
  if (!_umi) {
    _umi = createUmi(SOLANA_RPC_URL).use(mplCandyMachine());
  }
  return _umi;
}

/**
 * Create a wallet-connected Umi instance for signing transactions.
 * Used when a Phantom user wants to mint directly on-chain.
 */
export function createWalletUmi(wallet: WalletContextState): Umi {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }
  return createUmi(SOLANA_RPC_URL)
    .use(mplCandyMachine())
    .use(walletAdapterIdentity(wallet));
}
