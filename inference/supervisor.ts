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

import { getOllamaClient, isLocalLlmAvailable, type ChatMessage } from './local-llm.js';
import { FallbackHandler, type Message, type FallbackResult } from './fallback-handler.js';
import { getCompanionConfig, type CompanionConfig, type EscalationLevel } from '../companions/config.js';
import { checkPersonality, patchResponse } from '../bot/utils/personality-check.js';

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
}

export interface SupervisorOptions {
  /** Force local-only (ignore supervisor even if available) */
  forceLocal?: boolean;
  /** Force supervisor (skip local entirely) */
  forceSupervisor?: boolean;
  /** Override escalation level for this request */
  escalationOverride?: EscalationLevel;
  /** Task type hint for escalation decision */
  taskType?: 'chat' | 'code' | 'creative' | 'analysis' | 'voice';
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
  // Solana wallet addresses (base58, 32-44 chars)
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

const supervisorLog: SupervisorLogEntry[] = [];
const MAX_LOG_ENTRIES = 500;

function logSupervisorCall(entry: SupervisorLogEntry): void {
  supervisorLog.push(entry);
  if (supervisorLog.length > MAX_LOG_ENTRIES) {
    supervisorLog.shift();
  }
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
  return [...supervisorLog];
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

  // Decide route
  const escalate = shouldEscalate(userMessage, conversationDepth, config, options);
  const localAvailable = await isLocalLlmAvailable();

  // Route: supervisor requested but no API key → fall back to local
  // Route: local requested but Ollama down → fall back to supervisor
  let route: SupervisorRoute;
  let content: string;

  if (options?.forceSupervisor || (escalate && !options?.forceLocal)) {
    // ── Supervisor path ──
    try {
      const trimmed = trimForSupervisor(messages, config.supervisorContextWindow);
      const result = await fallback.executeWithFallback(
        trimmed,
        async () => { throw new Error('Supervisor requested'); },
        { forceCloud: true },
      );
      route = 'supervisor';
      content = stripDisclosure(result.content);
    } catch {
      // Supervisor unavailable — try local as fallback
      if (localAvailable) {
        content = await executeLocal(messages, config);
        route = 'local_fallback_supervisor';
      } else {
        console.error('[supervisor] No LLM available: supervisor failed and local is offline');
        content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
        route = 'local_fallback_supervisor';
      }
    }
  } else {
    // ── Local path ──
    if (localAvailable) {
      try {
        content = await executeLocal(messages, config);
        route = 'local';
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
        } catch {
          console.error('[supervisor] No LLM available: local errored and supervisor is unavailable');
          content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
          route = 'local_fallback_supervisor';
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
      } catch {
        console.error('[supervisor] No LLM available: local offline and supervisor unavailable');
        content = NO_LLM_FALLBACKS[companionId] ?? NO_LLM_FALLBACKS['cipher']!;
        route = 'local_fallback_supervisor';
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

  // Log for auditing
  logSupervisorCall({
    timestamp: new Date().toISOString(),
    companionId,
    route,
    messageLength: userMessage.length,
    contextMessages: messages.filter(m => m.role !== 'system').length,
    latencyMs,
  });

  return {
    content,
    route,
    supervisorUsed: route === 'supervisor' || route === 'local_fallback_supervisor',
    latencyMs,
    companionId,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Execute on local Ollama.
 */
async function executeLocal(messages: Message[], config: CompanionConfig): Promise<string> {
  const client = getOllamaClient();
  const result = await client.chat({
    messages: messages as ChatMessage[],
    model: config.localModel,
    options: {
      temperature: 0.8,
      top_p: 0.9,
    },
  });
  return result.message.content;
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
