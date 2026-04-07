/**
 * Companion Skills Routes — NFT-portable skill accrual system.
 *
 * Skills accrue to companion instances (NFTs). When an NFT is sold/transferred,
 * the skills travel with the companion — like leveled-up RPG characters.
 * Private user data (memories, conversations) stays with the original owner.
 *
 * GET    /companion-skills/:companionId        Get skills for a companion
 * POST   /companion-skills/:companionId/accrue  Award XP to a companion skill
 * POST   /companion-skills/snapshot             Create a skill state snapshot
 * GET    /companion-skills/snapshots            List snapshots
 * POST   /companion-skills/transfer             Prepare skills for NFT transfer
 * GET    /companion-skills/transfer-log         Transfer history
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { pinJSON } from '../lib/ipfs-pin.js';
import { anchorHash } from '../lib/chain-anchor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccrueBody {
  skillId: string;
  xpGained: number;
}

interface SnapshotBody {
  companionId: string;
  snapshotType?: 'skill_state' | 'personality' | 'full' | 'transfer';
}

interface TransferBody {
  companionId: string;
  nftMintAddress: string;
  toUserId?: string;
  transferTxSig?: string;
}

// XP thresholds per level (level 1 starts at 0 XP)
const XP_CURVE = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500];

function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level >= XP_CURVE.length) return XP_CURVE[XP_CURVE.length - 1]! + (level - XP_CURVE.length + 1) * 1000;
  return XP_CURVE[level] ?? 100;
}

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const accrueSchema = {
  type: 'object' as const,
  required: ['skillId'],
  properties: {
    skillId: { type: 'string' as const, minLength: 1, maxLength: 128 },
    xpGained: { type: 'number' as const, minimum: 1, maximum: 100, default: 10 },
  },
  additionalProperties: false,
};

const snapshotSchema = {
  type: 'object' as const,
  required: ['companionId'],
  properties: {
    companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
    snapshotType: { type: 'string' as const, enum: ['skill_state', 'personality', 'full', 'transfer'] },
  },
  additionalProperties: false,
};

const transferSchema = {
  type: 'object' as const,
  required: ['companionId', 'nftMintAddress'],
  properties: {
    companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
    nftMintAddress: { type: 'string' as const, minLength: 32, maxLength: 64 },
    toUserId: { type: 'string' as const, maxLength: 128 },
    transferTxSig: { type: 'string' as const, maxLength: 128 },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const companionSkillsRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /companion-skills/:companionId ──────────────────────────────────
  // Get all accrued skills for a specific companion.
  fastify.get<{ Params: { companionId: string } }>(
    '/companion-skills/:companionId',
    async (request) => {
      const userId = (request.user as { userId: string }).userId;
      const { companionId } = request.params;

      const rows = fastify.context.db.prepare(`
        SELECT
          cs.id, cs.companion_id, cs.skill_id, cs.skill_level, cs.xp,
          cs.xp_to_next_level, cs.is_portable, cs.usage_count,
          cs.accrued_at, cs.last_used_at,
          s.name AS skill_name, s.display_name AS skill_display_name
        FROM companion_skills cs
        JOIN skills s ON s.id = cs.skill_id
        WHERE cs.companion_id = ? AND cs.user_id = ?
        ORDER BY cs.skill_level DESC, cs.xp DESC
      `).all(companionId, userId) as any[];

      return rows.map((r) => ({
        id: r.id,
        companionId: r.companion_id,
        skillId: r.skill_id,
        skillName: r.skill_name,
        skillDisplayName: r.skill_display_name,
        skillLevel: r.skill_level,
        xp: r.xp,
        xpToNextLevel: r.xp_to_next_level,
        isPortable: r.is_portable === 1,
        usageCount: r.usage_count,
        accruedAt: new Date(r.accrued_at).toISOString(),
        lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      }));
    },
  );

  // ── POST /companion-skills/:companionId/accrue ──────────────────────────
  // Award XP to a companion's skill. Auto-levels up when threshold is crossed.
  fastify.post<{
    Params: { companionId: string };
    Body: AccrueBody;
  }>('/companion-skills/:companionId/accrue', { schema: { body: accrueSchema } } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.params;
    const { skillId, xpGained = 10 } = request.body;

    if (!skillId) return reply.badRequest('skillId is required');
    if (xpGained <= 0 || xpGained > 100) return reply.badRequest('xpGained must be 1-100');

    // Get or create companion_skill entry
    let entry = fastify.context.db.prepare(`
      SELECT id, skill_level, xp, xp_to_next_level, usage_count
      FROM companion_skills
      WHERE companion_id = ? AND user_id = ? AND skill_id = ?
    `).get(companionId, userId, skillId) as any;

    if (!entry) {
      // First time using this skill — create entry
      const id = `cs-${crypto.randomUUID()}`;
      const nextLevelXp = xpForLevel(2);
      fastify.context.db.prepare(`
        INSERT INTO companion_skills (id, companion_id, user_id, skill_id, skill_level, xp, xp_to_next_level, usage_count, last_used_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?)
      `).run(id, companionId, userId, skillId, xpGained, nextLevelXp, Date.now());

      return {
        skillLevel: 1,
        xp: xpGained,
        xpToNextLevel: nextLevelXp,
        leveledUp: false,
      };
    }

    // Add XP
    let newXp = entry.xp + xpGained;
    let newLevel = entry.skill_level;
    let leveledUp = false;

    // Check for level up
    while (newXp >= entry.xp_to_next_level && newLevel < 99) {
      newXp -= entry.xp_to_next_level;
      newLevel++;
      leveledUp = true;
      entry.xp_to_next_level = xpForLevel(newLevel + 1);
    }

    fastify.context.db.prepare(`
      UPDATE companion_skills
      SET xp = ?, skill_level = ?, xp_to_next_level = ?,
          usage_count = usage_count + 1, last_used_at = ?
      WHERE id = ?
    `).run(newXp, newLevel, entry.xp_to_next_level, Date.now(), entry.id);

    return {
      skillLevel: newLevel,
      xp: newXp,
      xpToNextLevel: entry.xp_to_next_level,
      leveledUp,
    };
  });

  // ── POST /companion-skills/snapshot ─────────────────────────────────────
  // Create a snapshot of a companion's skills/personality for IPFS/on-chain.
  fastify.post<{ Body: SnapshotBody }>('/companion-skills/snapshot', { schema: { body: snapshotSchema } } as any, async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId, snapshotType = 'skill_state' } = request.body;

    // Get all portable skills for this companion
    const skills = fastify.context.db.prepare(`
      SELECT cs.skill_id, cs.skill_level, cs.xp, cs.usage_count,
             s.name, s.display_name, s.category
      FROM companion_skills cs
      JOIN skills s ON s.id = cs.skill_id
      WHERE cs.companion_id = ? AND cs.user_id = ? AND cs.is_portable = 1
      ORDER BY cs.skill_level DESC
    `).all(companionId, userId) as any[];

    // Get NFT mint address
    const nft = fastify.context.db.prepare(`
      SELECT mint_address FROM nft_ownership
      WHERE companion_id = ? AND user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(companionId, userId) as any;

    // Build payload (skills only, NO private data)
    const payload = {
      companionId,
      snapshotType,
      timestamp: Date.now(),
      skills: skills.map((s: any) => ({
        id: s.skill_id,
        name: s.name,
        displayName: s.display_name,
        category: s.category,
        level: s.skill_level,
        xp: s.xp,
        usageCount: s.usage_count,
      })),
      totalSkillLevels: skills.reduce((sum: number, s: any) => sum + s.skill_level, 0),
    };

    const payloadStr = JSON.stringify(payload);

    // SHA-256 hash for integrity
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payloadStr),
    );
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const snapshotId = `csn-${crypto.randomUUID()}`;

    fastify.context.db.prepare(`
      INSERT INTO companion_snapshots
        (id, companion_id, user_id, nft_mint_address, snapshot_type,
         content_hash, encrypted_payload, is_on_chain)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      snapshotId,
      companionId,
      userId,
      nft?.mint_address ?? null,
      snapshotType,
      contentHash,
      payloadStr,
    );

    // Fire-and-forget: pin to IPFS then anchor hash on-chain (K013 pattern)
    (async () => {
      try {
        const pinResult = await pinJSON(payload, snapshotId);
        if (pinResult) {
          fastify.context.db.prepare(
            `UPDATE companion_snapshots SET ipfs_cid = ? WHERE id = ?`,
          ).run(pinResult.cid, snapshotId);
        }

        const anchorResult = await anchorHash(contentHash);
        if (anchorResult) {
          fastify.context.db.prepare(
            `UPDATE companion_snapshots SET solana_tx_sig = ?, is_on_chain = 1 WHERE id = ?`,
          ).run(anchorResult.txSig, snapshotId);
        }
      } catch {
        // Never block the response — side-effect failures are silent (K013)
      }
    })().catch(() => {});

    return {
      id: snapshotId,
      contentHash,
      skillCount: skills.length,
      totalLevels: payload.totalSkillLevels,
      snapshotType,
      ipfsCid: null,
      isOnChain: false,
    };
  });

  // ── GET /companion-skills/snapshots ─────────────────────────────────────
  fastify.get<{
    Querystring: { companionId?: string };
  }>('/companion-skills/snapshots', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId } = request.query;

    let sql = `
      SELECT id, companion_id, snapshot_type, content_hash, ipfs_cid,
             solana_tx_sig, is_on_chain, created_at
      FROM companion_snapshots
      WHERE user_id = ?
    `;
    const params: any[] = [userId];

    if (companionId) {
      sql += ` AND companion_id = ?`;
      params.push(companionId);
    }

    sql += ` ORDER BY created_at DESC LIMIT 50`;

    const rows = fastify.context.db.prepare(sql).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      companionId: r.companion_id,
      snapshotType: r.snapshot_type,
      contentHash: r.content_hash,
      ipfsCid: r.ipfs_cid,
      solanaTxSig: r.solana_tx_sig,
      isOnChain: r.is_on_chain === 1,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });

  // ── POST /companion-skills/transfer ─────────────────────────────────────
  // Prepare skills for NFT transfer. Skills travel with the NFT.
  // Private memories are stripped — only portable skills + personality move.
  fastify.post<{ Body: TransferBody }>('/companion-skills/transfer', { schema: { body: transferSchema } } as any, async (request, reply: FastifyReply) => {
    const userId = (request.user as { userId: string }).userId;
    const { companionId, nftMintAddress, toUserId, transferTxSig } = request.body;

    if (!companionId || !nftMintAddress) {
      return reply.badRequest('companionId and nftMintAddress are required');
    }

    // Verify ownership
    const ownership = fastify.context.db.prepare(`
      SELECT id FROM nft_ownership
      WHERE companion_id = ? AND user_id = ? AND mint_address = ?
    `).get(companionId, userId, nftMintAddress);

    if (!ownership) {
      return reply.forbidden('You do not own this companion NFT');
    }

    // Create a transfer snapshot first
    const skills = fastify.context.db.prepare(`
      SELECT cs.skill_id, cs.skill_level, cs.xp, cs.usage_count,
             s.name, s.display_name
      FROM companion_skills cs
      JOIN skills s ON s.id = cs.skill_id
      WHERE cs.companion_id = ? AND cs.user_id = ? AND cs.is_portable = 1
      ORDER BY cs.skill_level DESC
    `).all(companionId, userId) as any[];

    const skillsJson = JSON.stringify(
      skills.map((s: any) => ({
        skillId: s.skill_id,
        level: s.skill_level,
        xp: s.xp,
        name: s.name,
      })),
    );

    // Create transfer snapshot
    const payloadStr = JSON.stringify({
      companionId,
      nftMintAddress,
      fromUserId: userId,
      toUserId,
      skills: skills.map((s: any) => ({
        id: s.skill_id,
        name: s.name,
        level: s.skill_level,
        xp: s.xp,
      })),
    });

    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payloadStr),
    );
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const snapshotId = `csn-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO companion_snapshots
        (id, companion_id, user_id, nft_mint_address, snapshot_type,
         content_hash, encrypted_payload, is_on_chain)
      VALUES (?, ?, ?, ?, 'transfer', ?, ?, 0)
    `).run(snapshotId, companionId, userId, nftMintAddress, contentHash, payloadStr);

    // Log the transfer
    const transferId = `xfer-${crypto.randomUUID()}`;
    fastify.context.db.prepare(`
      INSERT INTO nft_transfers
        (id, nft_mint_address, companion_id, from_user_id, to_user_id,
         skills_transferred, snapshot_id, transfer_tx_sig)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transferId,
      nftMintAddress,
      companionId,
      userId,
      toUserId ?? null,
      skillsJson,
      snapshotId,
      transferTxSig ?? null,
    );

    // If toUserId is provided, replicate skills to new owner
    if (toUserId) {
      for (const skill of skills) {
        const newId = `cs-${crypto.randomUUID()}`;
        fastify.context.db.prepare(`
          INSERT OR IGNORE INTO companion_skills
            (id, companion_id, user_id, skill_id, skill_level, xp,
             xp_to_next_level, is_portable, usage_count, accrued_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          newId,
          companionId,
          toUserId,
          skill.skill_id,
          skill.skill_level,
          skill.xp,
          xpForLevel(skill.skill_level + 1),
          skill.usage_count,
          Date.now(),
        );
      }
    }

    return {
      transferId,
      snapshotId,
      contentHash,
      skillsTransferred: skills.length,
      totalLevels: skills.reduce((sum: number, s: any) => sum + s.skill_level, 0),
      message: 'Skills prepared for transfer. Private memories remain with you.',
    };
  });

  // ── GET /companion-skills/transfer-log ──────────────────────────────────
  fastify.get('/companion-skills/transfer-log', async (request) => {
    const userId = (request.user as { userId: string }).userId;

    const rows = fastify.context.db.prepare(`
      SELECT id, nft_mint_address, companion_id, from_user_id, to_user_id,
             skills_transferred, transfer_tx_sig, created_at
      FROM nft_transfers
      WHERE from_user_id = ? OR to_user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId, userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      nftMintAddress: r.nft_mint_address,
      companionId: r.companion_id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      skillsTransferred: JSON.parse(r.skills_transferred || '[]'),
      transferTxSig: r.transfer_tx_sig,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });
};

export default companionSkillsRoutes;
