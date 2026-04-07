/**
 * Mission Control Routes — Status, connect, disconnect endpoints
 *
 * Provides the REST surface for managing the Mission Control integration.
 * All routes are JWT-protected (registered inside the protected scope).
 * Responses use camelCase keys (K005).
 *
 * @module api/routes/mission-control
 */

import { FastifyPluginAsync } from 'fastify';
import {
  initMissionControlClient,
  getMissionControlClient,
  type CompanionAgent,
} from '../../inference/mission-control.js';
import { getMetricsCollector } from '../../inference/metrics.js';

// ============================================================================
// Request body types
// ============================================================================

interface ConnectBody {
  mcUrl: string;
  mcApiKey: string;
}

// ============================================================================
// Route plugin
// ============================================================================

const missionControlRoutes: FastifyPluginAsync = async (fastify) => {
  // --------------------------------------------------------------------------
  // GET /mission-control/status
  // --------------------------------------------------------------------------
  fastify.get('/mission-control/status', async () => {
    const client = getMissionControlClient();
    const status = client.getStatus();

    // Status already omits mcApiKey by design (T01 getStatus contract).
    // Return directly — all keys are already camelCase.
    return status;
  });

  // --------------------------------------------------------------------------
  // POST /mission-control/connect
  // --------------------------------------------------------------------------
  fastify.post<{ Body: ConnectBody }>('/mission-control/connect', async (request, reply) => {
    const body = request.body ?? ({} as ConnectBody);

    // Validate required fields
    if (!body.mcUrl || typeof body.mcUrl !== 'string') {
      reply.status(400);
      return { error: 'mcUrl is required and must be a string' };
    }
    if (!body.mcApiKey || typeof body.mcApiKey !== 'string') {
      reply.status(400);
      return { error: 'mcApiKey is required and must be a string' };
    }

    // Normalize URL — strip trailing slash
    const mcUrl = body.mcUrl.replace(/\/+$/, '');

    // Load privacy mode from user preferences
    const userId = (request.user as { userId: string }).userId;
    const getPrivacyMode = (): string => {
      try {
        const row = fastify.context.db.prepare(
          `SELECT privacy_mode FROM user_preferences WHERE user_id = ?`,
        ).get(userId) as { privacy_mode?: string } | undefined;
        return row?.privacy_mode ?? 'private';
      } catch {
        return 'private'; // Fail-closed
      }
    };

    // Initialize (or re-initialize) the MC client with provided credentials
    const client = initMissionControlClient({
      mcUrl,
      mcApiKey: body.mcApiKey,
      getPrivacyMode,
    });

    // Wire MetricsCollector subscription so telemetry flows to MC
    const metrics = getMetricsCollector();
    metrics.subscribe(client.onMetricEvent.bind(client));

    // Load companions from DB for agent registration
    const companions = loadCompanions(fastify.context.db);

    // Connect — registers companions as MC agents, starts heartbeats & telemetry
    await client.connect(companions);

    // Persist MC config to user_preferences for auto-reconnect on restart
    persistMcConfig(fastify.context.db, userId, mcUrl, body.mcApiKey);

    return client.getStatus();
  });

  // --------------------------------------------------------------------------
  // POST /mission-control/disconnect
  // --------------------------------------------------------------------------
  fastify.post('/mission-control/disconnect', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const client = getMissionControlClient();

    // Disconnect is idempotent — safe to call when not connected
    client.disconnect();

    // Clear persisted config
    clearMcConfig(fastify.context.db, userId);

    return client.getStatus();
  });
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load all companions from DB and map to CompanionAgent shape.
 */
function loadCompanions(db: any): CompanionAgent[] {
  try {
    const rows = db.prepare(
      `SELECT id, name, specialization FROM companions`,
    ).all() as Array<{ id: string; name: string; specialization: string }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.specialization,
    }));
  } catch {
    return [];
  }
}

/**
 * Persist MC connection config to user_preferences for auto-reconnect.
 * Uses safe column additions — the column may not exist in older DBs.
 */
function persistMcConfig(db: any, userId: string, mcUrl: string, mcApiKey: string): void {
  try {
    // Ensure columns exist (safe migration pattern from server.ts)
    try { db.exec(`ALTER TABLE user_preferences ADD COLUMN mc_url TEXT`); } catch { /* already exists */ }
    try { db.exec(`ALTER TABLE user_preferences ADD COLUMN mc_api_key TEXT`); } catch { /* already exists */ }

    db.prepare(
      `UPDATE user_preferences SET mc_url = ?, mc_api_key = ?, updated_at = ? WHERE user_id = ?`,
    ).run(mcUrl, mcApiKey, Date.now(), userId);
  } catch {
    // Non-critical — connect still works, just won't auto-reconnect on restart
  }
}

/**
 * Clear persisted MC config.
 */
function clearMcConfig(db: any, userId: string): void {
  try {
    db.prepare(
      `UPDATE user_preferences SET mc_url = NULL, mc_api_key = NULL, updated_at = ? WHERE user_id = ?`,
    ).run(Date.now(), userId);
  } catch {
    // Non-critical
  }
}

export default missionControlRoutes;
