/**
 * Frontier Provider Types — Unified interface for all LLM providers
 *
 * Each KIN companion is powered by a specific frontier model.
 * This module defines the shared contract all providers implement.
 *
 * @module inference/providers/types
 */

// ============================================================================
// Provider Identifiers
// ============================================================================

export type FrontierProviderId =
  | 'groq'       // Free tier (Qwen 3 32B)
  | 'openai'     // GPT-5.4 — powers Cipher
  | 'anthropic'  // Claude Opus 4.6 — powers Vortex
  | 'google'     // Gemini 3.1 Pro — powers Mischief
  | 'xai'        // Grok 4.20 — powers Forge
  | 'moonshot'   // Kimi K2.5 — powers Aether
  | 'zai'        // GLM-4.6 — powers Catalyst
  | 'deepseek'   // DeepSeek R1
  | 'mistral'    // Mistral Large
  | 'together'   // Together AI Llama 3.3 70B
  | 'fireworks'  // Fireworks Llama 3.3 70B
  | 'openrouter'; // OpenRouter — multi-model API fallback

// ============================================================================
// Model Specification
// ============================================================================

export interface FrontierModelSpec {
  providerId: FrontierProviderId;
  modelId: string;
  displayName: string;
  contextWindow: number;
  pricing: {
    inputPer1M: number;
    outputPer1M: number;
  };
  apiBaseUrl: string;
  apiKeyEnvVar: string;
}

// ============================================================================
// Chat Request / Response
// ============================================================================

export interface ProviderChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderChatRequest {
  messages: ProviderChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** Override the provider's default API key (e.g. user-provisioned KIN Credits key) */
  apiKeyOverride?: string;
}

export interface ProviderStreamChunk {
  content: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderChatResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: FrontierProviderId;
  latencyMs: number;
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface FrontierProvider {
  /** Provider identifier */
  id: FrontierProviderId;
  /** Model specification (pricing, context window, etc.) */
  spec: FrontierModelSpec;
  /** Check if this provider has a valid API key configured */
  isConfigured(): boolean;
  /** Execute a chat completion */
  chat(request: ProviderChatRequest): Promise<ProviderChatResponse>;
  /** Execute a streaming chat completion */
  chatStream?(request: ProviderChatRequest): AsyncGenerator<ProviderStreamChunk>;
}
