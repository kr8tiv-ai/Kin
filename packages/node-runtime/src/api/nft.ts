/**
 * NFT API Routes
 * 
 * Endpoints for Solana NFT operations and GLB avatar management.
 */

import express, { Request, Response } from 'express';

const router = express.Router();

// In-memory store for NFT records (would be replaced with real data in production)
let nftRecords: Map<string, NFTRecord> = new Map();

// --- Type Definitions ---

interface NFTRecord {
  record_id: string;
  schema_family: 'nft_record';
  kin_id: string;
  kin_name: string;
  mint_address: string;
  glb_url: string;
  owner_wallet: string;
  creator_wallet: string;
  chain: 'devnet' | 'mainnet-beta';
  collection_address?: string;
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    seller_fee_basis_points: number;
    creators: Array<{
      address: string;
      share: number;
      verified: boolean;
    }>;
    properties?: Record<string, any>;
  };
  minted_at: string;
  last_verified_at: string | null;
  verification_status: 'verified' | 'unverified' | 'pending' | 'failed';
  transfer_count: number;
  last_transfer_at: string | null;
  transaction_signature: string;
  boot_hash?: string;
  explorer_url: string;
  created_at: string;
  updated_at: string;
}

// Initialize with Genesis Six NFTs
function initializeGenesisSix(): void {
  const genesisSix = [
    {
      kin_id: 'cipher-001',
      kin_name: 'Cipher',
      glb_url: 'https://assets.kr8tiv.ai/kin/cipher.glb',
      specialization: 'web-design',
      bloodline: 'Code Kraken',
    },
    {
      kin_id: 'mischief-001',
      kin_name: 'Mischief',
      glb_url: 'https://assets.kr8tiv.ai/kin/mischief.glb',
      specialization: 'family-companion',
      bloodline: 'Glitch Pup',
    },
    {
      kin_id: 'vortex-001',
      kin_name: 'Vortex',
      glb_url: 'https://assets.kr8tiv.ai/kin/vortex.glb',
      specialization: 'social-media',
      bloodline: 'Teal Dragon',
    },
    {
      kin_id: 'forge-001',
      kin_name: 'Forge',
      glb_url: 'https://assets.kr8tiv.ai/kin/forge.glb',
      specialization: 'developer-support',
      bloodline: 'Cyber Unicorn',
    },
    {
      kin_id: 'aether-001',
      kin_name: 'Aether',
      glb_url: 'https://assets.kr8tiv.ai/kin/aether.glb',
      specialization: 'creative-writing',
      bloodline: 'Frost Ape',
    },
    {
      kin_id: 'catalyst-001',
      kin_name: 'Catalyst',
      glb_url: 'https://assets.kr8tiv.ai/kin/catalyst.glb',
      specialization: 'wealth-coaching',
      bloodline: 'Cosmic Blob',
    },
  ];

  const now = new Date().toISOString();
  const ownerWallet = 'Kr8tivGenesisOwner123456789ABCDEFGHIJ';

  genesisSix.forEach(kin => {
    const mintAddress = generateMintAddress(kin.kin_id);
    const record: NFTRecord = {
      record_id: `nft-record-${kin.kin_id.replace('-', '')}`,
      schema_family: 'nft_record',
      kin_id: kin.kin_id,
      kin_name: kin.kin_name,
      mint_address: mintAddress,
      glb_url: kin.glb_url,
      owner_wallet: ownerWallet,
      creator_wallet: ownerWallet,
      chain: 'devnet',
      collection_address: 'G3n3s1sS1xCo11ect10nXXXXXXXXXXXXXXXXX',
      metadata: {
        name: `${kin.kin_name} - Kin Companion`,
        symbol: 'KIN',
        uri: kin.glb_url.replace('.glb', '.json'),
        seller_fee_basis_points: 500,
        creators: [{ address: ownerWallet, share: 100, verified: true }],
        properties: {
          specialization: kin.specialization,
          bloodline: kin.bloodline,
          generation: 1,
        },
      },
      minted_at: now,
      last_verified_at: now,
      verification_status: 'verified',
      transfer_count: 0,
      last_transfer_at: null,
      transaction_signature: generateTransactionSignature(),
      explorer_url: `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`,
      created_at: now,
      updated_at: now,
    };
    nftRecords.set(kin.kin_id, record);
  });
}

// Initialize Genesis Six on load
initializeGenesisSix();

// --- Helper functions ---

function generateMintAddress(kinId: string): string {
  // Generate a deterministic mock mint address
  const hash = Buffer.from(`kin-nft-${kinId}-devnet`).toString('base64');
  return hash.replace(/[^a-zA-Z0-9]/g, '').substring(0, 44);
}

