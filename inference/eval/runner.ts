/**
 * Evaluation Runner — Orchestrates benchmark evaluation of local vs frontier models.
 *
 * Resolves the correct local model per companion via resolveLocalModel(),
 * resolves the frontier provider via getProvider(), executes each benchmark
 * prompt against both, measures latency and tokens, scores quality via
 * heuristic (and optionally LLM judge), and returns structured EvalResult[].
 *
 * Handles graceful degradation:
 * - Ollama unavailable → skip local, record error
 * - Frontier provider not configured → skip frontier, record error
 * - Judge parse failure → fall back to heuristic-only scoring
 *
 * @module inference/eval/runner
 */

import type { BenchmarkPrompt, EvalResult, EvalRunConfig, TaskCategory } from './types.js';
import { DEFAULT_EVAL_CONFIG } from './types.js';
import { getBenchmarkSuite } from './benchmarks.js';
import { scoreHeuristic, scoreWithJudge, computeQualityScore } from './scorer.js';
import type { HeuristicScore, JudgeScore } from './scorer.js';
import { OllamaClient, type ChatResponse } from '../local-llm.js';
import { getCompanionConfig, resolveLocalModel } from '../../companions/config.js';
import { getProvider } from '../providers/index.js';
import type { FrontierProvider, ProviderChatResponse } from '../providers/types.js';

// ============================================================================
// Extended Result Type (internal — tracks errors alongside results)
// ============================================================================

/**
 * A single prompt evaluation result that tracks errors for both providers.
 * The EvalResult for each provider is only present if the call succeeded.
 */
export interface PromptEvalOutcome {
  promptId: string;
  companionId: string;
  localResult: EvalResult | null;
  localError: string | null;
  frontierResult: EvalResult | null;
  frontierError: string | null;
}

// ============================================================================
// Runner
// ============================================================================

/**
 * Run a complete evaluation suite, producing EvalResult[] for all prompts.
 *
 * For each prompt:
 * 1. Resolve the local model name via resolveLocalModel()
 * 2. Resolve the frontier provider via getProvider()
 * 3. Execute local eval (Ollama) with timeout
 * 4. Execute frontier eval with timeout
 * 5. Score both responses (heuristic + optional judge)
 * 6. Return all results (including error-only entries)
 *
 * @param config - Run configuration (which companions, categories, concurrency, etc.)
 * @param ollamaClient - Optional OllamaClient instance (creates default if omitted)
 * @returns Array of EvalResult for every successful evaluation
 */
export async function runEvaluation(
  config: Partial<EvalRunConfig> = {},
  ollamaClient?: OllamaClient,
): Promise<EvalResult[]> {
  const fullConfig: EvalRunConfig = { ...DEFAULT_EVAL_CONFIG, ...config };
  const client = ollamaClient ?? new OllamaClient();

  // Check Ollama availability once up front
  const ollamaAvailable = await client.isAvailable(5000);

  // Collect prompts based on config filters
  const prompts = collectPrompts(fullConfig);
  if (prompts.length === 0) return [];

  // Resolve a judge provider if judge mode is enabled
  let judgeProvider: FrontierProvider | undefined;
  if (fullConfig.runJudge) {
    judgeProvider = findConfiguredJudgeProvider();
  }

  // Process prompts with bounded concurrency
  const results: EvalResult[] = [];
  const batches = chunk(prompts, fullConfig.maxConcurrency);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map((prompt) =>
        evaluatePrompt(prompt, client, ollamaAvailable, judgeProvider, fullConfig.timeoutMs),
      ),
    );

    for (const outcome of batchResults) {
      if (outcome.localResult) results.push(outcome.localResult);
      if (outcome.frontierResult) results.push(outcome.frontierResult);
    }
  }

  return results;
}

/**
 * Run evaluation for a single prompt — useful for targeted testing.
 */
export async function runSingleEval(
  prompt: BenchmarkPrompt,
  ollamaClient?: OllamaClient,
  options: { runJudge?: boolean; timeoutMs?: number } = {},
): Promise<PromptEvalOutcome> {
  const client = ollamaClient ?? new OllamaClient();
  const ollamaAvailable = await client.isAvailable(5000);

  let judgeProvider: FrontierProvider | undefined;
  if (options.runJudge) {
    judgeProvider = findConfiguredJudgeProvider();
  }

  return evaluatePrompt(
    prompt,
    client,
    ollamaAvailable,
    judgeProvider,
    options.timeoutMs ?? DEFAULT_EVAL_CONFIG.timeoutMs,
  );
}

// ============================================================================
// Internal — Prompt Collection
// ============================================================================

/**
 * Collect benchmark prompts matching the run config filters.
 */
function collectPrompts(config: EvalRunConfig): BenchmarkPrompt[] {
  const { companionIds, categories } = config;

  // If specific companions requested, get prompts for each
  if (companionIds.length > 0) {
    const prompts: BenchmarkPrompt[] = [];
    for (const cid of companionIds) {
      if (categories.length > 0) {
        for (const cat of categories) {
          prompts.push(...getBenchmarkSuite(cid, cat));
        }
      } else {
        prompts.push(...getBenchmarkSuite(cid));
      }
    }
    return prompts;
  }

  // No companion filter — get all, optionally filtered by category
  if (categories.length > 0) {
    const prompts: BenchmarkPrompt[] = [];
    for (const cat of categories) {
      prompts.push(...getBenchmarkSuite(null, cat));
    }
    return prompts;
  }

  return getBenchmarkSuite();
}

// ============================================================================
// Internal — Single Prompt Evaluation
// ============================================================================

