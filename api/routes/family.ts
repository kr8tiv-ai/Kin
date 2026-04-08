/**
 * Family Routes — family groups, membership, and invite codes
 *
 * POST /family/create     — create a family group (caller becomes parent)
 * POST /family/invite     — generate an invite code (parent-only)
 * POST /family/join       — accept an invite by code
 * GET  /family            — list family members with roles and activity
 * DELETE /family/members/:memberId — remove a member (parent-only)
 */

import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface CreateBody {
  name: string;
}

interface InviteBody {
  familyGroupId: string;
}

interface JoinBody {
  code: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Generate a 6-character alphanumeric invite code. */
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
}

/** Check if the user is a parent in the given family group. */
function isParent(db: any, familyGroupId: string, userId: string): boolean {
  const row = db.prepare(
    `SELECT role FROM family_members WHERE family_group_id = ? AND user_id = ?`,
  ).get(familyGroupId, userId) as { role: string } | undefined;
  return row?.role === 'parent';
}

/** Get the user's family group (first one they belong to). */
function getUserFamilyMembership(db: any, userId: string): { familyGroupId: string; role: string } | undefined {
  return db.prepare(
    `SELECT family_group_id AS familyGroupId, role FROM family_members WHERE user_id = ?`,
  ).get(userId) as { familyGroupId: string; role: string } | undefined;
}

// ============================================================================
// Plugin
// ============================================================================

