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

const COMPANION_METADATA: Record<string, Partial<NFTMetadata>> = {
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
  private connection: any; // Would be Connection from @solana/web3.js

  constructor(config: NFTConfig = {}) {
    this.config = {
      network: config.network ?? 'devnet',
      rpcUrl: config.rpcUrl ?? 'https://api.devnet.solana.com',
      ...config,
    };

    // In a real implementation, initialize Solana connection here
    // this.connection = new Connection(this.config.rpcUrl, 'confirmed');
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
   * Upload metadata to Arweave/IPFS
   */
  async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    // In production, this would:
    // 1. Upload to Arweave via Bundlr
    // 2. Or upload to IPFS via Pinata/NFT.Storage
    // 3. Return the URI

    console.log('Uploading metadata:', metadata.name);
    
    // Placeholder - return mock URI
    const hash = Buffer.from(JSON.stringify(metadata)).toString('base64').slice(0, 43);
    return `https://arweave.net/${hash}`;
  }

  // ==========================================================================
  // Minting
  // ==========================================================================

  /**
   * Mint a new companion NFT
   */
  async mintCompanion(
    companionId: string,
    ownerWallet: string,
    metadata: NFTMetadata
  ): Promise<MintResult> {
    // In production, this would:
    // 1. Upload metadata to Arweave
    // 2. Call the Anchor program to mint
    // 3. Transfer to owner wallet

    console.log(`Minting ${companionId} for ${ownerWallet}`);

    // Placeholder
    const mintAddress = `mint_${companionId}_${Date.now()}`;
    const signature = `sig_${Math.random().toString(36).substr(2, 87)}`;

    return {
      mintAddress,
      transactionSignature: signature,
      metadataUri: await this.uploadMetadata(metadata),
      companionId,
    };
  }

  /**
   * Mint via Candy Machine (for drops)
   */
  async mintFromCandyMachine(
    candyMachineId: string,
    wallet: string
  ): Promise<MintResult> {
    // Would use Metaplex Candy Machine
    console.log(`Minting from candy machine ${candyMachineId}`);

    return {
      mintAddress: `mint_${Date.now()}`,
      transactionSignature: `sig_${Math.random().toString(36).substr(2, 87)}`,
      metadataUri: 'https://arweave.net/placeholder',
      companionId: 'unknown',
    };
  }

  // ==========================================================================
  // Transfers
  // ==========================================================================

  /**
   * Transfer NFT to another wallet
   */
  async transfer(
    mintAddress: string,
    fromWallet: string,
    toWallet: string
  ): Promise<TransferResult> {
    // In production, this would:
    // 1. Verify ownership
    // 2. Create transfer instruction
    // 3. Sign and send transaction

    console.log(`Transferring ${mintAddress} from ${fromWallet} to ${toWallet}`);

    return {
      signature: `sig_${Math.random().toString(36).substr(2, 87)}`,
      fromWallet,
      toWallet,
      mintAddress,
    };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get NFTs owned by a wallet
   */
  async getNFTsByOwner(walletAddress: string): Promise<Array<{
    mintAddress: string;
    companionId: string;
    metadata: NFTMetadata;
  }>> {
    // Would use Metaplex to fetch NFTs
    console.log(`Fetching NFTs for ${walletAddress}`);

    return [];
  }

  /**
   * Get NFT metadata by mint address
   */
  async getNFTByMint(mintAddress: string): Promise<{
    mintAddress: string;
    companionId: string;
    metadata: NFTMetadata;
    owner: string;
  } | null> {
    // Would fetch from Solana
    console.log(`Fetching NFT ${mintAddress}`);

    return null;
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
    console.log(`Creating collection: ${options.name}`);

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
