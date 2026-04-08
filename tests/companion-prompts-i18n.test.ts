/**
 * Tests for language injection in buildCompanionPrompt.
 * Verifies that non-English language preferences append the correct
 * instruction to the system prompt, and English omits it.
 */
import { describe, it, expect } from 'vitest';
import { buildCompanionPrompt, LANGUAGE_NAMES } from '../inference/companion-prompts.js';

describe('buildCompanionPrompt — language injection', () => {
  it('omits language instruction when language is "en"', () => {
    const prompt = buildCompanionPrompt('cipher', undefined, { language: 'en' });
    expect(prompt).not.toContain('IMPORTANT: Respond in');
  });

  it('omits language instruction when language is undefined', () => {
    const prompt = buildCompanionPrompt('cipher');
    expect(prompt).not.toContain('IMPORTANT: Respond in');
  });

  it('omits language instruction when options is undefined', () => {
    const prompt = buildCompanionPrompt('cipher', undefined, undefined);
    expect(prompt).not.toContain('IMPORTANT: Respond in');
  });

  it('appends Japanese instruction when language is "ja"', () => {
    const prompt = buildCompanionPrompt('cipher', undefined, { language: 'ja' });
    expect(prompt).toContain('IMPORTANT: Respond in Japanese.');
    expect(prompt).toContain('Keep your personality, tone, and character exactly the same regardless of language.');
  });

  it('appends Spanish instruction when language is "es"', () => {
    const prompt = buildCompanionPrompt('forge', undefined, { language: 'es' });
    expect(prompt).toContain('IMPORTANT: Respond in Spanish.');
  });

  it('appends Korean instruction when language is "ko"', () => {
    const prompt = buildCompanionPrompt('mischief', undefined, { language: 'ko' });
    expect(prompt).toContain('IMPORTANT: Respond in Korean.');
  });

  it('uses raw ISO code when language is not in LANGUAGE_NAMES', () => {
    const prompt = buildCompanionPrompt('cipher', undefined, { language: 'sw' });
    expect(prompt).toContain('IMPORTANT: Respond in sw.');
  });

  it('preserves companion personality in prompt when language is set', () => {
    const prompt = buildCompanionPrompt('vortex', undefined, { language: 'de' });
    // Vortex personality should still be present
    expect(prompt).toContain('Vortex');
    expect(prompt).toContain('IMPORTANT: Respond in German.');
  });

  it('works with short prompts and language', () => {
    const prompt = buildCompanionPrompt('cipher', undefined, { short: true, language: 'fr' });
    expect(prompt).toContain('IMPORTANT: Respond in French.');
    // Short prompt should be present
    expect(prompt).toContain('Cipher');
  });

  it('language instruction appears after context section', () => {
    const prompt = buildCompanionPrompt('cipher', {
      userName: 'TestUser',
      timeContext: 'Monday, 3:00 PM',
    }, { language: 'zh' });
    const langIdx = prompt.indexOf('IMPORTANT: Respond in Chinese.');
    const contextIdx = prompt.indexOf('TestUser');
    expect(langIdx).toBeGreaterThan(contextIdx);
  });
});

describe('LANGUAGE_NAMES', () => {
  it('covers all 12 supported locales', () => {
    const expectedLocales = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'it', 'ru', 'hi', 'tr'];
    for (const locale of expectedLocales) {
      expect(LANGUAGE_NAMES[locale]).toBeDefined();
      expect(typeof LANGUAGE_NAMES[locale]).toBe('string');
    }
  });

  it('has reasonable names for all entries', () => {
    expect(LANGUAGE_NAMES['ja']).toBe('Japanese');
    expect(LANGUAGE_NAMES['ko']).toBe('Korean');
    expect(LANGUAGE_NAMES['zh']).toBe('Chinese');
    expect(LANGUAGE_NAMES['de']).toBe('German');
  });
});
