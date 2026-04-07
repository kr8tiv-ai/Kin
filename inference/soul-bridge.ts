/**
 * Soul Bridge — Bidirectional SOUL.md ↔ SoulConfigBody translation.
 *
 * Exports a KIN companion as an OpenClaw-compatible SOUL.md file,
 * and imports a SOUL.md file back into a KIN SoulConfigBody.
 *
 * All functions are pure (input → output, no side effects) for testability.
 * Trait estimation from markdown text is inherently lossy — expect ±15 tolerance
 * on round-trip conversions.
 *
 * @module inference/soul-bridge
 */

import type { CompanionConfig } from '../companions/config.js';
import type { SoulTraits, SoulStyle, SoulConfigBody } from './soul-types.js';
import {
  WARM_PHRASES,
  COLD_PHRASES,
  FORMAL_MARKERS,
  CASUAL_MARKERS,
  HUMOR_MARKERS,
  HEDGING_PHRASES,
  CREATIVITY_MARKERS,
} from './soul-drift.js';

// Re-export types for consumers
export type { SoulTraits, SoulStyle, SoulConfigBody };

// ============================================================================
// configToSoulMd — moved from api/routes/soul.ts
// ============================================================================

/**
 * Convert a SoulConfigBody to a KIN-style markdown document.
 * This is the same function previously defined inline in soul routes.
 */
export function configToSoulMd(config: SoulConfigBody, companionName?: string): string {
  const lines: string[] = [];

  lines.push(`# ${config.customName || companionName || 'My Companion'}`);
  lines.push('');

  // Core Truths from traits
  lines.push('## Core Truths');
  const { traits } = config;
  if (traits.warmth > 70) lines.push('- Be warm, encouraging, and emotionally present.');
  else if (traits.warmth < 30) lines.push('- Be reserved and matter-of-fact.');
  if (traits.humor > 70) lines.push('- Use humor freely — jokes, wordplay, and wit are welcome.');
  else if (traits.humor < 30) lines.push('- Stay serious and focused.');
  if (traits.directness > 70) lines.push('- Be blunt and direct. No hedging.');
  else if (traits.directness < 30) lines.push('- Be diplomatic. Soften feedback.');
  if (traits.formality > 70) lines.push('- Use professional, polished language.');
  else if (traits.formality < 30) lines.push('- Keep it casual and conversational.');
  if (traits.depth > 70) lines.push('- Give thorough, detailed explanations.');
  else if (traits.depth < 30) lines.push('- Keep responses brief.');
  if (traits.creativity > 70) lines.push('- Think outside the box.');
  else if (traits.creativity < 30) lines.push('- Stick to proven approaches.');
  lines.push('');

  // Values
  if (config.values.length > 0) {
    lines.push('## Values');
    config.values.forEach((v) => lines.push(`- ${v}`));
    lines.push('');
  }

  // Vibe / Style
  lines.push('## Vibe');
  lines.push(`- Vocabulary: ${config.style.vocabulary}`);
  lines.push(`- Response length: ${config.style.responseLength}`);
  lines.push(`- Emoji: ${config.style.useEmoji ? 'use sparingly' : 'avoid'}`);
  lines.push('');

  // Custom instructions
  if (config.customInstructions.trim()) {
    lines.push('## Custom Instructions');
    lines.push(config.customInstructions.trim());
    lines.push('');
  }

  // Boundaries
  if (config.boundaries.length > 0) {
    lines.push('## Boundaries');
    config.boundaries.forEach((b) => lines.push(`- ${b}`));
    lines.push('');
  }

  // Anti-patterns
  if (config.antiPatterns.length > 0) {
    lines.push('## Never Do These');
    config.antiPatterns.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// parseSoulMdSections — markdown section parser
// ============================================================================

/**
 * Parse a SOUL.md markdown string into a map of section heading → content.
 *
 * Splits on `## Heading` lines. Content before the first ## heading is stored
 * under the key `'_preamble'`. Heading names are trimmed but otherwise
 * preserved as-is (case-sensitive).
 *
 * @example
 * parseSoulMdSections('## Core Truths\n- Be warm\n\n## Values\n- Honesty')
 * // Map { 'Core Truths' => '- Be warm', 'Values' => '- Honesty' }
 */
export function parseSoulMdSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headingPattern = /^## (.+)$/gm;

  let lastHeading: string | null = null;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(markdown)) !== null) {
    // Capture content between previous position and this heading
    const contentBefore = markdown.slice(lastIndex, match.index).trim();
    if (lastHeading === null) {
      // Content before any ## heading
      if (contentBefore) {
        sections.set('_preamble', contentBefore);
      }
    } else {
      sections.set(lastHeading, contentBefore);
    }
    lastHeading = match[1]!.trim();
    lastIndex = match.index + match[0].length;
  }

  // Capture trailing content after last heading
  if (lastHeading !== null) {
    const trailing = markdown.slice(lastIndex).trim();
    sections.set(lastHeading, trailing);
  } else if (markdown.trim()) {
    // No headings at all — entire doc is preamble
    sections.set('_preamble', markdown.trim());
  }

  return sections;
}

