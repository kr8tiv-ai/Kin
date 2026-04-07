/**
 * DeepSeek Provider — DeepSeek R1
 * @module inference/providers/deepseek
 */

import { OpenAICompatProvider } from './openai-compat.js';
import type { FrontierModelSpec } from './types.js';

const SPEC: FrontierModelSpec = {
  providerId: 'deepseek',
  modelId: 'deepseek-r1',
  displayName: 'DeepSeek R1',
  contextWindow: 128_000,
  pricing: { inputPer1M: 0.55, outputPer1M: 2.19 },
  apiBaseUrl: 'https://api.deepseek.com/v1',
  apiKeyEnvVar: 'DEEPSEEK_API_KEY',
};

export const deepseekProvider = new OpenAICompatProvider('deepseek', SPEC);
export default deepseekProvider;