function generateTransactionSignature(): string {
  const random = Math.random().toString(36).substring(2);
  return random.repeat(3).substring(0, 88);
}

// --- API Routes ---

/**
 * Get NFT record for a Kin
 * GET /api/nft/:kinId
 */
router.get('/:kinId', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;
    const record = nftRecords.get(kinId);

    if (!record) {
      return res.status(404).json({ error: `No NFT found for ${kinId}` });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching NFT:', error);
    res.status(500).json({ error: 'Failed to fetch NFT' });
  }
});

/**
 * Get all NFT records
 * GET /api/nft
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const records = Array.from(nftRecords.values());
    res.json({
      count: records.length,
      records,
    });
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

/**
 * Mint a new NFT
 * POST /api/nft/mint
 */
router.post('/mint', async (req: Request, res: Response) => {
  try {
    const { kin_id, kin_name, glb_url, owner_wallet, metadata } = req.body;

    if (!kin_id || !kin_name || !glb_url || !owner_wallet) {
      return res.status(400).json({
        error: 'kin_id, kin_name, glb_url, and owner_wallet are required',
      });
    }

    const now = new Date().toISOString();
    const mintAddress = generateMintAddress(kin_id);

    const record: NFTRecord = {
      record_id: `nft-record-${kin_id.replace('-', '')}`,
      schema_family: 'nft_record',
      kin_id,
      kin_name,
      mint_address: mintAddress,
      glb_url,
      owner_wallet,
      creator_wallet: owner_wallet,
      chain: 'devnet',
      metadata: metadata || {
        name: `${kin_name} - Kin Companion`,
        symbol: 'KIN',
        uri: glb_url.replace('.glb', '.json'),
        seller_fee_basis_points: 500,
        creators: [{ address: owner_wallet, share: 100, verified: true }],
      },
      minted_at: now,
      last_verified_at: now,
      verification_status: 'verified',
      transfer_count: 0,
      last_transfer_at: null,
      transaction_signature: generateTransactionSignature(),
      explorer_url: `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`,
      created_at: now,
      updated_at: now,
    };

    nftRecords.set(kin_id, record);

    res.json({
      success: true,
      message: `NFT minted for ${kin_name}`,
      record,
    });
  } catch (error) {
    console.error('Error minting NFT:', error);
    res.status(500).json({ error: 'Failed to mint NFT' });
  }
});

/**
 * Verify ownership of NFT
 * GET /api/nft/:kinId/verify
 */
router.get('/:kinId/verify', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;
    const { wallet } = req.query;

    const record = nftRecords.get(kinId);

    if (!record) {
      return res.status(404).json({
        verified: false,
        error: `No NFT found for ${kinId}`,
      });
    }

    const isOwner = !wallet || record.owner_wallet === wallet;

    if (isOwner) {
      record.last_verified_at = new Date().toISOString();
      record.verification_status = 'verified';
    }

    res.json({
      verified: isOwner,
      kin_id: kinId,
      owner_wallet: record.owner_wallet,
      verified_at: record.last_verified_at,
    });
  } catch (error) {
    console.error('Error verifying ownership:', error);
    res.status(500).json({ error: 'Failed to verify ownership' });
  }
});

/**
 * Get GLB URL for a Kin
 * GET /api/nft/:kinId/glb
 */
router.get('/:kinId/glb', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;
    const record = nftRecords.get(kinId);

    if (!record) {
      return res.status(404).json({ error: `No NFT found for ${kinId}` });
    }

    res.json({
      kin_id: kinId,
      glb_url: record.glb_url,
      mint_address: record.mint_address,
    });
  } catch (error) {
    console.error('Error fetching GLB URL:', error);
    res.status(500).json({ error: 'Failed to fetch GLB URL' });
  }
});

/**
 * Transfer NFT to new wallet
 * POST /api/nft/:kinId/transfer
 */
router.post('/:kinId/transfer', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;
    const { to_wallet } = req.body;

    if (!to_wallet) {
      return res.status(400).json({ error: 'to_wallet is required' });
    }

    const record = nftRecords.get(kinId);

    if (!record) {
      return res.status(404).json({ error: `No NFT found for ${kinId}` });
    }

    record.owner_wallet = to_wallet;
    record.transfer_count += 1;
    record.last_transfer_at = new Date().toISOString();
    record.transaction_signature = generateTransactionSignature();
    record.updated_at = new Date().toISOString();

    res.json({
      success: true,
      message: `NFT transferred to ${to_wallet}`,
      record,
    });
  } catch (error) {
    console.error('Error transferring NFT:', error);
    res.status(500).json({ error: 'Failed to transfer NFT' });
  }
});

export default router;
