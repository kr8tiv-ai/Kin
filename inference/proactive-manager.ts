/**
 * ProactiveManager — Orchestrates proactive companion suggestions.
 *
 * Collects context signals (calendar, conversation gap, time patterns),
 * evaluates triggers via pure functions, generates personalized messages
 * through the companion's voice, and delivers via channel infrastructure.
 *
 * Follows the K030 three-file manager pattern and K034 pure-calculation
 * engine pattern: DB-accepting constructor, testable without Fastify.
 *
 * @module inference/proactive-manager
 */

import crypto from 'crypto';
import type { ChannelDelivery } from './channel-delivery.js';
import type { CalendarManager } from './calendar-manager.js';
import type {
  ContextSignal,
  ProactivePreferences,
  CalendarEvent,
  ProactiveSuggestion,
  SuggestionRequest,
} from './proactive-types.js';
import {
  evaluateAllTriggers,
  type SignalSources,
  type TimePattern,
} from './proactive-triggers.js';
import { buildCompanionPrompt } from './companion-prompts.js';
import { getOllamaClient } from './local-llm.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database handle — matches better-sqlite3's Database interface. */
export interface ProactiveDb {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

/** Row shape from user_preferences with proactive columns. */
interface PrefsRow {
  proactive_enabled: number;
  proactive_quiet_start: number | null;
  proactive_quiet_end: number | null;
  proactive_max_daily: number;
  proactive_channels: string;
}

/** Callback to execute a skill (K031 pattern). */
export type SkillExecutor = (
  skillName: string,
  context: { message: string; userId: string; userName: string },
) => Promise<{ content: string }>;

// ---------------------------------------------------------------------------
// ProactiveManager
// ---------------------------------------------------------------------------

export class ProactiveManager {
  private db: ProactiveDb;
  private channelDelivery: ChannelDelivery;
  private calendarManager: CalendarManager | null;

  constructor(
    db: ProactiveDb,
    channelDelivery: ChannelDelivery,
    calendarManager?: CalendarManager,
  ) {
    this.db = db;
    this.channelDelivery = channelDelivery;
    this.calendarManager = calendarManager ?? null;
  }

  // -----------------------------------------------------------------------
  // Preferences
  // -----------------------------------------------------------------------