/**
 * Evaluate a single prompt against both local and frontier models.
 */
async function evaluatePrompt(
  prompt: BenchmarkPrompt,
  ollamaClient: OllamaClient,
  ollamaAvailable: boolean,
  judgeProvider: FrontierProvider | undefined,
  timeoutMs: number,
): Promise<PromptEvalOutcome> {
  const companionId = prompt.companionId ?? 'cipher';
  const companionConfig = getCompanionConfig(companionId);
  const now = new Date().toISOString();

  const outcome: PromptEvalOutcome = {
    promptId: prompt.id,
    companionId,
    localResult: null,
    localError: null,
    frontierResult: null,
    frontierError: null,
  };

  // ── Local evaluation ────────────────────────────────────────────────────
  if (ollamaAvailable) {
    try {
      const localModelName = await resolveLocalModel(companionId, ollamaClient);
      const localEval = await withTimeout(
        evaluateLocal(prompt, ollamaClient, localModelName),
        timeoutMs,
        `Local eval timed out after ${timeoutMs}ms`,
      );

      const heuristic = scoreHeuristic(prompt, localEval.response);
      let judge: JudgeScore | null = null;
      if (judgeProvider) {
        try {
          judge = await scoreWithJudge(prompt, localEval.response, judgeProvider);
        } catch {
          // Judge failed — continue with heuristic only
        }
      }

      outcome.localResult = {
        promptId: prompt.id,
        model: localModelName,
        provider: 'local',
        response: localEval.response,
        latencyMs: localEval.latencyMs,
        tokenCount: localEval.tokenCount,
        heuristicScore: heuristic.overall,
        judgeScore: judge?.overall ?? null,
        qualityScore: computeQualityScore(heuristic, judge),
        evaluatedAt: now,
      };
    } catch (error) {
      outcome.localError = error instanceof Error ? error.message : String(error);
    }
  } else {
    outcome.localError = 'Ollama service unavailable';
  }

  // ── Frontier evaluation ─────────────────────────────────────────────────
  const frontierProvider = getProvider(companionConfig.frontierProvider);

  if (frontierProvider && frontierProvider.isConfigured()) {
    try {
      const frontierEval = await withTimeout(
        evaluateFrontier(prompt, frontierProvider),
        timeoutMs,
        `Frontier eval timed out after ${timeoutMs}ms`,
      );

      const heuristic = scoreHeuristic(prompt, frontierEval.response);
      let judge: JudgeScore | null = null;
      if (judgeProvider && judgeProvider.id !== frontierProvider.id) {
        // Only use judge if it's a different provider (avoid self-judging)
        try {
          judge = await scoreWithJudge(prompt, frontierEval.response, judgeProvider);
        } catch {
          // Judge failed — continue with heuristic only
        }
      }

      outcome.frontierResult = {
        promptId: prompt.id,
        model: frontierEval.model,
        provider: frontierProvider.id,
        response: frontierEval.response,
        latencyMs: frontierEval.latencyMs,
        tokenCount: frontierEval.tokenCount,
        heuristicScore: heuristic.overall,
        judgeScore: judge?.overall ?? null,
        qualityScore: computeQualityScore(heuristic, judge),
        evaluatedAt: now,
      };
    } catch (error) {
      outcome.frontierError = error instanceof Error ? error.message : String(error);
    }
  } else {
    outcome.frontierError = frontierProvider
      ? `Provider ${companionConfig.frontierProvider} not configured (missing API key)`
      : `Unknown provider: ${companionConfig.frontierProvider}`;
  }

  return outcome;
}

// ============================================================================
// Internal — Model-Specific Evaluation
// ============================================================================

interface RawEvalResult {
  response: string;
  latencyMs: number;
  tokenCount: number;
  model: string;
}

/**
 * Execute a single prompt against a local Ollama model.
 */
async function evaluateLocal(
  prompt: BenchmarkPrompt,
  ollamaClient: OllamaClient,
  modelName: string,
): Promise<RawEvalResult> {
  const start = performance.now();

  const chatResponse: ChatResponse = await ollamaClient.chat({
    model: modelName,
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userMessage },
    ],
    stream: false,
  });

  const latencyMs = Math.round(performance.now() - start);

  // Ollama provides token counts in the response metadata
  const inputTokens = chatResponse.prompt_eval_count ?? 0;
  const outputTokens = chatResponse.eval_count ?? 0;
  const responseText = chatResponse.message?.content ?? '';

  return {
    response: responseText,
    latencyMs,
    tokenCount: inputTokens + outputTokens,
    model: modelName,
  };
}

/**
 * Execute a single prompt against a frontier provider.
 */
async function evaluateFrontier(
  prompt: BenchmarkPrompt,
  provider: FrontierProvider,
): Promise<RawEvalResult> {
  const chatResponse: ProviderChatResponse = await provider.chat({
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userMessage },
    ],
  });

  return {
    response: chatResponse.content,
    latencyMs: chatResponse.latencyMs,
    tokenCount: chatResponse.inputTokens + chatResponse.outputTokens,
    model: chatResponse.model,
  };
}

// ============================================================================
// Internal — Helpers
// ============================================================================

/**
 * Find any configured frontier provider to use as an LLM judge.
 * Prefers anthropic > openai > any other configured provider.
 */
function findConfiguredJudgeProvider(): FrontierProvider | undefined {
  const preferred: Array<Parameters<typeof getProvider>[0]> = ['anthropic', 'openai', 'google', 'groq'];

  for (const id of preferred) {
    const provider = getProvider(id);
    if (provider?.isConfigured()) return provider;
  }

  return undefined;
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Split an array into chunks of the given size.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
