/**
 * Language Detection - Detects user's language from message text
 *
 * Uses Unicode script detection for CJK, Cyrillic, Arabic, etc.
 * Falls back to 'en' for Latin-script languages (more specific detection
 * would require a full NLP library or API call).
 */

/** Supported language codes */
export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ru' | 'uk' | 'ar' | 'fa' |
  'zh' | 'ja' | 'ko' | 'hi' | 'bn' | 'th' | 'vi' | 'tr' | 'pl' | 'nl';

interface ScriptPattern {
  pattern: RegExp;
  language: LanguageCode;
  name: string;
}

const SCRIPT_PATTERNS: ScriptPattern[] = [
  { pattern: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, language: 'zh', name: 'Chinese' },
  { pattern: /[\u3040-\u309F\u30A0-\u30FF]/g, language: 'ja', name: 'Japanese' },
  { pattern: /[\uAC00-\uD7AF\u1100-\u11FF]/g, language: 'ko', name: 'Korean' },
  { pattern: /[\u0600-\u06FF\u0750-\u077F]/g, language: 'ar', name: 'Arabic' },
  { pattern: /[\u0400-\u04FF]/g, language: 'ru', name: 'Russian/Cyrillic' },
  { pattern: /[\u0900-\u097F]/g, language: 'hi', name: 'Hindi' },
  { pattern: /[\u0980-\u09FF]/g, language: 'bn', name: 'Bengali' },
  { pattern: /[\u0E00-\u0E7F]/g, language: 'th', name: 'Thai' },
  { pattern: /[\u0600-\u06FF]\u06CC/g, language: 'fa', name: 'Persian' },
];

// Common words for Latin-script language detection (Sets for O(1) lookup)
const LATIN_MARKERS: Array<{ words: Set<string>; language: LanguageCode }> = [
  { words: new Set(['el', 'la', 'los', 'las', 'es', 'está', 'por', 'como', 'pero', 'más', 'también', 'hola', 'gracias', 'quiero']), language: 'es' },
  { words: new Set(['le', 'la', 'les', 'des', 'est', 'sont', 'avec', 'pour', 'mais', 'bonjour', 'merci', 'je', 'nous', 'vous']), language: 'fr' },
  { words: new Set(['der', 'die', 'das', 'ist', 'sind', 'mit', 'für', 'aber', 'hallo', 'danke', 'ich', 'wir', 'sie']), language: 'de' },
  { words: new Set(['o', 'a', 'os', 'as', 'é', 'está', 'com', 'para', 'mas', 'olá', 'obrigado', 'eu', 'nós', 'você']), language: 'pt' },
  { words: new Set(['il', 'la', 'gli', 'le', 'è', 'sono', 'con', 'per', 'ma', 'ciao', 'grazie', 'io', 'noi']), language: 'it' },
  { words: new Set(['ve', 'bir', 'bu', 'için', 'ile', 'ama', 'merhaba', 'teşekkür', 'ben', 'biz']), language: 'tr' },
  { words: new Set(['i', 'w', 'na', 'do', 'nie', 'jest', 'są', 'z', 'ale', 'cześć', 'dziękuję', 'ja', 'my']), language: 'pl' },
  { words: new Set(['de', 'het', 'een', 'is', 'zijn', 'met', 'voor', 'maar', 'hallo', 'dank', 'ik', 'wij']), language: 'nl' },
];

/**
 * Detect language from text content.
 * Returns ISO 639-1 language code.
 */
export function detectLanguage(text: string): LanguageCode {
  if (!text || text.trim().length < 3) return 'en';

  // Check non-Latin scripts first (most reliable) — patterns pre-compiled with 'g' flag
  for (const { pattern, language } of SCRIPT_PATTERNS) {
    pattern.lastIndex = 0; // Reset stateful 'g' regex before each use
    const matches = text.match(pattern);
    if (matches && matches.length >= 2) {
      return language;
    }
  }

  // For Latin script, check common word markers (Set.has for O(1) per word)
  const words = text.toLowerCase().split(/\s+/);
  let bestMatch: LanguageCode = 'en';
  let bestScore = 0;

  for (const { words: markerSet, language } of LATIN_MARKERS) {
    let score = 0;
    for (const w of words) {
      if (markerSet.has(w)) score++;
    }
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = language;
    }
  }

  return bestMatch;
}

/** Get a friendly language name */
export function getLanguageName(code: LanguageCode): string {
  const names: Record<LanguageCode, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    pt: 'Portuguese', it: 'Italian', ru: 'Russian', uk: 'Ukrainian',
    ar: 'Arabic', fa: 'Persian', zh: 'Chinese', ja: 'Japanese',
    ko: 'Korean', hi: 'Hindi', bn: 'Bengali', th: 'Thai',
    vi: 'Vietnamese', tr: 'Turkish', pl: 'Polish', nl: 'Dutch',
  };
  return names[code] ?? 'English';
}

/** Get a system prompt addition for the detected language */
export function getLanguagePromptAddition(code: LanguageCode): string {
  if (code === 'en') return '';
  const name = getLanguageName(code);
  return `\n\nIMPORTANT: The user is writing in ${name}. Respond in ${name} while maintaining your personality.`;
}
