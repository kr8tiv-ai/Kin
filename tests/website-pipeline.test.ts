/**
 * Website Pipeline Tests
 *
 * Tests for code generation, quality checks, design references, and
 * the WebsitePipeline class. Uses a mock LLM client that returns
 * deterministic responses.
 */

import { describe, it, expect } from 'vitest';
import {
  generateWebsite,
  WebsitePipeline,
  type GeneratedFile,
  type WebsiteConfig,
  type WebsiteRequest,
} from '../website/pipeline.js';

// ============================================================================
// Mock LLM Client
// ============================================================================

/** Returns a fake LLM client that replies with the given string. */
function mockLLM(response: string) {
  return {
    chat: async (_messages: { role: string; content: string }[]) => response,
  };
}

// ============================================================================
// parseGeneratedFiles (via generateWebsite)
// ============================================================================

describe('parseGeneratedFiles (tested via generateWebsite)', () => {
  const config: WebsiteConfig = { validationLevel: 'lenient' };

  it('parses a single code block with language and path', async () => {
    const llm = mockLLM(
      'Here is your page:\n\n```html:index.html\n<h1>Hello</h1>\n```',
    );

    const result = await generateWebsite({ prompt: 'make a page' }, config, llm);

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.path).toBe('index.html');
    expect(result.files[0]!.language).toBe('html');
    expect(result.files[0]!.content).toBe('<h1>Hello</h1>');
  });

  it('parses multiple code blocks', async () => {
    const response = [
      '```html:index.html',
      '<h1>Title</h1>',
      '```',
      '',
      '```css:styles.css',
      'h1 { color: red; }',
      '```',
      '',
      '```javascript:app.js',
      'console.log("hi");',
      '```',
    ].join('\n');

    const result = await generateWebsite({ prompt: 'build site' }, config, mockLLM(response));

    expect(result.files.length).toBe(3);
    expect(result.files[0]!.path).toBe('index.html');
    expect(result.files[1]!.path).toBe('styles.css');
    expect(result.files[2]!.path).toBe('app.js');
  });

  it('assigns default path when code block has no path annotation', async () => {
    const response = '```typescript\nconst x: number = 1;\n```';
    const result = await generateWebsite({ prompt: 'ts file' }, config, mockLLM(response));

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.path).toBe('file-0.ts');
    expect(result.files[0]!.language).toBe('typescript');
  });

  it('treats entire response as index.html when no code blocks present', async () => {
    const plain = '<h1>Just some HTML without fences</h1>';
    const result = await generateWebsite({ prompt: 'raw html' }, config, mockLLM(plain));

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.path).toBe('index.html');
    expect(result.files[0]!.language).toBe('html');
    expect(result.files[0]!.content).toBe(plain);
  });
});

// ============================================================================
// Quality Checks
// ============================================================================

