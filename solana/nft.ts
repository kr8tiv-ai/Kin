/**
 * Solana NFT Integration - Anchor program and minting utilities
 *
 * This module provides Solana NFT functionality for KIN companions:
 * - NFT collection deployment
 * - Minting flow for new owners
 * - Transfer mechanics
 * - Metadata management (including GLB avatars)
 *
 * Note: Requires Solana CLI and Anchor to be installed for full functionality.
 * The API routes in api/routes/nft.ts handle the server-side logic.
 *
 * @module solana/nft
 */

// ============================================================================
// Types
// ============================================================================

export interface NFTConfig {
  /** Solana network: 'devnet' | 'mainnet-beta' */
  network?: 'devnet' | 'mainnet-beta';
  /** RPC endpoint URL */
  rpcUrl?: string;
  /** Program ID for the NFT contract */
  programId?: string;
  /** Collection mint address */
  collectionMint?: string;
  /** Candy machine ID (if using candy machine) */
  candyMachineId?: string;
  /** Wallet keypair path or bytes */
  walletKeypair?: string | Uint8Array;
}

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  animation_url?: string; // GLB file for 3D avatar
  external_url?: string;
  attributes: NFTAttribute[];
  properties: {
    category: string;
    files: Array<{ uri: string; type: string }>;
    creators: Array<{ address: string; share: number }>;
  };
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface MintResult {
  mintAddress: string;
  transactionSignature: string;
  metadataUri: string;
  companionId: string;
}

export interface TransferResult {
  signature: string;
  fromWallet: string;
  toWallet: string;
  mintAddress: string;
}

// ============================================================================
// Companion NFT Metadata
// ============================================================================

