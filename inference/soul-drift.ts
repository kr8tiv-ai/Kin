/**
 * Soul Drift Detection — KIN AI companion platform
 *
 * Detects when a companion's behavior drifts from the user's configured
 * soul/personality traits by analyzing assistant messages for linguistic
 * signals that map to each trait dimension.
 *
 * @module inference/soul-drift
 */

import { createHash } from 'node:crypto';
import type { SoulTraits, SoulStyle, SoulConfigBody } from './soul-types.js';

// Re-export types so existing consumers don't break
export type { SoulTraits, SoulStyle, SoulConfigBody };

// Legacy alias used internally
type SoulConfig = SoulConfigBody;

// ============================================================================
// computeSoulHash
// ============================================================================

/**
 * Returns the SHA-256 hex digest of the canonical JSON of the soul config.
 * Use this to detect whether the config has changed between sessions.
 */
export function computeSoulHash(config: SoulConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex');
}

// ============================================================================
// scoreDrift — trait signal helpers
// ============================================================================

/** Count how many times any of the given phrases appear (case-insensitive) in text. */
function countPhrases(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of phrases) {
    // Simple substring count — quick and allocation-light for typical message sizes
    let pos = 0;
    while ((pos = lower.indexOf(phrase.toLowerCase(), pos)) !== -1) {
      count++;
      pos += phrase.length;
    }
  }
  return count;
}

/** Count emoji characters via Unicode ranges. */
function countEmoji(text: string): number {
  // Match common emoji Unicode blocks (Emoticons, Symbols, Pictographs, etc.)
  const emojiPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  return (text.match(emojiPattern) ?? []).length;
}

