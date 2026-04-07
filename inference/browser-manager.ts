/**
 * BrowserManager — Headless Chrome lifecycle, URL security, and content extraction.
 *
 * Owns a singleton headless Chrome instance via Puppeteer. Provides:
 * - SSRF-safe URL validation (blocks internal networks, non-HTTP schemes)
 * - Page pool with concurrent limit
 * - Structured content extraction (title, description, body text)
 * - Screenshot capture
 * - Health reporting and graceful cleanup
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserContent {
  title: string;
  description: string;
  text: string;
  url: string;
  loadTimeMs: number;
}

export type UrlValidationResult =
  | { valid: true; url: URL }
  | { valid: false; reason: string };

export interface BrowserHealth {
  alive: boolean;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent pages the manager will allow. */
export const MAX_PAGES = 3;

/** Text extraction character limit. */
const MAX_TEXT_LENGTH = 2000;

/** Chrome launch timeout in ms. */
const LAUNCH_TIMEOUT_MS = 30_000;

/** Default page navigation timeout in ms. */
const NAV_TIMEOUT_MS = 15_000;

/** Resource types to block during navigation (text-only extraction). */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

/** Security flags for the Chrome subprocess. */
const CHROME_ARGS: string[] = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
];

// ---------------------------------------------------------------------------
// URL Validation (SSRF protection)
// ---------------------------------------------------------------------------

/** RFC 1918 + loopback + link-local patterns for hostname blocking. */
const BLOCKED_HOSTNAME_PATTERNS: Array<(host: string) => boolean> = [
  // Loopback
  (h) => h === 'localhost',
  (h) => h === '127.0.0.1',
  (h) => h === '[::1]',
  (h) => h === '0.0.0.0',

  // 10.0.0.0/8
  (h) => /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h),

  // 172.16.0.0/12
  (h) => {
    const m = h.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (!m) return false;
    const second = parseInt(m[1]!, 10);
    return second >= 16 && second <= 31;
  },

  // 192.168.0.0/16
  (h) => /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h),

  // Link-local 169.254.0.0/16
  (h) => /^169\.254\.\d{1,3}\.\d{1,3}$/.test(h),
];

/**
 * Validate a URL for safe browsing. Blocks non-HTTP(S) schemes and internal
 * network addresses to prevent SSRF.
 */
export function validateUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is empty or not a string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: `Invalid URL: ${url}` };
  }

  // Scheme check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Blocked scheme: ${parsed.protocol}` };
  }

  // Hostname SSRF check
  const host = parsed.hostname.toLowerCase();
  for (const check of BLOCKED_HOSTNAME_PATTERNS) {
    if (check(host)) {
      return { valid: false, reason: `Blocked internal address: ${host}` };
    }
  }

  return { valid: true, url: parsed };
}

// ---------------------------------------------------------------------------
// BrowserManager
// ---------------------------------------------------------------------------

export class BrowserManager {
  private browser: Browser | null = null;
  private pages: Set<Page> = new Set();

  /** Launch or reuse the headless Chrome instance. */
  async launch(): Promise<void> {
    if (this.browser?.isConnected()) return;

    // Clean up stale reference if any
    if (this.browser) {
      await this.cleanup();
    }

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: CHROME_ARGS,
        timeout: LAUNCH_TIMEOUT_MS,
      });
    } catch (err) {
      this.browser = null;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Chrome launch failed: ${msg}`);
    }
  }

  /**
   * Create a new incognito page with request interception for text-only
   * extraction. Respects MAX_PAGES concurrent limit.
   */
  async getPage(): Promise<Page> {
    if (!this.browser?.isConnected()) {
      throw new Error('Browser not launched — call launch() first');
    }

    if (this.pages.size >= MAX_PAGES) {
      throw new Error(
        `Page limit reached (${MAX_PAGES}). Close a page before opening another.`,
      );
    }

    const context = await this.browser.createBrowserContext();
    const page = await context.newPage();

    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    await page.setViewport({ width: 1280, height: 720 });

    // Block heavy resource types for faster text extraction
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) {
        void req.abort();
      } else {
        void req.continue();
      }
    });

    this.pages.add(page);
    return page;
  }

  /**
   * Validate and navigate to a URL. Returns the page on success.
   * On failure, closes the page and throws.
   */
  async navigate(url: string, page: Page): Promise<Page> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      await this.closePage(page);
      throw new Error(`URL validation failed: ${validation.reason}`);
    }

    try {
      await page.goto(validation.url.href, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      await this.closePage(page);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Navigation failed for ${url}: ${msg}`);
    }

    return page;
  }

  /**
   * Extract structured content from the current page.
   * Body text is truncated to MAX_TEXT_LENGTH characters.
   */
  async extractContent(page: Page): Promise<BrowserContent> {
    const start = Date.now();

    try {
      const extracted = await page.evaluate((maxLen: number) => {
        const title = document.title || '';
        const descEl = document.querySelector(
          'meta[name="description"]',
        ) as HTMLMetaElement | null;
        const description = descEl?.content || '';
        const rawText = document.body?.innerText || '';
        const text = rawText.length > maxLen ? rawText.slice(0, maxLen) : rawText;
        return { title, description, text, url: window.location.href };
      }, MAX_TEXT_LENGTH);

      return {
        ...extracted,
        loadTimeMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Content extraction failed: ${msg}`);
    }
  }

  /** Capture a JPEG screenshot as a base64 string. */
  async screenshot(page: Page): Promise<string> {
    const result = await page.screenshot({
      encoding: 'base64',
      type: 'jpeg',
      quality: 70,
    });
    return result;
  }

  /** Close a single page and remove it from the tracked set. */
  async closePage(page: Page): Promise<void> {
    this.pages.delete(page);
    try {
      if (!page.isClosed()) {
        const ctx = page.browserContext();
        await page.close();
        // Also close the incognito context created in getPage()
        await ctx.close().catch(() => {});
      }
    } catch {
      // Page may already be closed — swallow
    }
  }

  /** Close all pages and terminate the Chrome process. */
  async cleanup(): Promise<void> {
    for (const page of this.pages) {
      try {
        if (!page.isClosed()) await page.close();
      } catch {
        // swallow
      }
    }
    this.pages.clear();

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Force-kill if graceful close fails
        const proc = this.browser.process();
        if (proc) proc.kill('SIGKILL');
      }
      this.browser = null;
    }
  }

  /** Report Chrome process health. */
  health(): BrowserHealth {
    if (!this.browser) {
      return { alive: false, pageCount: 0 };
    }
    return {
      alive: this.browser.isConnected(),
      pageCount: this.pages.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: BrowserManager | null = null;

/** Get or create the singleton BrowserManager instance. */
export function getBrowserManager(): BrowserManager {
  if (!instance) {
    instance = new BrowserManager();
  }
  return instance;
}
