/**
 * Mission Control Client — Outbound integration for telemetry, heartbeats,
 * prompt pack sync, and agent registration.
 *
 * Opt-in (MC_URL + MC_API_KEY env vars), fire-and-forget (K013), privacy-gated
 * (K012), and circuit-breaker-protected. Never blocks inference.
 *
 * @module inference/mission-control
 */

import { CircuitBreaker } from './circuit-breaker.js';
import { fetchWithTimeout } from './retry.js';
import { computeSoulHash } from './soul-drift.js';
import type { MetricEvent, RequestMetric } from './metrics.js';
import { createHash } from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface MissionControlConfig {
  /** Mission Control base URL (e.g. https://mc.example.com). If unset, client no-ops. */
  mcUrl?: string;
  /** API key for MC authentication. If unset, client no-ops. */
  mcApiKey?: string;
  /** Heartbeat interval in ms (default: 30_000) */
  heartbeatIntervalMs?: number;
  /** Telemetry flush interval in ms (default: 10_000) */
  telemetryFlushIntervalMs?: number;
  /** Telemetry queue flush threshold (default: 50 events) */
  telemetryFlushThreshold?: number;
  /** Privacy mode callback — returns 'private' or 'shared' */
  getPrivacyMode?: () => string;
  /** HTTP request timeout in ms (default: 8_000) */
  requestTimeoutMs?: number;
}

export interface CompanionAgent {
  id: string;
  name: string;
  role: string;
}

interface AgentMapping {
  companionId: string;
  mcAgentId: string;
}

export interface MissionControlStatus {
  connected: boolean;
  enabled: boolean;
  circuitBreakerState: string;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  telemetryQueueDepth: number;
  agentCount: number;
}

// ============================================================================
// Soul config types (inline, matches soul-drift.ts / soul.ts)
// ============================================================================

interface SoulTraits {
  warmth: number;
  formality: number;
  humor: number;
  directness: number;
  creativity: number;
  depth: number;
}

interface SoulStyle {
  vocabulary: 'simple' | 'moderate' | 'advanced';
  responseLength: 'concise' | 'balanced' | 'detailed';
  useEmoji: boolean;
}

interface SoulConfigBody {
  customName?: string;
  traits: SoulTraits;
  values: string[];
  style: SoulStyle;
  customInstructions: string;
  boundaries: string[];
  antiPatterns: string[];
}

// ============================================================================
// configToSoulMd — mirrors api/routes/soul.ts (private there, reimplemented)
// ============================================================================

