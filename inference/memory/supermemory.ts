/**
 * Supermemory.ai Integration — Intelligent memory layer for KIN companions
 *
 * Replaces raw string memories with AI-powered context:
 * - Fact extraction and knowledge graphs
 * - Temporal reasoning and contradiction handling
 * - Per-user, per-companion memory isolation
 * - Automatic user profiling
 *
 * Falls back gracefully to SQLite memories when API key is not configured.
 *
 * @see https://supermemory.ai/docs
 * @module inference/memory/supermemory
 */

// ============================================================================
// Types
// ============================================================================

export interface SupermemoryConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface MemoryResult {
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Client
// ============================================================================

export class SupermemoryClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: SupermemoryConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.supermemory.ai/v3';
  }

  /**
   * Store a memory for a user-companion pair.
   * Fire-and-forget safe — callers should `.catch(() => {})`.
   */
  async addMemory(
    content: string,
    userId: string,
    companionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const smUserId = `${userId}_${companionId}`;

    const response = await fetch(`${this.baseUrl}/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-supermemory-api-key': this.apiKey,
        'x-sm-user-id': smUserId,
      },
      body: JSON.stringify({
        content,
        metadata: {
          companionId,
          userId,
          timestamp: Date.now(),
          ...metadata,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.warn(`[supermemory] addMemory failed (${response.status}): ${error}`);
    }
  }

  /**
   * Search memories relevant to a query for a user-companion pair.
   */
  async searchMemories(
    query: string,
    userId: string,
    companionId: string,
    limit: number = 10,
  ): Promise<MemoryResult[]> {
    const smUserId = `${userId}_${companionId}`;

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-supermemory-api-key': this.apiKey,
          'x-sm-user-id': smUserId,
        },
        body: JSON.stringify({
          q: query,
          limit,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`[supermemory] search failed (${response.status}): ${error}`);
        return [];
      }

      const data = await response.json() as {
        results?: Array<{ content: string; score: number; metadata?: Record<string, unknown> }>;
      };

      return (data.results ?? []).map(r => ({
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      }));
    } catch (err) {
      console.warn('[supermemory] search error:', err);
      return [];
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let client: SupermemoryClient | null = null;

/**
 * Get the Supermemory client. Returns null if SUPERMEMORY_API_KEY is not set.
 * When null, callers should fall back to SQLite memories.
 */
export function getSupermemoryClient(): SupermemoryClient | null {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) return null;

  if (!client) {
    client = new SupermemoryClient({ apiKey });
    console.log('[supermemory] Client initialized');
  }

  return client;
}