// ============================================================================
// estimateTraits — keyword-density trait estimation
// ============================================================================

/**
 * Count how many times any of the given phrases appear (case-insensitive) in text.
 */
function countPhrases(text: string, phrases: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const phrase of phrases) {
    let pos = 0;
    const lp = phrase.toLowerCase();
    while ((pos = lower.indexOf(lp, pos)) !== -1) {
      count++;
      pos += lp.length;
    }
  }
  return count;
}

/** Count words in text. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Estimate SoulTraits from raw text using keyword-density heuristics.
 *
 * Uses the same keyword dictionaries as soul-drift.ts for consistency.
 * Results are inherently approximate — expect ±15 tolerance on any
 * individual trait value compared to a hand-scored result.
 *
 * Traits default to 50 when insufficient signal is found.
 */
export function estimateTraits(text: string): SoulTraits {
  if (!text.trim()) {
    return { warmth: 50, formality: 50, humor: 50, directness: 50, creativity: 50, depth: 50 };
  }

  const words = wordCount(text);

  // ── Warmth: ratio of warm to warm+cold signals ──────────────────────
  const warmCount = countPhrases(text, WARM_PHRASES);
  const coldCount = countPhrases(text, COLD_PHRASES);
  const warmTotal = warmCount + coldCount;
  let warmth = 50;
  if (warmTotal > 0) {
    warmth = Math.round((warmCount / warmTotal) * 100);
  }

  // ── Formality: ratio of formal to formal+casual signals ─────────────
  const formalCount = countPhrases(text, FORMAL_MARKERS);
  const casualCount = countPhrases(text, CASUAL_MARKERS);
  const formalTotal = formalCount + casualCount;
  let formality = 50;
  if (formalTotal > 0) {
    formality = Math.round((formalCount / formalTotal) * 100);
  }

  // ── Humor: density of humor markers ─────────────────────────────────
  const humorCount = countPhrases(text, HUMOR_MARKERS);
  let humor = 50;
  if (words > 0) {
    const density = humorCount / words;
    // density of 0.02+ maps to 100
    humor = Math.round(Math.min(density / 0.02, 1.0) * 100);
  }
  // If no humor markers found at all, stay at 50 (not 0)
  if (humorCount === 0) humor = 50;

  // ── Directness: inverse of hedging density ──────────────────────────
  const hedgeCount = countPhrases(text, HEDGING_PHRASES);
  let directness = 50;
  if (words > 0) {
    const hedgeDensity = hedgeCount / words;
    // At density 0 → directness 100; at density 0.04+ → directness 0
    const measuredDirectness = 1 - Math.min(hedgeDensity / 0.04, 1.0);
    directness = Math.round(measuredDirectness * 100);
  }
  // If no hedging at all and text is short, bias toward neutral
  if (hedgeCount === 0 && words < 20) directness = 50;

  // ── Creativity: density of creativity markers ───────────────────────
  const creativeCount = countPhrases(text, CREATIVITY_MARKERS);
  let creativity = 50;
  if (words > 0) {
    const density = creativeCount / words;
    // density 0.02+ maps to 100
    creativity = Math.round(Math.min(density / 0.02, 1.0) * 100);
  }
  if (creativeCount === 0) creativity = 50;

  // ── Depth: inferred from word count ─────────────────────────────────
  let depth = 50;
  if (words < 50) {
    depth = Math.round((words / 50) * 30 + 15); // 15–45 range for short
  } else if (words <= 200) {
    depth = 50; // balanced
  } else {
    depth = Math.round(Math.min(50 + ((words - 200) / 300) * 50, 100)); // 50–100
  }

  return { warmth, formality, humor, directness, creativity, depth };
}

// ============================================================================
// Fuzzy heading → field mapping
// ============================================================================

