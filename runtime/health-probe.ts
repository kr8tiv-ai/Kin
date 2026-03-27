/**
 * Health Probe - KIN Platform health check system
 *
 * Checks all KIN services (LLM, STT, TTS, database, APIs)
 * and returns a structured health report for console or Telegram.
 *
 * @module runtime/health-probe
 */

import { existsSync } from 'fs';
import { isLocalLlmAvailable } from '../inference/local-llm.js';
import { getSupervisorInfo } from '../inference/supervisor.js';
import { isWhisperCppAvailable } from '../voice/local-stt.js';
import { isXttsAvailable, isPiperAvailable } from '../voice/local-tts.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthStatus {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

// ============================================================================
// Individual Checks
// ============================================================================

async function checkLlm(): Promise<HealthStatus> {
  try {
    const available = await isLocalLlmAvailable();
    if (available) {
      return { name: 'llm', status: 'ok', detail: 'Ollama running' };
    }
    // Local unavailable — check if cloud fallback keys exist
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    if (hasOpenAI || hasAnthropic) {
      return { name: 'llm', status: 'warn', detail: 'Using cloud LLM (Ollama offline)' };
    }
    return { name: 'llm', status: 'error', detail: 'No LLM available' };
  } catch {
    return { name: 'llm', status: 'error', detail: 'LLM check failed' };
  }
}

async function checkStt(): Promise<HealthStatus> {
  try {
    const available = await isWhisperCppAvailable();
    if (available) {
      return { name: 'stt', status: 'ok', detail: 'whisper.cpp ready' };
    }
    // No local STT — cloud fallback is implicit
    return { name: 'stt', status: 'warn', detail: 'Using cloud STT' };
  } catch {
    return { name: 'stt', status: 'warn', detail: 'Using cloud STT' };
  }
}

async function checkTts(): Promise<HealthStatus> {
  try {
    const [xtts, piper] = await Promise.all([
      isXttsAvailable(),
      isPiperAvailable(),
    ]);
    if (xtts) {
      return { name: 'tts', status: 'ok', detail: 'XTTS voice cloning ready' };
    }
    if (piper) {
      return { name: 'tts', status: 'ok', detail: 'Piper TTS ready' };
    }
    return { name: 'tts', status: 'warn', detail: 'Using cloud TTS' };
  } catch {
    return { name: 'tts', status: 'warn', detail: 'Using cloud TTS' };
  }
}

function checkSupervisor(): HealthStatus {
  const info = getSupervisorInfo();
  if (info.configured) {
    const level = process.env.SUPERVISOR_ESCALATION ?? 'medium';
    return {
      name: 'supervisor',
      status: 'ok',
      detail: `${info.provider} configured (escalation: ${level})`,
    };
  }
  return {
    name: 'supervisor',
    status: 'warn',
    detail: 'No API key (local-only mode)',
  };
}

function checkSearch(): HealthStatus {
  if (process.env.TAVILY_API_KEY) {
    return { name: 'search', status: 'ok', detail: 'Tavily configured' };
  }
  return { name: 'search', status: 'error', detail: 'Not configured' };
}

function checkDatabase(): HealthStatus {
  const dbPath = process.env.DATABASE_PATH || './data/kin.db';
  if (existsSync(dbPath)) {
    return { name: 'database', status: 'ok', detail: 'Database ready' };
  }
  return { name: 'database', status: 'error', detail: `Database not found at ${dbPath}` };
}

function checkTailscale(): HealthStatus {
  if (process.env.TAILSCALE_API_KEY) {
    return { name: 'tailscale', status: 'ok', detail: 'Tailscale configured' };
  }
  return { name: 'tailscale', status: 'warn', detail: 'Tailscale not configured' };
}

function checkBot(): HealthStatus {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return { name: 'bot', status: 'ok', detail: 'Token configured' };
  }
  return { name: 'bot', status: 'error', detail: 'Token not set' };
}

// ============================================================================
// Main Probe
// ============================================================================

/**
 * Run all platform health checks in parallel.
 * Returns an array of HealthStatus results.
 */
export async function checkPlatformHealth(): Promise<HealthStatus[]> {
  const [llm, stt, tts] = await Promise.all([
    checkLlm(),
    checkStt(),
    checkTts(),
  ]);

  // Synchronous checks run inline
  const supervisor = checkSupervisor();
  const search = checkSearch();
  const database = checkDatabase();
  const tailscale = checkTailscale();
  const bot = checkBot();

  return [llm, supervisor, stt, tts, search, database, tailscale, bot];
}

// ============================================================================
// Console Formatter
// ============================================================================

/** Format health results for terminal/console logging */
export function formatHealthForConsole(results: HealthStatus[]): string {
  const icon = (s: HealthStatus['status']): string => {
    if (s === 'ok') return '\u2713';   // checkmark
    if (s === 'warn') return '\u26A0'; // warning
    return '\u2717';                    // x-mark
  };

  const lines = results.map(
    (r) => `  ${icon(r.status)} ${r.name.padEnd(12)} ${r.detail}`,
  );

  return ['KIN Health Report', '='.repeat(40), ...lines].join('\n');
}

// ============================================================================
// Telegram Formatter
// ============================================================================

/** Friendly names and emoji for each service */
const FRIENDLY_MAP: Record<string, { emoji: string; label: string }> = {
  llm:        { emoji: '\uD83E\uDDE0', label: 'Brain' },
  supervisor: { emoji: '\uD83C\uDF93', label: 'Supervisor' },
  stt:        { emoji: '\uD83C\uDF99\uFE0F', label: 'Ears' },
  tts:        { emoji: '\uD83D\uDDE3\uFE0F', label: 'Voice' },
  search:     { emoji: '\uD83D\uDD0D', label: 'Search' },
  database:   { emoji: '\uD83D\uDCBE', label: 'Memory' },
  tailscale:  { emoji: '\uD83C\uDF10', label: 'Network' },
  bot:        { emoji: '\uD83E\uDD16', label: 'Bot' },
};

const STATUS_EMOJI: Record<HealthStatus['status'], string> = {
  ok:    '\u2705',
  warn:  '\u26A0\uFE0F',
  error: '\u274C',
};

/** Format health results for Telegram message (non-tech friendly) */
export function formatHealthForTelegram(results: HealthStatus[]): string {
  const lines = results.map((r) => {
    const friendly = FRIENDLY_MAP[r.name] ?? { emoji: '\u2753', label: r.name };
    return `${friendly.emoji} ${friendly.label}: ${STATUS_EMOJI[r.status]} ${r.detail}`;
  });

  return ['\uD83E\uDE7A KIN Health Report', '', ...lines].join('\n');
}
