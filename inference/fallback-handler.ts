/**
 * Fallback Handler - Cloud LLM integration with route disclosure
 *
 * Provides intelligent fallback from local to cloud LLMs with:
 * - OpenAI/Anthropic integration
 * - Multi-provider iteration (tries all providers on failure)
 * - Route disclosure (tells user when using cloud)
 * - Cost tracking and estimation
 * - Graceful degradation
 *
 * @module inference/fallback-handler
 */

import { fetchWithTimeout, retryWithBackoff, HttpError, isTransientError } from './retry.js';

// ============================================================================
// Types
// ============================================================================

export interface FallbackConfig {
  /** Enable cloud fallback (default: true) */
  enabled?: boolean;
  /** Preferred fallback provider */
  preferredProvider?: 'openai' | 'anthropic' | 'groq';
  /** Maximum cost per request in USD */
  maxCostPerRequest?: number;
  /** Disclose routing to user (default: true) */
  discloseRouting?: boolean;
  /** Local model timeout before fallback (ms) */
  localTimeout?: number;
  /** Enable cost tracking */
  trackCosts?: boolean;
}

export interface ProviderConfig {
  openai?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  anthropic?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
  groq?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

export interface RoutingDecision {
  /** Which route was selected */
  route: 'local' | 'fallback';
  /** Which provider was used (if fallback) */
  provider?: 'openai' | 'anthropic' | 'groq';
  /** Model that was used */
  model: string;
  /** Reason for routing decision */
  reason: RoutingReason;
  /** Whether user was notified */
  disclosed: boolean;
}

export type RoutingReason =
  | 'local_preferred'
  | 'local_unavailable'
  | 'local_timeout'
  | 'local_error'
  | 'local_overloaded'
  | 'user_requested'
  | 'task_requires_cloud'
  | 'supervisor_escalation';

export interface CostRecord {
  timestamp: string;
  provider: 'openai' | 'anthropic' | 'groq';
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requestId: string;
}

export interface FallbackResult {
  content: string;
  routing: RoutingDecision;
  cost?: CostRecord;
  latencyMs: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Cost per 1K tokens (2025-2026 pricing) */
const COST_PER_1K_TOKENS = {
  openai: {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  },
  anthropic: {
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  },
  groq: {
    'qwen/qwen3-32b': { input: 0.00029, output: 0.00059 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.00011, output: 0.00034 },
    'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  },
};

/** Default models */
const DEFAULT_MODELS = {
  openai: 'gpt-4-turbo',
  anthropic: 'claude-3-sonnet',
  groq: 'qwen/qwen3-32b',
};

/** Disclosure messages */
const DISCLOSURE_MESSAGES = {
  local_unavailable: "⚠️ Local model unavailable. Using cloud ({{provider}}) for this request.",
  local_timeout: "⏱️ Local model timed out. Switching to cloud ({{provider}}).",
  local_error: "❌ Local model error. Falling back to cloud ({{provider}}).",
  task_requires_cloud: "☁️ This task requires cloud capabilities. Using {{provider}}.",
  user_requested: "☁️ Using cloud model ({{provider}}) as requested.",
  supervisor_escalation: "🎓 Escalating to supervisor ({{provider}}) for deeper analysis.",
};

// ============================================================================
// Cost Tracker
// ============================================================================

/**
 * Tracks LLM API costs
 */
class CostTracker {
  private records: CostRecord[] = [];
  private totalCostUsd = 0;
  private maxRecords = 1000;

  /**
   * Record a cost event
   */
  record(record: CostRecord): void {
    this.records.push(record);
    this.totalCostUsd += record.costUsd;

    // Keep only recent records
    if (this.records.length > this.maxRecords) {
      const removed = this.records.shift();
      if (removed) {
        this.totalCostUsd -= removed.costUsd;
      }
    }
  }

  /**
   * Get total cost
   */
  getTotal(): number {
    return this.totalCostUsd;
  }

  /**
   * Get cost by provider
   */
  getByProvider(provider: 'openai' | 'anthropic' | 'groq'): number {
    return this.records
      .filter(r => r.provider === provider)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /**
   * Get recent costs
   */
  getRecent(limit: number = 50): CostRecord[] {
    return this.records.slice(-limit);
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(
    provider: 'openai' | 'anthropic' | 'groq',
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = (COST_PER_1K_TOKENS[provider] as Record<string, { input: number; output: number }>)?.[model];
    
    if (!pricing) {
      // Use average pricing as fallback
      const avgInput = 0.01;
      const avgOutput = 0.03;
      return (inputTokens * avgInput + outputTokens * avgOutput) / 1000;
    }

    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
  }

  /**
   * Export costs for analysis
   */
  export(): { records: CostRecord[]; total: number } {
    return {
      records: [...this.records],
      total: this.totalCostUsd,
    };
  }
}

// ============================================================================
// Fallback Handler
// ============================================================================

/**
 * Handles fallback from local to cloud LLMs
 */
export class FallbackHandler {
  private config: Required<FallbackConfig>;
  private providerConfig: ProviderConfig;
  private costTracker: CostTracker;
  private onRouteChange?: (decision: RoutingDecision) => void;

  constructor(
    config: FallbackConfig = {},
    providerConfig: ProviderConfig = {}
  ) {
    // Auto-detect preferred provider: Groq (free) → Anthropic → OpenAI
    const defaultProvider = process.env.GROQ_API_KEY ? 'groq'
      : process.env.ANTHROPIC_API_KEY ? 'anthropic'
      : 'openai';

    this.config = {
      enabled: config.enabled ?? true,
      preferredProvider: config.preferredProvider ?? defaultProvider,
      maxCostPerRequest: config.maxCostPerRequest ?? 1.0,
      discloseRouting: config.discloseRouting ?? true,
      localTimeout: config.localTimeout ?? 30000,
      trackCosts: config.trackCosts ?? true,
    };

    this.providerConfig = {
      openai: {
        apiKey: providerConfig.openai?.apiKey ?? process.env.OPENAI_API_KEY,
        model: providerConfig.openai?.model ?? DEFAULT_MODELS.openai,
        baseUrl: providerConfig.openai?.baseUrl,
      },
      anthropic: {
        apiKey: providerConfig.anthropic?.apiKey ?? process.env.ANTHROPIC_API_KEY,
        model: providerConfig.anthropic?.model ?? DEFAULT_MODELS.anthropic,
        baseUrl: providerConfig.anthropic?.baseUrl,
      },
      groq: {
        apiKey: providerConfig.groq?.apiKey ?? process.env.GROQ_API_KEY,
        model: providerConfig.groq?.model ?? DEFAULT_MODELS.groq,
        baseUrl: providerConfig.groq?.baseUrl ?? 'https://api.groq.com/openai/v1',
      },
    };

    this.costTracker = new CostTracker();
  }

  /**
   * Set callback for route changes
   */
  onRouting(callback: (decision: RoutingDecision) => void): void {
    this.onRouteChange = callback;
  }

  /**
   * Check if fallback is available
   */
  async isFallbackAvailable(): Promise<{ openai: boolean; anthropic: boolean; groq: boolean }> {
    return {
      openai: !!(this.providerConfig.openai?.apiKey),
      anthropic: !!(this.providerConfig.anthropic?.apiKey),
      groq: !!(this.providerConfig.groq?.apiKey),
    };
  }

  /**
   * Execute with fallback - tries local first, falls back to cloud
   */
  async executeWithFallback(
    messages: Message[],
    localExecutor: () => Promise<string>,
    options: {
      taskType?: 'simple' | 'complex' | 'code' | 'creative';
      forceCloud?: boolean;
    } = {}
  ): Promise<FallbackResult> {
    const start = performance.now();

    // Check if cloud is forced
    if (options.forceCloud) {
      return this.executeCloud(messages, 'user_requested');
    }

    // Check if task requires cloud
    if (options.taskType === 'complex') {
      const available = await this.isFallbackAvailable();
      if (available[this.config.preferredProvider]) {
        return this.executeCloud(messages, 'task_requires_cloud');
      }
    }

    // Try local first
    try {
      const content = await Promise.race([
        localExecutor(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Local timeout')), this.config.localTimeout)
        ),
      ]);

      const routing: RoutingDecision = {
        route: 'local',
        model: 'local',
        reason: 'local_preferred',
        disclosed: false,
      };

      this.notifyRouting(routing);

      return {
        content,
        routing,
        latencyMs: performance.now() - start,
      };
    } catch (error) {
      // Local failed - check if fallback is enabled
      if (!this.config.enabled) {
        throw error;
      }

      // Determine reason
      let reason: RoutingReason = 'local_error';
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          reason = 'local_timeout';
        } else if (error.message.includes('unavailable')) {
          reason = 'local_unavailable';
        }
      }

      return this.executeCloud(messages, reason);
    }
  }

  /**
   * Execute directly on cloud provider.
   * Iterates through ALL providers in priority order — if the preferred
   * provider fails, tries the next one until one succeeds or all have
   * been exhausted.
   */
  private async executeCloud(
    messages: Message[],
    reason: RoutingReason
  ): Promise<FallbackResult> {
    const start = performance.now();

    // Build provider priority: preferred → fallbacks
    const providerOrder: Array<'groq' | 'openai' | 'anthropic'> = [this.config.preferredProvider as 'groq' | 'openai' | 'anthropic'];
    for (const p of ['groq', 'anthropic', 'openai'] as const) {
      if (!providerOrder.includes(p)) providerOrder.push(p);
    }

    // Filter to providers with API keys
    const available = providerOrder.filter(p => !!this.providerConfig[p]?.apiKey);

    if (available.length === 0) {
      throw new Error(`No API key configured for any provider (tried: ${providerOrder.join(', ')})`);
    }

    // Iterate through available providers — try each until one succeeds
    let lastError: unknown;
    for (const provider of available) {
      const apiKey = this.providerConfig[provider]!.apiKey!;
      const model = this.providerConfig[provider]?.model ?? DEFAULT_MODELS[provider];

      try {
        const result = await retryWithBackoff(
          () => this.executeProviderRequest(provider, messages, apiKey),
          { maxRetries: 1, initialDelayMs: 500 },
        );

        // Success — build routing + cost
        const disclosure = this.config.discloseRouting
          ? this.formatDisclosure(reason, provider)
          : undefined;

        const routing: RoutingDecision = {
          route: 'fallback',
          provider,
          model,
          reason,
          disclosed: this.config.discloseRouting,
        };

        this.notifyRouting(routing);

        const costRecord = this.createCostRecord(
          provider,
          model,
          result.inputTokens,
          result.outputTokens
        );

        if (this.config.trackCosts) {
          this.costTracker.record(costRecord);
        }

        return {
          content: disclosure ? `${disclosure}\n\n${result.content}` : result.content,
          routing,
          cost: costRecord,
          latencyMs: performance.now() - start,
        };
      } catch (err) {
        lastError = err;
        console.warn(`[fallback] Provider ${provider} failed, trying next:`, err instanceof Error ? err.message : err);
        // Continue to next provider
      }
    }

    // All providers exhausted
    throw lastError ?? new Error('All cloud providers failed');
  }

  /**
   * Execute request on specific provider
   */
  private async executeProviderRequest(
    provider: 'openai' | 'anthropic' | 'groq',
    messages: Message[],
    apiKey: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    if (provider === 'groq') {
      return this.executeGroqRequest(messages, apiKey);
    } else if (provider === 'openai') {
      return this.executeOpenAIRequest(messages, apiKey);
    } else {
      return this.executeAnthropicRequest(messages, apiKey);
    }
  }

  /**
   * Execute OpenAI request
   */
  private async executeOpenAIRequest(
    messages: Message[],
    apiKey: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const baseUrl = this.providerConfig.openai?.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.providerConfig.openai?.model ?? DEFAULT_MODELS.openai;

    const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
      }),
    }, 10_000);

