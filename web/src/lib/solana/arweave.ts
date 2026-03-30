'use client';

// ============================================================================
// Arweave Upload — Irys-powered permanent storage for companion 3D models.
// Adapted from 3D Anvil (CC0) — https://github.com/ToxSam/3d-anvil
//
// Used by admins to upload companion GLB models and metadata to Arweave.
// Once uploaded, the URI is set in the Candy Machine hidden settings.
// ============================================================================

import type { WalletContextState } from '@solana/wallet-adapter-react';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './constants';

// ── Types ──────────────────────────────────────────────────────────────────

type IrysInstance = Awaited<ReturnType<typeof createIrysUploader>>;

export interface UploadCostEstimate {
  totalLamports: string;
  totalSol: number;
}

// ── Irys Uploader Setup ────────────────────────────────────────────────────

/**
 * Create a connected Irys uploader bound to the user's Phantom wallet.
 * Does NOT trigger wallet popups — only reads the public key.
 */
export async function createIrysUploader(wallet: WalletContextState) {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error('Wallet not connected or does not support message signing');
  }

  // Dynamic imports to avoid bundling Irys for non-admin users
  const { WebUploader } = await import('@irys/web-upload');
  const { WebSolana } = await import('@irys/web-upload-solana');

  const builder = WebUploader(WebSolana)
    .withProvider(wallet)
    .withRpc(SOLANA_RPC_URL)
    .withIrysConfig({ timeout: 60000 });

  if (SOLANA_NETWORK === 'mainnet-beta') {
    builder.mainnet();
  } else {
    builder.devnet();
  }

  return await builder.build();
}

// ── Cost Estimation ────────────────────────────────────────────────────────

const ESTIMATED_METADATA_BYTES = 8192;
const FUNDING_BUFFER = 1.15;

/**
 * Estimate upload cost for files + metadata.
 * Queries Irys node — no wallet approval needed.
 */
export async function estimateUploadCost(
  irys: IrysInstance,
  files: File[],
  metadataCount = 2,
): Promise<UploadCostEstimate> {
  const { default: BigNumber } = await import('bignumber.js');

  const prices = await Promise.all([
    ...files.map((f) => irys.getPrice(f.size)),
    ...Array.from({ length: metadataCount }, () =>
      irys.getPrice(ESTIMATED_METADATA_BYTES),
    ),
  ]);

  const subtotal = prices.reduce((sum, p) => sum.plus(p), new BigNumber(0));
  const totalLamports = subtotal
    .multipliedBy(FUNDING_BUFFER)
    .integerValue(BigNumber.ROUND_CEIL);
  const totalSol = parseFloat(irys.utils.fromAtomic(totalLamports).toString());

  return { totalLamports: totalLamports.toString(), totalSol };
}

// ── Funding ────────────────────────────────────────────────────────────────

/**
 * Fund the wallet's Irys balance. Single SOL transaction.
 */
export async function fundIrysBalance(
  irys: IrysInstance,
  lamports: string,
): Promise<void> {
  const { default: BigNumber } = await import('bignumber.js');
  await irys.fund(new BigNumber(lamports));
}

// ── Upload ─────────────────────────────────────────────────────────────────

/**
 * Upload a single file to Arweave via Irys.
 * Balance must already be funded.
 */
export async function uploadFile(
  irys: IrysInstance,
  file: File,
): Promise<string> {
  const receipt = await irys.uploadFile(file);
  return `https://arweave.net/${receipt.id}`;
}

/**
 * Upload JSON metadata to Arweave via Irys.
 */
export async function uploadJson(
  irys: IrysInstance,
  json: Record<string, unknown>,
): Promise<string> {
  const data = JSON.stringify(json);
  const receipt = await irys.upload(data, {
    tags: [{ name: 'Content-Type', value: 'application/json' }],
  });
  return `https://arweave.net/${receipt.id}`;
}

/**
 * Upload a companion's GLB model and metadata to Arweave.
 * Returns the metadata URI for use in Candy Machine hidden settings.
 */
export async function uploadCompanionAssets(
  irys: IrysInstance,
  companionId: string,
  glbFile: File,
  thumbnailFile: File,
  metadata: {
    name: string;
    description: string;
    symbol?: string;
    attributes?: Array<{ trait_type: string; value: string }>;
  },
): Promise<{ metadataUri: string; glbUri: string; imageUri: string }> {
  // Upload GLB model
  const glbUri = await uploadFile(irys, glbFile);

  // Upload thumbnail image
  const imageUri = await uploadFile(irys, thumbnailFile);

  // Build and upload Metaplex-standard metadata
  const fullMetadata = {
    name: metadata.name,
    symbol: metadata.symbol ?? 'KIN',
    description: metadata.description,
    image: imageUri,
    animation_url: glbUri,
    external_url: 'https://www.meetyourkin.com',
    attributes: [
      { trait_type: 'Companion', value: companionId },
      { trait_type: 'Platform', value: 'KIN' },
      ...(metadata.attributes ?? []),
    ],
    properties: {
      files: [
        { uri: imageUri, type: 'image/png' },
        { uri: glbUri, type: 'model/gltf-binary' },
      ],
      category: 'vr',
      creators: [],
    },
  };

  const metadataUri = await uploadJson(irys, fullMetadata);

  return { metadataUri, glbUri, imageUri };
}
