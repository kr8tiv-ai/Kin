/**
 * NFT Routes - NFT ownership and minting endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { mintCompanionNFT } from '../lib/solana-mint.js';
import { mintRateLimit } from '../middleware/rate-limit.js';
import { pinJSON } from '../lib/ipfs-pin.js';
import { anchorHash } from '../lib/chain-anchor.js';

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

  // ── POST /nft/rebind-execute ──────────────────────────────────────────
  // Atomic data migration pipeline: snapshot → skill replication →
  // private data wipe → ownership transfer → status update.
  // Called by the new owner after Stripe payment completes (status: processing).
  fastify.post<{ Body: { mintAddress: string } }>(
    '/nft/rebind-execute',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { mintAddress } = request.body;

      if (!mintAddress) {
        reply.status(400);
        return { error: 'mintAddress is required' };
      }

      // ── Verify caller is the to_user_id of a processing rebinding ────
      const rebinding = fastify.context.db.prepare(`
        SELECT id, nft_mint_address, companion_id, from_user_id, to_user_id, status
        FROM nft_rebindings
        WHERE nft_mint_address = ? AND status = 'processing'
        ORDER BY created_at DESC LIMIT 1
      `).get(mintAddress) as {
        id: string; nft_mint_address: string; companion_id: string;
        from_user_id: string; to_user_id: string | null; status: string;
      } | undefined;

      if (!rebinding) {
        reply.status(404);
        return { error: 'No active rebinding found for this NFT' };
      }

      if (rebinding.to_user_id !== userId) {
        reply.status(403);
        return { error: 'Only the new owner can execute rebinding' };
      }

      // ── Idempotency: reject if already past processing ───────────────
      // (Checked above via status='processing', but guard against race)

      const fromUser = rebinding.from_user_id;
      const toUser = userId;
      const companionId = rebinding.companion_id;

      fastify.log.info(
        { rebindingId: rebinding.id, mintAddress, fromUser, toUser, companionId },
        '[Rebind] Starting atomic migration pipeline',
      );

      // ── Atomic transaction ────────────────────────────────────────────
      let snapshotId: string;
      let skillsTransferred = 0;
      let memoriesWiped = 0;

      const runPipeline = fastify.context.db.transaction(() => {
        // ── a. Snapshot: portable skills for transfer record ───────────
        const portableSkills = fastify.context.db.prepare(`
          SELECT cs.skill_id, cs.skill_level, cs.xp, cs.usage_count,
                 cs.xp_to_next_level, cs.is_portable,
                 s.name, s.display_name, s.category
          FROM companion_skills cs
          JOIN skills s ON s.id = cs.skill_id
          WHERE cs.companion_id = ? AND cs.user_id = ? AND cs.is_portable = 1
          ORDER BY cs.skill_level DESC
        `).all(companionId, fromUser) as any[];

        const snapshotPayload = {
          type: 'rebind_transfer',
          companionId,
          nftMintAddress: mintAddress,
          fromUserId: fromUser,
          toUserId: toUser,
          timestamp: Date.now(),
          skills: portableSkills.map((s: any) => ({
            id: s.skill_id,
            name: s.name,
            displayName: s.display_name,
            category: s.category,
            level: s.skill_level,
            xp: s.xp,
            usageCount: s.usage_count,
          })),
        };

        const payloadStr = JSON.stringify(snapshotPayload);
        const contentHash = crypto
          .createHash('sha256')
          .update(payloadStr)
          .digest('hex');

        snapshotId = `csn-${crypto.randomUUID()}`;

        fastify.context.db.prepare(`
          INSERT INTO companion_snapshots
            (id, companion_id, user_id, nft_mint_address, snapshot_type,
             content_hash, encrypted_payload, is_on_chain)
          VALUES (?, ?, ?, ?, 'transfer', ?, ?, 0)
        `).run(snapshotId, companionId, fromUser, mintAddress, contentHash, payloadStr);

        fastify.log.info(
          { snapshotId, skillCount: portableSkills.length },
          '[Rebind] Snapshot created',
        );

        // ── b. Skill replication: portable skills to new owner ─────────
        const insertSkillStmt = fastify.context.db.prepare(`
          INSERT OR REPLACE INTO companion_skills
            (id, companion_id, user_id, skill_id, skill_level, xp,
             xp_to_next_level, is_portable, usage_count, accrued_at)
          VALUES (
            COALESCE(
              (SELECT id FROM companion_skills WHERE companion_id = ? AND user_id = ? AND skill_id = ?),
              ?
            ),
            ?, ?, ?, ?, ?, ?, 1, ?, ?
          )
        `);
        for (const skill of portableSkills) {
          const newId = `cs-${crypto.randomUUID()}`;
          insertSkillStmt.run(
            companionId, toUser, skill.skill_id, // COALESCE lookup
            newId,                                 // fallback id
            companionId, toUser, skill.skill_id,
            skill.skill_level, skill.xp,
            skill.xp_to_next_level,
            skill.usage_count,
            Date.now(),
          );
          skillsTransferred++;
        }

        fastify.log.info(
          { skillsTransferred },
          '[Rebind] Skills replicated to new owner',
        );

        // ── c. Private data wipe ──────────────────────────────────────

        // c1. Delete conversations for old owner + companion
        const convResult = fastify.context.db.prepare(`
          DELETE FROM conversations
          WHERE user_id = ? AND companion_id = ?
        `).run(fromUser, companionId);

        // c2. Transferable memories: replicate to new owner, then delete originals
        const transferableMemories = fastify.context.db.prepare(`
          SELECT id, memory_type, content, importance, embedding, metadata
          FROM memories
          WHERE user_id = ? AND companion_id = ? AND is_transferable = 1
        `).all(fromUser, companionId) as any[];

        const insertMemoryStmt = fastify.context.db.prepare(`
          INSERT INTO memories
            (id, user_id, companion_id, memory_type, content, importance,
             is_transferable, embedding, metadata)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const mem of transferableMemories) {
          insertMemoryStmt.run(
            `mem-${crypto.randomUUID()}`,
            toUser, companionId,
            mem.memory_type, mem.content, mem.importance,
            mem.embedding, mem.metadata,
          );
        }

        // c3. Delete ALL memories for old owner + companion (transferable originals + non-transferable)
        const memResult = fastify.context.db.prepare(`
          DELETE FROM memories
          WHERE user_id = ? AND companion_id = ?
        `).run(fromUser, companionId);

        memoriesWiped = memResult.changes;

        // c4. Delete companion souls (personality config)
        fastify.context.db.prepare(`
          DELETE FROM companion_souls
          WHERE user_id = ? AND companion_id = ?
        `).run(fromUser, companionId);

        // c5. Delete companion customizations
        fastify.context.db.prepare(`
          DELETE FROM companion_customizations
          WHERE user_id = ? AND companion_id = ?
        `).run(fromUser, companionId);

        fastify.log.info(
          { conversationsDeleted: convResult.changes, memoriesWiped, transferableMemoriesMigrated: transferableMemories.length },
          '[Rebind] Private data wiped',
        );

        // ── d. Ownership transfer ─────────────────────────────────────

        // d1. Update nft_ownership
        fastify.context.db.prepare(`
          UPDATE nft_ownership
          SET user_id = ?, transfer_count = transfer_count + 1
          WHERE mint_address = ?
        `).run(toUser, mintAddress);

        // d2. Update user_companions
        fastify.context.db.prepare(`
          UPDATE user_companions
          SET user_id = ?
          WHERE user_id = ? AND companion_id = ?
        `).run(toUser, fromUser, companionId);

        // d3. Log transfer in nft_transfers
        const transferId = `xfer-${crypto.randomUUID()}`;
        const skillsJson = JSON.stringify(
          portableSkills.map((s: any) => ({
            skillId: s.skill_id,
            level: s.skill_level,
            xp: s.xp,
            name: s.name,
          })),
        );

        fastify.context.db.prepare(`
          INSERT INTO nft_transfers
            (id, nft_mint_address, companion_id, from_user_id, to_user_id,
             skills_transferred, snapshot_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(transferId, mintAddress, companionId, fromUser, toUser, skillsJson, snapshotId);

        // ── e. Status update ──────────────────────────────────────────
        fastify.context.db.prepare(`
          UPDATE nft_rebindings
          SET status = 'pending_onboarding', snapshot_id = ?, completed_at = ?
          WHERE id = ?
        `).run(snapshotId, Date.now(), rebinding.id);
      });

      // Execute the atomic transaction
      runPipeline();

      fastify.log.info(
        { rebindingId: rebinding.id, snapshotId: snapshotId!, skillsTransferred, memoriesWiped },
        '[Rebind] Migration pipeline complete',
      );

      // ── Fire-and-forget: pin snapshot to IPFS + anchor hash (K013) ──
      (async () => {
        try {
          const snapshot = fastify.context.db.prepare(
            `SELECT encrypted_payload, content_hash FROM companion_snapshots WHERE id = ?`,
          ).get(snapshotId!) as { encrypted_payload: string; content_hash: string } | undefined;

          if (snapshot) {
            const pinResult = await pinJSON(JSON.parse(snapshot.encrypted_payload), snapshotId!, request.log);
            if (pinResult) {
              fastify.context.db.prepare(
                `UPDATE companion_snapshots SET ipfs_cid = ? WHERE id = ?`,
              ).run(pinResult.cid, snapshotId!);
            }

            const anchorResult = await anchorHash(snapshot.content_hash);
            if (anchorResult) {
              fastify.context.db.prepare(
                `UPDATE companion_snapshots SET solana_tx_sig = ?, is_on_chain = 1 WHERE id = ?`,
              ).run(anchorResult.txSig, snapshotId!);
            }
          }
        } catch (err) {
          fastify.log.warn({ err, snapshotId: snapshotId! }, '[Rebind] IPFS/chain anchor failed (non-blocking)');
        }
      })().catch(() => {});

      return {
        success: true,
        rebindingId: rebinding.id,
        snapshotId: snapshotId!,
        skillsTransferred,
        memoriesWiped,
      };
    },
  );

  // ── GET /nft/rebind-status/:mintAddress ─────────────────────────────
  // Returns the latest rebinding record for a given NFT mint address.
  // Access-controlled: only from_user_id or to_user_id can query.
  fastify.get<{ Params: NFTParams }>(
    '/nft/rebind-status/:mintAddress',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { mintAddress } = request.params;

      const rebinding = fastify.context.db.prepare(`
        SELECT id, nft_mint_address, companion_id, from_user_id, to_user_id,
               status, created_at, completed_at
        FROM nft_rebindings
        WHERE nft_mint_address = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(mintAddress) as {
        id: string; nft_mint_address: string; companion_id: string;
        from_user_id: string; to_user_id: string | null; status: string;
        created_at: number; completed_at: number | null;
      } | undefined;

      if (!rebinding) {
        reply.status(404);
        return { error: 'No rebinding found for this NFT' };
      }

      // Access control: only involved parties can view rebinding status
      if (rebinding.from_user_id !== userId && rebinding.to_user_id !== userId) {
        reply.status(403);
        return { error: 'Not authorized to view this rebinding' };
      }

      return {
        rebindingId: rebinding.id,
        status: rebinding.status,
        companionId: rebinding.companion_id,
        fromUserId: rebinding.from_user_id,
        toUserId: rebinding.to_user_id,
        createdAt: new Date(rebinding.created_at).toISOString(),
        completedAt: rebinding.completed_at
          ? new Date(rebinding.completed_at).toISOString()
          : null,
      };
    },
  );

  // ── POST /nft/rebind-complete ─────────────────────────────────────────
  // Called by the new owner to finalize onboarding after rebinding migration.
  // Transitions status from pending_onboarding → complete.
  fastify.post<{ Body: { mintAddress: string } }>(
    '/nft/rebind-complete',
    async (request, reply) => {
      const userId = (request.user as { userId: string }).userId;
      const { mintAddress } = request.body;

      if (!mintAddress) {
        reply.status(400);
        return { error: 'mintAddress is required' };
      }

      const rebinding = fastify.context.db.prepare(`
        SELECT id, to_user_id, status
        FROM nft_rebindings
        WHERE nft_mint_address = ? AND status = 'pending_onboarding'
        ORDER BY created_at DESC LIMIT 1
      `).get(mintAddress) as {
        id: string; to_user_id: string | null; status: string;
      } | undefined;

      if (!rebinding) {
        reply.status(404);
        return { error: 'No rebinding pending onboarding for this NFT' };
      }

      if (rebinding.to_user_id !== userId) {
        reply.status(403);
        return { error: 'Only the new owner can complete rebinding' };
      }

      fastify.context.db.prepare(`
        UPDATE nft_rebindings
        SET status = 'complete', completed_at = ?
        WHERE id = ?
      `).run(Date.now(), rebinding.id);

      fastify.log.info(
        { rebindingId: rebinding.id, mintAddress, userId },
        '[Rebind] Onboarding complete',
      );

      return { success: true };
    },
  );

  // ── POST /nft/transfer (DEPRECATED) ─────────────────────────────────
  // Old naive transfer had multiple bugs: moved ALL memories, no transaction,
  // no snapshot. Replaced by the rebinding flow.
  fastify.post<{ Body: { mintAddress: string; toWallet: string; toUserId?: string } }>(
    '/nft/transfer',
    async (_request, reply) => {
      reply.status(410);
      return {
        error: 'Use /nft/rebind-checkout for NFT transfers',
        deprecated: true,
      };
    },
  );
};

export default nftRoutes;
