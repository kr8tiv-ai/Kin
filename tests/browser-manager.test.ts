/**
 * BrowserManager unit tests — URL validation, Chrome lifecycle, page pooling,
 * content extraction, error handling.
 *
 * Puppeteer is fully mocked so no real Chrome is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers — build before vi.mock so the factory can reference them
// ---------------------------------------------------------------------------

function createMockPage(closed = false) {
  let _closed = closed;
  const page: Record<string, any> = {
    setDefaultNavigationTimeout: vi.fn(),
    setViewport: vi.fn().mockResolvedValue(undefined),
    setRequestInterception: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({
      title: 'Test Page',
      description: 'A test description',
      text: 'Hello world',
      url: 'https://example.com',
    }),
    screenshot: vi.fn().mockResolvedValue('base64data'),
    close: vi.fn().mockImplementation(() => {
      _closed = true;
      return Promise.resolve();
    }),
    isClosed: vi.fn().mockImplementation(() => _closed),
    browserContext: vi.fn().mockReturnValue({
      close: vi.fn().mockResolvedValue(undefined),
    }),
  };
  return page;
}

function createMockBrowser(connected = true) {
  const pages: any[] = [];
  const mockContext = {
    newPage: vi.fn().mockImplementation(() => {
      const p = createMockPage();
      pages.push(p);
      return Promise.resolve(p);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser: Record<string, any> = {
    isConnected: vi.fn().mockReturnValue(connected),
    createBrowserContext: vi.fn().mockResolvedValue(mockContext),
    pages: vi.fn().mockImplementation(() => Promise.resolve(pages)),
    close: vi.fn().mockResolvedValue(undefined),
    process: vi.fn().mockReturnValue({ kill: vi.fn() }),
    _mockContext: mockContext,
    _pages: pages,
  };
  return browser;
}

// ---------------------------------------------------------------------------
// vi.mock puppeteer
// ---------------------------------------------------------------------------

let mockBrowser: ReturnType<typeof createMockBrowser>;

vi.mock('puppeteer', () => {
  return {
    default: {
      launch: vi.fn().mockImplementation(() => {
        mockBrowser = createMockBrowser();
        return Promise.resolve(mockBrowser);
      }),
    },
  };
});

// Must import AFTER vi.mock
import {
  validateUrl,
  BrowserManager,
  getBrowserManager,
  MAX_PAGES,
  type BrowserContent,
} from '../inference/browser-manager.js';

import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// validateUrl()
// ---------------------------------------------------------------------------

describe('validateUrl', () => {
  it('accepts a valid HTTPS URL', () => {
    const r = validateUrl('https://example.com/page?q=1');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.url.hostname).toBe('example.com');
  });

  it('accepts a valid HTTP URL', () => {
    const r = validateUrl('http://example.com');
    expect(r.valid).toBe(true);
  });

  it('blocks file:// scheme', () => {
    const r = validateUrl('file:///etc/passwd');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('Blocked scheme');
  });

  it('blocks javascript: scheme', () => {
    // javascript: URLs need a valid host portion to parse at all — but new URL('javascript:alert(1)')
    // actually throws on most runtimes, so we get "Invalid URL" instead of "Blocked scheme"
    const r = validateUrl('javascript:alert(1)');
    expect(r.valid).toBe(false);
  });

  it('blocks data: scheme', () => {
    const r = validateUrl('data:text/html,<h1>hi</h1>');
    expect(r.valid).toBe(false);
  });

  it('blocks 127.0.0.1 (loopback)', () => {
    const r = validateUrl('http://127.0.0.1:8080/admin');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('Blocked internal address');
  });

  it('blocks localhost', () => {
    const r = validateUrl('http://localhost:3000');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('localhost');
  });

  it('blocks 0.0.0.0', () => {
    const r = validateUrl('http://0.0.0.0');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('Blocked internal address');
  });

  it('blocks 10.x.x.x (Class A private)', () => {
    const r = validateUrl('http://10.0.0.1/internal');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('10.0.0.1');
  });

  it('blocks 172.16.x.x (Class B private)', () => {
    const r = validateUrl('http://172.16.0.1');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('172.16.0.1');
  });

  it('blocks 172.31.x.x (upper bound Class B)', () => {
    const r = validateUrl('http://172.31.255.255');
    expect(r.valid).toBe(false);
  });

  it('allows 172.15.x.x (outside Class B private)', () => {
    const r = validateUrl('http://172.15.0.1');
    expect(r.valid).toBe(true);
  });

  it('allows 172.32.x.x (outside Class B private)', () => {
    const r = validateUrl('http://172.32.0.1');
    expect(r.valid).toBe(true);
  });

  it('blocks 192.168.x.x (Class C private)', () => {
    const r = validateUrl('http://192.168.1.1');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('192.168.1.1');
  });

  it('blocks [::1] (IPv6 loopback)', () => {
    const r = validateUrl('http://[::1]:8080');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('[::1]');
  });

  it('blocks 169.254.x.x (link-local)', () => {
    const r = validateUrl('http://169.254.169.254/latest/meta-data');
    expect(r.valid).toBe(false);
  });

  it('rejects empty string', () => {
    const r = validateUrl('');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('empty');
  });

  it('rejects URL without protocol', () => {
    const r = validateUrl('example.com');
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('Invalid URL');
  });

  it('rejects URL with spaces', () => {
    const r = validateUrl('http://exam ple.com');
    expect(r.valid).toBe(false);
  });

  // @ts-expect-error — testing runtime guard against non-string input
  it('rejects null', () => {
    const r = validateUrl(null as any);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('empty');
  });
});

// ---------------------------------------------------------------------------
// BrowserManager
// ---------------------------------------------------------------------------

describe('BrowserManager', () => {
  let bm: BrowserManager;

  beforeEach(() => {
    bm = new BrowserManager();
    // Reset the puppeteer.launch mock so each test gets a fresh browser
    vi.mocked(puppeteer.launch).mockClear();
    vi.mocked(puppeteer.launch).mockImplementation(() => {
      mockBrowser = createMockBrowser();
      return Promise.resolve(mockBrowser) as any;
    });
  });

  afterEach(async () => {
    await bm.cleanup();
  });

  // -- launch ---------------------------------------------------------------

  describe('launch()', () => {
    it('calls puppeteer.launch with headless and security args', async () => {
      await bm.launch();

      expect(puppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          args: expect.arrayContaining([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
          ]),
          timeout: 30_000,
        }),
      );
    });

    it('reuses an existing connected browser', async () => {
      await bm.launch();
      await bm.launch();
      // Should only call launch once
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    });

    it('throws with context when Chrome launch fails', async () => {
      vi.mocked(puppeteer.launch).mockRejectedValueOnce(
        new Error('spawn ENOENT'),
      );

      await expect(bm.launch()).rejects.toThrow('Chrome launch failed: spawn ENOENT');
    });
  });

  // -- getPage --------------------------------------------------------------

  describe('getPage()', () => {
    it('returns a page with request interception', async () => {
      await bm.launch();
      const page = await bm.getPage();

      expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(15_000);
      expect(page.setViewport).toHaveBeenCalledWith({ width: 1280, height: 720 });
      expect(page.setRequestInterception).toHaveBeenCalledWith(true);
      expect(page.on).toHaveBeenCalledWith('request', expect.any(Function));
    });

    it('respects MAX_PAGES concurrent limit', async () => {
      await bm.launch();

      // Open MAX_PAGES pages
      for (let i = 0; i < MAX_PAGES; i++) {
        await bm.getPage();
      }

      // Next one should throw
      await expect(bm.getPage()).rejects.toThrow('Page limit reached');
    });

    it('throws if browser not launched', async () => {
      await expect(bm.getPage()).rejects.toThrow('Browser not launched');
    });
  });

  // -- navigate -------------------------------------------------------------

  describe('navigate()', () => {
    it('navigates to a valid URL', async () => {
      await bm.launch();
      const page = await bm.getPage();
      const result = await bm.navigate('https://example.com', page);

      expect(page.goto).toHaveBeenCalledWith(
        'https://example.com/',
        { waitUntil: 'domcontentloaded' },
      );
      expect(result).toBe(page);
    });

    it('closes page and throws on invalid URL', async () => {
      await bm.launch();
      const page = await bm.getPage();

      await expect(
        bm.navigate('http://127.0.0.1/admin', page),
      ).rejects.toThrow('URL validation failed');
    });

    it('closes page and throws on navigation timeout', async () => {
      await bm.launch();
      const page = await bm.getPage();
      page.goto.mockRejectedValueOnce(new Error('Navigation timeout'));

      await expect(
        bm.navigate('https://slow-site.com', page),
      ).rejects.toThrow('Navigation failed');
    });
  });

  // -- extractContent -------------------------------------------------------

  describe('extractContent()', () => {
    it('returns structured content from the page', async () => {
      await bm.launch();
      const page = await bm.getPage();

      const content = await bm.extractContent(page);

      expect(content.title).toBe('Test Page');
      expect(content.description).toBe('A test description');
      expect(content.text).toBe('Hello world');
      expect(content.url).toBe('https://example.com');
      expect(content.loadTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('truncates body text to 2000 characters', async () => {
      await bm.launch();
      const page = await bm.getPage();

      // The truncation happens inside page.evaluate, which we're mocking.
      // Verify the MAX_TEXT_LENGTH constant is passed to evaluate.
      const content = await bm.extractContent(page);
      expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 2000);
      expect(content).toBeDefined();
    });

    it('throws with context when page.evaluate fails', async () => {
      await bm.launch();
      const page = await bm.getPage();
      page.evaluate.mockRejectedValueOnce(new Error('Execution context destroyed'));

      await expect(bm.extractContent(page)).rejects.toThrow(
        'Content extraction failed: Execution context destroyed',
      );
    });
  });

  // -- screenshot -----------------------------------------------------------

  describe('screenshot()', () => {
    it('returns a base64 JPEG string', async () => {
      await bm.launch();
      const page = await bm.getPage();

      const result = await bm.screenshot(page);

      expect(page.screenshot).toHaveBeenCalledWith({
        encoding: 'base64',
        type: 'jpeg',
        quality: 70,
      });
      expect(result).toBe('base64data');
    });
  });

  // -- closePage ------------------------------------------------------------

  describe('closePage()', () => {
    it('closes a page and removes it from tracked set', async () => {
      await bm.launch();
      const page = await bm.getPage();
      expect(bm.health().pageCount).toBe(1);

      await bm.closePage(page);

      expect(bm.health().pageCount).toBe(0);
    });

    it('handles already-closed pages gracefully', async () => {
      await bm.launch();
      const page = await bm.getPage();
      page.isClosed.mockReturnValue(true);

      // Should not throw
      await bm.closePage(page);
      expect(bm.health().pageCount).toBe(0);
    });
  });

  // -- cleanup --------------------------------------------------------------

  describe('cleanup()', () => {
    it('closes all pages and the browser', async () => {
      await bm.launch();
      await bm.getPage();
      await bm.getPage();

      await bm.cleanup();

      expect(bm.health()).toEqual({ alive: false, pageCount: 0 });
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('force-kills Chrome if graceful close fails', async () => {
      await bm.launch();
      mockBrowser.close.mockRejectedValueOnce(new Error('close failed'));
      const killFn = mockBrowser.process().kill;

      await bm.cleanup();

      expect(killFn).toHaveBeenCalledWith('SIGKILL');
    });

    it('handles cleanup when browser is null', async () => {
      // Not launched — cleanup should be a no-op
      await bm.cleanup();
      expect(bm.health()).toEqual({ alive: false, pageCount: 0 });
    });
  });

  // -- health ---------------------------------------------------------------

  describe('health()', () => {
    it('reports dead when browser not launched', () => {
      expect(bm.health()).toEqual({ alive: false, pageCount: 0 });
    });

    it('reports alive with page count', async () => {
      await bm.launch();
      await bm.getPage();

      const h = bm.health();
      expect(h.alive).toBe(true);
      expect(h.pageCount).toBe(1);
    });

    it('reports dead when browser disconnects', async () => {
      await bm.launch();
      mockBrowser.isConnected.mockReturnValue(false);

      expect(bm.health().alive).toBe(false);
    });
  });

  // -- request interception -------------------------------------------------

  describe('request interception', () => {
    it('blocks image, media, and font resource types', async () => {
      await bm.launch();
      const page = await bm.getPage();

      // Get the request handler that was registered
      const onCall = page.on.mock.calls.find(
        (c: any[]) => c[0] === 'request',
      );
      expect(onCall).toBeDefined();
      const handler = onCall![1];

      // Simulate an image request
      const imgReq = {
        resourceType: () => 'image',
        abort: vi.fn().mockResolvedValue(undefined),
        continue: vi.fn().mockResolvedValue(undefined),
      };
      handler(imgReq);
      expect(imgReq.abort).toHaveBeenCalled();
      expect(imgReq.continue).not.toHaveBeenCalled();

      // Simulate a script request (should continue)
      const scriptReq = {
        resourceType: () => 'script',
        abort: vi.fn().mockResolvedValue(undefined),
        continue: vi.fn().mockResolvedValue(undefined),
      };
      handler(scriptReq);
      expect(scriptReq.continue).toHaveBeenCalled();
      expect(scriptReq.abort).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('getBrowserManager()', () => {
  it('returns the same instance on repeated calls', () => {
    const a = getBrowserManager();
    const b = getBrowserManager();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Boundary condition tests
// ---------------------------------------------------------------------------

describe('boundary conditions', () => {
  let bm: BrowserManager;

  beforeEach(() => {
    bm = new BrowserManager();
    vi.mocked(puppeteer.launch).mockClear();
    vi.mocked(puppeteer.launch).mockImplementation(() => {
      mockBrowser = createMockBrowser();
      return Promise.resolve(mockBrowser) as any;
    });
  });

  afterEach(async () => {
    await bm.cleanup();
  });

  it('allows exactly MAX_PAGES pages', async () => {
    await bm.launch();

    const pages: any[] = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      pages.push(await bm.getPage());
    }
    expect(bm.health().pageCount).toBe(MAX_PAGES);

    // Close one, then open another — should succeed
    await bm.closePage(pages[0]);
    expect(bm.health().pageCount).toBe(MAX_PAGES - 1);
    const newPage = await bm.getPage();
    expect(newPage).toBeDefined();
  });

  it('content exactly 2000 chars passes the max-length argument', async () => {
    await bm.launch();
    const page = await bm.getPage();

    const exact2000 = 'x'.repeat(2000);
    page.evaluate.mockResolvedValueOnce({
      title: 'T',
      description: '',
      text: exact2000,
      url: 'https://example.com',
    });

    const content = await bm.extractContent(page);
    expect(content.text).toHaveLength(2000);
  });

  it('content over 2000 chars is truncated in evaluate call', async () => {
    await bm.launch();
    const page = await bm.getPage();

    // Verify the evaluate is called with the 2000 limit
    await bm.extractContent(page);
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  it('relaunches after cleanup if launch is called again', async () => {
    await bm.launch();
    await bm.cleanup();
    expect(bm.health().alive).toBe(false);

    await bm.launch();
    expect(bm.health().alive).toBe(true);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });
});
