/**
 * Google Provider — Gemini 3.1 Pro (powers Mischief)
 *
 * Uses Google's Generative Language API:
 * - System message mapped to `systemInstruction` field
 * - Messages use `parts` array with `text` field
 * - Roles: 'user' and 'model' (not 'assistant')
 *
 * @module inference/providers/google
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
  providerId: 'google',
  modelId: 'gemini-3.1-pro',
  displayName: 'Google Gemini 3.1 Pro',
  contextWindow: 128_000,
  pricing: { inputPer1M: 1.25, outputPer1M: 5.0 },
  apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKeyEnvVar: 'GOOGLE_AI_API_KEY',
};

// ============================================================================
// Provider
// ============================================================================

class GoogleProvider implements FrontierProvider {
  readonly id = 'google' as const;
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
      throw new Error(`[google] API key not configured (set ${SPEC.apiKeyEnvVar})`);
    }

    const start = performance.now();

    // Extract system instruction
    const systemMessage = request.messages.find(m => m.role === 'system')?.content;

    // Map messages to Gemini format (role: 'user' | 'model')
    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `${SPEC.apiBaseUrl}/models/${SPEC.modelId}:generateContent?key=${this.apiKey}`;

    const data = await retryWithBackoff(async () => {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage }] } } : {}),
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
          },
        }),
      }, 15_000);

      if (!response.ok) {
        const error = await response.text();
        throw new HttpError(`[google] API error ${response.status}: ${error}`, response.status);
      }

      return response.json();
    }) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      content: text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      model: SPEC.modelId,
      provider: 'google',
      latencyMs: performance.now() - start,
    };
  }

  async *chatStream(request: ProviderChatRequest): AsyncGenerator<ProviderStreamChunk> {
    if (!this.apiKey) {
      throw new Error(`[google] API key not configured (set ${SPEC.apiKeyEnvVar})`);
    }

    // Extract system instruction
    const systemMessage = request.messages.find(m => m.role === 'system')?.content;

    // Map messages to Gemini format (role: 'user' | 'model')
    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `${SPEC.apiBaseUrl}/models/${SPEC.modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const response = await retryWithBackoff(async () => {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage }] } } : {}),
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.8,
          },
        }),
      }, 15_000);

      if (!res.ok) {
        const error = await res.text();
        throw new HttpError(`[google] API error ${res.status}: ${error}`, res.status);
      }

      return res;
    });

    if (!response.body) {
      throw new Error('[google] Response body is null — streaming not supported');
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

          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);

          try {
            const chunk = JSON.parse(payload) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
              }>;
              usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
              };
            };

            // Capture usage metadata when present (typically on the last chunk)
            if (chunk.usageMetadata) {
              inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
              outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
            }

            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              yield { content: text, done: false };
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true, inputTokens, outputTokens };
  }
}

export const googleProvider = new GoogleProvider();
export default googleProvider;