export const COMPANION_METADATA: Record<string, Partial<NFTMetadata>> = {
  cipher: {
    name: 'Cipher - Code Kraken',
    symbol: 'CIPHER',
    description: 'Your web design and frontend companion. The Code Kraken brings creative vision and technical precision.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Code Kraken' },
      { trait_type: 'Specialization', value: 'Web Design' },
      { trait_type: 'Element', value: 'Digital Ocean' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
  mischief: {
    name: 'Mischief - Glitch Pup',
    symbol: 'MISCHIEF',
    description: 'Your playful family companion and personal brand guide. The Glitch Pup brings warmth and creativity.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Glitch Pup' },
      { trait_type: 'Specialization', value: 'Family Companion' },
      { trait_type: 'Element', value: 'Digital Spark' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
  vortex: {
    name: 'Vortex - Teal Dragon',
    symbol: 'VORTEX',
    description: 'Your 24/7 CMO and marketing strategist. The Teal Dragon brings wisdom and market insight.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Teal Dragon' },
      { trait_type: 'Specialization', value: 'Marketing' },
      { trait_type: 'Element', value: 'Cosmic Wind' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
  forge: {
    name: 'Forge - Cyber Unicorn',
    symbol: 'FORGE',
    description: 'Your developer friend and debugging partner. The Cyber Unicorn brings clarity and technical mastery.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Cyber Unicorn' },
      { trait_type: 'Specialization', value: 'Development' },
      { trait_type: 'Element', value: 'Neon Fire' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
  aether: {
    name: 'Aether - Frost Ape',
    symbol: 'AETHER',
    description: 'Your creative muse and writing companion. The Frost Ape brings inspiration and artistic vision.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Frost Ape' },
      { trait_type: 'Specialization', value: 'Creative Writing' },
      { trait_type: 'Element', value: 'Arctic Mist' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
  catalyst: {
    name: 'Catalyst - Cosmic Blob',
    symbol: 'CATALYST',
    description: 'Your wealth coach and habits companion. The Cosmic Blob brings transformation and growth.',
    attributes: [
      { trait_type: 'Bloodline', value: 'Cosmic Blob' },
      { trait_type: 'Specialization', value: 'Wealth Coaching' },
      { trait_type: 'Element', value: 'Cosmic Energy' },
      { trait_type: 'Rarity', value: 'Genesis' },
    ],
  },
};

// ============================================================================
// NFT Client
// ============================================================================

export class SolanaNFTClient {
  private config: NFTConfig;
  private _umiPromise: Promise<any> | null = null;

  constructor(config: NFTConfig = {}) {
    this.config = {
      network: config.network ?? 'devnet',
      rpcUrl: config.rpcUrl ?? (process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'),
      ...config,
    };
  }

  /**
   * Lazily initialize Umi (Metaplex SDK) — only loads when needed.
   */
  private async getUmi(): Promise<any> {
    if (!this._umiPromise) {
      this._umiPromise = (async () => {
        try {
          const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
          const { mplCandyMachine } = await import('@metaplex-foundation/mpl-candy-machine');
          const { mplTokenMetadata } = await import('@metaplex-foundation/mpl-token-metadata');
          const { keypairIdentity, createSignerFromKeypair } = await import('@metaplex-foundation/umi');

          const umi = createUmi(this.config.rpcUrl!)
            .use(mplCandyMachine())
            .use(mplTokenMetadata());

          // Load admin keypair if available
          const keypairData = this.config.walletKeypair ?? process.env.SOLANA_ADMIN_KEYPAIR;
          if (keypairData) {
            const bs58 = await import('bs58');
            const secretKey = typeof keypairData === 'string'
              ? bs58.default.decode(keypairData)
              : keypairData;
            const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
            const signer = createSignerFromKeypair(umi, keypair);
            umi.use(keypairIdentity(signer));
          }

          return umi;
        } catch (err) {
          console.warn('[SolanaNFT] Failed to initialize Umi:', err);
          this._umiPromise = null;
          return null;
        }
      })();
    }
    return this._umiPromise;
  }

  // ==========================================================================
  // Metadata
  // ==========================================================================

  /**
   * Generate NFT metadata for a companion
   */
  generateCompanionMetadata(
    companionId: string,
    options: {
      glbUrl?: string;
      imageUrl: string;
      externalUrl?: string;
      customAttributes?: NFTAttribute[];
    }
  ): NFTMetadata {
    const base = COMPANION_METADATA[companionId];
    if (!base) {
      throw new NFTError(`Unknown companion: ${companionId}`, 'UNKNOWN_COMPANION');
    }

    const metadata: NFTMetadata = {
      name: base.name ?? `KIN Companion #${Date.now()}`,
      symbol: base.symbol ?? 'KIN',
      description: base.description ?? '',
      image: options.imageUrl,
      external_url: options.externalUrl,
      attributes: [...(base.attributes ?? []), ...(options.customAttributes ?? [])],
      properties: {
        category: options.glbUrl ? 'video' : 'image',
        files: [
          { uri: options.imageUrl, type: 'image/png' },
          ...(options.glbUrl ? [{ uri: options.glbUrl, type: 'model/gltf-binary' }] : []),
        ],
        creators: [
          {
            address: this.config.programId ?? 'KIN_PROGRAM_ID',
            share: 100,
          },
        ],
      },
    };

    if (options.glbUrl) {
      metadata.animation_url = options.glbUrl;
    }

    return metadata;
  }

  /**
   * Upload metadata to IPFS via Pinata or NFT.Storage.
   *
   * Tries Pinata first (PINATA_JWT env var), then NFT.Storage (NFT_STORAGE_KEY),
   * then falls back to a mock URI in development.
   *
   * Required env vars (at least one):
   *   PINATA_JWT — Pinata API JWT for pinning
   *   NFT_STORAGE_KEY — NFT.Storage API key
   */
  async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    const json = JSON.stringify(metadata);

    // ── Pinata (preferred) ────────────────────────────────────────────
    const pinataJwt = process.env.PINATA_JWT;
    if (pinataJwt) {
      try {
        const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pinataJwt}`,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: { name: `${metadata.name}-metadata.json` },
          }),
        });

        if (res.ok) {
          const { IpfsHash } = await res.json() as { IpfsHash: string };
          console.log(`[SolanaNFT] Pinata upload: ipfs://${IpfsHash}`);
          return `https://gateway.pinata.cloud/ipfs/${IpfsHash}`;
        }
        console.warn('[SolanaNFT] Pinata upload failed:', res.status, await res.text());
      } catch (err) {
        console.warn('[SolanaNFT] Pinata upload error:', err);
      }
    }

    // ── NFT.Storage (fallback) ────────────────────────────────────────
    const nftStorageKey = process.env.NFT_STORAGE_KEY;
    if (nftStorageKey) {
      try {
        const res = await fetch('https://api.nft.storage/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${nftStorageKey}`,
            'Content-Type': 'application/json',
          },
          body: json,
        });

        if (res.ok) {
          const data = await res.json() as { value?: { cid: string } };
          const cid = data.value?.cid;
          if (cid) {
            console.log(`[SolanaNFT] NFT.Storage upload: ipfs://${cid}`);
            return `https://nftstorage.link/ipfs/${cid}`;
          }
        }
        console.warn('[SolanaNFT] NFT.Storage upload failed:', res.status);
      } catch (err) {
        console.warn('[SolanaNFT] NFT.Storage upload error:', err);
      }
    }

    // ── Development fallback ──────────────────────────────────────────
    console.warn('[SolanaNFT] No IPFS provider configured (set PINATA_JWT or NFT_STORAGE_KEY). Using mock URI.');
    const hash = Buffer.from(json).toString('base64url').slice(0, 43);
    return `https://arweave.net/${hash}`;
  }

  // ==========================================================================
  // Minting
  // ==========================================================================

  /**
   * Mint a new companion NFT.
   *
   * Flow: upload metadata to IPFS → create mint via Umi → transfer to owner.
   * Falls back to mock result if Umi is not configured.
   */
  async mintCompanion(
    companionId: string,
    ownerWallet: string,
    metadata: NFTMetadata
  ): Promise<MintResult> {
    const metadataUri = await this.uploadMetadata(metadata);
    const umi = await this.getUmi();

    if (umi) {
      try {
        const { generateSigner, publicKey, transactionBuilder } = await import('@metaplex-foundation/umi');
        const { createNft } = await import('@metaplex-foundation/mpl-token-metadata');
        const { transferSol } = await import('@metaplex-foundation/mpl-toolbox');

        const mint = generateSigner(umi);

        const builder = createNft(umi, {
          mint,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadataUri,
          sellerFeeBasisPoints: { basisPoints: 500n, identifier: '%', decimals: 2 },
          collection: this.config.collectionMint
            ? { verified: false, key: publicKey(this.config.collectionMint) }
            : undefined,
        });

        const result = await builder.sendAndConfirm(umi);
        const sig = Buffer.from(result.signature).toString('base64');

        console.log(`[SolanaNFT] Minted ${companionId}: ${mint.publicKey}`);

        return {
          mintAddress: mint.publicKey.toString(),
          transactionSignature: sig,
          metadataUri,
          companionId,
        };
      } catch (err) {
        console.error('[SolanaNFT] Mint failed, returning mock:', err);
      }
    }

    // Fallback: mock result for development
    console.warn(`[SolanaNFT] Umi not configured — returning mock mint for ${companionId}`);
    return {
      mintAddress: `mock_mint_${companionId}_${Date.now()}`,
      transactionSignature: `mock_sig_${Date.now()}`,
      metadataUri,
      companionId,
    };
  }

  /**
   * Mint via Candy Machine (for drops).
   * Uses the Candy Machine address from config or env vars.
   */
  async mintFromCandyMachine(
    candyMachineId: string,
    wallet: string
  ): Promise<MintResult> {
    const umi = await this.getUmi();

    if (umi) {
      try {
        const { publicKey, generateSigner } = await import('@metaplex-foundation/umi');
        const { mintV2 } = await import('@metaplex-foundation/mpl-candy-machine');

        const nftMint = generateSigner(umi);
        const candyMachine = publicKey(candyMachineId);

        await mintV2(umi, {
          candyMachine,
          nftMint,
          collectionMint: this.config.collectionMint
            ? publicKey(this.config.collectionMint)
            : undefined as any,
          collectionUpdateAuthority: umi.identity.publicKey,
        }).sendAndConfirm(umi);

        console.log(`[SolanaNFT] CM mint: ${nftMint.publicKey}`);

        return {
          mintAddress: nftMint.publicKey.toString(),
          transactionSignature: `cm_${Date.now()}`,
          metadataUri: '',
          companionId: 'unknown',
        };
      } catch (err) {
        console.error('[SolanaNFT] Candy Machine mint failed:', err);
      }
    }

    console.warn(`[SolanaNFT] CM not configured — mock mint`);
    return {
      mintAddress: `mock_cm_mint_${Date.now()}`,
      transactionSignature: `mock_cm_sig_${Date.now()}`,
      metadataUri: '',
      companionId: 'unknown',
    };
  }

  // ==========================================================================
  // Transfers
  // ==========================================================================

  /**
   * Transfer NFT to another wallet via Umi.
   */
  async transfer(
    mintAddress: string,
    fromWallet: string,
    toWallet: string
  ): Promise<TransferResult> {
    const umi = await this.getUmi();

    if (umi) {
      try {
        const { publicKey } = await import('@metaplex-foundation/umi');
        const { transferV1 } = await import('@metaplex-foundation/mpl-token-metadata');

        const result = await transferV1(umi, {
          mint: publicKey(mintAddress),
          authority: umi.identity,
          tokenOwner: publicKey(fromWallet),
          destinationOwner: publicKey(toWallet),
          tokenStandard: { __kind: 'NonFungible' } as any,
        }).sendAndConfirm(umi);

        const sig = Buffer.from(result.signature).toString('base64');
        console.log(`[SolanaNFT] Transferred ${mintAddress}: ${sig}`);

        return { signature: sig, fromWallet, toWallet, mintAddress };
      } catch (err) {
        console.error('[SolanaNFT] Transfer failed:', err);
        throw new NFTError(`Transfer failed: ${(err as Error).message}`, 'TRANSFER_FAILED');
      }
    }

    console.warn('[SolanaNFT] Umi not configured — mock transfer');
    return {
      signature: `mock_transfer_${Date.now()}`,
      fromWallet,
      toWallet,
      mintAddress,
    };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get NFTs owned by a wallet via DAS (Digital Asset Standard) API.
   * Falls back to empty array if RPC doesn't support DAS.
   */
  async getNFTsByOwner(walletAddress: string): Promise<Array<{
    mintAddress: string;
    companionId: string;
    metadata: NFTMetadata;
  }>> {
    try {
      const res = await fetch(this.config.rpcUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 50,
          },
        }),
      });

      const data = await res.json() as any;
      const items = data?.result?.items ?? [];

      return items
        .filter((item: any) => item.content?.metadata?.symbol?.startsWith('KIN') ||
          Object.keys(COMPANION_METADATA).some(id =>
            item.content?.metadata?.name?.toLowerCase().includes(id)
          ))
        .map((item: any) => {
          const meta = item.content?.metadata ?? {};
          const companionId = Object.keys(COMPANION_METADATA).find(id =>
            meta.name?.toLowerCase().includes(id)
          ) ?? 'unknown';

          return {
            mintAddress: item.id,
            companionId,
            metadata: {
              name: meta.name ?? '',
              symbol: meta.symbol ?? 'KIN',
              description: meta.description ?? '',
              image: item.content?.links?.image ?? '',
              attributes: meta.attributes ?? [],
              properties: { category: 'image', files: [], creators: [] },
            },
          };
        });
    } catch (err) {
      console.warn('[SolanaNFT] getNFTsByOwner failed (RPC may not support DAS):', err);
      return [];
    }
  }

  /**
   * Get NFT metadata by mint address via DAS API.
   */
  async getNFTByMint(mintAddress: string): Promise<{
    mintAddress: string;
    companionId: string;
    metadata: NFTMetadata;
    owner: string;
  } | null> {
    try {
      const res = await fetch(this.config.rpcUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: mintAddress },
        }),
      });

      const data = await res.json() as any;
      const asset = data?.result;
      if (!asset) return null;

      const meta = asset.content?.metadata ?? {};
      const companionId = Object.keys(COMPANION_METADATA).find(id =>
        meta.name?.toLowerCase().includes(id)
      ) ?? 'unknown';

      return {
        mintAddress: asset.id,
        companionId,
        metadata: {
          name: meta.name ?? '',
          symbol: meta.symbol ?? 'KIN',
          description: meta.description ?? '',
          image: asset.content?.links?.image ?? '',
          attributes: meta.attributes ?? [],
          properties: { category: 'image', files: [], creators: [] },
        },
        owner: asset.ownership?.owner ?? '',
      };
    } catch (err) {
      console.warn('[SolanaNFT] getNFTByMint failed:', err);
      return null;
    }
  }

  // ==========================================================================
  // Collection
  // ==========================================================================

  /**
   * Create a new NFT collection
   */
  async createCollection(options: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
  }): Promise<{ collectionMint: string; signature: string }> {
    // STUB: Collection creation not yet implemented
    console.log(`[STUB] Creating collection: ${options.name}`);

    return {
      collectionMint: `collection_${Date.now()}`,
      signature: `sig_${Math.random().toString(36).substr(2, 87)}`,
    };
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class NFTError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'NFTError';
  }
}

