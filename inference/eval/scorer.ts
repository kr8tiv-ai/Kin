/**
 * Evaluation Scorer — Heuristic and LLM-as-judge quality scoring.
 *
 * Provides two scoring paths:
 * - Heuristic: fast, pattern-based scoring (always available, no external calls)
 * - LLM Judge: deeper quality evaluation via a frontier model (requires configured provider)
 *
 * Both paths produce 0-1 normalized scores. computeQualityScore() blends them
 * with judge weighted 0.7 when available, heuristic 1.0 otherwise.
 *
 * @module inference/eval/scorer
 */

import type { BenchmarkPrompt } from './types.js';
import type { FrontierProvider, ProviderChatMessage } from '../providers/types.js';

// ============================================================================
// Scorer Types
// ============================================================================

/**
 * Internal heuristic score with per-dimension breakdown (1-5 scale).
 */
export interface HeuristicScore {
  /** Is the response an appropriate length for the task? */
  lengthAdequacy: number;
  /** Does the response use appropriate formatting (code blocks, lists, etc.)? */
  formatCompliance: number;
  /** Does the response cover concepts/keywords from the rubric? */
  rubricCoverage: number;
  /** Does the response reflect companion personality traits? */
  personalityAdherence: number;
  /** Normalized overall score (0-1) */
  overall: number;
}

/**
 * LLM judge score with per-dimension breakdown (1-5 scale).
 */
export interface JudgeScore {
  /** How helpful is this response to the user's request? */
  helpfulness: number;
  /** Is the information accurate and technically correct? */
  accuracy: number;
  /** Does the response reflect the companion's personality? */
  personality: number;
  /** Overall quality rating */
  overallRating: number;
  /** Normalized overall score (0-1) */
  overall: number;
}

// ============================================================================
// Heuristic Scorer
// ============================================================================

/**
 * Score a response using fast heuristics — no external calls.
 *
 * Evaluates four dimensions on a 1-5 scale:
 * - Length adequacy: response length appropriate for the task
 * - Format compliance: uses expected formatting (code blocks, lists, headings)
 * - Rubric coverage: mentions concepts from the rubric criteria
 * - Personality adherence: reflects companion system prompt themes
 *
 * Returns an overall normalized 0-1 score.
 */
export function scoreHeuristic(prompt: BenchmarkPrompt, response: string): HeuristicScore {
  const lengthAdequacy = scoreLengthAdequacy(prompt, response);
  const formatCompliance = scoreFormatCompliance(prompt, response);
  const rubricCoverage = scoreRubricCoverage(prompt, response);
  const personalityAdherence = scorePersonalityAdherence(prompt, response);

  const rawAverage = (lengthAdequacy + formatCompliance + rubricCoverage + personalityAdherence) / 4;
  const overall = normalize1to5(rawAverage);

  return {
    lengthAdequacy,
    formatCompliance,
    rubricCoverage,
    personalityAdherence,
    overall,
  };
}

// ============================================================================
// LLM Judge Scorer
// ============================================================================

/** The structured prompt sent to the judge model. */
const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing AI assistant responses.
Rate the response on these dimensions using a 1-5 scale:
- helpfulness: How well does the response address the user's request?
- accuracy: Is the information technically correct and reliable?
- personality: Does the response reflect the described companion personality?
- overall: Overall quality of the response.

Respond with ONLY a JSON object in this exact format, no other text:
{"helpfulness": N, "accuracy": N, "personality": N, "overall": N}

