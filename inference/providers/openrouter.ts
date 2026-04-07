/**
 * OpenRouter Provider — Multi-model API fallback
 *
 * OpenRouter aggregates 200+ models behind a single OpenAI-compatible API.
 * Used as the KIN Credits API fallback when a user's CLI plan doesn't cover
 * a particular model or the CLI provider is down.
 *
 * @module inference/providers/openrouter
 */

import { OpenAICompatProvider } from './openai-compat.js';
import type { FrontierModelSpec } from './types.js';

const SPEC: FrontierModelSpec = {
  providerId: 'openrouter',
  modelId: 'openai/gpt-4o',            // default model; overridden per-request via routing
  displayName: 'OpenRouter (Multi-Model)',
  contextWindow: 128_000,
  pricing: { inputPer1M: 2.50, outputPer1M: 10.00 }, // varies by model; GPT-4o baseline
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  apiKeyEnvVar: 'OPENROUTER_API_KEY',
};

export const openrouterProvider = new OpenAICompatProvider('openrouter', SPEC);
export default openrouterProvider;