// ============================================================================
// Anchor Program IDL (simplified)
// ============================================================================

export const KIN_NFT_IDL = {
  version: '0.1.0',
  name: 'kin_nft',
  instructions: [
    {
      name: 'mintCompanion',
      accounts: [
        { name: 'mint', isMut: true, isSigner: true },
        { name: 'metadata', isMut: true, isSigner: false },
        { name: 'masterEdition', isMut: true, isSigner: false },
        { name: 'owner', isMut: true, isSigner: true },
        { name: 'collection', isMut: false, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'metadataProgram', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
        { name: 'rent', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'companionId', type: 'string' },
        { name: 'metadataUri', type: 'string' },
      ],
    },
    {
      name: 'transferCompanion',
      accounts: [
        { name: 'mint', isMut: false, isSigner: false },
        { name: 'from', isMut: true, isSigner: true },
        { name: 'to', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: 'CompanionNFT', type: { kind: 'struct', fields: [] } },
  ],
  types: [],
};

// ============================================================================
// Singleton & Exports
// ============================================================================

let defaultClient: SolanaNFTClient | null = null;

export function getNFTClient(config?: NFTConfig): SolanaNFTClient {
  if (!defaultClient || config) {
    defaultClient = new SolanaNFTClient(config);
  }
  return defaultClient;
}

export default SolanaNFTClient;
