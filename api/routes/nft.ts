/**
 * NFT Routes - NFT ownership and minting endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { mintCompanionNFT } from '../lib/solana-mint.js';
import { mintRateLimit } from '../middleware/rate-limit.js';

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

  // Get NFT traits: skills + latest snapshot with IPFS/chain status
  fastify.get<{ Params: NFTParams }>('/nft/:mintAddress/traits', async (request, reply) => {
    const { mintAddress } = request.params;

    // Look up NFT ownership by mint address
    const nft = fastify.context.db.prepare(`
      SELECT companion_id, user_id FROM nft_ownership
      WHERE mint_address = ?
    `).get(mintAddress) as { companion_id: string; user_id: string } | undefined;

    if (!nft) {
      reply.status(404);
      return { error: 'NFT not found' };
    }

    // Latest companion snapshot
    const snapshot = fastify.context.db.prepare(`
      SELECT id, content_hash, ipfs_cid, solana_tx_sig, is_on_chain, created_at
      FROM companion_snapshots
      WHERE companion_id = ? AND user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(nft.companion_id, nft.user_id) as any | undefined;

    // All portable skills for this companion
    const skills = fastify.context.db.prepare(`
      SELECT cs.skill_id, cs.skill_level, cs.xp, cs.xp_to_next_level,
             cs.is_portable, cs.usage_count, cs.accrued_at, cs.last_used_at,
             s.name AS skill_name, s.display_name AS skill_display_name,
             s.category AS skill_category
      FROM companion_skills cs
      JOIN skills s ON s.id = cs.skill_id
      WHERE cs.companion_id = ? AND cs.user_id = ?
      ORDER BY cs.skill_level DESC, cs.xp DESC
    `).all(nft.companion_id, nft.user_id) as any[];

    const totalSkillLevels = skills.reduce((sum: number, s: any) => sum + s.skill_level, 0);

    return {
      companionId: nft.companion_id,
      mintAddress,
      skills: skills.map((s: any) => ({
        skillId: s.skill_id,
        skillName: s.skill_name,
        skillDisplayName: s.skill_display_name,
        skillCategory: s.skill_category,
        skillLevel: s.skill_level,
        xp: s.xp,
        xpToNextLevel: s.xp_to_next_level,
        isPortable: s.is_portable === 1,
        usageCount: s.usage_count,
        accruedAt: new Date(s.accrued_at).toISOString(),
        lastUsedAt: s.last_used_at ? new Date(s.last_used_at).toISOString() : null,
      })),
      latestSnapshot: snapshot ? {
        id: snapshot.id,
        contentHash: snapshot.content_hash,
        ipfsCid: snapshot.ipfs_cid ?? null,
        solanaTxSig: snapshot.solana_tx_sig ?? null,
        isOnChain: snapshot.is_on_chain === 1,
        createdAt: new Date(snapshot.created_at).toISOString(),
      } : null,
      totalSkillLevels,
    };
  });

  // Initiate mint (placeholder - actual Solana integration required)
  fastify.post<{ Body: { companionId: string; wallet: string } }>(
    '/nft/mint',
    { preHandler: [mintRateLimit()] },
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

  // Transfer NFT with skill/memory migration
  fastify.post<{ Body: { mintAddress: string; toWallet: string; toUserId?: string } }>(
    '/nft/transfer',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { mintAddress, toWallet, toUserId } = request.body;

      // Verify ownership
      const nft = fastify.context.db.prepare(`
        SELECT * FROM nft_ownership WHERE mint_address = ? AND user_id = ?
      `).get(mintAddress, userId) as any;

      if (!nft) {
        reply.status(404);
        return { error: 'NFT not found or not owned' };
      }

      const companionId = nft.companion_id;

      // ── 1. Execute on-chain transfer ──────────────────────────────────
      let onChainSignature: string | null = null;
      try {
        const { getNFTClient } = await import('../../solana/nft.js');
        const client = getNFTClient();
        const result = await client.transfer(mintAddress, nft.owner_wallet, toWallet);
        onChainSignature = result.signature;
      } catch (err) {
        // Log but don't block — on-chain may fail if Umi not configured
        fastify.log.warn({ err, mintAddress }, 'On-chain transfer failed, proceeding with DB update');
      }

      // ── 2. Migrate memories to new owner ──────────────────────────────
      let memoriesMigrated = 0;
      if (toUserId) {
        try {
          const migrateResult = fastify.context.db.prepare(`
            UPDATE memories
            SET user_id = ?,
                updated_at = (strftime('%s','now')*1000)
            WHERE user_id = ? AND companion_id = ?
          `).run(toUserId, userId, companionId);
          memoriesMigrated = migrateResult.changes;
        } catch (err) {
          fastify.log.warn({ err }, 'Memory migration failed');
        }

        // ── 3. Migrate companion skills ───────────────────────────────
        try {
          fastify.context.db.prepare(`
            UPDATE companion_skills
            SET user_id = ?
            WHERE user_id = ? AND companion_id = ?
          `).run(toUserId, userId, companionId);
        } catch { /* companion_skills table may not exist */ }

        // ── 4. Migrate soul config ────────────────────────────────────
        try {
          fastify.context.db.prepare(`
            UPDATE companion_souls
            SET user_id = ?,
                updated_at = (strftime('%s','now')*1000)
            WHERE user_id = ? AND companion_id = ?
          `).run(toUserId, userId, companionId);
        } catch { /* companion_souls table may not exist */ }

        // ── 5. Transfer user_companions ownership ─────────────────────
        try {
          fastify.context.db.prepare(`
            UPDATE user_companions
            SET user_id = ?
            WHERE user_id = ? AND companion_id = ?
          `).run(toUserId, userId, companionId);
        } catch { /* ignore */ }
      }

      // ── 6. Update NFT ownership record ────────────────────────────────
      if (toUserId) {
        fastify.context.db.prepare(`
          UPDATE nft_ownership
          SET user_id = ?, owner_wallet = ?, transfer_count = transfer_count + 1
          WHERE mint_address = ?
        `).run(toUserId, toWallet, mintAddress);
      } else {
        fastify.context.db.prepare(`
          UPDATE nft_ownership
          SET owner_wallet = ?, transfer_count = transfer_count + 1
          WHERE mint_address = ?
        `).run(toWallet, mintAddress);
      }

      return {
        success: true,
        newOwner: toWallet,
        newUserId: toUserId ?? null,
        onChainSignature,
        migration: {
          memoriesMigrated,
          skillsMigrated: toUserId ? true : false,
          soulMigrated: toUserId ? true : false,
        },
      };
    }
  );
};

export default nftRoutes;