    if (!response.ok) {
      const error = await response.text();
      throw new HttpError(`OpenAI API error: ${response.status} - ${error}`, response.status);
    }

    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * Execute Anthropic request
   */
  private async executeAnthropicRequest(
    messages: Message[],
    apiKey: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const baseUrl = this.providerConfig.anthropic?.baseUrl ?? 'https://api.anthropic.com/v1';
    const model = this.providerConfig.anthropic?.model ?? DEFAULT_MODELS.anthropic;

    // Convert messages to Anthropic format
    const system = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');

    const response = await fetchWithTimeout(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    }, 10_000);

    if (!response.ok) {
      const error = await response.text();
      throw new HttpError(`Anthropic API error: ${response.status} - ${error}`, response.status);
    }

    const data = await response.json();

    return {
      content: data.content?.[0]?.text ?? '',
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  /**
   * Execute Groq request (OpenAI-compatible API)
   */
  private async executeGroqRequest(
    messages: Message[],
    apiKey: string
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const baseUrl = this.providerConfig.groq?.baseUrl ?? 'https://api.groq.com/openai/v1';
    const model = this.providerConfig.groq?.model ?? DEFAULT_MODELS.groq;

    const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 4096,
        temperature: 0.8,
      }),
    }, 10_000);

    if (!response.ok) {
      const error = await response.text();
      throw new HttpError(`Groq API error: ${response.status} - ${error}`, response.status);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content ?? '',
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * Format disclosure message
   */
  private formatDisclosure(reason: RoutingReason, provider: string): string {
    const template = DISCLOSURE_MESSAGES[reason as keyof typeof DISCLOSURE_MESSAGES] ?? DISCLOSURE_MESSAGES.local_error;
    const providerName = provider === 'openai' ? 'OpenAI' : provider === 'groq' ? 'Groq' : 'Claude';
    return template.replace('{{provider}}', providerName);
  }

  /**
   * Create cost record
   */
  private createCostRecord(
    provider: 'openai' | 'anthropic' | 'groq',
    model: string,
    inputTokens: number,
    outputTokens: number
  ): CostRecord {
    const cost = this.costTracker.estimateCost(provider, model, inputTokens, outputTokens);

    return {
      timestamp: new Date().toISOString(),
      provider,
      model,
      inputTokens,
      outputTokens,
      costUsd: cost,
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  /**
   * Notify routing callback
   */
  private notifyRouting(decision: RoutingDecision): void {
    if (this.onRouteChange) {
      this.onRouteChange(decision);
    }
  }

  /**
   * Simple chat — sends messages to the best available cloud provider.
   * Convenience wrapper used by support-chat.ts and other services.
   */
  async chat(
    messages: Message[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<FallbackResult> {
    return this.executeCloud(messages, 'user_requested');
  }

  /**
   * Streaming chat — yields tokens one-at-a-time via async generator.
   * Iterates through all available providers on connection failure.
   * Supports Groq, OpenAI (both use OpenAI-compatible SSE), and Anthropic.
   */
  async *chatStream(
    messages: Message[],
    options?: { maxTokens?: number; temperature?: number },
  ): AsyncGenerator<string> {
    // Build provider priority: preferred → fallbacks
    const providerOrder: Array<'groq' | 'openai' | 'anthropic'> = [
      this.config.preferredProvider as 'groq' | 'openai' | 'anthropic',
    ];
    for (const p of ['groq', 'anthropic', 'openai'] as const) {
      if (!providerOrder.includes(p)) providerOrder.push(p);
    }

    // Filter to providers with API keys
    const available = providerOrder.filter(p => !!this.providerConfig[p]?.apiKey);

    if (available.length === 0) {
      throw new Error('No API key configured for streaming');
    }

    const maxTokens = options?.maxTokens ?? 4096;
    const temperature = options?.temperature ?? 0.8;

    // Try each provider in order — yield from the first that connects
    let lastError: unknown;
    for (const provider of available) {
      const apiKey = this.providerConfig[provider]!.apiKey!;
      const model = this.providerConfig[provider]?.model ?? DEFAULT_MODELS[provider];

      try {
        yield* this.streamFromProvider(provider, apiKey, model, messages, maxTokens, temperature);
        return; // Success — done
      } catch (err) {
        lastError = err;
        console.warn(`[fallback] Stream provider ${provider} failed, trying next:`, err instanceof Error ? err.message : err);
        // Continue to next provider
      }
    }

    // All providers exhausted
    throw lastError ?? new Error('All streaming providers failed');
  }

  /**
   * Stream tokens from a specific provider.
   * Connection phase uses fetchWithTimeout; once streaming starts, tokens
   * are yielded until the provider signals completion.
   */
  private async *streamFromProvider(
    provider: 'groq' | 'openai' | 'anthropic',
    apiKey: string,
    model: string,
    messages: Message[],
    maxTokens: number,
    temperature: number,
  ): AsyncGenerator<string> {
    if (provider === 'groq' || provider === 'openai') {
      // OpenAI-compatible SSE streaming (Groq + OpenAI)
      const baseUrl = provider === 'groq'
        ? (this.providerConfig.groq?.baseUrl ?? 'https://api.groq.com/openai/v1')
        : (this.providerConfig.openai?.baseUrl ?? 'https://api.openai.com/v1');

      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
      }, 15_000);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpError(`${provider} streaming error: ${response.status} - ${error}`, response.status);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) yield token;
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } else {
      // Anthropic SSE streaming
      const baseUrl = this.providerConfig.anthropic?.baseUrl ?? 'https://api.anthropic.com/v1';
      const system = messages.find((m) => m.role === 'system')?.content;
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const response = await fetchWithTimeout(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: chatMessages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          stream: true,
        }),
      }, 15_000);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpError(`Anthropic streaming error: ${response.status} - ${error}`, response.status);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield parsed.delta.text;
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    }
  }

  /**
   * Get cost summary
   */
  getCostSummary(): { total: number; byProvider: { openai: number; anthropic: number; groq: number } } {
    return {
      total: this.costTracker.getTotal(),
      byProvider: {
        openai: this.costTracker.getByProvider('openai'),
        anthropic: this.costTracker.getByProvider('anthropic'),
        groq: this.costTracker.getByProvider('groq'),
      },
    };
  }

  /**
   * Export cost data
   */
  exportCosts(): { records: CostRecord[]; total: number } {
    return this.costTracker.export();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultHandler: FallbackHandler | null = null;

/**
 * Get the default fallback handler
 */
export function getFallbackHandler(
  config?: FallbackConfig,
  providerConfig?: ProviderConfig
): FallbackHandler {
  if (!defaultHandler || config || providerConfig) {
    defaultHandler = new FallbackHandler(config, providerConfig);
  }
  return defaultHandler;
}

/**
 * Create a new fallback handler
 */
export function createFallbackHandler(
  config?: FallbackConfig,
  providerConfig?: ProviderConfig
): FallbackHandler {
  return new FallbackHandler(config, providerConfig);
}

// ============================================================================
// Exports
// ============================================================================

export default FallbackHandler;
