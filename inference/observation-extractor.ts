/**
 * Observation Extractor — Extracts user preferences, facts, and goals from
 * conversation turns using lightweight heuristic analysis.
 *
 * Zero-cost: runs entirely on regex/string matching, no LLM calls.
 * Designed to be called after each supervisor response (fire-and-forget).
 *
 * @module inference/observation-extractor
 */

export interface Observation {
  type: 'preference' | 'fact' | 'goal' | 'skill_level' | 'topic_interest';
  content: string;
  confidence: number; // 0-1
}

// Module-scope topic map with Set<string> keywords for O(1) lookup
const TOPIC_MAP: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['programming', new Set(['code', 'function', 'api', 'bug', 'debug', 'deploy', 'git', 'react', 'python', 'javascript'])],
  ['writing', new Set(['story', 'novel', 'blog', 'article', 'essay', 'poem', 'writing', 'prose', 'narrative'])],
  ['business', new Set(['startup', 'revenue', 'marketing', 'brand', 'customer', 'sales', 'growth', 'investor'])],
  ['finance', new Set(['budget', 'invest', 'savings', 'stocks', 'crypto', 'portfolio', 'income', 'expense'])],
  ['health', new Set(['workout', 'diet', 'exercise', 'sleep', 'meditation', 'mental health', 'fitness'])],
  ['education', new Set(['learn', 'study', 'course', 'tutorial', 'homework', 'exam', 'degree'])],
  ['design', new Set(['ui', 'ux', 'design', 'figma', 'layout', 'typography', 'color', 'mockup'])],
  ['music', new Set(['song', 'music', 'guitar', 'piano', 'beat', 'melody', 'lyrics', 'album'])],
]);

/**
 * Extract observations from a user message + companion response pair.
 */
export function extractObservations(
  userMessage: string,
  companionResponse: string,
  companionId: string,
): Observation[] {
  const observations: Observation[] = [];
  const lower = userMessage.toLowerCase();

  // --- Preference detection ---
  // "I prefer X", "I like X", "I love X", "I hate X", "I don't like X"
  const prefPatterns = [
    /\bi (?:really )?(?:prefer|like|love|enjoy|want)\s+(.{5,60})/gi,
    /\bi (?:hate|dislike|don't like|can't stand)\s+(.{5,60})/gi,
    /my (?:favorite|preferred|go-to)\s+\w+\s+(?:is|are)\s+(.{3,60})/gi,
  ];
  for (const pat of prefPatterns) {
    for (const match of userMessage.matchAll(pat)) {
      if (match[1]) {
        observations.push({
          type: 'preference',
          content: match[1].trim().replace(/[.!?,;]+$/, ''),
          confidence: 0.7,
        });
      }
    }
  }

  // --- Fact detection ---
  // "I am a X", "I'm a X", "I work as X", "My name is X", "I live in X"
  const factPatterns = [
    /\bi(?:'m| am) (?:a |an )?(\w[\w\s]{2,40})/gi,
    /\bi work (?:as|at|for|in)\s+(.{3,50})/gi,
    /\bmy name is\s+(.{2,30})/gi,
    /\bi live in\s+(.{3,40})/gi,
    /\bi(?:'m| am) (?:from|based in)\s+(.{3,40})/gi,
    /\bi have (?:a |an )?(.{3,40}?)(?:\.|,|!|\?|$)/gi,
    /\bi(?:'ve| have) been (\w[\w\s]{3,40})/gi,
  ];
  for (const pat of factPatterns) {
    for (const match of userMessage.matchAll(pat)) {
      if (match[1] && match[1].trim().length > 2) {
        observations.push({
          type: 'fact',
          content: match[1].trim().replace(/[.!?,;]+$/, ''),
          confidence: 0.6,
        });
      }
    }
  }

  // --- Goal detection ---
  // "I want to X", "I need to X", "My goal is X", "I'm trying to X"
  const goalPatterns = [
    /\bi (?:want|need|plan|aim|hope|wish|intend) to\s+(.{5,80})/gi,
    /\bmy goal is (?:to )?(.{5,80})/gi,
    /\bi(?:'m| am) trying to\s+(.{5,80})/gi,
    /\bhelp me\s+(.{5,80})/gi,
    /\bi(?:'m| am) working on\s+(.{5,80})/gi,
  ];
  for (const pat of goalPatterns) {
    for (const match of userMessage.matchAll(pat)) {
      if (match[1]) {
        observations.push({
          type: 'goal',
          content: match[1].trim().replace(/[.!?,;]+$/, ''),
          confidence: 0.65,
        });
      }
    }
  }

  // --- Skill level detection ---
  // Heuristics based on vocabulary complexity and self-descriptions
  const beginnerSignals = /\bi(?:'m| am) (?:new|a beginner|just starting|learning|confused about)/i;
  const advancedSignals = /\bi(?:'ve| have) (?:been|years? of|extensive)\s+|senior|expert|proficient|fluent/i;
  if (beginnerSignals.test(userMessage)) {
    observations.push({ type: 'skill_level', content: 'beginner', confidence: 0.6 });
  } else if (advancedSignals.test(userMessage)) {
    observations.push({ type: 'skill_level', content: 'advanced', confidence: 0.6 });
  }

  // --- Topic interest detection ---
  // Uses module-scope TOPIC_MAP with Set keywords; split once, count via Set.has
  const msgWords = lower.split(/\s+/);
  for (const [topic, keywordSet] of TOPIC_MAP) {
    let matchCount = 0;
    for (const w of msgWords) {
      if (keywordSet.has(w)) matchCount++;
    }
    // Also check multi-word keywords (e.g. "mental health") via includes
    for (const kw of keywordSet) {
      if (kw.includes(' ') && lower.includes(kw)) matchCount++;
    }
    if (matchCount >= 2) {
      observations.push({ type: 'topic_interest', content: topic, confidence: Math.min(0.5 + matchCount * 0.1, 0.9) });
    }
  }

  // Deduplicate by content
  const seen = new Set<string>();
  return observations.filter(o => {
    const key = `${o.type}:${o.content.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
