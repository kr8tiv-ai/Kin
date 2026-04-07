/**
 * Fireworks AI Provider — Llama 3.3 70B Instruct
 * @module inference/providers/fireworks
 */

import { OpenAICompatProvider } from './openai-compat.js';
import type { FrontierModelSpec } from './types.js';

const SPEC: FrontierModelSpec = {
  providerId: 'fireworks',
  modelId: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  displayName: 'Fireworks Llama 3.3 70B',
  contextWindow: 128_000,
  pricing: { inputPer1M: 0.90, outputPer1M: 0.90 },
  apiBaseUrl: 'https://api.fireworks.ai/inference/v1',
  apiKeyEnvVar: 'FIREWORKS_API_KEY',
};

export const fireworksProvider = new OpenAICompatProvider('fireworks', SPEC);
export default fireworksProvider;
