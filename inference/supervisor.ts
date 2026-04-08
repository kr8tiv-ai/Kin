/**
 * Supervisor Module - Two-brain architecture for KIN companions
 *
 * Each KIN has a local LLM (fast, private, always-on) and a frontier model
 * supervisor (powerful, cloud-based, on-call). This module decides when to
 * escalate from local to supervisor and handles the routing transparently.
 *
 * Privacy contract:
 * - Conversation history is trimmed before sending to supervisor
 * - Voice audio never leaves the machine (only transcribed text)
 * - Database contents and file paths are never sent
 * - Every supervisor call is logged with timestamp and data size
 *
 * @module inference/supervisor
 */

import { getOllamaClient, isLocalLlmAvailable, type ChatMessage, type OllamaToolCall } from './local-llm.js';
import { WEB_SEARCH_TOOL, ollamaWebSearch, isWebSearchAvailable } from './web-search.js';
import { FallbackHandler, type Message, type FallbackResult } from './fallback-handler.js';
import { getCompanionConfig, type CompanionConfig, type EscalationLevel } from '../companions/config.js';
import { checkPersonality, patchResponse } from '../bot/utils/personality-check.js';
import { getProvider } from './providers/index.js';
import type { FrontierProviderId } from './providers/types.js';
import { getTrajectoryLogger } from './trajectory.js';
import { isProviderHealthy, recordSuccess, recordFailure } from './providers/circuit-breaker.js';
import { getMetricsCollector, type RequestMetric } from './metrics.js';
import { getSupermemoryClient } from './memory/supermemory.js';
import { extractObservations } from './observation-extractor.js';
import { getTrainingDataCollector } from './training-data.js';
import { buildChildSafetyPrompt, isWebSearchBlockedByAge, type AgeBracket } from './child-safety.js';

// In-character fallback messages when no LLM is available at all
const NO_LLM_FALLBACKS: Record<string, string> = {
  cipher: "Hey! My brain's taking a quick nap — the server's a bit overloaded right now. Try again in a moment? I promise I'll be sharper next time! 🐙",
  mischief: "Oops! I tried to think but my circuits are all tangled up right now! Give me a sec to untangle... 🐾✨",
  vortex: "I'm currently recalibrating my neural pathways. Please try again shortly — strategy requires patience. 🐉",
  forge: "My workshop tools need a quick cooldown. Send that again in a minute and I'll be ready to build! 🦄🔧",
  aether: "Even the deepest minds need a moment of stillness. I'm temporarily unavailable — please try again shortly. 🐵💭",
  catalyst: "I'm recharging my energy reserves! Give me just a moment and I'll be back to motivate you even harder! 🌟💪",
};

// ============================================================================
// Types
// ============================================================================

export type SupervisorRoute = 'local' | 'supervisor' | 'local_fallback_supervisor';

export interface SupervisedResult {
  /** The response content */
  content: string;
  /** Which route was taken */
  route: SupervisorRoute;
  /** Whether the supervisor was used */
  supervisorUsed: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Companion that handled the request */
  companionId: string;
  /** Which frontier model was used (null if local or free-tier) */
  frontierModel?: string;
  /** Which provider was used */
  provider?: FrontierProviderId | 'local';
  /** Input tokens consumed (0 for local) */
  inputTokens: number;
  /** Output tokens generated (0 for local) */
  outputTokens: number;
  /** Estimated cost in USD */
  costUsd: number;
}

export type UserTier = 'free' | 'hatchling' | 'elder' | 'hero' | 'nft';

