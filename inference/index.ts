/**
 * Inference Module - Local-first LLM integration for KIN
 *
 * This module provides a complete local-first LLM integration with:
 * - Ollama setup and management
 * - Cipher personality prompts
 * - Local LLM client with streaming
 * - Cloud fallback with route disclosure
 * - Comprehensive metrics tracking
 *
 * @example
 * ```typescript
 * import { OllamaClient, getFallbackHandler, getMetricsCollector } from './inference';
 *
 * // Check local availability
 * const client = new OllamaClient();
 * const isLocal = await client.isAvailable();
 *
 * // Execute with fallback
 * const handler = getFallbackHandler();
 * const result = await handler.executeWithFallback(
 *   messages,
 *   () => client.chat({ messages }).then(r => r.message.content)
 * );
 *
 * // Track metrics
 * const metrics = getMetricsCollector();
 * console.log(formatMetrics(metrics.getMetrics()));
 * ```
 *
 * @module inference
 */

// ============================================================================
// Re-exports
// ============================================================================

// Local LLM Client
export {
  OllamaClient,
  OllamaError,
  getOllamaClient,
  createOllamaClient,
  chat,
  chatStream,
  generate,
  isLocalLlmAvailable,
  type OllamaConfig,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type GenerateRequest,
  type GenerateResponse,
  type ModelOptions,
  type ModelInfo,
  type ModelDetails,
  type HealthStatus,
  type StreamCallback,
} from './local-llm';

// Cipher Prompts
export {
  CIPHER_SYSTEM_PROMPT,
  CIPHER_SYSTEM_PROMPT_SHORT,
  CIPHER_CODE_PROMPT,
  CIPHER_TEACH_PROMPT,
  WEBSITE_BUILDING_EXAMPLES,
  DEBUGGING_EXAMPLES,
  TEACHING_EXAMPLES,
  buildCipherPrompt,
  buildContextSection,
  type PromptContext,
  type UserPreferences,
  type TaskContext,
  type FewShotExample,
} from './cipher-prompts';

// Fallback Handler
export {
  FallbackHandler,
  getFallbackHandler,
  createFallbackHandler,
  type FallbackConfig,
  type ProviderConfig,
  type RoutingDecision,
  type RoutingReason,
  type CostRecord,
  type FallbackResult,
  type Message,
} from './fallback-handler';

// Metrics
export {
  MetricsCollector,
  getMetricsCollector,
  createMetricsCollector,
  getMetricsSnapshot,
  formatMetrics,
  estimateTokens,
  estimateChatTokens,
  type InferenceMetrics,
  type ProviderMetrics,
  type RequestMetric,
  type MetricThresholds,
  type MetricEvent,
  type MetricCallback,
} from './metrics';