describe('Quality Checks', () => {
  const config: WebsiteConfig = { validationLevel: 'strict' };

  it('flags placeholders (TODO, FIXME, XXX)', async () => {
    const response = '```html:index.html\n<div>TODO: add content here</div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('placeholders'))).toBe(true);
  });

  it('flags "your code here" placeholder', async () => {
    const response = '```html:index.html\n<div>your code here</div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('placeholders'))).toBe(true);
  });

  it('flags accessibility issues in HTML without aria/alt/role', async () => {
    const response = '```html:index.html\n<div><img src="photo.jpg"><button>Go</button></div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('accessibility'))).toBe(true);
  });

  it('passes accessibility check when aria attributes present', async () => {
    const response = '```html:index.html\n<div role="main"><img src="photo.jpg" alt="A photo"><button aria-label="Go">Go</button></div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    // The accessibility check should pass -- so no accessibility warning
    expect(result.warnings.some((w) => w.includes('accessibility'))).toBe(false);
  });

  it('flags hardcoded secrets (api_key = "...")', async () => {
    const response = '```javascript:config.js\nconst api_key = "sk-1234567890abcdef";\n```';
    const result = await generateWebsite({ prompt: 'config' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('credentials'))).toBe(true);
  });

  it('flags hardcoded secrets (password = "...")', async () => {
    const response = '```javascript:config.js\nconst password = "supersecret123";\n```';
    const result = await generateWebsite({ prompt: 'config' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('credentials'))).toBe(true);
  });

  it('does not flag env variable references without string assignment', async () => {
    // The secrets regex looks for: api_key|secret|password|token followed by = or : then a quoted string.
    // A bare process.env lookup has no quoted string literal, so it should NOT be flagged.
    const response = '```javascript:config.js\nconst key = process.env.MY_VAR;\nconst debug = true;\n```';
    const result = await generateWebsite({ prompt: 'config' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('credentials'))).toBe(false);
  });

  it('checks for semantic HTML in .html files', async () => {
    const response = '```html:page.html\n<div>All divs no semantic elements</div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('semantic'))).toBe(true);
  });

  it('passes semantic HTML check when semantic elements present', async () => {
    const response = '```html:page.html\n<header><nav>Menu</nav></header><main>Content</main><footer>Foot</footer>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.warnings.some((w) => w.includes('semantic'))).toBe(false);
  });

  it('checks for responsive design patterns', async () => {
    const noneResponsive = '```css:style.css\nbody { color: red; }\n```';
    const result = await generateWebsite({ prompt: 'style' }, config, mockLLM(noneResponsive));

    expect(result.warnings.some((w) => w.includes('responsive'))).toBe(true);
  });

  it('passes responsive check with @media queries', async () => {
    const responsive = '```css:style.css\n@media (max-width: 768px) { body { padding: 1rem; } }\n```';
    const result = await generateWebsite({ prompt: 'style' }, config, mockLLM(responsive));

    expect(result.warnings.some((w) => w.includes('responsive'))).toBe(false);
  });

  it('passes responsive check with Tailwind breakpoint classes', async () => {
    const tailwind = '```html:page.html\n<header><div class="text-sm md:text-lg lg:text-xl">Title</div></header>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(tailwind));

    expect(result.warnings.some((w) => w.includes('responsive'))).toBe(false);
  });
});

// ============================================================================
// Explanation / Teaching Points extraction
// ============================================================================

describe('Explanation and teaching points extraction', () => {
  const config: WebsiteConfig = {};

  it('extracts text outside code blocks as explanation', async () => {
    const response = 'Here is an explanation.\n\n```html:index.html\n<p>content</p>\n```\n\nMore details.';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.explanation).toContain('Here is an explanation');
    expect(result.explanation).toContain('More details');
    // Should NOT contain the code block content
    expect(result.explanation).not.toContain('<p>content</p>');
  });

  it('extracts teaching points prefixed with "Note:"', async () => {
    const response = 'Note: Use semantic elements for SEO.\n\n```html:index.html\n<main>hi</main>\n```\n\nNote: Always add alt text.';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.teachingPoints.length).toBe(2);
    expect(result.teachingPoints[0]).toContain('semantic');
    expect(result.teachingPoints[1]).toContain('alt text');
  });

  it('returns empty teaching points when none present', async () => {
    const response = '```html:index.html\n<div>hi</div>\n```';
    const result = await generateWebsite({ prompt: 'page' }, config, mockLLM(response));

    expect(result.teachingPoints).toEqual([]);
  });
});

// ============================================================================
// WebsitePipeline class
// ============================================================================

