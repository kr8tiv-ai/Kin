/**
 * Browser Skill — Browse websites, extract content, and take screenshots.
 *
 * Uses the BrowserManager singleton (headless Chrome via Puppeteer) to
 * navigate to user-provided URLs, extract structured content, and return
 * a markdown summary. SSRF-safe URL validation blocks internal networks.
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';
import { getBrowserManager, validateUrl } from '../../../inference/browser-manager.js';

// ---------------------------------------------------------------------------
// URL Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first HTTP(S) URL from a message string.
 * Strips trailing punctuation that commonly follows pasted URLs in prose.
 * Returns null if no URL is found.
 */
export function extractUrl(message: string): string | null {
  const match = message.match(/https?:\/\/\S+/i);
  if (!match) return null;

  // Strip trailing sentence punctuation that's almost never part of a URL
  return match[0].replace(/[.,)?!]+$/, '');
}

// ---------------------------------------------------------------------------
// Result Formatting
// ---------------------------------------------------------------------------

function formatBrowseResult(content: {
  title: string;
  description: string;
  text: string;
  url: string;
  loadTimeMs: number;
}): string {
  const lines: string[] = [];

  lines.push(`🌐 **${content.title || 'Untitled Page'}**\n`);

  if (content.description) {
    lines.push(`> ${content.description}\n`);
  }

  if (content.text) {
    // Truncate long content for chat display
    const display =
      content.text.length > 1500
        ? content.text.slice(0, 1500) + '…'
        : content.text;
    lines.push('**Content:**');
    lines.push(display);
    lines.push('');
  }

  // Count markdown-style links in the extracted text
  const linkCount = (content.text.match(/https?:\/\/\S+/gi) || []).length;
  if (linkCount > 0) {
    lines.push(`🔗 ${linkCount} link${linkCount === 1 ? '' : 's'} found`);
  }

  lines.push(`⏱ Loaded in ${content.loadTimeMs}ms`);
  lines.push(`📎 ${content.url}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// BrowserSkill
// ---------------------------------------------------------------------------

export const browserSkill: KinSkill = {
  name: 'browser',
  description: 'Browse websites, extract content, and take screenshots',

  triggers: [
    'browse\\s+https?://\\S+',
    'visit\\s+https?://\\S+',
    'check\\s+(?:this\\s+)?(?:website|site|page|url)\\s+',
    'open\\s+https?://\\S+',
    'what.*(?:on|at)\\s+https?://\\S+',
    'summarize\\s+https?://\\S+',
    'screenshot\\s+https?://\\S+',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    // 1. Extract URL from message
    const url = extractUrl(ctx.message);
    if (!url) {
      return {
        content: 'Please include a URL. Try: "browse https://example.com"',
        type: 'text',
      };
    }

    // 2. Validate URL (SSRF protection)
    const validation = validateUrl(url);
    if (!validation.valid) {
      return {
        content: `Cannot browse that URL: ${validation.reason}`,
        type: 'error',
        metadata: { url, blocked: true },
      };
    }

    // 3. Browse and extract
    const manager = getBrowserManager();
    let page: Awaited<ReturnType<typeof manager.getPage>> | null = null;

    try {
      await manager.launch();
      page = await manager.getPage();
      await manager.navigate(url, page);
      const content = await manager.extractContent(page);

      return {
        content: formatBrowseResult(content),
        type: 'markdown',
        metadata: {
          url: content.url,
          loadTimeMs: content.loadTimeMs,
          contentLength: content.text.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Timeout detection
      if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('Navigation timeout')) {
        return {
          content: 'The page took too long to load (15s timeout).',
          type: 'error',
          metadata: { url, error: 'timeout' },
        };
      }

      // Chrome launch failure
      if (msg.includes('Chrome launch failed') || msg.includes('Browser not launched')) {
        return {
          content: 'Browser engine is not available. Chrome may need to be installed.',
          type: 'error',
          metadata: { url, error: 'chrome_unavailable' },
        };
      }

      // Content extraction failure
      if (msg.includes('Content extraction failed')) {
        return {
          content: `Could not extract content from ${url}: ${msg}`,
          type: 'error',
          metadata: { url, error: 'extraction_failed' },
        };
      }

      // Generic navigation / other errors
      return {
        content: `Failed to browse ${url}: ${msg}`,
        type: 'error',
        metadata: { url, error: 'navigation_failed' },
      };
    } finally {
      // Always close the page to prevent leaks
      if (page) {
        await manager.closePage(page).catch(() => {});
      }
    }
  },
};

export default browserSkill;