export interface SupervisorOptions {
  /** Force local-only (ignore supervisor even if available) */
  forceLocal?: boolean;
  /** Force supervisor (skip local entirely) */
  forceSupervisor?: boolean;
  /** Override escalation level for this request */
  escalationOverride?: EscalationLevel;
  /** Task type hint for escalation decision */
  taskType?: 'chat' | 'code' | 'creative' | 'analysis' | 'voice';
  /** User's tier — determines frontier vs free model routing */
  userTier?: UserTier;
  /** User ID for trajectory logging */
  userId?: string;
  /** User's privacy mode — 'private' forces local-only, 'shared' enables training data collection */
  privacyMode?: 'private' | 'shared';
  /**
   * Optional SQLite memory fallback — returns string array of memories.
   * Used when Supermemory is unavailable. Entry points that have SQLite
   * access should pass their query function here.
   */
  memoryFallback?: () => Promise<string[]>;
  /**
   * KIN Credits credential — provisioned by PinkBrain subscription.
   * CLI credentials route through the companion's frontier provider;
   * API credentials route through OpenRouter as a fallback.
   */
  kinCredential?: {
    type: 'cli' | 'api';
    credential: string;
    providerId: FrontierProviderId;
  };
  /**
   * User's age bracket for child safety prompt injection.
   * Populated from JWT claims (set by buildJwtPayload in auth.ts).
   * under_13/13_to_17 get safety boundary prompts; adult (or undefined) gets none.
   */
  ageBracket?: AgeBracket;
}

// ============================================================================
// Escalation Logic
// ============================================================================

/** Message length threshold (characters) — longer messages suggest complexity */
const LENGTH_THRESHOLDS: Record<EscalationLevel, number> = {
  low: 800,
  medium: 400,
  high: 200,
  always: 0,
  never: Infinity,
};

/** Conversation depth threshold — deep conversations benefit from supervisor */
const DEPTH_THRESHOLDS: Record<EscalationLevel, number> = {
  low: 20,
  medium: 12,
  high: 6,
  always: 0,
  never: Infinity,
};

/** Universal escalation signals — phrases that suggest the user wants quality */
const ESCALATION_SIGNALS = [
  'think carefully',
  'think about this',
  'this is important',
  'be thorough',
  'in detail',
  'step by step',
  'analyze',
  'compare',
  'pros and cons',
  'help me decide',
  'what do you think',
  'plan',
  'strategy',
  'review',
  'best approach',
  'complex',
];

/**
 * Decide whether a message should be escalated to the supervisor.
 */
