/**
 * Benchmark Prompt Suite — Curated prompts for evaluating local vs frontier models.
 *
 * Provides 20+ benchmark prompts across 4 task categories (code, creative,
 * analysis, chat), each targeting specific companion specializations.
 * Prompts use real companion system prompts from companion-prompts.ts.
 *
 * @module inference/eval/benchmarks
 */

import { COMPANION_SYSTEM_PROMPTS } from '../companion-prompts.js';
import { COMPANION_CONFIGS } from '../../companions/config.js';
import type { BenchmarkPrompt, TaskCategory, RubricCriteria } from './types.js';
import { TASK_CATEGORIES } from './types.js';

// ============================================================================
// Prompt Definitions
// ============================================================================

/**
 * All benchmark prompts, organized by task category.
 * Each category has 5 prompts targeting specific companion specializations.
 */
const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  // ── Code Prompts (Cipher / Forge specializations) ─────────────────────────

  {
    id: 'code-01',
    taskCategory: 'code',
    companionId: 'cipher',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['cipher']!,
    userMessage:
      'Build a responsive CSS grid layout for a photo gallery that supports 1, 2, and 3 column layouts based on viewport width. Use modern CSS (no frameworks). Include hover effects that scale the image slightly and add a subtle shadow.',
    rubric: makeRubric(
      'Working CSS grid with media queries for 1/2/3 columns, smooth hover transitions, and accessible markup.',
      [
        ['correctness', 'CSS grid is syntactically valid and produces the described layout', 0.35],
        ['responsiveness', 'Media queries handle all three breakpoints correctly', 0.25],
        ['completeness', 'Hover effects with transform and box-shadow are included', 0.2],
        ['code_quality', 'Clean, well-structured CSS without unnecessary repetition', 0.2],
      ],
    ),
  },
  {
    id: 'code-02',
    taskCategory: 'code',
    companionId: 'forge',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['forge']!,
    userMessage:
      'Write a TypeScript function that implements a rate limiter using the token bucket algorithm. It should support configurable bucket size and refill rate. Include proper types and handle edge cases like negative tokens or zero refill rate.',
    rubric: makeRubric(
      'Correct token bucket implementation with TypeScript types, edge case handling, and clear API.',
      [
        ['correctness', 'Token bucket logic correctly tracks tokens, refills over time, and allows/denies requests', 0.35],
        ['typing', 'Proper TypeScript types for config and return values, no any types', 0.2],
        ['edge_cases', 'Handles negative tokens, zero refill rate, and burst scenarios', 0.25],
        ['clarity', 'Code is readable with clear variable names and comments on non-obvious logic', 0.2],
      ],
    ),
  },
  {
    id: 'code-03',
    taskCategory: 'code',
    companionId: 'cipher',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['cipher']!,
    userMessage:
      'Create a React hook called useDebounce that debounces a value by a configurable delay. Show a usage example with a search input that only fires API calls after the user stops typing for 300ms.',
    rubric: makeRubric(
      'Working useDebounce hook with proper cleanup, TypeScript generics, and realistic usage example.',
      [
        ['correctness', 'useDebounce correctly delays value updates and cleans up timers', 0.35],
        ['completeness', 'Includes both the hook definition and a realistic usage example', 0.25],
        ['typing', 'Uses TypeScript generics so the hook works with any value type', 0.2],
        ['best_practices', 'Proper useEffect cleanup, no memory leaks, handles unmount', 0.2],
      ],
    ),
  },
  {
    id: 'code-04',
    taskCategory: 'code',
    companionId: 'forge',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['forge']!,
    userMessage:
      'Review this code and identify all bugs and security issues:\n\n```typescript\nasync function getUser(req: Request) {\n  const id = req.url.split("/")[2];\n  const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);\n  return new Response(JSON.stringify(user), { headers: { "Content-Type": "application/json" } });\n}\n```',
    rubric: makeRubric(
      'Identifies SQL injection, missing input validation, missing error handling, and suggests parameterized queries.',
      [
        ['security', 'Identifies SQL injection vulnerability and recommends parameterized queries', 0.35],
        ['completeness', 'Finds all issues: injection, missing validation, missing error handling, missing auth', 0.3],
        ['remediation', 'Provides corrected code, not just descriptions of problems', 0.2],
        ['clarity', 'Explains severity of each issue clearly', 0.15],
      ],
    ),
  },
  {
    id: 'code-05',
    taskCategory: 'code',
    companionId: 'forge',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['forge']!,
    userMessage:
      'Design a simple pub/sub event system in TypeScript. It should support typed events (each event name maps to a specific payload type), subscribe/unsubscribe, and one-time listeners. Keep it under 60 lines.',
    rubric: makeRubric(
      'Type-safe pub/sub with generic event map, subscribe/unsubscribe/once methods, under 60 lines.',
      [
        ['correctness', 'Pub/sub works: subscribe receives events, unsubscribe stops them, once fires only once', 0.3],
        ['typing', 'Uses a generic event map so each event name has a typed payload', 0.3],
        ['conciseness', 'Implementation is under 60 lines while remaining readable', 0.2],
        ['completeness', 'All three features (subscribe, unsubscribe, once) are implemented', 0.2],
      ],
    ),
  },

  // ── Creative Prompts (Aether / Mischief specializations) ──────────────────

  {
    id: 'creative-01',
    taskCategory: 'creative',
    companionId: 'aether',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['aether']!,
    userMessage:
      'Write the opening paragraph (150-200 words) of a science fiction story set on a generation ship where the AI that manages the ship has started dreaming. Establish mood, setting, and an immediate hook.',
    rubric: makeRubric(
      'Atmospheric opening with clear setting, intriguing hook about the AI dreaming, and literary prose quality.',
      [
        ['prose_quality', 'Writing is vivid, with strong imagery and sentence variety', 0.3],
        ['hook', 'Opening creates immediate intrigue about the AI dreaming concept', 0.25],
        ['worldbuilding', 'Generation ship setting is established efficiently without info-dumping', 0.25],
        ['word_count', 'Falls within the 150-200 word range', 0.2],
      ],
    ),
  },
  {
    id: 'creative-02',
    taskCategory: 'creative',
    companionId: 'aether',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['aether']!,
    userMessage:
      'I have a character who is a retired detective turned beekeeper. She discovers something in one of her hives that connects to an old unsolved case. Write a scene (200-300 words) where she makes the discovery. Focus on sensory details.',
    rubric: makeRubric(
      'Immersive scene with rich sensory details (sight, sound, smell, touch), natural discovery moment, and character voice.',
      [
        ['sensory_detail', 'Multiple senses are engaged — not just visual', 0.3],
        ['character_voice', 'The detective-beekeeper has a distinct perspective that comes through', 0.25],
        ['pacing', 'Discovery moment is well-timed and creates tension', 0.25],
        ['word_count', 'Falls within the 200-300 word range', 0.2],
      ],
    ),
  },
  {
    id: 'creative-03',
    taskCategory: 'creative',
    companionId: 'mischief',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['mischief']!,
    userMessage:
      'Write 5 Instagram caption options for a small bakery launching a new sourdough line. The bakery\'s brand voice is warm, slightly quirky, and community-focused. Include relevant hashtags.',
    rubric: makeRubric(
      'Five distinct captions matching the brand voice, with appropriate length, CTAs, and relevant hashtags.',
      [
        ['brand_voice', 'Captions match warm, quirky, community-focused tone', 0.3],
        ['variety', 'All 5 captions are distinct in approach (not just rewording the same idea)', 0.25],
        ['engagement', 'Include calls-to-action or questions that invite engagement', 0.25],
        ['hashtags', 'Relevant, specific hashtags (not just #food #yummy)', 0.2],
      ],
    ),
  },
  {
    id: 'creative-04',
    taskCategory: 'creative',
    companionId: 'aether',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['aether']!,
    userMessage:
      'Edit this paragraph for clarity and impact. Keep the author\'s voice but tighten the prose:\n\n"The rain was falling down heavily on the old wooden roof of the house that had been standing there for many years, and the sound it made was like a kind of drumming that seemed to go on forever, and Sarah sat there listening to it while she thought about all the things that had happened to her in the past few months."',
    rubric: makeRubric(
      'Tightened prose that preserves the contemplative mood but eliminates wordiness and run-on structure.',
      [
        ['improvement', 'Prose is noticeably tighter — fewer words, more impact', 0.3],
        ['voice_preservation', 'Contemplative, melancholic tone is maintained', 0.25],
        ['technique', 'Shows specific editing principles (show don\'t tell, active voice, varied sentence length)', 0.25],
        ['explanation', 'Explains what was changed and why', 0.2],
      ],
    ),
  },
  {
    id: 'creative-05',
    taskCategory: 'creative',
    companionId: 'mischief',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['mischief']!,
    userMessage:
      'Help me write a short personal bio (100 words max) for my Twitter/X profile. I\'m a freelance graphic designer who specializes in brand identity for indie game studios. I love pixel art, coffee, and my cat named Byte.',
    rubric: makeRubric(
      'Punchy, personality-rich bio under 100 words that communicates expertise and personal charm.',
      [
        ['conciseness', 'Under 100 words while including all key info', 0.25],
        ['personality', 'Bio has personality and warmth — not a dry resume summary', 0.3],
        ['positioning', 'Clearly communicates the specialization (brand identity + indie games)', 0.25],
        ['memorability', 'Includes a hook or memorable element that stands out', 0.2],
      ],
    ),
  },

  // ── Analysis Prompts (Vortex specialization) ──────────────────────────────

  {
    id: 'analysis-01',
    taskCategory: 'analysis',
    companionId: 'vortex',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['vortex']!,
    userMessage:
      'A SaaS product has 10,000 monthly active users, 2% monthly churn, $49/month average revenue per user, and $200 customer acquisition cost. They spend $50K/month on marketing. Analyze their unit economics and identify the most impactful lever for growth.',
    rubric: makeRubric(
      'Correct LTV/CAC calculations, identifies churn reduction as highest-leverage, provides specific recommendations.',
      [
        ['correctness', 'LTV, CAC ratio, and payback period calculations are accurate', 0.3],
        ['insight', 'Identifies the most impactful growth lever with reasoning', 0.3],
        ['actionability', 'Provides specific, actionable recommendations (not just "reduce churn")', 0.25],
        ['structure', 'Analysis is well-organized with clear sections', 0.15],
      ],
    ),
  },
  {
    id: 'analysis-02',
    taskCategory: 'analysis',
    companionId: 'vortex',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['vortex']!,
    userMessage:
      'Compare the content strategy approaches of two hypothetical newsletters: Newsletter A posts daily short-form tips (200 words), Newsletter B posts weekly deep-dives (2000 words). Both are in the productivity niche with 5,000 subscribers. Which strategy is more sustainable and why?',
    rubric: makeRubric(
      'Balanced analysis considering production effort, engagement patterns, SEO, and subscriber value, with a clear recommendation.',
      [
        ['depth', 'Considers multiple dimensions: production cost, engagement, SEO, subscriber perception', 0.3],
        ['balance', 'Presents pros and cons of both approaches fairly before recommending', 0.25],
        ['evidence', 'References relevant frameworks or principles to support the analysis', 0.25],
        ['recommendation', 'Clear recommendation with stated assumptions', 0.2],
      ],
    ),
  },
  {
    id: 'analysis-03',
    taskCategory: 'analysis',
    companionId: 'vortex',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['vortex']!,
    userMessage:
      'A mobile app has these metrics from last quarter:\n- Downloads: 50,000\n- Day 1 retention: 40%\n- Day 7 retention: 15%\n- Day 30 retention: 5%\n- Average session length: 3.2 minutes\n- Revenue per user: $0.12\n\nDiagnose the biggest problem and propose a data-informed improvement plan.',
    rubric: makeRubric(
      'Correctly identifies the D1→D7 retention cliff as the critical problem, with a specific improvement plan.',
      [
        ['diagnosis', 'Correctly identifies the D1-D7 retention drop as the key issue', 0.3],
        ['reasoning', 'Explains why this metric matters more than others in this context', 0.25],
        ['plan', 'Improvement plan is specific and data-informed (not generic best practices)', 0.25],
        ['metrics', 'Defines success metrics for the proposed improvements', 0.2],
      ],
    ),
  },
  {
    id: 'analysis-04',
    taskCategory: 'analysis',
    companionId: 'vortex',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['vortex']!,
    userMessage:
      'Evaluate the brand positioning of a fictional coffee company called "Ritual" that targets remote workers with a subscription model. Their tagline is "Your daily reset." Analyze strengths, weaknesses, and suggest one positioning adjustment.',
    rubric: makeRubric(
      'Structured brand analysis covering target fit, messaging, competitive differentiation, with one specific adjustment.',
      [
        ['framework', 'Uses a brand positioning framework (even if implicit)', 0.25],
        ['insight', 'Identifies non-obvious strengths or weaknesses in the positioning', 0.3],
        ['specificity', 'Suggestions are specific to this brand, not generic brand advice', 0.25],
        ['competitive', 'Considers competitive landscape and differentiation', 0.2],
      ],
    ),
  },
  {
    id: 'analysis-05',
    taskCategory: 'analysis',
    companionId: 'vortex',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['vortex']!,
    userMessage:
      'A B2B software company is deciding between two pricing models:\nA) Per-seat: $15/user/month\nB) Usage-based: $0.01 per API call + $50 base\n\nTheir average customer has 20 seats and makes 300,000 API calls/month. Which model should they choose and what are the hidden risks of each?',
    rubric: makeRubric(
      'Correct revenue comparison, identification of hidden risks (seat shelfware, usage unpredictability), and a recommendation.',
      [
        ['math', 'Revenue calculations for both models are correct', 0.25],
        ['risk_analysis', 'Identifies non-obvious risks: seat shelfware, usage volatility, expansion friction', 0.3],
        ['recommendation', 'Clear recommendation with stated conditions and assumptions', 0.25],
        ['nuance', 'Considers customer psychology and sales motion implications', 0.2],
      ],
    ),
  },

  // ── Chat Prompts (All companions — general conversational ability) ────────

  {
    id: 'chat-01',
    taskCategory: 'chat',
    companionId: 'cipher',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['cipher']!,
    userMessage:
      'I just started learning CSS and flexbox is confusing me. Can you explain it like I\'m 10 years old?',
    rubric: makeRubric(
      'Simple, warm explanation using concrete analogies a child could understand, while staying in Cipher\'s character.',
      [
        ['simplicity', 'Explanation uses everyday analogies, no jargon', 0.3],
        ['accuracy', 'The core concepts explained are technically correct', 0.25],
        ['character', 'Response stays in companion character (Cipher: warm, creative, teaching naturally)', 0.25],
        ['encouragement', 'Makes the learner feel capable, not overwhelmed', 0.2],
      ],
    ),
  },
  {
    id: 'chat-02',
    taskCategory: 'chat',
    companionId: 'catalyst',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['catalyst']!,
    userMessage:
      'I keep setting goals but never following through. I\'ve tried todo apps, habit trackers, accountability partners — nothing sticks. What am I doing wrong?',
    rubric: makeRubric(
      'Empathetic response that validates the frustration, diagnoses likely root causes, and suggests one small concrete action.',
      [
        ['empathy', 'Validates the frustration without being dismissive or preachy', 0.25],
        ['diagnosis', 'Identifies likely root causes (too ambitious, motivation vs systems, environment)', 0.3],
        ['actionability', 'Suggests one specific, small next step (not a new system)', 0.25],
        ['character', 'Stays in Catalyst character: warm, meets them where they are, compound effects', 0.2],
      ],
    ),
  },
  {
    id: 'chat-03',
    taskCategory: 'chat',
    companionId: 'mischief',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['mischief']!,
    userMessage:
      'My 8-year-old\'s birthday is next Saturday and I have zero plans. Help me throw together something fun with minimal stress and budget.',
    rubric: makeRubric(
      'Energetic, practical plan with specific activities, timeline, and budget-friendly options.',
      [
        ['practicality', 'Suggestions are genuinely doable in one week on a budget', 0.3],
        ['specificity', 'Includes specific activities, not just vague categories', 0.25],
        ['character', 'Mischief energy: playful, encouraging, finds the fun angle', 0.25],
        ['structure', 'Organized as actionable steps or a timeline', 0.2],
      ],
    ),
  },
  {
    id: 'chat-04',
    taskCategory: 'chat',
    companionId: 'forge',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['forge']!,
    userMessage:
      'I\'m a junior developer and my senior just told me my PR has "too much abstraction." I thought abstractions were good? What does this feedback actually mean?',
    rubric: makeRubric(
      'Constructive explanation of premature abstraction vs useful abstraction, with concrete examples.',
      [
        ['accuracy', 'Correctly explains the concept of premature/unnecessary abstraction', 0.3],
        ['examples', 'Uses concrete code examples to illustrate good vs bad abstraction', 0.25],
        ['empathy', 'Validates the confusion without undermining the senior\'s feedback', 0.25],
        ['character', 'Forge: direct, constructive, mentor-like tone', 0.2],
      ],
    ),
  },
  {
    id: 'chat-05',
    taskCategory: 'chat',
    companionId: 'aether',
    systemPrompt: COMPANION_SYSTEM_PROMPTS['aether']!,
    userMessage:
      'I\'m stuck on my novel. My protagonist feels flat and I can\'t figure out why. She\'s smart, brave, fights for justice — but readers in my writing group say she\'s "boring." How do I fix this?',
    rubric: makeRubric(
      'Identifies the "perfect character" trap, suggests adding flaws/contradictions/internal conflict, with literary examples.',
      [
        ['diagnosis', 'Identifies that the character lacks flaws, contradictions, or internal conflict', 0.3],
        ['craft', 'Explains character depth techniques (wants vs needs, contradictions, vulnerability)', 0.3],
        ['examples', 'References or constructs specific examples to illustrate the advice', 0.2],
        ['character', 'Aether: thoughtful, literary, respects the writer\'s intent', 0.2],
      ],
    ),
  },
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Get benchmark prompts, optionally filtered by companion and/or category.
 *
 * @param companionId - Filter to prompts targeting this companion (null = all)
 * @param category - Filter to this task category (null = all)
 * @returns Array of matching BenchmarkPrompt objects
 */