/** Count contractions (e.g. "don't", "I'm", "you're") */
function countContractions(text: string): number {
  return (text.match(/\b\w+'\w+\b/g) ?? []).length;
}

/** Count words in a string. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Trait signal dictionaries ────────────────────────────────────────────────

export const WARM_PHRASES = [
  "glad",
  "happy to help",
  "great",
  "wonderful",
  "love",
  "appreciate",
  "absolutely",
  "of course",
  "pleasure",
  "awesome",
  "amazing",
  "fantastic",
  "thank you",
  "thanks",
];

export const COLD_PHRASES = [
  "cannot",
  "unable",
  "not possible",
  "no.",
  "incorrect",
  "wrong",
  "error",
  "fail",
];

export const FORMAL_MARKERS = [
  "would you",
  "please",
  "i recommend",
  "i suggest",
  "i would",
  "furthermore",
  "therefore",
  "however",
  "in addition",
  "regarding",
];

export const CASUAL_MARKERS = [
  "hey",
  "gonna",
  "wanna",
  "gotta",
  "cool",
  "yeah",
  "yep",
  "nope",
  "chill",
  "totally",
  "kinda",
  "sorta",
];

export const HUMOR_MARKERS = [
  "haha",
  "lol",
  "lmao",
  "hehe",
  "joke",
  "kidding",
  "funny",
  "pun",
  "ha!",
  "hilarious",
];

export const HEDGING_PHRASES = [
  "perhaps",
  "maybe",
  "consider",
  "it might be",
  "you could",
  "possibly",
  "might want to",
  "seems like",
  "kind of",
  "sort of",
  "i think",
  "i believe",
  "not sure",
  "could be",
];

export const CREATIVITY_MARKERS = [
  "what if",
  "alternatively",
  "creative approach",
  "outside the box",
  "unconventional",
  "novel idea",
  "another way",
  "have you considered",
  "interesting angle",
  "flip this",
];

// ── Per-trait scorers (return 0.0–1.0 alignment) ─────────────────────────────

/**
 * Warmth: ratio of warm to total warm+cold signals, normalised against target.
 * If there are no signals at all we assume neutral (0.5), then score against target.
 */
function scoreWarmth(target: number, messages: string[]): number {
  let totalWarm = 0;
  let totalCold = 0;
  let exclamationCount = 0;

  for (const msg of messages) {
    totalWarm += countPhrases(msg, WARM_PHRASES);
    totalCold += countPhrases(msg, COLD_PHRASES);
    exclamationCount += (msg.match(/!/g) ?? []).length;
  }

  // Exclamation marks contribute to warmth signal
  totalWarm += Math.min(exclamationCount, 5); // cap so they don't dominate

  const total = totalWarm + totalCold;
  const measuredRatio = total === 0 ? 0.5 : totalWarm / total; // 0–1
  const targetRatio = target / 100;

  return 1 - Math.abs(measuredRatio - targetRatio);
}

/**
 * Formality: ratio of formal to total formal+casual signals.
 * Contractions count as casual markers.
 */
function scoreFormality(target: number, messages: string[]): number {
  let totalFormal = 0;
  let totalCasual = 0;

  for (const msg of messages) {
    totalFormal += countPhrases(msg, FORMAL_MARKERS);
    totalCasual += countPhrases(msg, CASUAL_MARKERS) + countContractions(msg);
  }

  const total = totalFormal + totalCasual;
  const measuredRatio = total === 0 ? 0.5 : totalFormal / total;
  const targetRatio = target / 100;

  return 1 - Math.abs(measuredRatio - targetRatio);
}

/**
 * Humor: density of humor markers + emoji as a proxy.
 * We treat >0.05 markers-per-word as "high humor" (maps to 100).
 */
function scoreHumor(target: number, messages: string[]): number {
  let totalHumorSignals = 0;
  let totalWords = 0;

  for (const msg of messages) {
    totalHumorSignals += countPhrases(msg, HUMOR_MARKERS) + countEmoji(msg);
    totalWords += wordCount(msg);
  }

  if (totalWords === 0) return 1 - Math.abs(0.5 - target / 100);

  const density = totalHumorSignals / totalWords; // 0 – ~0.1 typical range
  // Map density to 0–100: density of 0.05+ → score 100
  const measured = Math.min(density / 0.05, 1.0);
  const targetNorm = target / 100;

  return 1 - Math.abs(measured - targetNorm);
}

/**
 * Directness: inversely related to hedging density.
 * More hedging = less direct.
 */
function scoreDirectness(target: number, messages: string[]): number {
  let hedgeCount = 0;
  let totalWords = 0;

  for (const msg of messages) {
    hedgeCount += countPhrases(msg, HEDGING_PHRASES);
    totalWords += wordCount(msg);
  }

  if (totalWords === 0) return 1 - Math.abs(0.5 - target / 100);

  const hedgeDensity = hedgeCount / totalWords;
  // At density 0 → directness = 1.0; at density 0.05+ → directness = 0.0
  const measured = 1 - Math.min(hedgeDensity / 0.05, 1.0);
  const targetNorm = target / 100;

  return 1 - Math.abs(measured - targetNorm);
}

/**
 * Depth: average response length in words.
 * <50 → concise (score 0.33), 50-150 → balanced (score 0.67), >150 → detailed (score 1.0)
 */
function scoreDepth(target: number, messages: string[]): number {
  if (messages.length === 0) return 1 - Math.abs(0.5 - target / 100);

  const totalWords = messages.reduce((sum, msg) => sum + wordCount(msg), 0);
  const avgWords = totalWords / messages.length;

  // Map average word count to a 0–1 scale
  let measured: number;
  if (avgWords < 50) {
    measured = 0.0 + (avgWords / 50) * 0.33;          // 0.00 – 0.33
  } else if (avgWords <= 150) {
    measured = 0.33 + ((avgWords - 50) / 100) * 0.34; // 0.33 – 0.67
  } else {
    measured = 0.67 + Math.min((avgWords - 150) / 150, 1.0) * 0.33; // 0.67 – 1.00
  }

  const targetNorm = target / 100;
  return 1 - Math.abs(measured - targetNorm);
}

/**
 * Creativity: density of creativity markers per word.
 */
function scoreCreativity(target: number, messages: string[]): number {
  let totalCreative = 0;
  let totalWords = 0;

  for (const msg of messages) {
    totalCreative += countPhrases(msg, CREATIVITY_MARKERS);
    totalWords += wordCount(msg);
  }

  if (totalWords === 0) return 1 - Math.abs(0.5 - target / 100);

  const density = totalCreative / totalWords;
  // density 0.03+ → fully creative (score 1.0)
  const measured = Math.min(density / 0.03, 1.0);
  const targetNorm = target / 100;

  return 1 - Math.abs(measured - targetNorm);
}

// ============================================================================
// scoreDrift
// ============================================================================

/**
 * Analyse assistant messages and return a soul alignment score.
 *
 * Returns 1.0 when the companion is perfectly aligned with the configured
 * soul traits, and 0.0 when fully drifted. All six trait dimensions are
 * weighted equally.
 */
export function scoreDrift(
  config: SoulConfig,
  assistantMessages: { content: string }[],
): number {
  if (assistantMessages.length === 0) {
    // No data to analyse — assume aligned
    return 1.0;
  }

  const texts = assistantMessages.map(m => m.content);
  const { traits } = config;

  const traitScores = [
    scoreWarmth(traits.warmth, texts),
    scoreFormality(traits.formality, texts),
    scoreHumor(traits.humor, texts),
    scoreDirectness(traits.directness, texts),
    scoreDepth(traits.depth, texts),
    scoreCreativity(traits.creativity, texts),
  ];

  // Clamp each score to [0, 1] defensively, then average
  const clamped = traitScores.map(s => Math.max(0, Math.min(1, s)));
  const average = clamped.reduce((sum, s) => sum + s, 0) / clamped.length;

  return Math.round(average * 1000) / 1000; // 3 decimal places
}

// ============================================================================
// needsReinforcement
// ============================================================================

/**
 * Returns true when the drift score falls below the reinforcement threshold.
 * A score below 0.7 means more than 30% drift from the configured soul.
 */
export function needsReinforcement(driftScore: number): boolean {
  return driftScore < 0.7;
}

// ============================================================================
// buildReinforcementPrefix
// ============================================================================

/** Map a 0-100 trait value to a readable intensity label. */
function traitLabel(value: number, lowLabel: string, highLabel: string): string {
  if (value >= 70) return highLabel;
  if (value <= 30) return lowLabel;
  return `moderately ${highLabel}`;
}

/**
 * Build a short system prompt prefix to reinforce soul alignment.
 * Injected at the top of the next request when needsReinforcement() is true.
 */
export function buildReinforcementPrefix(config: SoulConfig): string {
  const { traits, style, customName } = config;

  const name = customName ? `"${customName}"` : 'this companion';

  const descriptions: string[] = [
    traitLabel(traits.warmth, 'reserved', 'warm and friendly'),
    traitLabel(traits.formality, 'casual', 'formal'),
    traitLabel(traits.humor, 'serious', 'humorous'),
    traitLabel(traits.directness, 'indirect and hedging', 'direct and confident'),
    traitLabel(traits.depth, 'concise', 'thorough and detailed'),
    traitLabel(traits.creativity, 'conventional', 'creative and inventive'),
  ];

  const styleNotes: string[] = [];
  if (style.useEmoji) {
    styleNotes.push('use emoji where appropriate');
  }
  if (style.responseLength === 'concise') {
    styleNotes.push('keep responses concise');
  } else if (style.responseLength === 'detailed') {
    styleNotes.push('give detailed responses');
  }
  if (style.vocabulary === 'simple') {
    styleNotes.push('use plain vocabulary');
  } else if (style.vocabulary === 'advanced') {
    styleNotes.push('use rich vocabulary');
  }

  const traitPart = descriptions.join(', ');
  const stylePart = styleNotes.length > 0 ? ` Remember to ${styleNotes.join(', ')}.` : '';

  return `[SOUL REINFORCEMENT] Remember: you are configured to be ${traitPart} as ${name}. Stay aligned with your soul.${stylePart}`;
}
