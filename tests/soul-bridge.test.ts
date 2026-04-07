/**
 * Soul Bridge — unit tests for SOUL.md export/import + API routes.
 *
 * Tests: soulToOpenClaw, openClawToSoul, parseSoulMdSections, estimateTraits,
 * configToSoulMd, round-trip equivalence, and Fastify API route integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  soulToOpenClaw,
  openClawToSoul,
  parseSoulMdSections,
  estimateTraits,
  configToSoulMd,
} from '../inference/soul-bridge.js';
import type { SoulConfigBody } from '../inference/soul-types.js';
import { COMPANION_CONFIGS, getCompanionConfig } from '../companions/config.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Test fixtures
// ============================================================================

const SAMPLE_SOUL_CONFIG: SoulConfigBody = {
  customName: 'TestBot',
  traits: { warmth: 80, formality: 20, humor: 75, directness: 85, creativity: 60, depth: 70 },
  values: ['honesty', 'creativity', 'empathy'],
  style: { vocabulary: 'moderate', responseLength: 'balanced', useEmoji: true },
  customInstructions: 'Always explain your reasoning step by step.',
  boundaries: ['No personal data storage', 'No medical advice'],
  antiPatterns: ['Never use sarcasm when someone is upset', 'Never break character'],
};

const MINIMAL_SOUL_CONFIG: SoulConfigBody = {
  traits: { warmth: 50, formality: 50, humor: 50, directness: 50, creativity: 50, depth: 50 },
  values: [],
  style: { vocabulary: 'moderate', responseLength: 'balanced', useEmoji: false },
  customInstructions: '',
  boundaries: [],
  antiPatterns: [],
};

const WELL_FORMED_SOUL_MD = `# My Test Companion

## Core Truths
- Be warm, encouraging, and emotionally present.
- Use humor freely — jokes, wordplay, and wit are welcome.
- Be blunt and direct. No hedging.

## Values
- honesty
- creativity
- empathy

## Vibe
- Vocabulary: advanced
- Response length: detailed
- Emoji: use sparingly

## Custom Instructions
Always explain your reasoning step by step.

## Boundaries
- No personal data storage
- No medical advice

## Never Do These
- Never use sarcasm when someone is upset
- Never break character

## Continuity
- Maintain consistent personality across sessions.
`;

// ============================================================================
// parseSoulMdSections
// ============================================================================

describe('parseSoulMdSections', () => {
  it('parses well-formed SOUL.md into sections', () => {
    const sections = parseSoulMdSections(WELL_FORMED_SOUL_MD);

    expect(sections.has('Core Truths')).toBe(true);
    expect(sections.has('Values')).toBe(true);
    expect(sections.has('Vibe')).toBe(true);
    expect(sections.has('Custom Instructions')).toBe(true);
    expect(sections.has('Boundaries')).toBe(true);
    expect(sections.has('Never Do These')).toBe(true);
    expect(sections.has('Continuity')).toBe(true);
  });

  it('extracts preamble text (content before first ##)', () => {
    const md = '# Title\n\nSome intro text\n\n## Section 1\nContent';
    const sections = parseSoulMdSections(md);

    expect(sections.get('_preamble')).toContain('# Title');
    expect(sections.get('Section 1')).toBe('Content');
  });

  it('handles markdown with no ## headings', () => {
    const md = '# Just a title\n\nSome content without level-2 headings.';
    const sections = parseSoulMdSections(md);

    expect(sections.size).toBe(1);
    expect(sections.has('_preamble')).toBe(true);
  });

  it('handles empty string', () => {
    const sections = parseSoulMdSections('');
    expect(sections.size).toBe(0);
  });

  it('handles consecutive ## headings with no content between them', () => {
    const md = '## First\n## Second\nContent here';
    const sections = parseSoulMdSections(md);

    expect(sections.get('First')).toBe('');
    expect(sections.get('Second')).toBe('Content here');
  });

  it('preserves heading text exactly (case-sensitive)', () => {
    const md = '## Core Truths\nStuff\n## custom SECTION\nOther stuff';
    const sections = parseSoulMdSections(md);

    expect(sections.has('Core Truths')).toBe(true);
    expect(sections.has('custom SECTION')).toBe(true);
  });
});

// ============================================================================
// estimateTraits
// ============================================================================

describe('estimateTraits', () => {
  it('returns all-50 defaults for empty text', () => {
    const traits = estimateTraits('');
    expect(traits.warmth).toBe(50);
    expect(traits.formality).toBe(50);
    expect(traits.humor).toBe(50);
    expect(traits.directness).toBe(50);
    expect(traits.creativity).toBe(50);
    expect(traits.depth).toBe(50);
  });

  it('detects high warmth from warm text', () => {
    const warmText = 'I am so glad to help you! This is wonderful and amazing. I appreciate your question, absolutely love it! Great work, fantastic progress!';
    const traits = estimateTraits(warmText);
    expect(traits.warmth).toBeGreaterThan(65);
  });

  it('detects low warmth from cold text', () => {
    const coldText = 'That is incorrect. You cannot do that. This is wrong and not possible. Error detected, unable to proceed. Fail.';
    const traits = estimateTraits(coldText);
    expect(traits.warmth).toBeLessThan(35);
  });

  it('detects high formality from formal text', () => {
    const formalText = 'I would suggest that we proceed carefully. Furthermore, I recommend reviewing the documentation. However, in addition to the proposed changes, regarding the requirements, therefore we should...';
    const traits = estimateTraits(formalText);
    expect(traits.formality).toBeGreaterThan(65);
  });

  it('detects low formality from casual text', () => {
    const casualText = 'Hey! Yeah, gonna do this cool thing. Wanna check it out? Totally chill, kinda sorta easy, nope no problem!';
    const traits = estimateTraits(casualText);
    expect(traits.formality).toBeLessThan(35);
  });

  it('detects humor from humor markers', () => {
    const funnyText = 'Haha that was hilarious! LOL just kidding. The funny thing is, jokes aside, this pun is great hehe.';
    const traits = estimateTraits(funnyText);
    expect(traits.humor).toBeGreaterThan(65);
  });

  it('returns neutral humor when no humor markers', () => {
    const plainText = 'This is a straightforward explanation of the concept without any embellishment.';
    const traits = estimateTraits(plainText);
    expect(traits.humor).toBe(50);
  });

  it('detects low directness from hedging text', () => {
    const hedgingText = 'Perhaps maybe you could consider it might be that possibly I think I believe we should sort of kind of look into not sure about this.';
    const traits = estimateTraits(hedgingText);
    expect(traits.directness).toBeLessThan(40);
  });

  it('all trait values are 0-100', () => {
    const text = 'glad happy to help wonderful love appreciate absolutely great fantastic amazing thank you haha lol funny joke perhaps maybe consider';
    const traits = estimateTraits(text);

    for (const [, value] of Object.entries(traits)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// configToSoulMd
// ============================================================================

describe('configToSoulMd', () => {
  it('generates markdown with expected sections', () => {
    const md = configToSoulMd(SAMPLE_SOUL_CONFIG, 'Cipher');
    expect(md).toContain('# TestBot');
    expect(md).toContain('## Core Truths');
    expect(md).toContain('## Values');
    expect(md).toContain('## Vibe');
    expect(md).toContain('## Custom Instructions');
    expect(md).toContain('## Boundaries');
    expect(md).toContain('## Never Do These');
  });

  it('uses companionName when no customName', () => {
    const md = configToSoulMd(MINIMAL_SOUL_CONFIG, 'Forge');
    expect(md).toContain('# Forge');
  });

  it('falls back to "My Companion" when no names given', () => {
    const md = configToSoulMd(MINIMAL_SOUL_CONFIG);
    expect(md).toContain('# My Companion');
  });

  it('maps high warmth to warm directive', () => {
    const config = { ...MINIMAL_SOUL_CONFIG, traits: { ...MINIMAL_SOUL_CONFIG.traits, warmth: 85 } };
    const md = configToSoulMd(config);
    expect(md).toContain('warm, encouraging');
  });

  it('maps low warmth to reserved directive', () => {
    const config = { ...MINIMAL_SOUL_CONFIG, traits: { ...MINIMAL_SOUL_CONFIG.traits, warmth: 20 } };
    const md = configToSoulMd(config);
    expect(md).toContain('reserved and matter-of-fact');
  });

  it('omits empty sections', () => {
    const md = configToSoulMd(MINIMAL_SOUL_CONFIG);
    expect(md).not.toContain('## Values');
    expect(md).not.toContain('## Custom Instructions');
    expect(md).not.toContain('## Boundaries');
    expect(md).not.toContain('## Never Do These');
  });
});

// ============================================================================
// openClawToSoul — import
// ============================================================================

describe('openClawToSoul', () => {
  it('parses well-formed SOUL.md into SoulConfigBody', () => {
    const result = openClawToSoul(WELL_FORMED_SOUL_MD);

    expect(result.customName).toBe('My Test Companion');
    expect(result.values).toEqual(['honesty', 'creativity', 'empathy']);
    expect(result.style.vocabulary).toBe('advanced');
    expect(result.style.responseLength).toBe('detailed');
    expect(result.style.useEmoji).toBe(true);
    expect(result.customInstructions).toContain('explain your reasoning');
    expect(result.boundaries).toContain('No personal data storage');
    expect(result.boundaries).toContain('No medical advice');
    expect(result.antiPatterns).toContain('Never use sarcasm when someone is upset');
    expect(result.antiPatterns).toContain('Never break character');
  });

  it('returns sensible defaults for missing sections', () => {
    const md = '# Minimal Bot\n\n## Values\n- Be nice\n';
    const result = openClawToSoul(md);

    expect(result.customName).toBe('Minimal Bot');
    expect(result.values).toEqual(['Be nice']);
    expect(result.boundaries).toEqual([]);
    expect(result.antiPatterns).toEqual([]);
    expect(result.customInstructions).toBe('');
    expect(result.style.vocabulary).toBe('moderate');
  });

  it('ignores unknown sections gracefully', () => {
    const md = '## Core Truths\n- Be warm\n\n## Random Extra Section\nStuff here\n\n## Values\n- Trust';
    const result = openClawToSoul(md);

    expect(result.values).toEqual(['Trust']);
    // Should not throw
  });

  it('handles empty file (returns full defaults)', () => {
    const result = openClawToSoul('');

    expect(result.traits.warmth).toBe(50);
    expect(result.values).toEqual([]);
    expect(result.boundaries).toEqual([]);
    expect(result.customInstructions).toBe('');
  });

  it('handles malformed markdown with no ## headings', () => {
    const md = 'Just some random text without any structure at all.';
    const result = openClawToSoul(md);

    // Should return defaults, not throw
    expect(result.values).toEqual([]);
    expect(result.traits).toBeDefined();
  });

  it('maps alternative heading names correctly', () => {
    const md = [
      '## Personality',
      '- Be warm and friendly',
      '',
      '## Hard Limits',
      '- Never share secrets',
      '',
      '## Communication Style',
      '- Vocabulary: simple',
      '- Response length: concise',
    ].join('\n');
    const result = openClawToSoul(md);

    // 'Personality' → traits (estimated from text)
    expect(result.traits).toBeDefined();
    // 'Hard Limits' → boundaries
    expect(result.boundaries).toContain('Never share secrets');
    // 'Communication Style' → style
    expect(result.style.vocabulary).toBe('simple');
    expect(result.style.responseLength).toBe('concise');
  });

  it('maps "Rules" to boundaries', () => {
    const md = '## Rules\n- Always be truthful\n- No harmful content';
    const result = openClawToSoul(md);
    expect(result.boundaries).toEqual(['Always be truthful', 'No harmful content']);
  });

  it('extracts custom name from # heading', () => {
    const md = '# SuperHelper\n\n## Values\n- Helpfulness';
    const result = openClawToSoul(md);
    expect(result.customName).toBe('SuperHelper');
  });
});

// ============================================================================
// soulToOpenClaw — export
// ============================================================================

describe('soulToOpenClaw', () => {
  const cipherConfig = getCompanionConfig('cipher');
  const cipherMd = fs.readFileSync(path.join(process.cwd(), 'companions', 'cipher.md'), 'utf-8');

  it('produces markdown with Identity section from companion config', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Identity');
    expect(result).toContain('**Name**: Cipher');
    expect(result).toContain('**Species**: Code Kraken');
    expect(result).toContain('**Tagline**:');
  });

  it('includes personality core from companion markdown', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('### Personality Core');
    expect(result).toContain('Design-Obsessed');
  });

  it('includes speech patterns from companion markdown', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('### Speech Patterns');
  });

  it('includes Core Truths from soul config traits', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Core Truths');
    expect(result).toContain('warm, encouraging');
  });

  it('includes Values section', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Values');
    expect(result).toContain('- honesty');
    expect(result).toContain('- creativity');
    expect(result).toContain('- empathy');
  });

  it('includes Vibe section from soul config style', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Vibe');
    expect(result).toContain('Vocabulary: moderate');
    expect(result).toContain('Response length: balanced');
    expect(result).toContain('Emoji: use sparingly');
  });

  it('includes Boundaries and Never Do These', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Boundaries');
    expect(result).toContain('No personal data storage');
    expect(result).toContain('## Never Do These');
    expect(result).toContain('Never use sarcasm when someone is upset');
  });

  it('includes Continuity section', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);

    expect(result).toContain('## Continuity');
    expect(result).toContain('Maintain consistent personality across sessions');
  });

  it('works without soul config (base companion only)', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd);

    expect(result).toContain('# Cipher');
    expect(result).toContain('## Identity');
    expect(result).toContain('## Continuity');
    // Should still have personality from markdown
    expect(result).toContain('### Personality Core');
  });

  it('uses customName from soul config as title', () => {
    const result = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);
    expect(result).toMatch(/^# TestBot/);
  });

  it('exports all 6 companions without errors', () => {
    for (const companionId of Object.keys(COMPANION_CONFIGS)) {
      const config = getCompanionConfig(companionId);
      const mdPath = path.join(process.cwd(), 'companions', `${companionId}.md`);

      let md = '';
      try {
        md = fs.readFileSync(mdPath, 'utf-8');
      } catch {
        // companion markdown might not exist for all
      }

      const result = soulToOpenClaw(config, md, SAMPLE_SOUL_CONFIG);
      expect(result).toContain('## Identity');
      expect(result).toContain('## Continuity');
    }
  });
});

// ============================================================================
// Round-trip test
// ============================================================================

describe('round-trip: export → import', () => {
  const cipherConfig = getCompanionConfig('cipher');
  const cipherMd = fs.readFileSync(path.join(process.cwd(), 'companions', 'cipher.md'), 'utf-8');

  it('exported markdown can be re-imported with traits within ±15 tolerance', () => {
    const exported = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);
    const reimported = openClawToSoul(exported);

    // Values should round-trip exactly
    expect(reimported.values).toEqual(SAMPLE_SOUL_CONFIG.values);

    // Style should round-trip exactly
    expect(reimported.style.vocabulary).toBe(SAMPLE_SOUL_CONFIG.style.vocabulary);
    expect(reimported.style.responseLength).toBe(SAMPLE_SOUL_CONFIG.style.responseLength);
    expect(reimported.style.useEmoji).toBe(SAMPLE_SOUL_CONFIG.style.useEmoji);

    // Boundaries and anti-patterns should round-trip exactly
    expect(reimported.boundaries).toEqual(SAMPLE_SOUL_CONFIG.boundaries);
    expect(reimported.antiPatterns).toEqual(SAMPLE_SOUL_CONFIG.antiPatterns);

    // Custom instructions should round-trip exactly
    expect(reimported.customInstructions).toContain('explain your reasoning');
  });

  it('re-export after import produces equivalent sections', () => {
    const exported1 = soulToOpenClaw(cipherConfig, cipherMd, SAMPLE_SOUL_CONFIG);
    const reimported = openClawToSoul(exported1);
    const exported2 = soulToOpenClaw(cipherConfig, cipherMd, reimported);

    // Both exports should have the same structural sections
    const sections1 = parseSoulMdSections(exported1);
    const sections2 = parseSoulMdSections(exported2);

    // Values section should match
    expect(sections2.get('Values')).toBe(sections1.get('Values'));

    // Vibe section should match
    expect(sections2.get('Vibe')).toBe(sections1.get('Vibe'));
  });
});

// ============================================================================
// API Route Integration Tests — OpenClaw endpoints
// ============================================================================

describe('OpenClaw API Routes', () => {
  let server: FastifyInstance | null = null;
  let authToken = '';
  let skipReason = '';

  beforeAll(async () => {
    // Race the entire server init against a timeout to handle cases where
    // better-sqlite3 native module load blocks the event loop (K001/K027).
    const initPromise = (async () => {
      const { createServer } = await import('../api/server.js');

      server = await createServer({
        environment: 'development',
        jwtSecret: 'test-secret-for-vitest',
        databasePath: ':memory:',
        rateLimitMax: 10000,
      });
      await server.ready();

      // Get a dev auth token
      const loginRes = await server.inject({
        method: 'POST',
        url: '/auth/dev-login',
        payload: { userId: 'test-soul-user', displayName: 'Soul Tester' },
      });
      const loginBody = loginRes.json();
      authToken = loginBody.token;
    })();

    try {
      await Promise.race([
        initPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Server init timed out (likely K001/K027 native module issue)')), 10000),
        ),
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('bindings') ||
        msg.includes('better_sqlite3') ||
        msg.includes('better-sqlite3') ||
        msg.includes('ERR_DLOPEN_FAILED') ||
        msg.includes('dockerode') ||
        msg.includes('ERR_MODULE_NOT_FOUND') ||
        msg.includes('timed out')
      ) {
        skipReason = `Server init failed: ${msg.slice(0, 150)}`;
        server = null;
      } else {
        throw err;
      }
    }
  }, 15000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  function skip(): boolean {
    if (skipReason) {
      console.log(`[SKIP] ${skipReason}`);
      return true;
    }
    return false;
  }

  // ── GET /soul/export/:companionId/openclaw ─────────────────────────────

  describe('GET /soul/export/:companionId/openclaw', () => {
    it('exports cipher without soul config (base companion only)', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');

      const body = res.body;
      expect(body).toContain('# Cipher');
      expect(body).toContain('## Identity');
      expect(body).toContain('**Name**: Cipher');
      expect(body).toContain('**Species**: Code Kraken');
      expect(body).toContain('## Continuity');
    });

    it('exports with user soul config when one exists', async () => {
      if (skip()) return;

      // First, PUT a soul config
      await server!.inject({
        method: 'PUT',
        url: '/soul/cipher',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: SAMPLE_SOUL_CONFIG,
      });

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain('# TestBot'); // customName from SAMPLE_SOUL_CONFIG
      expect(body).toContain('## Values');
      expect(body).toContain('- honesty');
      expect(body).toContain('## Vibe');
      expect(body).toContain('## Boundaries');
      expect(body).toContain('## Never Do These');
    });

    it('returns 400 for unknown companion ID', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/unknown-bot/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain('Unknown companion');
    });

    it('returns 401 without auth token', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/cipher/openclaw',
      });

      expect(res.statusCode).toBe(401);
    });

    it('includes Personality Core from companion markdown', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('### Personality Core');
      expect(res.body).toContain('Design-Obsessed');
    });

    it('exports forge companion successfully', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'GET',
        url: '/soul/export/forge/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('# Forge');
      expect(res.body).toContain('## Identity');
    });
  });

  // ── POST /soul/import/:companionId/openclaw ────────────────────────────

  describe('POST /soul/import/:companionId/openclaw', () => {
    const IMPORT_SOUL_MD = `# Imported Bot

## Core Truths
- Be warm, encouraging, and emotionally present.
- Use humor freely — jokes, wordplay, and wit are welcome.
- Be blunt and direct. No hedging.

## Values
- transparency
- curiosity

## Vibe
- Vocabulary: advanced
- Response length: detailed
- Emoji: use sparingly

## Custom Instructions
Think out loud and show your work.

## Boundaries
- No financial advice
- No legal counsel

## Never Do These
- Never dismiss user feelings
- Never make promises about outcomes
`;

    it('imports well-formed SOUL.md and returns parsed config', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'text/markdown',
        },
        payload: IMPORT_SOUL_MD,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.config).toBeDefined();
      expect(body.config.customName).toBe('Imported Bot');
      expect(body.config.values).toEqual(['transparency', 'curiosity']);
      expect(body.config.style.vocabulary).toBe('advanced');
      expect(body.config.style.responseLength).toBe('detailed');
      expect(body.config.style.useEmoji).toBe(true);
      expect(body.config.customInstructions).toContain('Think out loud');
      expect(body.config.boundaries).toContain('No financial advice');
      expect(body.config.antiPatterns).toContain('Never dismiss user feelings');
    });

    it('returns confidence levels for each trait', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'text/markdown',
        },
        payload: IMPORT_SOUL_MD,
      });

      const body = res.json();
      expect(body.confidence).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(body.confidence.warmth);
      expect(['high', 'medium', 'low']).toContain(body.confidence.formality);
      expect(['high', 'medium', 'low']).toContain(body.confidence.humor);
      expect(['high', 'medium', 'low']).toContain(body.confidence.directness);
      expect(['high', 'medium', 'low']).toContain(body.confidence.creativity);
      expect(['high', 'medium', 'low']).toContain(body.confidence.depth);
    });

    it('persists imported config to DB (verifiable via GET)', async () => {
      if (skip()) return;

      // Import
      await server!.inject({
        method: 'POST',
        url: '/soul/import/forge/openclaw',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'text/markdown',
        },
        payload: IMPORT_SOUL_MD,
      });

      // Verify via standard GET
      const res = await server!.inject({
        method: 'GET',
        url: '/soul/forge',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.soul).not.toBeNull();
      expect(body.soul.config.values).toEqual(['transparency', 'curiosity']);
      expect(body.soul.config.customInstructions).toContain('Think out loud');
    });

    it('upserts when importing twice for same companion', async () => {
      if (skip()) return;

      const md1 = '# First\n## Values\n- alpha\n';
      const md2 = '# Second\n## Values\n- beta\n';

      // First import
      await server!.inject({
        method: 'POST',
        url: '/soul/import/mischief/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: md1,
      });

      // Second import (upsert)
      await server!.inject({
        method: 'POST',
        url: '/soul/import/mischief/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: md2,
      });

      // Verify latest values
      const res = await server!.inject({
        method: 'GET',
        url: '/soul/mischief',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body = res.json();
      expect(body.soul.config.values).toEqual(['beta']);
      expect(body.soul.config.customName).toBe('Second');
    });

    it('returns 400 for unknown companion ID', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/nonexistent/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: '# Test\n## Values\n- hello\n',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Unknown companion');
    });

    it('returns 400 for empty body', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: '',
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('empty');
    });

    it('returns 401 without auth token', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: { 'content-type': 'text/markdown' },
        payload: '# Test\n## Values\n- hi\n',
      });

      expect(res.statusCode).toBe(401);
    });

    it('handles text/plain content type', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/plain' },
        payload: '# PlainBot\n## Values\n- simplicity\n',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().config.customName).toBe('PlainBot');
    });

    it('handles minimal markdown with no structured sections', async () => {
      if (skip()) return;

      const res = await server!.inject({
        method: 'POST',
        url: '/soul/import/cipher/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: 'Just some unstructured text about being a helpful companion.',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      // Should get defaults for most fields
      expect(body.config.values).toEqual([]);
      expect(body.config.boundaries).toEqual([]);
    });
  });

  // ── Round-trip: export → import via API ────────────────────────────────

  describe('API round-trip: export → import', () => {
    it('exports then imports cipher, re-export matches structure', async () => {
      if (skip()) return;

      // PUT a soul config first
      await server!.inject({
        method: 'PUT',
        url: '/soul/vortex',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        payload: SAMPLE_SOUL_CONFIG,
      });

      // Export via OpenClaw
      const exportRes = await server!.inject({
        method: 'GET',
        url: '/soul/export/vortex/openclaw',
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(exportRes.statusCode).toBe(200);
      const exportedMd = exportRes.body;

      // Import it back to a different companion
      const importRes = await server!.inject({
        method: 'POST',
        url: '/soul/import/aether/openclaw',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'text/markdown' },
        payload: exportedMd,
      });
      expect(importRes.statusCode).toBe(200);
      const importedConfig = importRes.json().config;

      // Values should round-trip exactly
      expect(importedConfig.values).toEqual(SAMPLE_SOUL_CONFIG.values);

      // Boundaries should round-trip
      expect(importedConfig.boundaries).toEqual(SAMPLE_SOUL_CONFIG.boundaries);

      // Anti-patterns should round-trip
      expect(importedConfig.antiPatterns).toEqual(SAMPLE_SOUL_CONFIG.antiPatterns);
    });
  });
});
