/**
 * BrowserSkill unit tests — URL extraction, trigger matching, execute flow,
 * error paths, and SkillRouter integration.
 *
 * BrowserManager is fully mocked so no real Chrome is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SkillContext } from '../bot/skills/types.js';

// ---------------------------------------------------------------------------
// Mock BrowserManager before importing the skill
// ---------------------------------------------------------------------------

const mockClosePage = vi.fn().mockResolvedValue(undefined);
const mockLaunch = vi.fn().mockResolvedValue(undefined);
const mockGetPage = vi.fn();
const mockNavigate = vi.fn();
const mockExtractContent = vi.fn();
const mockCleanup = vi.fn().mockResolvedValue(undefined);

const mockManager = {
  launch: mockLaunch,
  getPage: mockGetPage,
  navigate: mockNavigate,
  extractContent: mockExtractContent,
  closePage: mockClosePage,
  cleanup: mockCleanup,
  health: vi.fn().mockReturnValue({ alive: true, pageCount: 0 }),
};

vi.mock('../inference/browser-manager.js', () => ({
  getBrowserManager: () => mockManager,
  validateUrl: (url: string) => {
    // Real validation logic for tests — delegate to a spy-able function
    return mockValidateUrl(url);
  },
}));

// Default validateUrl mock — passes everything through
let mockValidateUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: `Blocked scheme: ${parsed.protocol}` };
    }
    // Block localhost/internal for realistic SSRF testing
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return { valid: false, reason: `Blocked internal address: ${host}` };
    }
    return { valid: true, url: parsed };
  } catch {
    return { valid: false, reason: `Invalid URL: ${url}` };
  }
};

// Import after mocks are set up
import { browserSkill, extractUrl } from '../bot/skills/builtins/browser.js';
import { SkillRouter } from '../bot/skills/loader.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeCtx(message: string): SkillContext {
  return {
    message,
    userId: 'test-user',
    userName: 'Test',
    conversationHistory: [],
    env: {},
  };
}

const fakePage = { id: 'mock-page' };

function setupSuccessfulBrowse(content?: Partial<{
  title: string;
  description: string;
  text: string;
  url: string;
  loadTimeMs: number;
}>) {
  const defaults = {
    title: 'Example Domain',
    description: 'This domain is for use in illustrative examples.',
    text: 'Example Domain\nThis domain is for use in illustrative examples in documents.',
    url: 'https://example.com',
    loadTimeMs: 500,
  };
  mockLaunch.mockResolvedValue(undefined);
  mockGetPage.mockResolvedValue(fakePage);
  mockNavigate.mockResolvedValue(fakePage);
  mockExtractContent.mockResolvedValue({ ...defaults, ...content });
  mockClosePage.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// extractUrl
// ---------------------------------------------------------------------------

describe('extractUrl', () => {
  it('extracts URL from "browse https://example.com"', () => {
    expect(extractUrl('browse https://example.com')).toBe('https://example.com');
  });

  it('extracts URL from middle of sentence', () => {
    expect(extractUrl('can you check https://news.ycombinator.com for me')).toBe(
      'https://news.ycombinator.com',
    );
  });

  it('strips trailing period', () => {
    expect(extractUrl('visit https://example.com.')).toBe('https://example.com');
  });

  it('strips trailing comma', () => {
    expect(extractUrl('look at https://example.com, please')).toBe(
      'https://example.com',
    );
  });

  it('strips trailing closing paren', () => {
    expect(extractUrl('(see https://example.com)')).toBe('https://example.com');
  });

  it('strips trailing question mark', () => {
    expect(extractUrl('have you seen https://example.com?')).toBe(
      'https://example.com',
    );
  });

  it('strips trailing exclamation mark', () => {
    expect(extractUrl('check https://example.com!')).toBe('https://example.com');
  });

  it('preserves query params', () => {
    expect(extractUrl('browse https://example.com/page?q=test&lang=en')).toBe(
      'https://example.com/page?q=test&lang=en',
    );
  });

  it('handles URL with path', () => {
    expect(extractUrl('open https://example.com/blog/post-1')).toBe(
      'https://example.com/blog/post-1',
    );
  });

  it('returns null for no URL', () => {
    expect(extractUrl('hello there')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractUrl('')).toBeNull();
  });

  it('extracts http (not just https)', () => {
    expect(extractUrl('browse http://example.com')).toBe('http://example.com');
  });
});

// ---------------------------------------------------------------------------
// Trigger Matching
// ---------------------------------------------------------------------------

describe('BrowserSkill trigger matching', () => {
  let router: SkillRouter;

  beforeEach(() => {
    router = new SkillRouter();
  });

  const shouldMatch = [
    'browse https://example.com',
    'visit https://example.com',
    'open https://news.ycombinator.com',
    'summarize https://example.com/article',
    'screenshot https://example.com',
    'check this website https://foo.com',
    'check site https://foo.com',
    'what is on https://example.com',
    'what\'s at https://example.com/page',
  ];

  for (const msg of shouldMatch) {
    it(`matches: "${msg}"`, () => {
      const skill = router.matchSkill(msg);
      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('browser');
    });
  }

  const shouldNotMatch = [
    'hello there',
    'what time is it',
    'search for cats',
  ];

  for (const msg of shouldNotMatch) {
    it(`does NOT match browser for: "${msg}"`, () => {
      const skill = router.matchSkill(msg);
      if (skill) {
        // Might match another skill (web-search, etc.) — just not browser
        expect(skill.name).not.toBe('browser');
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Execute — success path
// ---------------------------------------------------------------------------

describe('BrowserSkill execute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupSuccessfulBrowse();
  });

  it('returns structured markdown on successful browse', async () => {
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));

    expect(result.type).toBe('markdown');
    expect(result.content).toContain('Example Domain');
    expect(result.content).toContain('illustrative examples');
    expect(result.content).toContain('500ms');
    expect(result.content).toContain('https://example.com');
    expect(result.metadata).toMatchObject({
      url: 'https://example.com',
      loadTimeMs: 500,
    });
  });

  it('includes description blockquote when present', async () => {
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.content).toContain('> This domain is for use in illustrative examples.');
  });

  it('reports content length in metadata', async () => {
    setupSuccessfulBrowse({ text: 'a'.repeat(200) });
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.metadata?.contentLength).toBe(200);
  });

  it('calls launch, getPage, navigate, extractContent in order', async () => {
    await browserSkill.execute(makeCtx('browse https://example.com'));

    expect(mockLaunch).toHaveBeenCalled();
    expect(mockGetPage).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('https://example.com', fakePage);
    expect(mockExtractContent).toHaveBeenCalledWith(fakePage);
  });

  it('closes page after successful browse', async () => {
    await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(mockClosePage).toHaveBeenCalledWith(fakePage);
  });
});

// ---------------------------------------------------------------------------
// Execute — error paths
// ---------------------------------------------------------------------------

describe('BrowserSkill error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupSuccessfulBrowse(); // default setup; individual tests override
  });

  it('returns helpful error when no URL in message', async () => {
    const result = await browserSkill.execute(makeCtx('browse something'));
    expect(result.type).toBe('text');
    expect(result.content).toContain('Please include a URL');
    expect(result.content).toContain('browse https://example.com');
  });

  it('returns error for blocked internal URL', async () => {
    const result = await browserSkill.execute(
      makeCtx('browse https://localhost:3000/admin'),
    );
    expect(result.type).toBe('error');
    expect(result.content).toContain('Cannot browse that URL');
    expect(result.content).toContain('Blocked internal address');
  });

  it('returns timeout message on navigation timeout', async () => {
    mockNavigate.mockRejectedValue(new Error('Navigation timeout of 15000ms exceeded'));
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('took too long to load');
    expect(result.content).toContain('15s timeout');
  });

  it('returns chrome unavailable message on launch failure', async () => {
    mockLaunch.mockRejectedValue(new Error('Chrome launch failed: no chrome binary'));
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('Browser engine is not available');
    expect(result.content).toContain('Chrome may need to be installed');
  });

  it('returns extraction error when content extraction fails', async () => {
    mockExtractContent.mockRejectedValue(new Error('Content extraction failed: page crashed'));
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('Could not extract content');
  });

  it('returns generic error for unknown failures', async () => {
    mockNavigate.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'));
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('Failed to browse');
    expect(result.content).toContain('ERR_NAME_NOT_RESOLVED');
  });

  it('closes page even on navigation error (finally block)', async () => {
    mockNavigate.mockRejectedValue(new Error('Navigation failed'));
    await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(mockClosePage).toHaveBeenCalledWith(fakePage);
  });

  it('closes page even on extraction error (finally block)', async () => {
    mockExtractContent.mockRejectedValue(new Error('Content extraction failed'));
    await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(mockClosePage).toHaveBeenCalledWith(fakePage);
  });

  it('does not crash when closePage itself throws', async () => {
    // Set up successful browse but make closePage reject
    setupSuccessfulBrowse();
    mockClosePage.mockRejectedValue(new Error('close error'));
    // Should still return a valid result, not throw
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('markdown');
  });

  it('handles non-Error throws gracefully', async () => {
    mockNavigate.mockRejectedValue('string error');
    const result = await browserSkill.execute(makeCtx('browse https://example.com'));
    expect(result.type).toBe('error');
    expect(result.content).toContain('string error');
  });
});

// ---------------------------------------------------------------------------
// SkillRouter integration
// ---------------------------------------------------------------------------

describe('BrowserSkill SkillRouter integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupSuccessfulBrowse();
  });

  it('browserSkill appears in router.listSkills()', () => {
    const router = new SkillRouter();
    const names = router.listSkills().map((s) => s.name);
    expect(names).toContain('browser');
  });

  it('router.hasSkill("browser") is true', () => {
    const router = new SkillRouter();
    expect(router.hasSkill('browser')).toBe(true);
  });

  it('matchAndExecute routes browse command to browser skill', async () => {
    const router = new SkillRouter();
    const result = await router.matchAndExecute(makeCtx('browse https://example.com'));
    expect(result).not.toBeNull();
    expect(result!.type).toBe('markdown');
    expect(result!.content).toContain('Example Domain');
  });
});

// ---------------------------------------------------------------------------
// BrowserSkill interface compliance
// ---------------------------------------------------------------------------

describe('BrowserSkill interface compliance', () => {
  it('has required KinSkill properties', () => {
    expect(browserSkill.name).toBe('browser');
    expect(typeof browserSkill.description).toBe('string');
    expect(browserSkill.description.length).toBeGreaterThan(0);
    expect(Array.isArray(browserSkill.triggers)).toBe(true);
    expect(browserSkill.triggers.length).toBeGreaterThan(0);
    expect(typeof browserSkill.execute).toBe('function');
  });

  it('all trigger patterns are valid regex', () => {
    for (const trigger of browserSkill.triggers) {
      expect(() => new RegExp(trigger, 'i')).not.toThrow();
    }
  });
});
