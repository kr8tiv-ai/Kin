/**
 * Ollama Web Search — Tool-calling integration for local model web access
 *
 * Provides the tool definition and HTTP client for Ollama's hosted web search
 * and web fetch APIs. Gated behind OLLAMA_API_KEY + privacy mode (K012 two-gate
 * pattern) so local models can augment responses with real-time information
 * only when explicitly permitted.
 *
 * @module inference/web-search
 */

import { fetchWithTimeout } from './retry.js';
import type { OllamaTool } from './local-llm.js';

// ============================================================================
// Constants
// ============================================================================

const OLLAMA_WEB_SEARCH_URL = 'https://ollama.com/api/web_search';
const OLLAMA_WEB_FETCH_URL = 'https://ollama.com/api/web_fetch';
const WEB_SEARCH_TIMEOUT_MS = 15_000;

// ============================================================================
// Types
// ============================================================================

export interface WebSearchResult {
  results: Array<{
    title: string;
    url: string;
    content: string;
  }>;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Tool definition object passed to Ollama's /api/chat `tools` array.
 * Tells the model it can call `web_search` with a query string.
 */
export const WEB_SEARCH_TOOL: OllamaTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for current information',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
      },
      required: ['query'],
    },
  },
};

// ============================================================================
// Privacy Gate
// ============================================================================

/**
 * Two-gate check (K012): web search is available only when:
 * 1. OLLAMA_API_KEY env var is set
 * 2. privacyMode is NOT 'private'
 *
 * Both gates must pass independently.
 */
export function isWebSearchAvailable(privacyMode: string | undefined): boolean {
  const hasApiKey = !!process.env.OLLAMA_API_KEY;
  const isNotPrivate = privacyMode !== 'private';
  return hasApiKey && isNotPrivate;
}

// ============================================================================
// Web Search Client
// ============================================================================

/**
 * Call Ollama's hosted web search API.
 *
 * @param query   Search query string
 * @param apiKey  Ollama API key (Bearer auth)
 * @returns       Parsed search results
 * @throws        On non-200 response or network error (caller should catch)
 */
export async function ollamaWebSearch(
  query: string,
  apiKey: string,
): Promise<WebSearchResult> {
  const response = await fetchWithTimeout(
    OLLAMA_WEB_SEARCH_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
    },
    WEB_SEARCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Ollama web search failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Defensive: ensure results is an array even if API returns unexpected shape
  return {
    results: Array.isArray(data?.results) ? data.results : [],
  };
}

/**
 * Fetch a URL's content via Ollama's hosted web fetch API.
 *
 * @param url     URL to fetch
 * @param apiKey  Ollama API key (Bearer auth)
 * @returns       Fetched content as string
 * @throws        On non-200 response or network error
 */
export async function ollamaWebFetch(
  url: string,
  apiKey: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    OLLAMA_WEB_FETCH_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url }),
    },
    WEB_SEARCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Ollama web fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  return typeof data?.content === 'string' ? data.content : '';
}
