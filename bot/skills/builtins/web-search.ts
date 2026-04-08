/**
 * Web Search Skill - Searches the web using Tavily API
 *
 * Tavily provides a search API optimized for LLM consumption.
 * Free tier: 1000 searches/month.
 * https://tavily.com
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import { fetchWithTimeout } from '../../../inference/retry.js';

const TAVILY_BASE = 'https://api.tavily.com';

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
  query: string;
}

/**
 * Extract search query from user message.
 */
function extractQuery(message: string): string | null {
  const lower = message.toLowerCase();

  // "search for X", "search X"
  const searchFor = lower.match(/search\s+(?:for\s+)?["']?(.+?)["']?\s*$/i);
  if (searchFor?.[1]) return searchFor[1].trim();

  // "look up X", "lookup X"
  const lookUp = lower.match(/look\s*up\s+["']?(.+?)["']?\s*$/i);
  if (lookUp?.[1]) return lookUp[1].trim();

  // "google X", "find info on X"
  const google = lower.match(/(?:google|find\s+(?:info|information)\s+(?:on|about))\s+["']?(.+?)["']?\s*$/i);
  if (google?.[1]) return google[1].trim();

  // "what is X" / "who is X" (only if message starts with these)
  const whatIs = lower.match(/^(?:what|who|where|when|how)\s+(?:is|are|was|were|do|does|did)\s+(.+?)\??$/i);
  if (whatIs?.[1] && lower.includes('search')) return whatIs[1].trim();

  return null;
}

/**
 * Call Tavily search API.
 */
async function tavilySearch(query: string, apiKey: string, maxResults = 5): Promise<TavilyResponse> {
  const response = await fetchWithTimeout(`${TAVILY_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: maxResults,
      include_answer: true,
    }),
  }, 15_000);

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Tavily API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<TavilyResponse>;
}

/**
 * Format search results for display.
 */
function formatResults(data: TavilyResponse): string {
  const lines: string[] = [];

  lines.push(`🔍 Search: "${data.query}"\n`);

  if (data.answer) {
    lines.push(`**Summary:** ${data.answer}\n`);
  }

  if (data.results.length > 0) {
    lines.push('**Top Results:**');
    for (const r of data.results.slice(0, 5)) {
      const snippet = r.content.length > 150
        ? r.content.slice(0, 150) + '...'
        : r.content;
      lines.push(`• **${r.title}**`);
      lines.push(`  ${snippet}`);
      lines.push(`  ${r.url}\n`);
    }
  } else {
    lines.push('No results found.');
  }

  return lines.join('\n');
}

export const webSearchSkill: KinSkill = {
  name: 'web-search',
  description: 'Search the web using Tavily for up-to-date information',
  triggers: [
    'search\\s+(?:for\\s+)?\\S+',
    'look\\s*up\\s+\\S+',
    'google\\s+\\S+',
    'find\\s+info\\s+(?:on|about)\\s+\\S+',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const apiKey = ctx.env.TAVILY_API_KEY;

    if (!apiKey) {
      return {
        content: 'Web search is not configured. Set TAVILY_API_KEY in your environment to enable it.',
        type: 'error',
      };
    }

    const query = extractQuery(ctx.message);
    if (!query) {
      return {
        content: 'What would you like me to search for? Try: "search for React server components"',
        type: 'text',
      };
    }

    try {
      const data = await tavilySearch(query, apiKey);
      return {
        content: formatResults(data),
        type: 'markdown',
        metadata: {
          query: data.query,
          resultCount: data.results.length,
          hasAnswer: !!data.answer,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: `Search failed: ${msg}`,
        type: 'error',
      };
    }
  },
};

export default webSearchSkill;