describe('WebsitePipeline', () => {
  it('constructs with default config values', () => {
    const pipeline = new WebsitePipeline();
    // Verify it is usable - no errors thrown
    expect(pipeline).toBeDefined();
  });

  it('generate() delegates to generateWebsite with pipeline config', async () => {
    const pipeline = new WebsitePipeline({
      validationLevel: 'lenient',
    });

    const response = '```html:index.html\n<h1 role="heading">Hello</h1>\n```';
    const result = await pipeline.generate(
      { prompt: 'build me a landing page' },
      mockLLM(response),
    );

    expect(result.files.length).toBe(1);
    expect(result.files[0]!.content).toContain('Hello');
  });

  it('generate() adds teaching mode prompt when requested', async () => {
    const pipeline = new WebsitePipeline();
    let capturedMessages: { role: string; content: string }[] = [];

    const spyLLM = {
      chat: async (messages: { role: string; content: string }[]) => {
        capturedMessages = messages;
        return '```html:index.html\n<h1>Hi</h1>\n```';
      },
    };

    await pipeline.generate(
      { prompt: 'page', teachingMode: true },
      spyLLM,
    );

    // System prompt should contain teaching mode instructions
    const systemMsg = capturedMessages.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('TEACHING MODE');
  });

  it('generate() adds companion personality for cipher', async () => {
    const pipeline = new WebsitePipeline();
    let capturedMessages: { role: string; content: string }[] = [];

    const spyLLM = {
      chat: async (messages: { role: string; content: string }[]) => {
        capturedMessages = messages;
        return '```html:index.html\n<h1>Hi</h1>\n```';
      },
    };

    await pipeline.generate(
      { prompt: 'page', companionId: 'cipher' },
      spyLLM,
    );

    const systemMsg = capturedMessages.find((m) => m.role === 'system');
    expect(systemMsg!.content).toContain('CIPHER PERSONALITY');
    expect(systemMsg!.content).toContain('Code Kraken');
  });

  it('generate() includes framework in user prompt when specified', async () => {
    const pipeline = new WebsitePipeline();
    let capturedMessages: { role: string; content: string }[] = [];

    const spyLLM = {
      chat: async (messages: { role: string; content: string }[]) => {
        capturedMessages = messages;
        return '```html:index.html\n<h1>Hi</h1>\n```';
      },
    };

    await pipeline.generate(
      { prompt: 'page', context: { framework: 'react' } },
      spyLLM,
    );

    const userMsg = capturedMessages.find((m) => m.role === 'user');
    expect(userMsg!.content).toContain('FRAMEWORK: Use react');
  });

  it('iterate() passes existing code in context', async () => {
    const pipeline = new WebsitePipeline();
    let capturedMessages: { role: string; content: string }[] = [];

    const spyLLM = {
      chat: async (messages: { role: string; content: string }[]) => {
        capturedMessages = messages;
        return '```html:index.html\n<h1>Updated</h1>\n```';
      },
    };

    const existingFiles: GeneratedFile[] = [
      { path: 'index.html', content: '<h1>Old</h1>', language: 'html' },
    ];

    await pipeline.iterate(existingFiles, 'make it better', spyLLM);

    const userMsg = capturedMessages.find((m) => m.role === 'user');
    expect(userMsg!.content).toContain('EXISTING CODE');
    expect(userMsg!.content).toContain('<h1>Old</h1>');
  });
});

// ============================================================================
// getDesignReferences
// ============================================================================

describe('WebsitePipeline.getDesignReferences', () => {
  const pipeline = new WebsitePipeline();

  it('returns all references when no filter is provided', () => {
    const refs = pipeline.getDesignReferences();
    expect(refs.length).toBe(5);
    const names = refs.map((r) => r.name);
    expect(names).toContain('Linear');
    expect(names).toContain('Stripe');
    expect(names).toContain('Vercel');
    expect(names).toContain('Notion');
    expect(names).toContain('Framer');
  });

  it('filters by style tag (dark)', () => {
    const refs = pipeline.getDesignReferences('dark');
    expect(refs.length).toBeGreaterThanOrEqual(1);
    // Linear has "dark" tag
    expect(refs.some((r) => r.name === 'Linear')).toBe(true);
  });

  it('filters by style tag (minimal)', () => {
    const refs = pipeline.getDesignReferences('minimal');
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs.some((r) => r.name === 'Linear' || r.name === 'Vercel')).toBe(true);
  });

  it('filters by name match', () => {
    const refs = pipeline.getDesignReferences('stripe');
    expect(refs.length).toBe(1);
    expect(refs[0]!.name).toBe('Stripe');
  });

  it('returns empty array when no matches', () => {
    const refs = pipeline.getDesignReferences('nonexistent-style-xyz');
    expect(refs.length).toBe(0);
  });

  it('each reference has required fields', () => {
    const refs = pipeline.getDesignReferences();
    for (const ref of refs) {
      expect(ref.name).toBeDefined();
      expect(ref.url).toBeDefined();
      expect(ref.description).toBeDefined();
      expect(Array.isArray(ref.styleTags)).toBe(true);
      expect(Array.isArray(ref.strengths)).toBe(true);
      expect(ref.styleTags.length).toBeGreaterThan(0);
      expect(ref.strengths.length).toBeGreaterThan(0);
    }
  });
});
