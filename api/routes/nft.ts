/**
 * NFT Routes - NFT ownership and minting endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { mintCompanionNFT } from '../lib/solana-mint.js';

interface NFTParams {
  mintAddress: string;
}

const nftRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user's NFTs
  fastify.get('/nft', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const nfts = fastify.context.db.prepare(`
      SELECT 
        n.id,
        n.mint_address,
        n.owner_wallet,
        n.acquired_at,
        n.transfer_count,
        n.metadata_uri,
        n.is_primary,
        c.id as companion_id,
        c.name as companion_name,
        c.type as companion_type,
        c.specialization
      FROM nft_ownership n
      JOIN companions c ON n.companion_id = c.id
      WHERE n.user_id = ?
      ORDER BY n.acquired_at DESC
    `).all(userId) as any[];

    return {
      nfts: nfts.map((n) => ({
        id: n.id,
        mintAddress: n.mint_address,
        ownerWallet: n.owner_wallet,
        acquiredAt: new Date(n.acquired_at).toISOString(),
        transferCount: n.transfer_count,
        metadataUri: n.metadata_uri,
        isPrimary: n.is_primary === 1,
        companion: {
          id: n.companion_id,
          name: n.companion_name,
          type: n.companion_type,
          specialization: n.specialization,
        },
      })),
    };
  });

  // Get NFT by mint address
  fastify.get<{ Params: NFTParams }>('/nft/:mintAddress', async (request, reply) => {
    const { mintAddress } = request.params;

    const nft = fastify.context.db.prepare(`
      SELECT 
        n.*,
        c.id as companion_id,
        c.name as companion_name,
        c.type as companion_type
      FROM nft_ownership n
      JOIN companions c ON n.companion_id = c.id
      WHERE n.mint_address = ?
    `).get(mintAddress) as any;

    if (!nft) {
      reply.status(404);
      return { error: 'NFT not found' };
    }

    return {
      mintAddress: nft.mint_address,
      ownerWallet: nft.owner_wallet,
      acquiredAt: new Date(nft.acquired_at).toISOString(),
      transferCount: nft.transfer_count,
      companion: {
        id: nft.companion_id,
        name: nft.companion_name,
        type: nft.companion_type,
      },
    };
  });

  // Initiate mint (placeholder - actual Solana integration required)
  fastify.post<{ Body: { companionId: string; wallet: string } }>(
    '/nft/mint',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { companionId, wallet } = request.body;

      // Check if companion is already owned
      const existing = fastify.context.db.prepare(`
        SELECT 1 FROM nft_ownership WHERE user_id = ? AND companion_id = ?
      `).get(userId, companionId);

      if (existing) {
        reply.status(409);
        return { error: 'Companion already owned' };
      }

      // Attempt real Candy Machine mint (falls back to mock if CM not deployed)
      const mintResult = await mintCompanionNFT(companionId, wallet);
      const id = `nft-${crypto.randomUUID()}`;

      fastify.context.db.prepare(`
        INSERT INTO nft_ownership (id, user_id, companion_id, mint_address, owner_wallet)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, companionId, mintResult.mintAddress, wallet);

      return {
        success: true,
        mintAddress: mintResult.mintAddress,
        source: mintResult.source,
      };
    }
  );

  // Transfer NFT (placeholder)
  fastify.post<{ Body: { mintAddress: string; toWallet: string } }>(
    '/nft/transfer',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { mintAddress, toWallet } = request.body;

      // Verify ownership
      const nft = fastify.context.db.prepare(`
        SELECT * FROM nft_ownership WHERE mint_address = ? AND user_id = ?
      `).get(mintAddress, userId) as any;

      if (!nft) {
        reply.status(404);
        return { error: 'NFT not found or not owned' };
      }

      // In production, this would:
      // 1. Create Solana transfer transaction
      // 2. Request signature
      // 3. Submit transaction
      // 4. Handle memory boundary transfer

      fastify.context.db.prepare(`
        UPDATE nft_ownership 
        SET owner_wallet = ?, transfer_count = transfer_count + 1
        WHERE mint_address = ?
      `).run(toWallet, mintAddress);

      return {
        success: true,
        message: 'Mock transfer - integrate Solana for production',
        newOwner: toWallet,
      };
    }
  );
};

export default nftRoutes;
