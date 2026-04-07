/**
 * Together AI Provider — Llama 3.3 70B Instruct Turbo
 * @module inference/providers/together
 */

import { OpenAICompatProvider } from './openai-compat.js';
import type { FrontierModelSpec } from './types.js';

const SPEC: FrontierModelSpec = {
  providerId: 'together',
  modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  displayName: 'Together AI Llama 3.3 70B',
  contextWindow: 128_000,
  pricing: { inputPer1M: 0.88, outputPer1M: 0.88 },
  apiBaseUrl: 'https://api.together.xyz/v1',
  apiKeyEnvVar: 'TOGETHER_API_KEY',
};

export const togetherProvider = new OpenAICompatProvider('together', SPEC);
export default togetherProvider;
