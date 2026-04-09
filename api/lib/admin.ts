/**
 * Shared Admin Guard — Centralized admin check used across admin, models, and revenue routes.
 *
 * Admin = user.tier === 'hero' OR user.userId listed in ADMIN_USER_IDS env var.
 * The Set is cached at module level — env var is parsed once on first call.
 *
 * @module api/lib/admin
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Cache the parsed admin IDs at module level (parsed once on first access)
let cachedAdminIds: Set<string> | null = null;

export function getAdminUserIds(): Set<string> {
  if (cachedAdminIds) return cachedAdminIds;
  const raw = process.env.ADMIN_USER_IDS ?? '';
  cachedAdminIds = new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean),
  );
  return cachedAdminIds;
}

export function isAdmin(request: FastifyRequest): boolean {
  const user = request.user as { userId: string; tier?: string };
  if (user.tier === 'hero') return true;
  return getAdminUserIds().has(user.userId);
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isAdmin(request)) {
    reply.status(403).send({ error: 'Forbidden: admin access required' });
    return false;
  }
  return true;
}

/**
 * Reset the cached admin IDs — useful for testing when env vars change.
 */
export function _resetAdminCache(): void {
  cachedAdminIds = null;
}
