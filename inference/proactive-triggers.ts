/**
 * Proactive Companion — Pure trigger evaluation functions.
 *
 * Every function in this module is a pure function: input → output, no
 * side effects, no DB access, no I/O. This makes them independently
 * testable (K023 pattern) and easy to reason about.
 *
 * @module inference/proactive-triggers
 */

import type { TriggerResult, CalendarEvent, ProactivePreferences } from './proactive-types.js';

// ---------------------------------------------------------------------------
// Re-export a minimal UserPattern shape for trigger evaluation.
// We don't import from prediction-engine.ts to avoid pulling in Ollama deps.
// ---------------------------------------------------------------------------

/** Minimal time-pattern entry for trigger evaluation. */
export interface TimePattern {
  hour: number;          // 0-23
  messages: string[];    // recent messages at this hour
  confidence: number;    // 0-1 how strong the pattern is
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Trigger if a calendar event starts within this many minutes. */
const CALENDAR_TRIGGER_MINUTES = 60;

/** Trigger if the conversation gap exceeds this many hours. */
const CONVERSATION_GAP_HOURS = 24;

/** Minimum confidence threshold for time-pattern triggers. */
const TIME_PATTERN_MIN_CONFIDENCE = 0.6;

// ---------------------------------------------------------------------------
// Calendar Trigger
// ---------------------------------------------------------------------------

/**
 * Evaluate whether any upcoming calendar event should trigger a proactive
 * suggestion. Fires if an event starts within 60 minutes of `now`.
 */
export function evaluateCalendarTrigger(
  events: CalendarEvent[],
  now: Date,
): TriggerResult {
  const nowMs = now.getTime();
  const windowEnd = nowMs + CALENDAR_TRIGGER_MINUTES * 60 * 1000;

  // Find the soonest upcoming event within the window
  let soonest: CalendarEvent | null = null;
  let soonestStart = Infinity;

  for (const event of events) {
    if (event.startTime > nowMs && event.startTime <= windowEnd) {
      if (event.startTime < soonestStart) {
        soonest = event;
        soonestStart = event.startTime;
      }
    }
  }

  if (!soonest) {
    return {
      shouldTrigger: false,
      signalType: 'calendar_event',
      reason: 'No upcoming events within trigger window',
      confidence: 0,
    };
  }

  const minutesUntil = Math.round((soonest.startTime - nowMs) / 60_000);
  // Higher confidence the closer the event is
  const confidence = Math.min(1, 0.5 + (CALENDAR_TRIGGER_MINUTES - minutesUntil) / (CALENDAR_TRIGGER_MINUTES * 2));

  return {
    shouldTrigger: true,
    signalType: 'calendar_event',
    reason: `"${soonest.title}" starts in ${minutesUntil} minutes`,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Conversation Gap Trigger
// ---------------------------------------------------------------------------

/**
 * Evaluate whether the gap since the last user message warrants a check-in.
 * Fires if gap > 24h or if there has never been a message (null).
 */
export function evaluateConversationGapTrigger(
  lastMessageAt: number | null,
  now: Date,
): TriggerResult {
  // Never messaged — treat as a gap
  if (lastMessageAt === null) {
    return {
      shouldTrigger: true,
      signalType: 'conversation_gap',
      reason: 'No previous messages — first check-in',
      confidence: 0.6,
    };
  }

  const gapHours = (now.getTime() - lastMessageAt) / (3600 * 1000);

  if (gapHours <= CONVERSATION_GAP_HOURS) {
    return {
      shouldTrigger: false,
      signalType: 'conversation_gap',
      reason: `Last message ${gapHours.toFixed(1)}h ago — within ${CONVERSATION_GAP_HOURS}h window`,
      confidence: 0,
    };
  }

  // Confidence scales with gap length, capped at 0.9
  const confidence = Math.min(0.9, 0.5 + (gapHours - CONVERSATION_GAP_HOURS) / 48);

  return {
    shouldTrigger: true,
    signalType: 'conversation_gap',
    reason: `No messages for ${gapHours.toFixed(1)} hours`,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Time Pattern Trigger
// ---------------------------------------------------------------------------

/**
 * Evaluate whether the current time matches a learned user pattern.
 * Fires if the current hour matches a pattern with sufficient confidence.
 */
export function evaluateTimePatternTrigger(
  patterns: TimePattern[],
  now: Date,
): TriggerResult {
  const currentHour = now.getHours();

  // Find the best-matching pattern for the current hour
  let bestMatch: TimePattern | null = null;

  for (const pattern of patterns) {
    if (pattern.hour === currentHour && pattern.confidence >= TIME_PATTERN_MIN_CONFIDENCE) {
      if (!bestMatch || pattern.confidence > bestMatch.confidence) {
        bestMatch = pattern;
      }
    }
  }

  if (!bestMatch) {
    return {
      shouldTrigger: false,
      signalType: 'time_pattern',
      reason: `No high-confidence patterns for hour ${currentHour}`,
      confidence: 0,
    };
  }

  return {
    shouldTrigger: true,
    signalType: 'time_pattern',
    reason: `Matches time pattern at hour ${currentHour} (${bestMatch.messages.length} past messages)`,
    confidence: bestMatch.confidence,
  };
}

// ---------------------------------------------------------------------------
// Quiet Hours
// ---------------------------------------------------------------------------

/**
 * Check whether the current time falls within the user's quiet hours.
 * Handles midnight-crossing ranges (e.g., quiet 23-7).
 * Returns false if quiet hours are not configured (both null).
 */
export function isInQuietHours(
  now: Date,
  quietStart: number | null,
  quietEnd: number | null,
): boolean {
  if (quietStart === null || quietEnd === null) {
    return false;
  }

  const hour = now.getHours();

  if (quietStart <= quietEnd) {
    // Same-day range, e.g. 22-23 or 1-5
    return hour >= quietStart && hour < quietEnd;
  }

  // Midnight-crossing range, e.g. 23-7 means quiet from 23:00 to 06:59
  return hour >= quietStart || hour < quietEnd;
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Check whether the daily suggestion limit has been reached.
 */
export function isRateLimited(deliveredToday: number, maxDaily: number): boolean {
  return deliveredToday >= maxDaily;
}

// ---------------------------------------------------------------------------
// Composite Evaluator
// ---------------------------------------------------------------------------

/** All signal sources bundled for the composite evaluator. */
export interface SignalSources {
  calendar: CalendarEvent[];
  lastMessageAt: number | null;
  patterns: TimePattern[];
}

/**
 * Evaluate all trigger types and return the highest-confidence result,
 * or null if no trigger fires, quiet hours are active, or rate limit hit.
 */
export function evaluateAllTriggers(
  signals: SignalSources,
  now: Date,
  prefs: ProactivePreferences,
  deliveredToday: number,
): TriggerResult | null {
  // Gate checks first
  if (isInQuietHours(now, prefs.quietStart, prefs.quietEnd)) {
    return null;
  }
  if (isRateLimited(deliveredToday, prefs.maxDaily)) {
    return null;
  }

  // Evaluate each trigger type
  const results: TriggerResult[] = [
    evaluateCalendarTrigger(signals.calendar, now),
    evaluateConversationGapTrigger(signals.lastMessageAt, now),
    evaluateTimePatternTrigger(signals.patterns, now),
  ];

  // Filter to those that should trigger, pick highest confidence
  const triggered = results.filter(r => r.shouldTrigger);
  if (triggered.length === 0) return null;

  triggered.sort((a, b) => b.confidence - a.confidence);
  return triggered[0]!;
}
