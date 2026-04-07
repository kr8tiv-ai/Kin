/**
 * Mistral Provider — Mistral Large
 * @module inference/providers/mistral
 */

import { OpenAICompatProvider } from './openai-compat.js';
import type { FrontierModelSpec } from './types.js';

const SPEC: FrontierModelSpec = {
  providerId: 'mistral',
  modelId: 'mistral-large-latest',
  displayName: 'Mistral Large',
  contextWindow: 128_000,
  pricing: { inputPer1M: 2.0, outputPer1M: 6.0 },
  apiBaseUrl: 'https://api.mistral.ai/v1',
  apiKeyEnvVar: 'MISTRAL_API_KEY',
};

export const mistralProvider = new OpenAICompatProvider('mistral', SPEC);
export default mistralProvider;