/** Normalise heading text for comparison. */
function normaliseHeading(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/** Heading patterns mapped to SoulConfigBody fields. */
const HEADING_FIELD_MAP: [RegExp, string][] = [
  [/^(core\s*truths|personality|who\s*you\s*are|identity|traits)$/, 'traits'],
  [/^(values|principles|beliefs)$/, 'values'],
  [/^(vibe|communication\s*style|style|tone|voice)$/, 'style'],
  [/^(custom\s*instructions|instructions|directives|guidance)$/, 'customInstructions'],
  [/^(boundaries|hard\s*limits|limits|rules|constraints)$/, 'boundaries'],
  [/^(never\s*do\s*these|anti.?patterns|never|dont|forbidden|avoid)$/, 'antiPatterns'],
  [/^(continuity|persistence|memory|context)$/, 'continuity'],
];

function matchHeadingToField(heading: string): string | null {
  const normalised = normaliseHeading(heading);
  for (const [pattern, field] of HEADING_FIELD_MAP) {
    if (pattern.test(normalised)) return field;
  }
  return null;
}

// ============================================================================
// Style parsing helpers
// ============================================================================

/**
 * Parse a Vibe/Style section into SoulStyle.
 * Looks for bullet lines like `- Vocabulary: advanced` or `- Emoji: use sparingly`.
 */
function parseStyleSection(content: string): SoulStyle {
  const style: SoulStyle = { vocabulary: 'moderate', responseLength: 'balanced', useEmoji: false };
  const lower = content.toLowerCase();

  // Vocabulary
  if (lower.includes('advanced') || lower.includes('rich') || lower.includes('sophisticated')) {
    style.vocabulary = 'advanced';
  } else if (lower.includes('simple') || lower.includes('plain') || lower.includes('basic')) {
    style.vocabulary = 'simple';
  }

  // Response length
  if (lower.includes('concise') || lower.includes('brief') || lower.includes('short')) {
    style.responseLength = 'concise';
  } else if (lower.includes('detailed') || lower.includes('thorough') || lower.includes('verbose')) {
    style.responseLength = 'detailed';
  }

  // Emoji
  if (lower.includes('emoji') && !lower.includes('avoid') && !lower.includes('no emoji')) {
    style.useEmoji = true;
  }

  return style;
}

/**
 * Extract bullet list items from markdown content.
 * Returns the text of each bullet line with the leading `- ` or `* ` stripped.
 */
function extractBulletItems(content: string): string[] {
  const items: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[-*]\s+(.+)/);
    if (match) {
      items.push(match[1]!.trim());
    }
  }
  return items;
}

// ============================================================================
// openClawToSoul — import SOUL.md → SoulConfigBody
// ============================================================================

/**
 * Parse a SOUL.md markdown file into a SoulConfigBody.
 *
 * Uses fuzzy heading matching to map ## sections to config fields.
 * Unknown sections are silently ignored. Missing sections get sensible defaults.
 * Trait values are estimated from section text using keyword-density heuristics
 * (inherently lossy — ±15 tolerance expected).
 */
