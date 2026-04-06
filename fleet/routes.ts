/**
 * Fleet Control Plane — API Routes
 *
 * Fastify plugin providing fleet lifecycle endpoints backed by FleetDb and
 * ContainerManager. All responses use camelCase keys (K005).
 *
 * Endpoints:
 *   POST   /fleet/provision          — Provision new KIN instance
 *   GET    /fleet/status             — Fleet overview with instance list
 *   GET    /fleet/instances/:id      — Single instance detail
 *   POST   /fleet/instances/:id/start  — Start a stopped instance
 *   POST   /fleet/instances/:id/stop   — Stop a running instance
 *   DELETE /fleet/instances/:id      — Remove instance (containers + DB row)
 *   POST   /fleet/instances/:id/health — Trigger health check
 */

import { FastifyPluginAsync } from 'fastify';
import { FleetDb } from './db.js';
import { ContainerManager } from './container-manager.js';
import { TunnelManager } from './tunnel-manager.js';
import { MAX_INSTANCES } from './types.js';
import type { FleetInstance } from './types.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Subdomain: starts with lowercase letter, followed by 2-31 lowercase alphanum/hyphens */
const SUBDOMAIN_RE = /^[a-z][a-z0-9-]{2,31}$/;

function isValidSubdomain(value: unknown): value is string {
  return typeof value === 'string' && SUBDOMAIN_RE.test(value);
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface FleetRouteOptions {
  fleetDb: FleetDb;
  containerManager: ContainerManager;
  tunnelManager?: TunnelManager;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const fleetRoutesPlugin: FastifyPluginAsync<FleetRouteOptions> = async (
  fastify,
  opts,
) => {
  const { fleetDb, containerManager, tunnelManager } = opts;

  // =========================================================================
  // POST /fleet/provision
  // =========================================================================

  fastify.post<{
    Body: {
      userId?: string;
      subdomain?: string;
      cpuShares?: number;
      memoryMb?: number;
    };
  }>('/fleet/provision', async (request, reply) => {
    const { userId, subdomain, cpuShares, memoryMb } = request.body ?? {};

    // --- Validate required fields ------------------------------------------
    if (!userId || typeof userId !== 'string') {
      reply.status(400);
      return { error: 'userId is required' };
    }

    if (!isValidSubdomain(subdomain)) {
      reply.status(400);
      return {
        error:
          'Invalid subdomain. Must start with a letter, contain only lowercase letters, digits, or hyphens, and be 3-32 characters.',
      };
    }

    // --- Duplicate check ---------------------------------------------------
    const existingBySubdomain = fleetDb.getInstanceBySubdomain(subdomain);
    if (existingBySubdomain) {
      reply.status(409);
      return { error: `Subdomain "${subdomain}" is already in use` };
    }

    const existingByUser = fleetDb.getInstanceByUserId(userId);
    if (existingByUser) {
      reply.status(409);
      return { error: 'User already has a fleet instance' };
    }

    // --- Capacity check ----------------------------------------------------
    const stats = fleetDb.getFleetStats();
    if (stats.total >= MAX_INSTANCES) {
      reply.status(503);
      return { error: 'Fleet capacity reached. Try again later.' };
    }

    // --- Provision ---------------------------------------------------------
    const instance = await containerManager.provision(userId, subdomain, {
      cpuShares,
      memoryMb,
    });

    reply.status(201);
    return instance;
  });

  // =========================================================================
  // GET /fleet/status
  // =========================================================================

  fastify.get('/fleet/status', async () => {
    const stats = fleetDb.getFleetStats();
    const instances = fleetDb.listInstances();

    // Enrich each instance with resource usage (best-effort)
    const enriched: Array<FleetInstance & { resourceUsage?: unknown }> = [];
    for (const inst of instances) {
      let resourceUsage: unknown = null;
      if (inst.status === 'running') {
        try {
          resourceUsage = await containerManager.getResourceUsage(inst.id);
        } catch {
          // non-critical — Docker may be unreachable
        }
      }
      enriched.push({ ...inst, resourceUsage });
    }

    return {
      totalInstances: stats.total,
      running: stats.running,
      stopped: stats.stopped,
      error: stats.error,
      provisioning: stats.provisioning,
      removing: stats.removing,
      instances: enriched,
      lastUpdated: Date.now(),
    };
  });

  // =========================================================================
  // GET /fleet/instances/:id
  // =========================================================================

  fastify.get<{ Params: { id: string } }>(
    '/fleet/instances/:id',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      // Try to add resource usage for running instances
      let resourceUsage: unknown = null;
      if (instance.status === 'running') {
        try {
          resourceUsage = await containerManager.getResourceUsage(instance.id);
        } catch {
          // non-critical
        }
      }

      return { ...instance, resourceUsage };
    },
  );

  // =========================================================================
  // POST /fleet/instances/:id/start
  // =========================================================================

  fastify.post<{ Params: { id: string } }>(
    '/fleet/instances/:id/start',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      if (instance.status === 'running') {
        return instance; // idempotent
      }

      const updated = await containerManager.startInstance(instance.id);
      return updated;
    },
  );

  // =========================================================================
  // POST /fleet/instances/:id/stop
  // =========================================================================

  fastify.post<{ Params: { id: string } }>(
    '/fleet/instances/:id/stop',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      if (instance.status === 'stopped') {
        return instance; // idempotent
      }

      const updated = await containerManager.stopInstance(instance.id);
      return updated;
    },
  );

  // =========================================================================
  // DELETE /fleet/instances/:id
  // =========================================================================

  fastify.delete<{ Params: { id: string } }>(
    '/fleet/instances/:id',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      await containerManager.removeInstance(instance.id);
      return { success: true };
    },
  );

  // =========================================================================
  // POST /fleet/instances/:id/health
  // =========================================================================

  fastify.post<{ Params: { id: string } }>(
    '/fleet/instances/:id/health',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      const updated = await containerManager.checkHealth(instance.id);
      return updated;
    },
  );

  // =========================================================================
  // GET /fleet/instances/:id/tunnel — Tunnel status (never exposes tunnelToken)
  // =========================================================================

  fastify.get<{ Params: { id: string } }>(
    '/fleet/instances/:id/tunnel',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      return {
        tunnelId: instance.tunnelId,
        tunnelStatus: instance.tunnelStatus,
        tunnelEndpoint: instance.tunnelId
          ? `https://ollama.${instance.subdomain}.kin.kr8tiv.ai`
          : null,
      };
    },
  );

  // =========================================================================
  // POST /fleet/instances/:id/tunnel/refresh — Re-check via Cloudflare API
  // =========================================================================

  fastify.post<{ Params: { id: string } }>(
    '/fleet/instances/:id/tunnel/refresh',
    async (request, reply) => {
      const instance = fleetDb.getInstance(request.params.id);
      if (!instance) {
        reply.status(404);
        return { error: 'Instance not found' };
      }

      if (!instance.tunnelId) {
        reply.status(400);
        return { error: 'No tunnel configured for this instance' };
      }

      if (!tunnelManager) {
        reply.status(503);
        return { error: 'Tunnel management not available (Cloudflare credentials not configured)' };
      }

      try {
        const cfStatus = await tunnelManager.getTunnelStatus(instance.tunnelId);

        // Map Cloudflare status to our tunnel_status enum
        let mappedStatus: 'connected' | 'disconnected' | 'provisioned' = 'provisioned';
        if (cfStatus.status === 'healthy' && cfStatus.connections.length > 0) {
          mappedStatus = 'connected';
        } else if (cfStatus.status === 'inactive' || cfStatus.connections.length === 0) {
          mappedStatus = 'disconnected';
        }

        const updated = fleetDb.updateTunnelStatus(instance.id, mappedStatus);

        return {
          tunnelId: updated!.tunnelId,
          tunnelStatus: updated!.tunnelStatus,
          cloudflareStatus: cfStatus.status,
          connections: cfStatus.connections.length,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reply.status(502);
        return { error: `Failed to refresh tunnel status: ${msg}` };
      }
    },
  );
};

export default fleetRoutesPlugin;