function configToSoulMd(config: SoulConfigBody, companionName?: string): string {
  const lines: string[] = [];

  lines.push(`# ${config.customName || companionName || 'My Companion'}`);
  lines.push('');

  lines.push('## Core Truths');
  const { traits } = config;
  if (traits.warmth > 70) lines.push('- Be warm, encouraging, and emotionally present.');
  else if (traits.warmth < 30) lines.push('- Be reserved and matter-of-fact.');
  if (traits.humor > 70) lines.push('- Use humor freely — jokes, wordplay, and wit are welcome.');
  else if (traits.humor < 30) lines.push('- Stay serious and focused.');
  if (traits.directness > 70) lines.push('- Be blunt and direct. No hedging.');
  else if (traits.directness < 30) lines.push('- Be diplomatic. Soften feedback.');
  if (traits.formality > 70) lines.push('- Use professional, polished language.');
  else if (traits.formality < 30) lines.push('- Keep it casual and conversational.');
  if (traits.depth > 70) lines.push('- Give thorough, detailed explanations.');
  else if (traits.depth < 30) lines.push('- Keep responses brief.');
  if (traits.creativity > 70) lines.push('- Think outside the box.');
  else if (traits.creativity < 30) lines.push('- Stick to proven approaches.');
  lines.push('');

  if (config.values.length > 0) {
    lines.push('## Values');
    config.values.forEach((v) => lines.push(`- ${v}`));
    lines.push('');
  }

  lines.push('## Vibe');
  lines.push(`- Vocabulary: ${config.style.vocabulary}`);
  lines.push(`- Response length: ${config.style.responseLength}`);
  lines.push(`- Emoji: ${config.style.useEmoji ? 'use sparingly' : 'avoid'}`);
  lines.push('');

  if (config.customInstructions.trim()) {
    lines.push('## Custom Instructions');
    lines.push(config.customInstructions.trim());
    lines.push('');
  }

  if (config.boundaries.length > 0) {
    lines.push('## Boundaries');
    config.boundaries.forEach((b) => lines.push(`- ${b}`));
    lines.push('');
  }

  if (config.antiPatterns.length > 0) {
    lines.push('## Never Do These');
    config.antiPatterns.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// MissionControlClient
// ============================================================================

export class MissionControlClient {
  private readonly mcUrl: string | null;
  private readonly mcApiKey: string | null;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly getPrivacyMode: () => string;
  private readonly requestTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly telemetryFlushIntervalMs: number;
  private readonly telemetryFlushThreshold: number;

  private _connected = false;
  private agents: AgentMapping[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryQueue: MetricEvent[] = [];
  private lastHeartbeatAt: number | null = null;
  private lastError: string | null = null;

  constructor(config: MissionControlConfig = {}) {
    this.mcUrl = config.mcUrl || process.env.MC_URL || null;
    this.mcApiKey = config.mcApiKey || process.env.MC_API_KEY || null;
    this.getPrivacyMode = config.getPrivacyMode ?? (() => 'private');
    this.requestTimeoutMs = config.requestTimeoutMs ?? 8_000;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? 30_000;
    this.telemetryFlushIntervalMs = config.telemetryFlushIntervalMs ?? 10_000;
    this.telemetryFlushThreshold = config.telemetryFlushThreshold ?? 50;

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 1,
      timeout: this.requestTimeoutMs,
      resetTimeout: 60_000,
    });
  }

  // ==========================================================================
  // Enabled check — all public methods gate on this
  // ==========================================================================

  /** Returns true when both MC_URL and MC_API_KEY are configured. */
  private get enabled(): boolean {
    return !!(this.mcUrl && this.mcApiKey);
  }

  // ==========================================================================
  // HTTP helper — circuit-breaker + auth + timeout
  // ==========================================================================

  private async mcFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.mcUrl}${path}`;
    return this.circuitBreaker.execute(() =>
      fetchWithTimeout(
        url,
        {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.mcApiKey}`,
            ...(init?.headers as Record<string, string> | undefined),
          },
        },
        this.requestTimeoutMs,
      ),
    );
  }

  // ==========================================================================
  // connect — register companions as MC agents
  // ==========================================================================

  async connect(companions: CompanionAgent[]): Promise<void> {
    if (!this.enabled) return;

    const registrations: AgentMapping[] = [];

    for (const companion of companions) {
      try {
        const response = await this.mcFetch('/api/agents/register', {
          method: 'POST',
          body: JSON.stringify({
            name: companion.name,
            role: companion.role,
            externalId: companion.id,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { agentId?: string; id?: string };
          registrations.push({
            companionId: companion.id,
            mcAgentId: data.agentId || data.id || companion.id,
          });
        }
      } catch {
        // Fire-and-forget per K013 — individual registration failure
        // doesn't block other companions
      }
    }

    this.agents = registrations;
    this._connected = registrations.length > 0;

    if (this._connected) {
      this.startHeartbeat();
      this.startTelemetryFlush();
    }
  }

  // ==========================================================================
  // disconnect — stop timers, clear state
  // ==========================================================================

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }

    this._connected = false;
    this.agents = [];
    this.telemetryQueue = [];
    this.lastHeartbeatAt = null;
    this.lastError = null;
  }

  // ==========================================================================
  // isConnected
  // ==========================================================================

  isConnected(): boolean {
    return this._connected;
  }

  // ==========================================================================
  // getStatus — structured diagnostics (never exposes API key)
  // ==========================================================================

  getStatus(): MissionControlStatus {
    return {
      connected: this._connected,
      enabled: this.enabled,
      circuitBreakerState: this.circuitBreaker.getState(),
      lastHeartbeatAt: this.lastHeartbeatAt
        ? new Date(this.lastHeartbeatAt).toISOString()
        : null,
      lastError: this.lastError,
      telemetryQueueDepth: this.telemetryQueue.length,
      agentCount: this.agents.length,
    };
  }

  // ==========================================================================
  // Heartbeat — periodic POST per registered agent
  // ==========================================================================

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats().catch(() => {});
    }, this.heartbeatIntervalMs);

    // Send an initial heartbeat immediately
    this.sendHeartbeats().catch(() => {});
  }

  private async sendHeartbeats(): Promise<void> {
    for (const agent of this.agents) {
      try {
        const response = await this.mcFetch(
          `/api/agents/${agent.mcAgentId}/heartbeat`,
          {
            method: 'POST',
            body: JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              queueDepth: this.telemetryQueue.length,
            }),
          },
        );
        if (response.ok) {
          this.lastHeartbeatAt = Date.now();
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        // Fire-and-forget (K013)
      }
    }
  }

  // ==========================================================================
  // Telemetry — batched push of MetricEvent data
  // ==========================================================================

  /**
   * Public callback for MetricsCollector.subscribe().
   * Adds event to internal queue, auto-flushes when threshold is hit.
   */
  onMetricEvent(event: MetricEvent): void {
    if (!this.enabled || !this._connected) return;

    // Privacy gate (K012): skip when mode is 'private'
    if (this.getPrivacyMode() === 'private') return;

    this.telemetryQueue.push(event);

    if (this.telemetryQueue.length >= this.telemetryFlushThreshold) {
      this.flushTelemetry().catch(() => {});
    }
  }

  private startTelemetryFlush(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);

    this.telemetryTimer = setInterval(() => {
      if (this.telemetryQueue.length > 0) {
        this.flushTelemetry().catch(() => {});
      }
    }, this.telemetryFlushIntervalMs);
  }

  private async flushTelemetry(): Promise<void> {
    if (this.telemetryQueue.length === 0) return;

    // Privacy gate (K012): double-check before flush
    if (this.getPrivacyMode() === 'private') {
      this.telemetryQueue = [];
      return;
    }

    // Grab the current batch and clear the queue atomically
    const batch = this.telemetryQueue.splice(0, this.telemetryQueue.length);

    try {
      // Transform MetricEvents into a flat telemetry payload
      const payload = batch.map((event) => {
        if (event.type === 'request_end') {
          const m = event.metric;
          return {
            type: 'inference_metric',
            requestId: m.requestId,
            provider: m.provider,
            model: m.model,
            latencyMs: m.latencyMs,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            success: m.success,
            error: m.error,
            costUsd: m.costUsd,
            route: m.route,
            timestamp: m.timestamp,
          };
        }
        return { type: event.type, timestamp: new Date().toISOString(), ...event };
      });

      await this.mcFetch('/api/telemetry/ingest', {
        method: 'POST',
        body: JSON.stringify({ events: payload }),
      });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      // Fire-and-forget (K013) — data loss is acceptable per project pattern
    }
  }

  // ==========================================================================
  // Prompt Pack Sync — bidirectional soul config sync with MC
  // ==========================================================================

  /**
   * Sync soul configs between local DB and Mission Control.
   * Push local configs that MC doesn't have (or that changed); pull MC configs
   * that are newer. Uses computeSoulHash for change detection.
   *
   * @param db - Database instance (better-sqlite3 compatible)
   */
  async syncPromptPacks(db: any): Promise<void> {
    if (!this.enabled || !this._connected) return;

    // Privacy gate — prompt packs contain personality data
    if (this.getPrivacyMode() === 'private') return;

    try {
      // ── Push local → MC ──────────────────────────────────────────────
      const localSouls = db.prepare(
        `SELECT * FROM companion_souls`,
      ).all() as any[];

      for (const soul of localSouls) {
        const config: SoulConfigBody = {
          customName: soul.custom_name ?? undefined,
          traits: JSON.parse(soul.traits || '{}'),
          values: JSON.parse(soul.soul_values || '[]'),
          style: JSON.parse(soul.style || '{}'),
          customInstructions: soul.custom_instructions ?? '',
          boundaries: JSON.parse(soul.boundaries || '[]'),
          antiPatterns: JSON.parse(soul.anti_patterns || '[]'),
        };

        const localHash = computeSoulHash(config as any);
        const markdown = configToSoulMd(config, soul.companion_id);

        try {
          await this.mcFetch('/api/prompt-packs/sync', {
            method: 'POST',
            body: JSON.stringify({
              companionId: soul.companion_id,
              userId: soul.user_id,
              soulHash: localHash,
              markdown,
              config,
            }),
          });
        } catch {
          // Individual pack push failure — continue with others
        }
      }

      // ── Pull MC → local ──────────────────────────────────────────────
      try {
        const response = await this.mcFetch('/api/prompt-packs/list', {
          method: 'GET',
        });

        if (!response.ok) return;

        const data = (await response.json()) as {
          packs?: Array<{
            companionId: string;
            userId: string;
            soulHash: string;
            config: SoulConfigBody;
          }>;
        };

        if (!data.packs || !Array.isArray(data.packs)) return;

        for (const pack of data.packs) {
          // Check if we already have this exact config locally
          const existing = db.prepare(
            `SELECT soul_hash FROM companion_souls WHERE user_id = ? AND companion_id = ?`,
          ).get(pack.userId, pack.companionId) as { soul_hash: string } | undefined;

          if (existing && existing.soul_hash === pack.soulHash) {
            continue; // Already in sync
          }

          // Upsert from MC
          const now = Date.now();
          const cfg = pack.config;

          if (existing) {
            db.prepare(`
              UPDATE companion_souls SET
                custom_name = ?, traits = ?, soul_values = ?, style = ?,
                custom_instructions = ?, boundaries = ?, anti_patterns = ?,
                soul_hash = ?, updated_at = ?
              WHERE user_id = ? AND companion_id = ?
            `).run(
              cfg.customName ?? null,
              JSON.stringify(cfg.traits),
              JSON.stringify(cfg.values),
              JSON.stringify(cfg.style),
              cfg.customInstructions,
              JSON.stringify(cfg.boundaries),
              JSON.stringify(cfg.antiPatterns),
              pack.soulHash,
              now,
              pack.userId,
              pack.companionId,
            );
          } else {
            const id = `soul-mc-${createHash('sha256').update(`${pack.userId}-${pack.companionId}`).digest('hex').slice(0, 12)}`;
            db.prepare(`
              INSERT INTO companion_souls
                (id, user_id, companion_id, custom_name, traits, soul_values, style,
                 custom_instructions, boundaries, anti_patterns, soul_hash, drift_score, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?)
            `).run(
              id,
              pack.userId,
              pack.companionId,
              cfg.customName ?? null,
              JSON.stringify(cfg.traits),
              JSON.stringify(cfg.values),
              JSON.stringify(cfg.style),
              cfg.customInstructions,
              JSON.stringify(cfg.boundaries),
              JSON.stringify(cfg.antiPatterns),
              pack.soulHash,
              now,
              now,
            );
          }
        }
      } catch {
        // Pull failure — non-critical
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      // Fire-and-forget (K013)
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: MissionControlClient | null = null;

/**
 * Initialize the Mission Control client singleton.
 * Call once during server startup. Safe to call with no config —
 * the client will no-op if MC_URL/MC_API_KEY are unset.
 */
export function initMissionControlClient(
  config: MissionControlConfig = {},
): MissionControlClient {
  if (instance) {
    instance.disconnect();
  }
  instance = new MissionControlClient(config);
  return instance;
}

/**
 * Get the Mission Control client singleton.
 * Returns a disabled client if init hasn't been called yet.
 */
export function getMissionControlClient(): MissionControlClient {
  if (!instance) {
    instance = new MissionControlClient();
  }
  return instance;
}
