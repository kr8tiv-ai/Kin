/**
 * Anthropic Provider — Claude Opus 4.6 (powers Vortex)
 *
 * Uses Anthropic's Messages API (non-OpenAI format):
 * - System message extracted to top-level `system` field
 * - Roles mapped: user/assistant only in messages array
 *
 * @module inference/providers/anthropic
 */

import type {
  FrontierProvider,
  FrontierModelSpec,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderStreamChunk,
} from './types.js';
import { fetchWithTimeout, retryWithBackoff, HttpError } from '../retry.js';

// ============================================================================
// Spec
// ============================================================================

const SPEC: FrontierModelSpec = {
  providerId: 'anthropic',
  modelId: 'claude-opus-4-6',
  displayName: 'Anthropic Claude Opus 4.6',
  contextWindow: 1_000_000,
  pricing: { inputPer1M: 5.0, outputPer1M: 25.0 },
  apiBaseUrl: 'https://api.anthropic.com/v1',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
};

// ============================================================================
// Provider
// ============================================================================

class AnthropicProvider implements FrontierProvider {
  readonly id = 'anthropic' as const;
  readonly spec = SPEC;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env[SPEC.apiKeyEnvVar];
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    if (!this.apiKey) {
      throw new Error(`[anthropic] API key not configured (set ${SPEC.apiKeyEnvVar})`);
    }

    const start = performance.now();

    // Extract system message (Anthropic uses top-level `system` field)
    const systemMessage = request.messages.find(m => m.role === 'system')?.content;
    const chatMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${SPEC.apiBaseUrl}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: SPEC.modelId,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
            ...(systemMessage ? { system: systemMessage } : {}),
            messages: chatMessages,
          }),
        },
        10_000, // 10s timeout for chat
      );

      if (!response.ok) {
        const error = await response.text();
        throw new HttpError(`[anthropic] API error ${response.status}: ${error}`, response.status);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      return {
        content: data.content?.[0]?.text ?? '',
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        model: SPEC.modelId,
        provider: 'anthropic',
        latencyMs: performance.now() - start,
      };
    });
  }

  async *chatStream(request: ProviderChatRequest): AsyncGenerator<ProviderStreamChunk> {
    if (!this.apiKey) {
      throw new Error(`[anthropic] API key not configured (set ${SPEC.apiKeyEnvVar})`);
    }

    // Extract system message (Anthropic uses top-level `system` field)
    const systemMessage = request.messages.find(m => m.role === 'system')?.content;
    const chatMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

    // Retry covers connection/initial response — once streaming starts,
    // the caller handles mid-stream failures at a higher level.
    const response = await retryWithBackoff(async () => {
      const res = await fetchWithTimeout(
        `${SPEC.apiBaseUrl}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: SPEC.modelId,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
            ...(systemMessage ? { system: systemMessage } : {}),
            messages: chatMessages,
            stream: true,
          }),
        },
        15_000, // 15s timeout for stream initiation
      );

      if (!res.ok) {
        const error = await res.text();
        throw new HttpError(`[anthropic] API error ${res.status}: ${error}`, res.status);
      }

      return res;
    });

    if (!response.body) {
      throw new Error('[anthropic] Response body is null — streaming not supported');
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
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          // Anthropic SSE format: "event: <type>" followed by "data: <json>"
          if (trimmed.startsWith('event: ')) continue; // event line — data follows next

          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);

          try {
            const event = JSON.parse(payload) as {
              type: string;
              message?: { usage?: { input_tokens?: number } };
              delta?: { text?: string; usage?: { output_tokens?: number } };
              usage?: { input_tokens?: number; output_tokens?: number };
            };

            switch (event.type) {
              case 'message_start':
                // Capture input token count from initial message metadata
                inputTokens = event.message?.usage?.input_tokens ?? 0;
                break;

              case 'content_block_delta':
                // Yield text content from delta
                if (event.delta?.text) {
                  yield { content: event.delta.text, done: false };
                }
                break;

              case 'message_delta':
                // Capture output token count from final message delta
                outputTokens = event.delta?.usage?.output_tokens ?? event.usage?.output_tokens ?? 0;
                break;

              case 'message_stop':
                yield { content: '', done: true, inputTokens, outputTokens };
                return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // If we exit without message_stop, still yield a final done chunk
    yield { content: '', done: true, inputTokens, outputTokens };
  }
}

export const anthropicProvider = new AnthropicProvider();
export default anthropicProvider;
