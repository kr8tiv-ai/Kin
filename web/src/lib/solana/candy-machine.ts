'use client';

// ============================================================================
// Candy Machine — Client-side mint for Phantom wallet users.
// Adapted from 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
//
// This is the OPTIONAL path for crypto-native users who connect Phantom.
// The primary mint flow uses Stripe → server-side Candy Machine mint.
// ============================================================================

import {
  generateSigner,
  publicKey,
  some,
  none,
  transactionBuilder,
  type Umi,
} from '@metaplex-foundation/umi';
import {
  mintV2,
  fetchCandyMachine,
  safeFetchCandyMachine,
  fetchCandyGuard,
} from '@metaplex-foundation/mpl-candy-machine';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';

import { COMPANION_CANDY_MACHINES } from './constants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MintResult {
  mintAddress: string;
  companionId: string;
}

export interface CandyMachineState {
  address: string;
  itemsAvailable: number;
  itemsRedeemed: number;
  authority: string;
  collectionMint: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MINT_COMPUTE_UNITS = 800_000;

// ── Fetch state ──────────────────────────────────────────────────────────────

/**
 * Get the current state of a companion's Candy Machine.
 * Returns null if the CM address isn't configured or doesn't exist on-chain.
 */
export async function fetchCompanionCMState(
  umi: Umi,
  companionId: string,
): Promise<CandyMachineState | null> {
  const cmAddress = COMPANION_CANDY_MACHINES[companionId];
  if (!cmAddress) return null;

  const cm = await safeFetchCandyMachine(umi, publicKey(cmAddress));
  if (!cm) return null;

  return {
    address: cm.publicKey.toString(),
    itemsAvailable: Number(cm.data?.itemsAvailable ?? cm.itemsLoaded),
    itemsRedeemed: Number(cm.itemsRedeemed),
    authority: cm.authority.toString(),
    collectionMint: cm.collectionMint.toString(),
  };
}

// ── Client-side mint (Phantom users) ─────────────────────────────────────────

/**
 * Mint a companion NFT directly from the Candy Machine using a connected wallet.
 *
 * This is the crypto-native path — users connect Phantom and mint on-chain.
 * The primary flow (Stripe checkout) uses the server-side mint instead.
 */
export async function mintCompanionDirect(
  umi: Umi,
  companionId: string,
): Promise<MintResult> {
  const cmAddress = COMPANION_CANDY_MACHINES[companionId];
  if (!cmAddress) {
    throw new Error(`Candy Machine not configured for companion: ${companionId}`);
  }

  const cmPubkey = publicKey(cmAddress);
  const cm = await fetchCandyMachine(umi, cmPubkey);
  const candyGuard = await fetchCandyGuard(umi, cm.mintAuthority);

  const nftMint = generateSigner(umi);

  // Build mint arguments from guard config
  const mintArgs: Record<string, unknown> = {};

  // Handle SOL payment guard
  if (candyGuard.guards.solPayment?.__option === 'Some') {
    mintArgs.solPayment = some({
      destination: (candyGuard.guards.solPayment.value as any).destination,
    });
  }

  // Handle mint limit guard
  if (candyGuard.guards.mintLimit?.__option === 'Some') {
    mintArgs.mintLimit = some({
      id: (candyGuard.guards.mintLimit.value as any).id,
    });
  }

  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: MINT_COMPUTE_UNITS }))
    .add(
      mintV2(umi, {
        candyMachine: cm.publicKey,
        nftMint,
        collectionMint: cm.collectionMint,
        collectionUpdateAuthority: cm.authority,
        mintArgs,
        group: none(),
        candyGuard: candyGuard.publicKey,
      }),
    );

  // Build, sign (wallet-first), and send
  const builtTx = await builder.buildAndSign(umi);
  const sig = await umi.rpc.sendTransaction(builtTx);
  const blockhash = await umi.rpc.getLatestBlockhash({ commitment: 'confirmed' });
  await umi.rpc.confirmTransaction(sig, {
    strategy: { type: 'blockhash', ...blockhash },
    commitment: 'confirmed',
  });

  return {
    mintAddress: nftMint.publicKey.toString(),
    companionId,
  };
}

/**
 * Check if a companion's Candy Machine has supply remaining.
 */
export async function canMintCompanion(
  umi: Umi,
  companionId: string,
): Promise<{ available: boolean; remaining: number }> {
  const state = await fetchCompanionCMState(umi, companionId);
  if (!state) return { available: false, remaining: 0 };

  const remaining = state.itemsAvailable - state.itemsRedeemed;
  return { available: remaining > 0, remaining };
}