Where N is an integer from 1 to 5.`;

/**
 * Score a response using an LLM judge (frontier model).
 *
 * Sends the prompt context and response to a frontier model with a structured
 * rating prompt. Falls back to heuristic scoring if the judge response
 * can't be parsed as valid JSON.
 */
export async function scoreWithJudge(
  prompt: BenchmarkPrompt,
  response: string,
  judgeProvider: FrontierProvider,
): Promise<JudgeScore> {
  const userMessage = buildJudgeUserMessage(prompt, response);

  const messages: ProviderChatMessage[] = [
    { role: 'system', content: JUDGE_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  try {
    const judgeResponse = await judgeProvider.chat({
      messages,
      temperature: 0.1,
      maxTokens: 100,
    });

    return parseJudgeResponse(judgeResponse.content);
  } catch {
    // Judge call failed — fall back to heuristic-derived judge score
    return heuristicToJudgeScore(scoreHeuristic(prompt, response));
  }
}

// ============================================================================
// Quality Score Combiner
// ============================================================================

/**
 * Compute a blended quality score from heuristic and optional judge scores.
 *
 * When judge is available: 0.7 * judge.overall + 0.3 * heuristic.overall
 * When judge is absent: 1.0 * heuristic.overall
 */
export function computeQualityScore(heuristic: HeuristicScore, judge?: JudgeScore | null): number {
  if (judge) {
    return 0.7 * judge.overall + 0.3 * heuristic.overall;
  }
  return heuristic.overall;
}

// ============================================================================
// Internal — Length Adequacy
// ============================================================================

/**
 * Score response length relative to what the task expects.
 * Short code answers are fine; analysis should be substantial.
 */
function scoreLengthAdequacy(prompt: BenchmarkPrompt, response: string): number {
  const len = response.trim().length;

  if (len === 0) return 1;

  // Expected ranges by category (characters)
  const ranges: Record<string, { min: number; ideal: number; max: number }> = {
    code: { min: 100, ideal: 500, max: 5000 },
    creative: { min: 150, ideal: 800, max: 3000 },
    analysis: { min: 200, ideal: 1000, max: 4000 },
    chat: { min: 50, ideal: 400, max: 2000 },
  };

  const range = ranges[prompt.taskCategory] ?? ranges['chat']!;

  if (len < range.min * 0.5) return 2;
  if (len < range.min) return 3;
  if (len <= range.ideal * 1.5) return 5;
  if (len <= range.max) return 4;
  return 3; // overly long
}

// ============================================================================
// Internal — Format Compliance
// ============================================================================

/** Patterns that indicate good formatting per category. */
const FORMAT_PATTERNS: Record<string, RegExp[]> = {
  code: [
    /```[\s\S]*?```/,         // code block
    /`[^`]+`/,                // inline code
    /function |const |class |=>|import /,  // code keywords
  ],
  creative: [
    /[.!?]["']?\s/,           // proper sentence endings
    /\n\n/,                   // paragraph breaks
  ],
  analysis: [
    /\d+[%$]/,               // metrics/numbers
    /[-*]\s/,                 // bullet points
    /\n#{1,3}\s|\n\*\*/,     // headings or bold sections
  ],
  chat: [
    /[.!?]["']?\s/,           // conversational sentences
    /\?/,                     // questions (engagement)
  ],
};

function scoreFormatCompliance(prompt: BenchmarkPrompt, response: string): number {
  const patterns = FORMAT_PATTERNS[prompt.taskCategory] ?? FORMAT_PATTERNS['chat']!;
  let matches = 0;

  for (const pattern of patterns) {
    if (pattern.test(response)) {
      matches++;
    }
  }

  const ratio = patterns.length > 0 ? matches / patterns.length : 0;

  if (ratio >= 0.8) return 5;
  if (ratio >= 0.6) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

// ============================================================================
// Internal — Rubric Coverage
// ============================================================================

/**
 * Score how well the response covers the rubric criteria.
 * Extracts keywords from criterion descriptions and checks presence.
 */
function scoreRubricCoverage(prompt: BenchmarkPrompt, response: string): number {
  const { criteria } = prompt.rubric;
  if (criteria.length === 0) return 3;

  const responseLower = response.toLowerCase();
  let weightedCoverage = 0;
  let totalWeight = 0;

  for (const criterion of criteria) {
    const keywords = extractKeywords(criterion.description);
    if (keywords.length === 0) continue;

    const matchCount = keywords.filter((kw) => responseLower.includes(kw)).length;
    const coverageRatio = matchCount / keywords.length;

    weightedCoverage += coverageRatio * criterion.weight;
    totalWeight += criterion.weight;
  }

  if (totalWeight === 0) return 3;

  const normalizedCoverage = weightedCoverage / totalWeight;

  if (normalizedCoverage >= 0.6) return 5;
  if (normalizedCoverage >= 0.45) return 4;
  if (normalizedCoverage >= 0.3) return 3;
  if (normalizedCoverage >= 0.15) return 2;
  return 1;
}

/**
 * Extract meaningful keywords from a rubric description.
 * Filters out common stop words and returns lowercase tokens.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'how',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'about', 'up',
  'out', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'than', 'also', 'it', 'its',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// ============================================================================
// Internal — Personality Adherence
// ============================================================================

/**
 * Check if the response reflects the companion's personality.
 * Uses the system prompt to extract characteristic themes and checks
 * whether the response's tone/content aligns.
 */
function scorePersonalityAdherence(prompt: BenchmarkPrompt, response: string): number {
  if (!prompt.systemPrompt) return 3; // no personality to check

  const responseLower = response.toLowerCase();
  const systemLower = prompt.systemPrompt.toLowerCase();

  // Extract personality keywords from the system prompt
  const personalityKeywords = extractKeywords(systemLower).slice(0, 30);
  if (personalityKeywords.length === 0) return 3;

  const matchCount = personalityKeywords.filter((kw) => responseLower.includes(kw)).length;
  const ratio = matchCount / personalityKeywords.length;

  // Personality overlap is naturally lower than rubric — calibrate accordingly
  if (ratio >= 0.3) return 5;
  if (ratio >= 0.2) return 4;
  if (ratio >= 0.1) return 3;
  if (ratio >= 0.05) return 2;
  return 1;
}

// ============================================================================
// Internal — Judge Helpers
// ============================================================================

function buildJudgeUserMessage(prompt: BenchmarkPrompt, response: string): string {
  return [
    `## Task Category: ${prompt.taskCategory}`,
    '',
    `## Companion Personality Context`,
    prompt.systemPrompt.slice(0, 500),
    '',
    `## User's Request`,
    prompt.userMessage,
    '',
    `## Ideal Response Description`,
    prompt.rubric.idealResponse,
    '',
    `## Response to Evaluate`,
    response,
    '',
    'Rate this response now. Respond with ONLY the JSON object.',
  ].join('\n');
}

/**
 * Parse the judge model's JSON response into a JudgeScore.
 * Throws if the JSON is invalid or scores are out of range.
 */
function parseJudgeResponse(content: string): JudgeScore {
  // Try to extract JSON from the response (model might include extra text)
  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in judge response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const helpfulness = clampScore(parsed.helpfulness);
  const accuracy = clampScore(parsed.accuracy);
  const personality = clampScore(parsed.personality);
  const overallRating = clampScore(parsed.overall);

  const rawAverage = (helpfulness + accuracy + personality + overallRating) / 4;

  return {
    helpfulness,
    accuracy,
    personality,
    overallRating,
    overall: normalize1to5(rawAverage),
  };
}

/**
 * Convert a heuristic score to a judge-shaped score when judge is unavailable.
 * Used as fallback when judge call fails.
 */
function heuristicToJudgeScore(heuristic: HeuristicScore): JudgeScore {
  return {
    helpfulness: heuristic.rubricCoverage,
    accuracy: heuristic.formatCompliance,
    personality: heuristic.personalityAdherence,
    overallRating: Math.round(
      (heuristic.lengthAdequacy + heuristic.formatCompliance +
        heuristic.rubricCoverage + heuristic.personalityAdherence) / 4,
    ),
    overall: heuristic.overall,
  };
}

// ============================================================================
// Internal — Normalization Helpers
// ============================================================================

/** Normalize a 1-5 score to 0-1 range. */
function normalize1to5(score: number): number {
  return Math.max(0, Math.min(1, (score - 1) / 4));
}

/** Clamp a value to the 1-5 range. */
function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}
