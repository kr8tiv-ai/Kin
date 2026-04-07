/**
 * Approval Routes — User confirmation gate for external mutations.
 *
 * JWT-protected endpoints for listing, viewing, approving, and rejecting
 * exec approvals. Follows pipeline-routes.ts patterns for type safety,
 * ownership enforcement, and camelCase responses.
 *
 * @module api/routes/approvals
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ApprovalManager } from '../../inference/approval-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRouteOpts {
  approvalManager: ApprovalManager;
}

interface ApprovalIdParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Protected routes (require JWT)
// ---------------------------------------------------------------------------

const approvalRoutes: FastifyPluginAsync<ApprovalRouteOpts> = async (fastify, opts) => {
  const { approvalManager } = opts;

  // GET /approvals — list pending approvals for the authenticated user
  fastify.get('/approvals', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const approvals = approvalManager.listPending(userId);
    return { approvals };
  });

  // GET /approvals/:id — get a single approval
  fastify.get<{ Params: ApprovalIdParams }>('/approvals/:id', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    const approval = approvalManager.getApproval(id);
    if (!approval) {
      reply.status(404);
      return { error: 'Approval not found' };
    }

    // Ownership enforcement
    if (approval.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this approval' };
    }

    return { approval };
  });

  // POST /approvals/:id/approve — approve a pending approval
  fastify.post<{ Params: ApprovalIdParams }>('/approvals/:id/approve', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    // Check existence and ownership before resolving
    const approval = approvalManager.getApproval(id);
    if (!approval) {
      reply.status(404);
      return { error: 'Approval not found' };
    }
    if (approval.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this approval' };
    }

    const resolved = await approvalManager.resolveApproval(id, 'approved', 'user');
    if (!resolved) {
      reply.status(409);
      return { error: 'Approval already resolved or expired' };
    }

    // Re-fetch to get updated fields
    const updated = approvalManager.getApproval(id);
    return { success: true, approval: updated };
  });

  // POST /approvals/:id/reject — reject a pending approval
  fastify.post<{ Params: ApprovalIdParams }>('/approvals/:id/reject', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const { id } = request.params;

    // Check existence and ownership before resolving
    const approval = approvalManager.getApproval(id);
    if (!approval) {
      reply.status(404);
      return { error: 'Approval not found' };
    }
    if (approval.userId !== userId) {
      reply.status(403);
      return { error: 'Forbidden: you do not own this approval' };
    }

    const resolved = await approvalManager.resolveApproval(id, 'rejected', 'user');
    if (!resolved) {
      reply.status(409);
      return { error: 'Approval already resolved or expired' };
    }

    // Re-fetch to get updated fields
    const updated = approvalManager.getApproval(id);
    return { success: true, approval: updated };
  });
};

export default approvalRoutes;
