/**
 * Bot Handlers Unit Tests
 *
 * Tests for sanitizeInput, escapeMarkdown (sanitize.ts),
 * detectLanguage, getLanguageName, getLanguagePromptAddition (language.ts).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeInput, escapeMarkdown } from '../bot/utils/sanitize.js';
import {
  detectLanguage,
  getLanguageName,
  getLanguagePromptAddition,
  type LanguageCode,
} from '../bot/utils/language.js';

// ============================================================================
// sanitizeInput
// ============================================================================

describe('sanitizeInput', () => {
  it('returns trimmed input unchanged when already clean', () => {
    expect(sanitizeInput('hello world')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('strips control characters but preserves newlines and tabs', () => {
    // \x00 = NUL, \x07 = BEL, \x1F = US -- all should be removed
    const dirty = 'hello\x00\x07world\x1F!';
    expect(sanitizeInput(dirty)).toBe('helloworld!');
  });

  it('preserves newlines (\\n) and carriage returns (\\r)', () => {
    expect(sanitizeInput('line1\nline2\rline3')).toBe('line1\nline2\rline3');
  });

  it('preserves tabs', () => {
    expect(sanitizeInput('col1\tcol2')).toBe('col1\tcol2');
  });

  it('truncates input to the default max length of 4096', () => {
    const long = 'a'.repeat(5000);
    const result = sanitizeInput(long);
    expect(result.length).toBe(4096);
  });

  it('truncates to a custom max length', () => {
    const result = sanitizeInput('abcdefghij', 5);
    expect(result).toBe('abcde');
  });

  it('handles empty string', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('handles string that is only whitespace', () => {
    expect(sanitizeInput('   \t  \n  ')).toBe('');
  });

  it('handles string that is only control characters', () => {
    expect(sanitizeInput('\x00\x01\x02\x03')).toBe('');
  });

  it('handles unicode emoji and special characters', () => {
    expect(sanitizeInput('Hello 🐙 World! 你好')).toBe('Hello 🐙 World! 你好');
  });

  it('strips DEL character (\\x7F)', () => {
    expect(sanitizeInput('hello\x7Fworld')).toBe('helloworld');
  });
});

// ============================================================================
// escapeMarkdown
// ============================================================================

describe('escapeMarkdown', () => {
  it('escapes underscores', () => {
    expect(escapeMarkdown('hello_world')).toBe('hello\\_world');
  });

  it('escapes asterisks', () => {
    expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
  });

  it('escapes square brackets', () => {
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)');
  });

  it('escapes backticks', () => {
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
  });

  it('escapes tildes', () => {
    expect(escapeMarkdown('~strike~')).toBe('\\~strike\\~');
  });

  it('does not double-escape already escaped characters', () => {
    // A backslash itself is in the escape set, so it gets escaped
    expect(escapeMarkdown('hello\\world')).toBe('hello\\\\world');
  });

  it('returns plain text unchanged', () => {
    expect(escapeMarkdown('plain text 123')).toBe('plain text 123');
  });

  it('handles empty string', () => {
    expect(escapeMarkdown('')).toBe('');
  });
});

// ============================================================================
// detectLanguage
// ============================================================================

describe('detectLanguage', () => {
  it('defaults to English for empty string', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('defaults to English for very short text (< 3 chars)', () => {
    expect(detectLanguage('hi')).toBe('en');
  });

  it('defaults to English for whitespace-only input', () => {
    expect(detectLanguage('   ')).toBe('en');
  });

  it('detects English for normal English text', () => {
    expect(detectLanguage('Hello, how are you doing today?')).toBe('en');
  });

  // --- Non-Latin script detection (Unicode ranges) ---

  it('detects Chinese from CJK characters', () => {
    expect(detectLanguage('你好世界，今天天气真好')).toBe('zh');
  });

  it('detects Japanese from Hiragana/Katakana', () => {
    // Use a string with primarily Hiragana/Katakana (no kanji, which overlaps CJK)
    expect(detectLanguage('おはようございます。カタカナですね')).toBe('ja');
  });

  it('detects Korean from Hangul characters', () => {
    expect(detectLanguage('안녕하세요 반갑습니다')).toBe('ko');
  });

  it('detects Arabic from Arabic script', () => {
    expect(detectLanguage('مرحبا بالعالم كيف حالك')).toBe('ar');
  });

  it('detects Russian from Cyrillic script', () => {
    expect(detectLanguage('Привет мир, как дела')).toBe('ru');
  });

  it('detects Hindi from Devanagari script', () => {
    expect(detectLanguage('नमस्ते दुनिया आज कैसे हो')).toBe('hi');
  });

  it('detects Bengali from Bengali script', () => {
    expect(detectLanguage('নমস্কার পৃথিবী আজ কেমন আছো')).toBe('bn');
  });

  it('detects Thai from Thai script', () => {
    expect(detectLanguage('สวัสดีครับ วันนี้อากาศดีมาก')).toBe('th');
  });

  // --- Latin-script language detection (keyword-based) ---

  it('detects Spanish from common Spanish words', () => {
    expect(detectLanguage('Hola, como está usted hoy por la mañana')).toBe('es');
  });

  it('detects French from common French words', () => {
    expect(detectLanguage('Bonjour, je suis très content pour vous')).toBe('fr');
  });

  it('detects German from common German words', () => {
    expect(detectLanguage('Hallo, ich bin der neue Student hier')).toBe('de');
  });

  it('detects Italian from common Italian words', () => {
    expect(detectLanguage('Ciao, io sono molto contento per noi')).toBe('it');
  });

  it('detects Turkish from common Turkish words', () => {
    expect(detectLanguage('Merhaba, ben bugün için çok mutluyum')).toBe('tr');
  });

  it('detects Polish from common Polish words', () => {
    expect(detectLanguage('Cześć, ja i my nie jest to dobre')).toBe('pl');
  });

  it('falls back to English when Latin text has no strong markers', () => {
    expect(detectLanguage('The quick brown fox jumps over the lazy dog')).toBe('en');
  });

  it('requires at least 2 script matches for non-Latin detection', () => {
    // A single Chinese character among English should not trigger Chinese
    expect(detectLanguage('Hello 好 world today')).toBe('en');
  });

  it('requires at least 2 word matches for Latin detection', () => {
    // Only 1 Spanish word embedded in English
    expect(detectLanguage('The hola big test for today')).toBe('en');
  });
});

// ============================================================================
// getLanguageName
// ============================================================================

describe('getLanguageName', () => {
  const expected: Record<LanguageCode, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    pt: 'Portuguese', it: 'Italian', ru: 'Russian', uk: 'Ukrainian',
    ar: 'Arabic', fa: 'Persian', zh: 'Chinese', ja: 'Japanese',
    ko: 'Korean', hi: 'Hindi', bn: 'Bengali', th: 'Thai',
    vi: 'Vietnamese', tr: 'Turkish', pl: 'Polish', nl: 'Dutch',
  };

  for (const [code, name] of Object.entries(expected)) {
    it(`returns "${name}" for code "${code}"`, () => {
      expect(getLanguageName(code as LanguageCode)).toBe(name);
    });
  }
});

// ============================================================================
// getLanguagePromptAddition
// ============================================================================

describe('getLanguagePromptAddition', () => {
  it('returns empty string for English', () => {
    expect(getLanguagePromptAddition('en')).toBe('');
  });

  it('returns a prompt addition mentioning Spanish for "es"', () => {
    const result = getLanguagePromptAddition('es');
    expect(result).toContain('Spanish');
    expect(result).toContain('Respond in Spanish');
  });

  it('returns a prompt addition mentioning Chinese for "zh"', () => {
    const result = getLanguagePromptAddition('zh');
    expect(result).toContain('Chinese');
    expect(result).toContain('Respond in Chinese');
  });

  it('returns a prompt addition mentioning Arabic for "ar"', () => {
    const result = getLanguagePromptAddition('ar');
    expect(result).toContain('Arabic');
    expect(result).toContain('Respond in Arabic');
  });

  it('contains IMPORTANT directive for non-English languages', () => {
    expect(getLanguagePromptAddition('fr')).toContain('IMPORTANT');
    expect(getLanguagePromptAddition('de')).toContain('IMPORTANT');
    expect(getLanguagePromptAddition('ja')).toContain('IMPORTANT');
  });

  it('mentions maintaining personality', () => {
    expect(getLanguagePromptAddition('ru')).toContain('maintaining your personality');
  });
});