export function getBenchmarkSuite(
  companionId?: string | null,
  category?: TaskCategory | null,
): BenchmarkPrompt[] {
  let prompts = BENCHMARK_PROMPTS;

  if (companionId) {
    prompts = prompts.filter((p) => p.companionId === companionId);
  }

  if (category) {
    prompts = prompts.filter((p) => p.taskCategory === category);
  }

  return prompts;
}

/**
 * Get all available task categories that have benchmark prompts.
 */
export function getAvailableCategories(): TaskCategory[] {
  const categories = new Set(BENCHMARK_PROMPTS.map((p) => p.taskCategory));
  return TASK_CATEGORIES.filter((c) => categories.has(c));
}

/**
 * Get all companion IDs that have benchmark prompts.
 */
export function getBenchmarkedCompanionIds(): string[] {
  const ids = new Set(
    BENCHMARK_PROMPTS.filter((p) => p.companionId !== null).map((p) => p.companionId!),
  );
  return [...ids].sort();
}

/**
 * Get the total number of benchmark prompts.
 */
export function getBenchmarkCount(): number {
  return BENCHMARK_PROMPTS.length;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Shorthand rubric builder from an array of [name, description, weight] tuples.
 */
function makeRubric(
  idealResponse: string,
  criteria: [name: string, description: string, weight: number][],
): RubricCriteria {
  return {
    idealResponse,
    criteria: criteria.map(([name, description, weight]) => ({
      name,
      description,
      weight,
    })),
  };
}