export function openClawToSoul(markdown: string): SoulConfigBody {
  const sections = parseSoulMdSections(markdown);

  // Start with defaults
  const result: SoulConfigBody = {
    traits: { warmth: 50, formality: 50, humor: 50, directness: 50, creativity: 50, depth: 50 },
    values: [],
    style: { vocabulary: 'moderate', responseLength: 'balanced', useEmoji: false },
    customInstructions: '',
    boundaries: [],
    antiPatterns: [],
  };

  // Extract custom name from # heading in preamble
  const preamble = sections.get('_preamble');
  if (preamble) {
    const nameMatch = preamble.match(/^# (.+)$/m);
    if (nameMatch) {
      result.customName = nameMatch[1]!.trim();
    }
  }

  // Collect all text assigned to "traits" for estimation
  let traitsText = '';

  for (const [heading, content] of sections) {
    if (heading === '_preamble') continue;

    const field = matchHeadingToField(heading);
    if (!field) continue; // Unknown section — skip

    switch (field) {
      case 'traits':
        traitsText += '\n' + content;
        break;
      case 'values':
        result.values = extractBulletItems(content);
        if (result.values.length === 0 && content.trim()) {
          // Single paragraph — treat as one value
          result.values = [content.trim()];
        }
        break;
      case 'style':
        result.style = parseStyleSection(content);
        break;
      case 'customInstructions':
        result.customInstructions = content.trim();
        break;
      case 'boundaries':
        result.boundaries = extractBulletItems(content);
        if (result.boundaries.length === 0 && content.trim()) {
          result.boundaries = [content.trim()];
        }
        break;
      case 'antiPatterns':
        result.antiPatterns = extractBulletItems(content);
        if (result.antiPatterns.length === 0 && content.trim()) {
          result.antiPatterns = [content.trim()];
        }
        break;
      case 'continuity':
        // Continuity section is informational — no direct field mapping
        break;
    }
  }

  // Estimate traits from collected trait-section text,
  // falling back to full document text if no specific trait section found
  if (traitsText.trim()) {
    result.traits = estimateTraits(traitsText);
  } else {
    // Use all section text for estimation
    const allText = Array.from(sections.values()).join('\n');
    if (allText.trim()) {
      result.traits = estimateTraits(allText);
    }
  }

  return result;
}

// ============================================================================
// soulToOpenClaw — export companion as OpenClaw SOUL.md
// ============================================================================

/**
 * Compose an OpenClaw-compatible SOUL.md from a KIN companion's config.
 *
 * @param companionConfig - The companion's static config (name, species, tagline)
 * @param companionMarkdown - The raw companion personality markdown (from companions/*.md)
 * @param soulConfig - Optional user's soul customisation. If absent, uses defaults.
 * @returns OpenClaw-compatible SOUL.md markdown string
 */
export function soulToOpenClaw(
  companionConfig: CompanionConfig,
  companionMarkdown: string,
  soulConfig?: SoulConfigBody,
): string {
  const lines: string[] = [];

  // ── Identity section ──────────────────────────────────────────────────
  const displayName = soulConfig?.customName || companionConfig.name;
  lines.push(`# ${displayName}`);
  lines.push('');
  lines.push('## Identity');
  lines.push(`- **Name**: ${companionConfig.name}`);
  lines.push(`- **Species**: ${companionConfig.species}`);
  lines.push(`- **Tagline**: ${companionConfig.tagline}`);
  lines.push('');

  // Extract core traits from companion markdown if present
  const coreTraitsMatch = companionMarkdown.match(/### Core Traits\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (coreTraitsMatch) {
    lines.push('### Personality Core');
    lines.push(coreTraitsMatch[1]!.trim());
    lines.push('');
  }

  // Extract speech patterns if present
  const speechMatch = companionMarkdown.match(/### Speech Patterns\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
  if (speechMatch) {
    lines.push('### Speech Patterns');
    lines.push(speechMatch[1]!.trim());
    lines.push('');
  }

  // ── Core Truths (from soul config traits → directives) ────────────────
  if (soulConfig) {
    const truthsMd = configToSoulMd(soulConfig, displayName);
    // Extract just the Core Truths section from the generated markdown
    const truthsMatch = truthsMd.match(/## Core Truths\n([\s\S]*?)(?=\n##|$)/);
    if (truthsMatch && truthsMatch[1]!.trim()) {
      lines.push('## Core Truths');
      lines.push(truthsMatch[1]!.trim());
      lines.push('');
    }
  }

  // ── Values ────────────────────────────────────────────────────────────
  if (soulConfig && soulConfig.values.length > 0) {
    lines.push('## Values');
    soulConfig.values.forEach((v) => lines.push(`- ${v}`));
    lines.push('');
  }

  // ── Vibe (style) ──────────────────────────────────────────────────────
  if (soulConfig) {
    lines.push('## Vibe');
    lines.push(`- Vocabulary: ${soulConfig.style.vocabulary}`);
    lines.push(`- Response length: ${soulConfig.style.responseLength}`);
    lines.push(`- Emoji: ${soulConfig.style.useEmoji ? 'use sparingly' : 'avoid'}`);
    lines.push('');
  }

  // ── Custom Instructions ───────────────────────────────────────────────
  if (soulConfig && soulConfig.customInstructions.trim()) {
    lines.push('## Custom Instructions');
    lines.push(soulConfig.customInstructions.trim());
    lines.push('');
  }

  // ── Boundaries ────────────────────────────────────────────────────────
  if (soulConfig && soulConfig.boundaries.length > 0) {
    lines.push('## Boundaries');
    soulConfig.boundaries.forEach((b) => lines.push(`- ${b}`));
    lines.push('');
  }

  // ── Never Do These ────────────────────────────────────────────────────
  if (soulConfig && soulConfig.antiPatterns.length > 0) {
    lines.push('## Never Do These');
    soulConfig.antiPatterns.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }

  // ── Continuity (standard OpenClaw persistence instructions) ───────────
  lines.push('## Continuity');
  lines.push('- Maintain consistent personality across sessions.');
  lines.push('- Reference previous interactions when relevant.');
  lines.push('- Evolve style naturally while respecting configured boundaries.');
  lines.push('- If uncertain about a preference, ask rather than assume.');
  lines.push('');

  return lines.join('\n');
}