const familyRoutes: FastifyPluginAsync = async (fastify) => {

  // --------------------------------------------------------------------------
  // POST /family/create — create a new family group
  // --------------------------------------------------------------------------
  fastify.post<{ Body: CreateBody }>('/family/create', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const name = request.body?.name?.trim();

    if (!name || name.length === 0) {
      reply.status(400);
      return { error: 'Family name is required' };
    }

    if (name.length > 100) {
      reply.status(400);
      return { error: 'Family name must be 100 characters or less' };
    }

    // Check if user is already in a family group
    const existing = getUserFamilyMembership(fastify.context.db, userId);
    if (existing) {
      reply.status(409);
      return { error: 'You are already a member of a family group' };
    }

    const groupId = `fam-${crypto.randomUUID()}`;
    const memberId = `fm-${crypto.randomUUID()}`;
    const now = Date.now();

    fastify.context.db.prepare(
      `INSERT INTO family_groups (id, name, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(groupId, name, userId, now, now);

    fastify.context.db.prepare(
      `INSERT INTO family_members (id, family_group_id, user_id, role, joined_at)
       VALUES (?, ?, ?, 'parent', ?)`,
    ).run(memberId, groupId, userId, now);

    return {
      familyGroupId: groupId,
      name,
      role: 'parent',
      createdAt: now,
    };
  });

  // --------------------------------------------------------------------------
  // POST /family/invite — generate an invite code (parent-only)
  // --------------------------------------------------------------------------
  fastify.post<{ Body: InviteBody }>('/family/invite', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const familyGroupId = request.body?.familyGroupId?.trim();

    if (!familyGroupId) {
      reply.status(400);
      return { error: 'familyGroupId is required' };
    }

    // Verify parent role
    if (!isParent(fastify.context.db, familyGroupId, userId)) {
      reply.status(403);
      return { error: 'Only parents can generate invite codes' };
    }

    const codeId = `finv-${crypto.randomUUID()}`;
    const code = generateInviteCode();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    fastify.context.db.prepare(
      `INSERT INTO family_invite_codes (id, family_group_id, code, created_by, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    ).run(codeId, familyGroupId, code, userId, now, expiresAt);

    return {
      code,
      expiresAt,
    };
  });

  // --------------------------------------------------------------------------
  // POST /family/join — accept an invite code
  // --------------------------------------------------------------------------
  fastify.post<{ Body: JoinBody }>('/family/join', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const code = request.body?.code?.trim()?.toUpperCase();

    if (!code) {
      reply.status(400);
      return { error: 'Invite code is required' };
    }

    // Check if user is already in a family group
    const existing = getUserFamilyMembership(fastify.context.db, userId);
    if (existing) {
      reply.status(409);
      return { error: 'You are already a member of a family group' };
    }

    // Look up the invite code
    const invite = fastify.context.db.prepare(
      `SELECT id, family_group_id, status, expires_at FROM family_invite_codes WHERE code = ?`,
    ).get(code) as { id: string; family_group_id: string; status: string; expires_at: number } | undefined;

    if (!invite) {
      reply.status(404);
      return { error: 'Invalid invite code' };
    }

    if (invite.status !== 'active') {
      reply.status(410);
      return { error: 'Invite code has already been used or expired' };
    }

    if (Date.now() > invite.expires_at) {
      // Mark as expired
      fastify.context.db.prepare(
        `UPDATE family_invite_codes SET status = 'expired' WHERE id = ?`,
      ).run(invite.id);
      reply.status(410);
      return { error: 'Invite code has expired' };
    }

    // Join the family group as a member (not parent)
    const memberId = `fm-${crypto.randomUUID()}`;
    const now = Date.now();

    fastify.context.db.prepare(
      `INSERT INTO family_members (id, family_group_id, user_id, role, joined_at)
       VALUES (?, ?, ?, 'member', ?)`,
    ).run(memberId, invite.family_group_id, userId, now);

    // Mark invite code as used
    fastify.context.db.prepare(
      `UPDATE family_invite_codes SET status = 'used' WHERE id = ?`,
    ).run(invite.id);

    // Look up group name
    const group = fastify.context.db.prepare(
      `SELECT name FROM family_groups WHERE id = ?`,
    ).get(invite.family_group_id) as { name: string };

    return {
      familyGroupId: invite.family_group_id,
      familyName: group.name,
      role: 'member',
      joinedAt: now,
    };
  });

  // --------------------------------------------------------------------------
  // GET /family — list family members with roles and activity summary
  // --------------------------------------------------------------------------
  fastify.get('/family', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;

    const membership = getUserFamilyMembership(fastify.context.db, userId);
    if (!membership) {
      reply.status(404);
      return { error: 'You are not a member of any family group' };
    }

    const group = fastify.context.db.prepare(
      `SELECT id, name, created_by, created_at FROM family_groups WHERE id = ?`,
    ).get(membership.familyGroupId) as { id: string; name: string; created_by: string; created_at: number };

    const members = fastify.context.db.prepare(`
      SELECT fm.id, fm.user_id, fm.role, fm.joined_at, u.first_name, u.last_name
      FROM family_members fm
      JOIN users u ON u.id = fm.user_id
      WHERE fm.family_group_id = ?
      ORDER BY fm.joined_at ASC
    `).all(membership.familyGroupId) as Array<{
      id: string; user_id: string; role: string; joined_at: number;
      first_name: string; last_name: string | null;
    }>;

    // Get activity summary per member: message count and last active
    const memberList = members.map((m) => {
      const activity = fastify.context.db.prepare(`
        SELECT COUNT(*) as messageCount, MAX(timestamp) as lastActive
        FROM messages
        WHERE conversation_id IN (
          SELECT id FROM conversations WHERE user_id = ?
        )
      `).get(m.user_id) as { messageCount: number; lastActive: number | null };

      return {
        memberId: m.id,
        userId: m.user_id,
        firstName: m.first_name,
        lastName: m.last_name,
        role: m.role,
        joinedAt: m.joined_at,
        messageCount: activity.messageCount ?? 0,
        lastActive: activity.lastActive ?? null,
      };
    });

    return {
      familyGroupId: group.id,
      familyName: group.name,
      createdBy: group.created_by,
      createdAt: group.created_at,
      myRole: membership.role,
      members: memberList,
    };
  });

  // --------------------------------------------------------------------------
  // DELETE /family/members/:memberId — remove a member (parent-only)
  // --------------------------------------------------------------------------
  fastify.delete<{ Params: { memberId: string } }>('/family/members/:memberId', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { memberId } = request.params;

    if (!memberId) {
      reply.status(400);
      return { error: 'memberId is required' };
    }

    // Look up the target member
    const target = fastify.context.db.prepare(
      `SELECT id, family_group_id, user_id, role FROM family_members WHERE id = ?`,
    ).get(memberId) as { id: string; family_group_id: string; user_id: string; role: string } | undefined;

    if (!target) {
      reply.status(404);
      return { error: 'Member not found' };
    }

    // Verify the caller is a parent in the same family group
    if (!isParent(fastify.context.db, target.family_group_id, userId)) {
      reply.status(403);
      return { error: 'Only parents can remove family members' };
    }

    // Don't allow removing yourself (parent) — they'd need to delete the group
    if (target.user_id === userId) {
      reply.status(400);
      return { error: 'Cannot remove yourself from the family group' };
    }

    fastify.context.db.prepare(
      `DELETE FROM family_members WHERE id = ?`,
    ).run(memberId);

    return { removed: true, memberId };
  });
};

export default familyRoutes;
