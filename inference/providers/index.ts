/**
 * Frontier Provider Registry — Central provider management
 *
 * Registers all 11 providers (6 frontier + Groq free tier + 4 additional).
 * Provides lookup by provider ID and companion ID.
 *
 * @module inference/providers
 */

import type { FrontierProvider, FrontierProviderId, FrontierModelSpec } from './types.js';
import { openaiProvider } from './openai.js';
import { anthropicProvider } from './anthropic.js';
import { googleProvider } from './google.js';
import { xaiProvider } from './xai.js';
import { moonshotProvider } from './moonshot.js';
import { zaiProvider } from './zai.js';
import { groqProvider } from './groq.js';
import { deepseekProvider } from './deepseek.js';
import { mistralProvider } from './mistral.js';
import { togetherProvider } from './together.js';
import { fireworksProvider } from './fireworks.js';
import { openrouterProvider } from './openrouter.js';

// ============================================================================
// Registry
// ============================================================================

const PROVIDER_REGISTRY = new Map<FrontierProviderId, FrontierProvider>();

// Register all providers
function initializeProviders(): void {
  if (PROVIDER_REGISTRY.size > 0) return; // already initialized

  const providers: FrontierProvider[] = [
    openaiProvider,
    anthropicProvider,
    googleProvider,
    xaiProvider,
    moonshotProvider,
    zaiProvider,
    groqProvider,
    deepseekProvider,
    mistralProvider,
    togetherProvider,
    fireworksProvider,
    openrouterProvider,
  ];

  for (const provider of providers) {
    PROVIDER_REGISTRY.set(provider.id, provider);
  }

  // Log which providers are configured
  const configured = providers.filter(p => p.isConfigured()).map(p => p.id);
  const missing = providers.filter(p => !p.isConfigured()).map(p => p.id);
  console.log(`[providers] Configured: ${configured.join(', ') || 'none'}`);
  if (missing.length > 0) {
    console.log(`[providers] Not configured: ${missing.join(', ')}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get a provider by ID. Auto-initializes on first call.
 */
export function getProvider(id: FrontierProviderId): FrontierProvider | undefined {
  if (PROVIDER_REGISTRY.size === 0) initializeProviders();
  return PROVIDER_REGISTRY.get(id);
}

/**
 * Get all configured providers.
 */
export function getConfiguredProviders(): FrontierProvider[] {
  if (PROVIDER_REGISTRY.size === 0) initializeProviders();
  return Array.from(PROVIDER_REGISTRY.values()).filter(p => p.isConfigured());
}

/**
 * Get all provider specs (for UI display, pricing info, etc.).
 */
export function getAllProviderSpecs(): FrontierModelSpec[] {
  if (PROVIDER_REGISTRY.size === 0) initializeProviders();
  return Array.from(PROVIDER_REGISTRY.values()).map(p => p.spec);
}

/**
 * Check if a specific provider is configured and ready.
 */
export function isProviderReady(id: FrontierProviderId): boolean {
  const provider = getProvider(id);
  return provider?.isConfigured() ?? false;
}

// ============================================================================
// Re-exports
// ============================================================================

export type {
  FrontierProvider,
  FrontierProviderId,
  FrontierModelSpec,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderChatMessage,
} from './types.js';

export { initializeProviders };