  /**
   * Load proactive preferences for a user. Returns defaults if the
   * proactive columns don't exist yet (safe migration not applied).
   */
  getPreferences(userId: string): ProactivePreferences {
    try {
      const row = this.db.prepare(
        `SELECT proactive_enabled, proactive_quiet_start, proactive_quiet_end,
                proactive_max_daily, proactive_channels
         FROM user_preferences WHERE user_id = ?`,
      ).get(userId) as PrefsRow | undefined;

      if (!row) {
        return {
          proactiveEnabled: false,
          quietStart: null,
          quietEnd: null,
          maxDaily: 5,
          channels: [],
        };
      }

      let channels: string[] = [];
      try {
        channels = JSON.parse(row.proactive_channels ?? '[]');
      } catch {
        channels = [];
      }

      return {
        proactiveEnabled: !!row.proactive_enabled,
        quietStart: row.proactive_quiet_start,
        quietEnd: row.proactive_quiet_end,
        maxDaily: row.proactive_max_daily ?? 5,
        channels,
      };
    } catch {
      // Column doesn't exist yet (migration not applied) — return defaults
      return {
        proactiveEnabled: false,
        quietStart: null,
        quietEnd: null,
        maxDaily: 5,
        channels: [],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Signal Collection
  // -----------------------------------------------------------------------

  /**
   * Gather context signals from all available sources for a user+companion.
   */
  async collectSignals(
    userId: string,
    companionId: string,
  ): Promise<SignalSources> {
    // Calendar events (if calendar manager available)
    let calendar: CalendarEvent[] = [];
    if (this.calendarManager) {
      calendar = await this.calendarManager.listUpcomingEvents(userId, 2);
    }

    // Last message timestamp from conversations
    const lastMsg = this.db.prepare(
      `SELECT MAX(m.timestamp) as last_ts
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_id = ? AND c.companion_id = ? AND m.role = 'user'`,
    ).get(userId, companionId) as { last_ts: number | null } | undefined;

    const lastMessageAt = lastMsg?.last_ts ?? null;

    // Time patterns — build from message history (simplified)
    const patterns = this.buildTimePatterns(userId, companionId);

    return { calendar, lastMessageAt, patterns };
  }

  /**
   * Build time patterns from message history for the current hour.
   * Uses the same hour-bucketing logic as PredictionEngine but reads from DB.
   */
  private buildTimePatterns(userId: string, companionId: string): TimePattern[] {
    // Query messages grouped by hour to detect patterns
    const rows = this.db.prepare(
      `SELECT
         CAST((m.timestamp / 3600000) % 24 AS INTEGER) as hour,
         COUNT(*) as msg_count,
         GROUP_CONCAT(SUBSTR(m.content, 1, 50), '|') as samples
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.user_id = ? AND c.companion_id = ? AND m.role = 'user'
         AND m.timestamp > ?
       GROUP BY hour
       HAVING msg_count >= 3`,
    ).all(
      userId,
      companionId,
      Date.now() - 14 * 24 * 3600 * 1000, // last 14 days
    ) as Array<{ hour: number; msg_count: number; samples: string }>;

    return rows.map(row => ({
      hour: row.hour,
      messages: (row.samples ?? '').split('|').filter(Boolean),
      confidence: Math.min(0.9, 0.3 + row.msg_count * 0.05),
    }));
  }

  // -----------------------------------------------------------------------
  // Core Flow: Evaluate → Generate → Deliver
  // -----------------------------------------------------------------------

  /**
   * Evaluate triggers and produce a suggestion for a user+companion pair.
   * Returns the created suggestion, or null if no trigger fires.
   */
  async evaluateAndSuggest(
    userId: string,
    companionId: string,
  ): Promise<ProactiveSuggestion | null> {
    const prefs = this.getPreferences(userId);
    if (!prefs.proactiveEnabled) return null;

    const now = new Date();
    const signals = await this.collectSignals(userId, companionId);

    // Count today's delivered suggestions
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const countRow = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM proactive_suggestions
       WHERE user_id = ? AND companion_id = ? AND status = 'delivered'
         AND delivered_at >= ?`,
    ).get(userId, companionId, startOfDay) as { cnt: number };
    const deliveredToday = countRow?.cnt ?? 0;

    // Evaluate triggers (pure function)
    const trigger = evaluateAllTriggers(signals, now, prefs, deliveredToday);
    if (!trigger) return null;

    // Persist context signal
    const signalId = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO context_signals (id, user_id, companion_id, signal_type, payload, confidence, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      signalId,
      userId,
      companionId,
      trigger.signalType,
      JSON.stringify({ reason: trigger.reason }),
      trigger.confidence,
      Date.now(),
      Date.now() + 3600 * 1000, // expires in 1 hour
    );

    // Generate suggestion content via local LLM
    const companionRow = this.db.prepare(
      'SELECT name FROM companions WHERE id = ?',
    ).get(companionId) as { name: string } | undefined;
    const companionName = companionRow?.name ?? companionId;

    const content = await this.generateSuggestionContent(
      trigger,
      companionId,
      companionName,
      userId,
    );

    // Pick delivery channel — first available opted-in channel
    const deliveryChannel = prefs.channels[0] ?? 'api';

    // Look up delivery recipient for the user+channel
    const recipientId = this.resolveRecipientId(userId, deliveryChannel);

    // Persist suggestion
    const suggestionId = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO proactive_suggestions
        (id, user_id, companion_id, signal_id, content, delivery_channel, delivery_recipient_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      suggestionId, userId, companionId, signalId, content,
      deliveryChannel, recipientId, Date.now(),
    );

    // Deliver — fire-and-forget (K013 pattern)
    this.channelDelivery.send(deliveryChannel, recipientId, content).then(() => {
      // Mark as delivered
      const now = Date.now();
      this.db.prepare(
        `UPDATE proactive_suggestions SET status = 'delivered', delivered_at = ? WHERE id = ?`,
      ).run(now, suggestionId);
      this.db.prepare(
        `UPDATE context_signals SET status = 'delivered', delivered_at = ? WHERE id = ?`,
      ).run(now, signalId);
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[proactive] Delivery failed for suggestion ${suggestionId}: ${msg}`);
    });

    return {
      id: suggestionId,
      userId,
      companionId,
      signalId,
      content,
      deliveryChannel,
      deliveryRecipientId: recipientId,
      status: 'pending',
      userFeedback: null,
      createdAt: Date.now(),
      deliveredAt: null,
    };
  }