export function shouldEscalate(
  message: string,
  conversationDepth: number,
  config: CompanionConfig,
  options?: SupervisorOptions,
): boolean {
  const level = options?.escalationOverride ?? config.escalationLevel;

  // Hard overrides
  if (level === 'always') return true;
  if (level === 'never') return false;
  if (options?.forceLocal) return false;
  if (options?.forceSupervisor) return true;

  const lowerMessage = message.toLowerCase();

  // Check message length against threshold
  if (message.length >= LENGTH_THRESHOLDS[level]!) {
    return true;
  }

  // Check conversation depth
  if (conversationDepth >= DEPTH_THRESHOLDS[level]!) {
    return true;
  }

  // Check universal escalation signals
  for (const signal of ESCALATION_SIGNALS) {
    if (lowerMessage.includes(signal)) {
      return true;
    }
  }

  // Check companion-specific keywords
  for (const keyword of config.escalationKeywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // Check if it's a multi-part question (multiple question marks)
  const questionCount = (message.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    return true;
  }

  return false;
}

// ============================================================================
// Privacy: Context Trimming & Data Sanitization
//
// PRIVACY CONTRACT:
// 1. Only the system prompt + last N messages are sent to the cloud
// 2. PII patterns (emails, phones, wallet addresses, IPs) are redacted
// 3. File paths and database references are stripped
// 4. Voice audio never leaves the device (only transcribed text is sent)
// 5. Every cloud call is logged with timestamp, data size, and redaction count
// ============================================================================

/** Patterns that indicate sensitive data we should redact before cloud send */
const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[email]' },
  // Phone numbers (various formats)
  { pattern: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[phone]' },
  // JWT tokens (header.payload, signature intentionally not required)
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[jwt]' },
  // Bearer tokens in Authorization-style strings
  { pattern: /\bBearer\s+[A-Za-z0-9._~+\/=-]{20,}/g, replacement: '[bearer]' },
  // Database connection strings (postgres, mysql, mongodb, redis)
  { pattern: /\b(postgres|mysql|mongodb|redis):\/\/[^\s]+/gi, replacement: '[db_url]' },
  // Solana wallet addresses (base58, 32-44 chars)
  // NOTE: This pattern may match normal base58 strings of 32-44 chars that are not wallet addresses.
  { pattern: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, replacement: '[wallet]' },
  // Ethereum addresses
  { pattern: /\b0x[a-fA-F0-9]{40}\b/g, replacement: '[wallet]' },
  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[ip]' },
  // File paths (Unix and Windows)
  { pattern: /(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+/g, replacement: '[path]' },
  // API keys / tokens (long hex or base64 strings)
  { pattern: /\b(sk|pk|api|key|token|secret)[-_]?[a-zA-Z0-9]{20,}\b/gi, replacement: '[key]' },
  // Credit card numbers
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[card]' },
  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[ssn]' },
];

/**
 * Redact PII from a single message's content.
 * Returns { sanitized, redactionCount }.
 */
function redactPII(content: string): { sanitized: string; redactionCount: number } {
  let sanitized = content;
  let redactionCount = 0;

  for (const { pattern, replacement } of PII_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      redactionCount += matches.length;
      sanitized = sanitized.replace(pattern, replacement);
    }
  }

  return { sanitized, redactionCount };
}

/**
 * Trim and sanitize messages before sending to the supervisor.
 * Only sends the system prompt + last N messages + the current message.
 * Redacts PII, file paths, and sensitive tokens from all content.
 */
function trimForSupervisor(
  messages: Message[],
  maxHistory: number,
): Message[] {
  const system = messages.find(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  // Keep only the last N non-system messages
  const trimmed = nonSystem.slice(-maxHistory);

  let totalRedactions = 0;
  const sanitized = trimmed.map(m => {
    const { sanitized: clean, redactionCount } = redactPII(m.content);
    totalRedactions += redactionCount;
    return { ...m, content: clean };
  });

  if (totalRedactions > 0) {
    console.log(`[privacy] Redacted ${totalRedactions} PII patterns before supervisor send`);
  }

  const result: Message[] = [];
  if (system) {
    // System prompt is trusted — don't redact companion personality
    result.push(system);
  }
  result.push(...sanitized);

  return result;
}

// ============================================================================
// Supervisor Log
// ============================================================================

interface SupervisorLogEntry {
  timestamp: string;
  companionId: string;
  route: SupervisorRoute;
  messageLength: number;
  contextMessages: number;
  latencyMs: number;
}

// Circular buffer for supervisor log — avoids O(n) Array.shift()
const supervisorLogBuffer: (SupervisorLogEntry | null)[] = new Array(500).fill(null);
let supervisorLogWriteIdx = 0;
let supervisorLogCount = 0;
const MAX_LOG_ENTRIES = 500;

function logSupervisorCall(entry: SupervisorLogEntry): void {
  supervisorLogBuffer[supervisorLogWriteIdx] = entry;
  supervisorLogWriteIdx = (supervisorLogWriteIdx + 1) % MAX_LOG_ENTRIES;
  if (supervisorLogCount < MAX_LOG_ENTRIES) supervisorLogCount++;
  console.log(
    `[supervisor] ${entry.route} | companion=${entry.companionId} | ` +
    `msg=${entry.messageLength}chars | context=${entry.contextMessages}msgs | ` +
    `${entry.latencyMs.toFixed(0)}ms`,
  );
}

/**
 * Get the supervisor call log for auditing.
 */
export function getSupervisorLog(): SupervisorLogEntry[] {
  if (supervisorLogCount < MAX_LOG_ENTRIES) {
    return supervisorLogBuffer.slice(0, supervisorLogCount) as SupervisorLogEntry[];
  }
  // Buffer is full — read from writeIdx (oldest) wrapping around
  return [
    ...supervisorLogBuffer.slice(supervisorLogWriteIdx),
    ...supervisorLogBuffer.slice(0, supervisorLogWriteIdx),
  ] as SupervisorLogEntry[];
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generate a response using the two-brain architecture.
 *
 * Routes between local LLM and frontier model supervisor based on
 * message complexity, conversation depth, and companion configuration.
 */
export async function supervisedChat(
  messages: Message[],
  companionId: string,
  fallback: FallbackHandler,
  options?: SupervisorOptions,
): Promise<SupervisedResult> {
  const start = performance.now();
  const config = getCompanionConfig(companionId);

  // Extract the user's message (last message in array)
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content ?? '';
  const conversationDepth = messages.filter(m => m.role !== 'system').length;

  // ── Centralized memory injection ──
  // All entry points (Telegram, web, Discord, WhatsApp, voice) get consistent
  // memory context without duplicating Supermemory/SQLite logic.
  const userId = options?.userId;
  if (userId) {
    let memoryBlock = '';
    const supermemory = getSupermemoryClient();
    if (supermemory) {
      try {
        const memories = await supermemory.searchMemories(userMessage, userId, companionId, 10);
        if (memories.length > 0) {
          memoryBlock = `\n\nYou remember these things about the user:\n${memories.map(m => `- ${m.content}`).join('\n')}`;
        }
      } catch {
        // Supermemory failed — try SQLite fallback
        if (options?.memoryFallback) {
          try {
            const raw = await options.memoryFallback();
            if (raw.length > 0) {
              memoryBlock = `\n\nYou remember these things about the user:\n${raw.map(m => `- ${m}`).join('\n')}`;
            }
          } catch { /* no memories available */ }
        }
      }
    } else if (options?.memoryFallback) {
      // No Supermemory configured — use SQLite fallback directly
      try {
        const raw = await options.memoryFallback();
        if (raw.length > 0) {
          memoryBlock = `\n\nYou remember these things about the user:\n${raw.map(m => `- ${m}`).join('\n')}`;
        }
      } catch { /* no memories available */ }
    }

    // Inject memory block into system message
    if (memoryBlock) {
      const systemIdx = messages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0) {
        messages[systemIdx] = {
          ...messages[systemIdx]!,
          content: messages[systemIdx]!.content + memoryBlock,
        };
      }
    }
  }

  // ── Child safety prompt injection ──
  // Inject age-appropriate safety boundaries into the system message for child/teen accounts.
  // Must happen before routing so both local and frontier paths see the safety prompt.
  const ageBracket = options?.ageBracket ?? 'adult';
  if (ageBracket !== 'adult') {
    const safetyPrompt = buildChildSafetyPrompt(ageBracket);
    if (safetyPrompt) {
      const systemIdx = messages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0) {
        messages[systemIdx] = {
          ...messages[systemIdx]!,
          content: messages[systemIdx]!.content + '\n\n' + safetyPrompt,
        };
      }
      console.log(`[supervisor] Child safety prompt injected for ageBracket=${ageBracket}`);
    }
  }

  // ── Privacy enforcement ──
  // Undefined privacyMode defaults to 'private' (safe default — opt-in to shared)
  const privacyMode = options?.privacyMode ?? 'private';
  if (privacyMode === 'private') {
    if (options) {
      options.forceLocal = true;
    } else {
      options = { forceLocal: true };
    }
    console.log(`[supervisor] Privacy mode: ${privacyMode}, enforcing local-only`);
  }

  // Decide route
  const escalate = shouldEscalate(userMessage, conversationDepth, config, options);
  const localAvailable = await isLocalLlmAvailable();

  // Route: supervisor requested but no API key → fall back to local
  // Route: local requested but Ollama down → fall back to supervisor
  let route: SupervisorRoute = 'local_fallback_supervisor';
  let content: string = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;

  // Determine if user qualifies for frontier model
  const userTier = options?.userTier ?? 'free';
  const hasFrontierAccess = userTier !== 'free';
  let frontierModel: string | undefined;
  let usedProvider: FrontierProviderId | 'local' | undefined;
  // Track real token counts + cost from provider responses
  let trackedInputTokens = 0;
  let trackedOutputTokens = 0;
  let trackedCostUsd = 0;

  if (options?.forceSupervisor || (escalate && !options?.forceLocal)) {
    // ── Supervisor path ──

    // Try companion-specific frontier model first (for paid/NFT users)
    if (hasFrontierAccess) {
      const frontier = getProvider(config.frontierProvider);
      if (frontier?.isConfigured() && isProviderHealthy(config.frontierProvider)) {
        try {
          const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
          const result = await frontier.chat({
            messages: trimmed,
            maxTokens: 4096,
            temperature: 0.8,
          });
          route = 'supervisor';
          content = result.content;
          frontierModel = config.frontierModelId;
          usedProvider = config.frontierProvider;
          trackedInputTokens = result.inputTokens;
          trackedOutputTokens = result.outputTokens;
          // Calculate cost from actual tokens + provider pricing
          const pricing = frontier.spec.pricing;
          trackedCostUsd = (result.inputTokens / 1_000_000) * pricing.inputPer1M
                         + (result.outputTokens / 1_000_000) * pricing.outputPer1M;
          recordSuccess(config.frontierProvider);
          console.log(
            `[supervisor] Frontier ${config.frontierModelName} | ` +
            `${result.inputTokens}in/${result.outputTokens}out | ` +
            `$${trackedCostUsd.toFixed(4)} | ${result.latencyMs.toFixed(0)}ms`,
          );
        } catch (err) {
          recordFailure(config.frontierProvider);
          console.warn(`[supervisor] Frontier ${config.frontierProvider} failed, falling back to waterfall:`, err);
          // Fall through to legacy fallback below
          frontierModel = undefined;
          usedProvider = undefined;
        }
      }
    }

    // ── KIN Credits path (PinkBrain-provisioned credentials) ──
    // CLI credential → route through companion's frontier provider with override key.
    // API credential → route through OpenRouter with override key.
    if (!frontierModel && options?.kinCredential) {
      const kc = options.kinCredential;
      const targetProviderId: FrontierProviderId = kc.type === 'cli' ? kc.providerId : 'openrouter';
      const provider = getProvider(targetProviderId);
      if (provider) {
        try {
          const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
          const result = await provider.chat({
            messages: trimmed,
            maxTokens: 4096,
            temperature: 0.8,
            apiKeyOverride: kc.credential,
          });
          route = 'supervisor';
          content = result.content;
          frontierModel = provider.spec.modelId;
          usedProvider = targetProviderId;
          trackedInputTokens = result.inputTokens;
          trackedOutputTokens = result.outputTokens;
          const pricing = provider.spec.pricing;
          trackedCostUsd = (result.inputTokens / 1_000_000) * pricing.inputPer1M
                         + (result.outputTokens / 1_000_000) * pricing.outputPer1M;
          recordSuccess(targetProviderId);
          const pathLabel = kc.type === 'cli' ? `CLI via ${targetProviderId}` : `API fallback via openrouter`;
          console.log(
            `[supervisor] KIN Credits ${pathLabel} | ` +
            `${result.inputTokens}in/${result.outputTokens}out | ` +
            `$${trackedCostUsd.toFixed(4)} | ${result.latencyMs.toFixed(0)}ms`,
          );
        } catch (err) {
          recordFailure(targetProviderId);
          const pathLabel = kc.type === 'cli' ? 'CLI' : 'API';
          console.warn(`[supervisor] KIN Credits ${pathLabel} via ${targetProviderId} failed, falling back to waterfall:`, err);
          // If CLI failed, try API fallback through OpenRouter before hitting free waterfall
          if (kc.type === 'cli') {
            const openrouter = getProvider('openrouter');
            if (openrouter) {
              try {
                const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
                const result = await openrouter.chat({
                  messages: trimmed,
                  maxTokens: 4096,
                  temperature: 0.8,
                  apiKeyOverride: kc.credential,
                });
                route = 'supervisor';
                content = result.content;
                frontierModel = openrouter.spec.modelId;
                usedProvider = 'openrouter';
                trackedInputTokens = result.inputTokens;
                trackedOutputTokens = result.outputTokens;
                const pricing = openrouter.spec.pricing;
                trackedCostUsd = (result.inputTokens / 1_000_000) * pricing.inputPer1M
                               + (result.outputTokens / 1_000_000) * pricing.outputPer1M;
                recordSuccess('openrouter');
                console.log(
                  `[supervisor] KIN Credits API fallback via openrouter | ` +
                  `${result.inputTokens}in/${result.outputTokens}out | ` +
                  `$${trackedCostUsd.toFixed(4)} | ${result.latencyMs.toFixed(0)}ms`,
                );
              } catch (orErr) {
                recordFailure('openrouter');
                console.warn('[supervisor] KIN Credits OpenRouter fallback also failed:', orErr);
                // Fall through to legacy waterfall
              }
            }
          }
        }
      }
    }

    // If frontier didn't handle it, use legacy fallback waterfall (Groq free tier)
    if (!frontierModel) {
      try {
        const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
        const result = await fallback.executeWithFallback(
          trimmed,
          async () => { throw new Error('Supervisor requested'); },
          { forceCloud: true },
        );
        route = route || 'supervisor';
        content = content || stripDisclosure(result.content);
        usedProvider = usedProvider || (result.routing.provider as FrontierProviderId) || 'groq';
      } catch {
        // Supervisor unavailable — try local as fallback
        if (localAvailable) {
          content = await executeLocal(messages, config, privacyMode);
          route = 'local_fallback_supervisor';
          usedProvider = 'local';
        } else {
          console.error('[supervisor] No LLM available: supervisor failed and local is offline');
          content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
          route = 'local_fallback_supervisor';
          usedProvider = 'local';
        }
      }
    }
  } else {
    // ── Local path ──
    if (localAvailable) {
      try {
        content = await executeLocal(messages, config, privacyMode);
        route = 'local';
        usedProvider = 'local';
      } catch {
        // Local errored — try supervisor as safety net
        try {
          const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
          const result = await fallback.executeWithFallback(
            trimmed,
            async () => { throw new Error('Local failed'); },
            { taskType: 'simple' },
          );
          route = 'local_fallback_supervisor';
          content = stripDisclosure(result.content);
          usedProvider = (result.routing.provider as FrontierProviderId) || 'groq';
        } catch {
          console.error('[supervisor] No LLM available: local errored and supervisor is unavailable');
          content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
          route = 'local_fallback_supervisor';
          usedProvider = 'local';
        }
      }
    } else {
      // Local offline — use supervisor even though not explicitly escalated
      try {
        const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
        const result = await fallback.executeWithFallback(
          trimmed,
          async () => { throw new Error('Local unavailable'); },
          { taskType: 'simple' },
        );
        route = 'local_fallback_supervisor';
        content = stripDisclosure(result.content);
        usedProvider = (result.routing.provider as FrontierProviderId) || 'groq';
      } catch {
        console.error('[supervisor] No LLM available: local offline and supervisor unavailable');
        content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
        route = 'local_fallback_supervisor';
        usedProvider = 'local';
      }
    }
  }

  // ── Personality validation ──
  const personalityCheck = checkPersonality(content, companionId);
  if (!personalityCheck.passed) {
    console.warn(
      `[personality] BLOCKED for ${companionId}: ${personalityCheck.issues.join('; ')}`,
    );
    content = patchResponse(content, companionId);
  } else if (personalityCheck.severity === 'warn') {
    console.warn(
      `[personality] WARN for ${companionId}: ${personalityCheck.issues.join('; ')}`,
    );
  }

  const latencyMs = performance.now() - start;

  // ── Training data collection ──
  // Only collect when privacy mode is 'shared' AND the response came from the frontier (supervisor route).
  // Fire-and-forget — errors are swallowed by the collector.
  if (privacyMode === 'shared' && route === 'supervisor') {
    const systemPrompt = messages[0]?.role === 'system' ? messages[0].content : '';
    getTrainingDataCollector().collect({
      userId: userId ?? 'unknown',
      companionId,
      privacyMode,
      systemPrompt,
      userMessage,
      assistantResponse: content,
      route,
      provider: (usedProvider ?? 'unknown') as string,
      model: frontierModel ?? config.localModel,
      latencyMs,
    }).catch(() => {});
  }

  // Log for auditing
  logSupervisorCall({
    timestamp: new Date().toISOString(),
    companionId,
    route,
    messageLength: userMessage.length,
    contextMessages: messages.filter(m => m.role !== 'system').length,
    latencyMs,
  });

  // Extract observations from the conversation (zero-cost heuristics, no LLM)
  const observations = extractObservations(userMessage, content, companionId);

  // Store interaction in Supermemory (fire-and-forget — non-blocking)
  if (userId) {
    getSupermemoryClient()?.addMemory(
      `User: "${userMessage.slice(0, 300)}" | Companion: "${content.slice(0, 500)}"`,
      userId,
      companionId,
    ).catch(() => {});

    // Store high-confidence observations as discrete memories
    const supermemory = getSupermemoryClient();
    for (const obs of observations.filter(o => o.confidence >= 0.7)) {
      supermemory?.addMemory(
        `[${obs.type}] ${obs.content}`,
        userId,
        companionId,
      ).catch(() => {});
    }
  }

  // Record inference metrics (in-memory, synchronous — no async overhead)
  const metricsProvider = usedProvider ?? 'local';
  const metricsModel = frontierModel ?? config.localModel;
  const isSuccess = content !== (NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!);
  getMetricsCollector().record({
    requestId: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    provider: metricsProvider,
    model: metricsModel,
    latencyMs,
    inputTokens: trackedInputTokens,
    outputTokens: trackedOutputTokens,
    success: isSuccess,
    costUsd: trackedCostUsd,
    route: route === 'local' ? 'local' : 'fallback',
  });

  // Trajectory persistence (fire-and-forget — non-blocking)
  getTrajectoryLogger().log({
    userId: options?.userId ?? 'unknown',
    companionId,
    provider: usedProvider ?? 'local',
    model: frontierModel ?? config.localModel,
    route,
    userMessageLength: userMessage.length,
    responseLength: content.length,
    inputTokens: trackedInputTokens,
    outputTokens: trackedOutputTokens,
    latencyMs,
    costUsd: trackedCostUsd,
    observations,
  }).catch(() => {});

  return {
    content,
    route,
    supervisorUsed: route === 'supervisor' || route === 'local_fallback_supervisor',
    latencyMs,
    companionId,
    frontierModel,
    provider: usedProvider,
    inputTokens: trackedInputTokens,
    outputTokens: trackedOutputTokens,
    costUsd: trackedCostUsd,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Maximum tool-call loop iterations to prevent infinite loops */
const MAX_TOOL_CALL_ITERATIONS = 3;

/**
 * Execute on local Ollama, with optional web search tool-calling support.
 *
 * When web search is available (OLLAMA_API_KEY set + non-private mode),
 * passes the web_search tool definition so the model can request searches.
 * Handles the tool-call response loop with a cap of 3 iterations.
 */
async function executeLocal(
  messages: Message[],
  config: CompanionConfig,
  privacyMode?: string,
): Promise<string> {
  const client = getOllamaClient();
  const webSearchEnabled = isWebSearchAvailable(privacyMode);
  const apiKey = process.env.OLLAMA_API_KEY ?? '';

  let chatMessages = messages as ChatMessage[];
  let toolCallCount = 0;

  for (let iteration = 0; iteration <= MAX_TOOL_CALL_ITERATIONS; iteration++) {
    const result = await client.chat({
      messages: chatMessages,
      model: config.localModel,
      options: {
        temperature: 0.8,
        top_p: 0.9,
      },
      ...(webSearchEnabled ? { tools: [WEB_SEARCH_TOOL] } : {}),
    });

    // If no tool calls, return the content directly
    if (!result.message.tool_calls || result.message.tool_calls.length === 0) {
      if (toolCallCount > 0) {
        console.log(`[supervisor] Tool-call loop completed after ${toolCallCount} call(s)`);
      }
      return result.message.content;
    }

    // Cap iterations — return whatever content we have
    if (iteration >= MAX_TOOL_CALL_ITERATIONS) {
      console.warn(`[supervisor] Tool-call loop hit max iterations (${MAX_TOOL_CALL_ITERATIONS}), returning partial content`);
      return result.message.content;
    }

    // Process tool calls — append assistant message with tool_calls, then tool responses
    chatMessages = [
      ...chatMessages,
      { role: 'assistant' as const, content: result.message.content || '', tool_calls: result.message.tool_calls },
    ];

    for (const toolCall of result.message.tool_calls) {
      const toolResponse = await handleToolCall(toolCall, apiKey, webSearchEnabled);
      chatMessages = [
        ...chatMessages,
        { role: 'tool' as const, content: toolResponse },
      ];
      toolCallCount++;
    }
  }

  // Should not reach here — the loop returns in all paths above
  return '';
}

/**
 * Handle a single tool call from the model.
 * Returns the string content to send back as a tool-role message.
 */
async function handleToolCall(
  toolCall: OllamaToolCall,
  apiKey: string,
  webSearchEnabled: boolean,
): Promise<string> {
  const { name, arguments: args } = toolCall.function;

  if (name !== 'web_search') {
    // Unknown tool — ignore gracefully
    console.warn(`[supervisor] Model requested unknown tool: ${name}`);
    return `Tool '${name}' is not available.`;
  }

  const query = typeof args?.query === 'string' ? args.query : String(args?.query ?? '');

  // If web search is not actually available (API key missing), tell the model
  if (!webSearchEnabled || !apiKey) {
    console.log(`[web-search] Requested but not available (no API key or private mode)`);
    return 'Web search is not available. Please answer based on your training data.';
  }

  // Execute the search
  const start = performance.now();
  try {
    const result = await ollamaWebSearch(query, apiKey);
    const latencyMs = performance.now() - start;
    console.log(`[web-search] query="${query}" results=${result.results.length} latencyMs=${latencyMs.toFixed(0)}`);

    if (result.results.length === 0) {
      return 'No search results found for the query.';
    }

    // Format results for the model
    const formatted = result.results
      .slice(0, 5) // Limit to top 5 results to avoid context bloat
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
      .join('\n\n');

    return `Web search results for "${query}":\n\n${formatted}`;
  } catch (err) {
    const latencyMs = performance.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[web-search] Failed: query="${query}" error="${errMsg}" latencyMs=${latencyMs.toFixed(0)}`);
    return 'Web search failed. Please answer based on your training data.';
  }
}

/**
 * Strip the fallback handler's disclosure prefix.
 * The supervisor module handles its own disclosure via the log,
 * so we don't need the fallback handler's "Using cloud..." messages.
 */
function stripDisclosure(content: string): string {
  // Remove common disclosure prefixes
  const patterns = [
    /^⚠️ Local model unavailable\. Using cloud \([^)]+\) for this request\.\n\n/,
    /^⏱️ Local model timed out\. Switching to cloud \([^)]+\)\.\n\n/,
    /^❌ Local model error\. Falling back to cloud \([^)]+\)\.\n\n/,
    /^☁️ This task requires cloud capabilities\. Using [^.]+\.\n\n/,
    /^☁️ Using cloud model \([^)]+\) as requested\.\n\n/,
  ];
  for (const pattern of patterns) {
    content = content.replace(pattern, '');
  }
  return content;
}

// ============================================================================
// Convenience: Check Supervisor Availability
// ============================================================================

/**
 * Check if a supervisor (frontier model) is configured and reachable.
 */
export function isSupervisorConfigured(): boolean {
  return !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Get the configured supervisor provider and model info.
 */
export function getSupervisorInfo(): { provider: string; configured: boolean } {
  const provider = process.env.SUPERVISOR_PROVIDER ?? (process.env.GROQ_API_KEY ? 'groq' : 'anthropic');
  const key = provider === 'groq'
    ? process.env.GROQ_API_KEY
    : provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  return { provider, configured: !!key };
}
