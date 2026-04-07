/**
 * MediaManager — Replicate API wrapper for video and music generation.
 *
 * Owns a singleton Replicate client instance. Provides:
 * - Video generation via Wan 2.x model
 * - Music generation via Lyria 3 / MusicGen model
 * - Per-user rate limiting (10 generations/hour)
 * - Global concurrency cap (5 simultaneous)
 * - Structured error handling — never throws raw API errors
 * - Generation tracking with status queries
 * - Health reporting
 */

import Replicate from 'replicate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerationResult {
  id: string;
  url: string;
  mimeType: string;
  durationMs: number;
}

export interface GenerationRecord {
  id: string;
  userId: string;
  type: 'video' | 'audio';
  status: 'pending' | 'running' | 'completed' | 'error' | 'rate-limited' | 'generation-timeout';
  prompt: string;
  result?: GenerationResult;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface MediaHealth {
  configured: boolean;
  activeGenerations: number;
}

export interface VideoOptions {
  model?: string;
  duration?: number;
}

export interface MusicOptions {
  model?: string;
  durationSec?: number;
}

type GenerationResponse =
  | { status: 'completed'; result: GenerationResult }
  | { status: 'error' | 'rate-limited' | 'generation-timeout'; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent generations across all users. */
const MAX_CONCURRENT = 5;

/** Per-user generation limit within the rate window. */
const PER_USER_LIMIT = 10;

/** Rate window duration in ms (1 hour). */
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Default Replicate API call timeout in ms. */
const GENERATION_TIMEOUT_MS = 120_000;

/** Default video model (Wan 2.1 on Replicate). */
const DEFAULT_VIDEO_MODEL = 'wan-ai/wan2.1-t2v-720p' as const;

/** Default music model (MusicGen on Replicate). */
const DEFAULT_MUSIC_MODEL = 'meta/musicgen' as const;

// ---------------------------------------------------------------------------
// MediaManager
// ---------------------------------------------------------------------------

export class MediaManager {
  private client: Replicate | null = null;
  private generations: Map<string, GenerationRecord> = new Map();
  private activeCount = 0;

  /**
   * Per-user rate tracking.
   * Key: userId, Value: array of generation timestamps within the rate window.
   */
  private userRates: Map<string, number[]> = new Map();

  // -------------------------------------------------------------------------
  // Client lifecycle
  // -------------------------------------------------------------------------

  /** Lazy-init the Replicate client from env. Returns null if unconfigured. */
  private getClient(): Replicate | null {
    if (this.client) return this.client;

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return null;

    this.client = new Replicate({ auth: token });
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  /** Prune expired timestamps and check if user is within rate limit. */
  private checkUserRate(userId: string): boolean {
    const now = Date.now();
    const cutoff = now - RATE_WINDOW_MS;
    const timestamps = (this.userRates.get(userId) ?? []).filter(t => t > cutoff);
    this.userRates.set(userId, timestamps);
    return timestamps.length < PER_USER_LIMIT;
  }

  /** Record a generation against the user's rate window. */
  private recordUserGeneration(userId: string): void {
    const timestamps = this.userRates.get(userId) ?? [];
    timestamps.push(Date.now());
    this.userRates.set(userId, timestamps);
  }

  // -------------------------------------------------------------------------
  // Generation helpers
  // -------------------------------------------------------------------------

  /** Generate a unique ID for tracking. */
  private generateId(): string {
    return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Run a Replicate model with timeout and structured error handling.
   * Returns the output URL string or an error.
   */
  private async runModel(
    model: `${string}/${string}` | `${string}/${string}:${string}`,
    input: Record<string, unknown>,
  ): Promise<{ url: string } | { error: string; timeout?: boolean }> {
    const client = this.getClient();
    if (!client) {
      return { error: 'Replicate not configured — set REPLICATE_API_TOKEN' };
    }

    try {
      const output = await Promise.race([
        client.run(model, { input }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GENERATION_TIMEOUT')), GENERATION_TIMEOUT_MS),
        ),
      ]);

      // Replicate output varies by model — could be a FileOutput, string, or array
      const url = this.extractUrl(output);
      if (!url) {
        return { error: 'Replicate returned unexpected output shape — no URL found' };
      }

      return { url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GENERATION_TIMEOUT') {
        return { error: 'Generation timed out after 120s', timeout: true };
      }
      return { error: `Replicate API error: ${msg}` };
    }
  }

  /**
   * Extract a URL from Replicate's varied output formats.
   * Handles: FileOutput with .url(), string URL, array of URLs/FileOutputs.
   */
  private extractUrl(output: unknown): string | null {
    if (!output) return null;

    // String URL
    if (typeof output === 'string' && output.startsWith('http')) {
      return output;
    }

    // FileOutput or object with url() method
    if (typeof output === 'object' && output !== null) {
      const obj = output as Record<string, unknown>;

      // FileOutput has a .url() method
      if (typeof obj.url === 'function') {
        const result = (obj.url as () => string)();
        if (typeof result === 'string') return result;
      }

      // Or it might just be a string property
      if (typeof obj.url === 'string') {
        return obj.url;
      }

      // toString() on FileOutput yields the URL
      const str = String(output);
      if (str.startsWith('http')) return str;
    }

    // Array — take first element
    if (Array.isArray(output) && output.length > 0) {
      return this.extractUrl(output[0]);
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generate a video from a text prompt.
   * Returns a structured result — never throws.
   */
  async generateVideo(
    prompt: string,
    userId: string,
    options?: VideoOptions,
  ): Promise<GenerationResponse> {
    // Gate: configured?
    if (!this.getClient()) {
      return { status: 'error', error: 'Replicate not configured — set REPLICATE_API_TOKEN' };
    }

    // Gate: user rate limit
    if (!this.checkUserRate(userId)) {
      return { status: 'rate-limited', error: 'Rate limit exceeded — max 10 generations per hour' };
    }

    // Gate: global concurrency
    if (this.activeCount >= MAX_CONCURRENT) {
      return { status: 'rate-limited', error: 'Too many concurrent generations — try again shortly' };
    }

    const id = this.generateId();
    const model = (options?.model ?? DEFAULT_VIDEO_MODEL) as `${string}/${string}`;
    const record: GenerationRecord = {
      id,
      userId,
      type: 'video',
      status: 'running',
      prompt,
      createdAt: Date.now(),
    };
    this.generations.set(id, record);
    this.activeCount++;
    this.recordUserGeneration(userId);

    const startMs = Date.now();
    try {
      const result = await this.runModel(model, {
        prompt,
        ...(options?.duration ? { num_frames: Math.round(options.duration * 24) } : {}),
      });

      if ('error' in result) {
        record.status = result.timeout ? 'generation-timeout' : 'error';
        record.error = result.error;
        record.completedAt = Date.now();
        return { status: record.status, error: result.error };
      }

      const genResult: GenerationResult = {
        id,
        url: result.url,
        mimeType: 'video/mp4',
        durationMs: Date.now() - startMs,
      };
      record.status = 'completed';
      record.result = genResult;
      record.completedAt = Date.now();
      return { status: 'completed', result: genResult };
    } finally {
      this.activeCount--;
    }
  }

  /**
   * Generate music from a text prompt.
   * Returns a structured result — never throws.
   */
  async generateMusic(
    prompt: string,
    userId: string,
    options?: MusicOptions,
  ): Promise<GenerationResponse> {
    // Gate: configured?
    if (!this.getClient()) {
      return { status: 'error', error: 'Replicate not configured — set REPLICATE_API_TOKEN' };
    }

    // Gate: user rate limit
    if (!this.checkUserRate(userId)) {
      return { status: 'rate-limited', error: 'Rate limit exceeded — max 10 generations per hour' };
    }

    // Gate: global concurrency
    if (this.activeCount >= MAX_CONCURRENT) {
      return { status: 'rate-limited', error: 'Too many concurrent generations — try again shortly' };
    }

    const id = this.generateId();
    const model = (options?.model ?? DEFAULT_MUSIC_MODEL) as `${string}/${string}`;
    const record: GenerationRecord = {
      id,
      userId,
      type: 'audio',
      status: 'running',
      prompt,
      createdAt: Date.now(),
    };
    this.generations.set(id, record);
    this.activeCount++;
    this.recordUserGeneration(userId);

    const startMs = Date.now();
    try {
      const result = await this.runModel(model, {
        prompt,
        ...(options?.durationSec ? { duration: options.durationSec } : {}),
      });

      if ('error' in result) {
        record.status = result.timeout ? 'generation-timeout' : 'error';
        record.error = result.error;
        record.completedAt = Date.now();
        return { status: record.status, error: result.error };
      }

      const genResult: GenerationResult = {
        id,
        url: result.url,
        mimeType: 'audio/mpeg',
        durationMs: Date.now() - startMs,
      };
      record.status = 'completed';
      record.result = genResult;
      record.completedAt = Date.now();
      return { status: 'completed', result: genResult };
    } finally {
      this.activeCount--;
    }
  }

  /**
   * Get the status of a generation by ID.
   * Returns the full record or undefined if not found.
   */
  getGenerationStatus(id: string): GenerationRecord | undefined {
    return this.generations.get(id);
  }

  /** Report health: configured state and active generation count. */
  getHealth(): MediaHealth {
    return {
      configured: !!process.env.REPLICATE_API_TOKEN,
      activeGenerations: this.activeCount,
    };
  }

  /** Clean up stale completed records older than 1 hour to prevent memory leak. */
  pruneStaleRecords(): void {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [id, record] of this.generations) {
      if (record.completedAt && record.completedAt < cutoff) {
        this.generations.delete(id);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: MediaManager | null = null;

/** Get or create the singleton MediaManager instance. */
export function getMediaManager(): MediaManager {
  if (!instance) {
    instance = new MediaManager();
  }
  return instance;
}
