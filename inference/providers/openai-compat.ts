/**
 * OpenAI-Compatible Provider Base — Shared HTTP logic for providers that
 * implement the OpenAI chat completions API format.
 *
 * Used by: xAI (Grok), Moonshot (Kimi), Z.ai (GLM), Groq
 *
 * @module inference/providers/openai-compat
 */

import type {
  FrontierProvider,
  FrontierProviderId,
  FrontierModelSpec,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderStreamChunk,
} from './types.js';
import { fetchWithTimeout, retryWithBackoff, HttpError } from '../retry.js';

// ============================================================================
// Base Class
// ============================================================================

export class OpenAICompatProvider implements FrontierProvider {
  readonly id: FrontierProviderId;
  readonly spec: FrontierModelSpec;
  private apiKey: string | undefined;

  constructor(id: FrontierProviderId, spec: FrontierModelSpec) {
    this.id = id;
    this.spec = spec;
    this.apiKey = process.env[spec.apiKeyEnvVar];
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const effectiveKey = request.apiKeyOverride ?? this.apiKey;
    if (!effectiveKey) {
      throw new Error(`[${this.id}] API key not configured (set ${this.spec.apiKeyEnvVar})`);
    }

    const start = performance.now();

    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${this.spec.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveKey}`,
          },
          body: JSON.stringify({
            model: this.spec.modelId,
            messages: request.messages,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
          }),
        },
        10_000, // 10s timeout for chat
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpError(`[${this.id}] API error ${response.status}: ${error}`, response.status);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        content: data.choices[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: this.spec.modelId,
        provider: this.id,
        latencyMs: performance.now() - start,
      };
    });
  }

  async *chatStream(request: ProviderChatRequest): AsyncGenerator<ProviderStreamChunk> {
    const effectiveKey = request.apiKeyOverride ?? this.apiKey;
    if (!effectiveKey) {
      throw new Error(`[${this.id}] API key not configured (set ${this.spec.apiKeyEnvVar})`);
    }

    // Retry covers the connection/initial response — once streaming starts,
    // we don't retry mid-stream (the caller handles that at a higher level).
    const response = await retryWithBackoff(async () => {
      const res = await fetchWithTimeout(
        `${this.spec.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveKey}`,
          },
          body: JSON.stringify({
            model: this.spec.modelId,
            messages: request.messages,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
            stream: true,
            stream_options: { include_usage: true },
          }),
        },
        15_000, // 15s timeout for stream initiation
      );

      if (!res.ok) {
        const error = await res.text();
        throw new HttpError(`[${this.id}] API error ${res.status}: ${error}`, res.status);
      }

      return res;
    });

    if (!response.body) {
      throw new Error(`[${this.id}] Response body is null — streaming not supported`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // skip empty lines and comments

          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6); // strip "data: "

          if (payload === '[DONE]') {
            yield { content: '', done: true, inputTokens, outputTokens };
            return;
          }

          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };

            // Capture usage when present (typically on the final chunk)
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
              outputTokens = chunk.usage.completion_tokens ?? outputTokens;
            }

            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // If we exit without [DONE], still yield a final done chunk
    yield { content: '', done: true, inputTokens, outputTokens };
  }
}