  /**
   * Scan all opted-in users and evaluate triggers for their active companions.
   * Called periodically by a scheduler (e.g., every 15 minutes).
   */
  async runScan(): Promise<number> {
    const users = this.db.prepare(
      `SELECT DISTINCT up.user_id, uc.companion_id
       FROM user_preferences up
       JOIN user_companions uc ON up.user_id = uc.user_id AND uc.is_active = TRUE
       WHERE up.proactive_enabled = TRUE`,
    ).all() as Array<{ user_id: string; companion_id: string }>;

    let triggered = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(({ user_id, companion_id }) =>
          this.evaluateAndSuggest(user_id, companion_id),
        ),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        if (result.status === 'fulfilled' && result.value) {
          triggered++;
        } else if (result.status === 'rejected') {
          const { user_id, companion_id } = batch[j]!;
          const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error(`[proactive] Scan error for user=${user_id} companion=${companion_id}: ${msg}`);
        }
      }
    }

    if (triggered > 0) {
      console.log(`[proactive] Scan complete: ${triggered} suggestion(s) triggered for ${users.length} user-companion pair(s)`);
    }
    return triggered;
  }

  // -----------------------------------------------------------------------
  // Message Generation
  // -----------------------------------------------------------------------

  /**
   * Generate a personalized suggestion message using the local LLM
   * with the companion's voice/persona.
   */
  async generateSuggestionContent(
    trigger: { signalType: string; reason: string; confidence: number },
    companionId: string,
    companionName: string,
    userId: string,
  ): Promise<string> {
    const systemPrompt = buildCompanionPrompt(companionId, {
      userName: userId,
      timeContext: new Date().toLocaleString(),
    }, { short: true });

    const userPrompt =
      `You are proactively reaching out to the user. ` +
      `Context signal: ${trigger.signalType} — ${trigger.reason}. ` +
      `Write a brief, helpful, in-character message (1-2 sentences) that ` +
      `acknowledges the signal and offers to help. Be natural, not robotic. ` +
      `Do not explain that you are an AI or that this is a proactive message.`;

    try {
      const ollama = getOllamaClient();
      const response = await ollama.chat({
        model: process.env.OLLAMA_MODEL ?? 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      return response.message?.content ?? this.fallbackContent(trigger, companionName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[proactive] LLM generation failed: ${msg}`);
      return this.fallbackContent(trigger, companionName);
    }
  }

  /**
   * Static fallback content when LLM is unavailable.
   */
  private fallbackContent(
    trigger: { signalType: string; reason: string },
    companionName: string,
  ): string {
    switch (trigger.signalType) {
      case 'calendar_event':
        return `Hey! ${companionName} here — looks like you have something coming up. ${trigger.reason}. Want me to help you prepare?`;
      case 'conversation_gap':
        return `Hey! ${companionName} checking in — it's been a while. Anything I can help with?`;
      case 'time_pattern':
        return `Good timing! ${companionName} noticed this is usually when we chat. What's on your mind?`;
      default:
        return `${companionName} here — just checking in. Need anything?`;
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the delivery recipient ID for a user on a given channel.
   * Checks the user's platform IDs (telegram_id, etc.) and dm_allowlist.
   */
  private resolveRecipientId(userId: string, channel: string): string {
    if (channel === 'api') return userId;

    // Check platform-specific user ID
    const columnMap: Record<string, string> = {
      telegram: 'telegram_id',
      whatsapp: 'id', // WhatsApp uses user ID as recipient
      discord: 'id',
    };
    const col = columnMap[channel] ?? 'id';

    const user = this.db.prepare(
      `SELECT ${col} as recipient FROM users WHERE id = ?`,
    ).get(userId) as { recipient: string | null } | undefined;

    return user?.recipient?.toString() ?? userId;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ProactiveManager | null = null;

/** Get or create the singleton ProactiveManager. */
export function getProactiveManager(
  db: ProactiveDb,
  channelDelivery: ChannelDelivery,
  calendarManager?: CalendarManager,
): ProactiveManager {
  if (!instance) {
    instance = new ProactiveManager(db, channelDelivery, calendarManager);
  }
  return instance;
}

/** Reset the singleton (for tests). */
export function resetProactiveManager(): void {
  instance = null;
}
