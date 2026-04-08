/**
 * Tests for proactive-triggers.ts — pure trigger evaluation functions.
 *
 * All functions under test are pure (input → output), so no mocking
 * or DB setup is needed (K023 pattern).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateCalendarTrigger,
  evaluateConversationGapTrigger,
  evaluateTimePatternTrigger,
  isInQuietHours,
  isRateLimited,
  evaluateAllTriggers,
  type TimePattern,
} from '../inference/proactive-triggers.js';
import type { CalendarEvent, ProactivePreferences } from '../inference/proactive-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Date for a specific hour on a fixed day. */
function dateAt(hour: number, minute: number = 0): Date {
  return new Date(2026, 3, 6, hour, minute, 0, 0); // April 6, 2026
}

/** Create a CalendarEvent starting at the given Date. */
function calendarEvent(title: string, startDate: Date, durationMinutes: number = 60): CalendarEvent {
  return {
    title,
    startTime: startDate.getTime(),
    endTime: startDate.getTime() + durationMinutes * 60_000,
    location: null,
  };
}

/** Default proactive preferences (enabled, no quiet hours, max 5). */
const DEFAULT_PREFS: ProactivePreferences = {
  proactiveEnabled: true,
  quietStart: null,
  quietEnd: null,
  maxDaily: 5,
  channels: ['telegram'],
};

// ---------------------------------------------------------------------------
// evaluateCalendarTrigger
// ---------------------------------------------------------------------------

describe('evaluateCalendarTrigger', () => {
  it('triggers when an event starts within 60 minutes', () => {
    const now = dateAt(10, 0);
    const events = [calendarEvent('Team standup', dateAt(10, 30))];
    const result = evaluateCalendarTrigger(events, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.signalType).toBe('calendar_event');
    expect(result.reason).toContain('Team standup');
    expect(result.reason).toContain('30 minutes');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('does not trigger when event is 2 hours away', () => {
    const now = dateAt(10, 0);
    const events = [calendarEvent('Late meeting', dateAt(12, 0))];
    const result = evaluateCalendarTrigger(events, now);

    expect(result.shouldTrigger).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('does not trigger with no events', () => {
    const now = dateAt(10, 0);
    const result = evaluateCalendarTrigger([], now);

    expect(result.shouldTrigger).toBe(false);
  });

  it('picks the soonest event within the window', () => {
    const now = dateAt(10, 0);
    const events = [
      calendarEvent('Later meeting', dateAt(10, 50)),
      calendarEvent('Soon meeting', dateAt(10, 15)),
      calendarEvent('Far meeting', dateAt(14, 0)),
    ];
    const result = evaluateCalendarTrigger(events, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.reason).toContain('Soon meeting');
    expect(result.reason).toContain('15 minutes');
  });

  it('does not trigger for past events', () => {
    const now = dateAt(10, 0);
    const events = [calendarEvent('Past meeting', dateAt(9, 0))];
    const result = evaluateCalendarTrigger(events, now);

    expect(result.shouldTrigger).toBe(false);
  });

  it('confidence increases as event gets closer', () => {
    const now = dateAt(10, 0);
    const close = evaluateCalendarTrigger([calendarEvent('Close', dateAt(10, 10))], now);
    const far = evaluateCalendarTrigger([calendarEvent('Far', dateAt(10, 55))], now);

    expect(close.confidence).toBeGreaterThan(far.confidence);
  });
});

// ---------------------------------------------------------------------------
// evaluateConversationGapTrigger
// ---------------------------------------------------------------------------

describe('evaluateConversationGapTrigger', () => {
  it('triggers when gap exceeds 24 hours', () => {
    const now = dateAt(10, 0);
    const lastMessage = now.getTime() - 25 * 3600 * 1000; // 25h ago
    const result = evaluateConversationGapTrigger(lastMessage, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.signalType).toBe('conversation_gap');
    expect(result.reason).toContain('25.0 hours');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('does not trigger when gap is under 24 hours', () => {
    const now = dateAt(10, 0);
    const lastMessage = now.getTime() - 12 * 3600 * 1000; // 12h ago
    const result = evaluateConversationGapTrigger(lastMessage, now);

    expect(result.shouldTrigger).toBe(false);
  });

  it('triggers when lastMessage is null (first check-in)', () => {
    const now = dateAt(10, 0);
    const result = evaluateConversationGapTrigger(null, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.reason).toContain('first check-in');
    expect(result.confidence).toBe(0.6);
  });

  it('confidence scales with gap length', () => {
    const now = dateAt(10, 0);
    const short = evaluateConversationGapTrigger(now.getTime() - 25 * 3600_000, now);
    const long = evaluateConversationGapTrigger(now.getTime() - 72 * 3600_000, now);

    expect(long.confidence).toBeGreaterThan(short.confidence);
  });
});

// ---------------------------------------------------------------------------
// evaluateTimePatternTrigger
// ---------------------------------------------------------------------------

describe('evaluateTimePatternTrigger', () => {
  it('triggers when current hour matches a high-confidence pattern', () => {
    const now = dateAt(7, 0);
    const patterns: TimePattern[] = [
      { hour: 7, messages: ['weather', 'news', 'hello'], confidence: 0.8 },
    ];
    const result = evaluateTimePatternTrigger(patterns, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.signalType).toBe('time_pattern');
    expect(result.confidence).toBe(0.8);
  });

  it('does not trigger when confidence is below threshold', () => {
    const now = dateAt(7, 0);
    const patterns: TimePattern[] = [
      { hour: 7, messages: ['test'], confidence: 0.3 },
    ];
    const result = evaluateTimePatternTrigger(patterns, now);

    expect(result.shouldTrigger).toBe(false);
  });

  it('does not trigger when no patterns match current hour', () => {
    const now = dateAt(15, 0);
    const patterns: TimePattern[] = [
      { hour: 7, messages: ['morning'], confidence: 0.9 },
    ];
    const result = evaluateTimePatternTrigger(patterns, now);

    expect(result.shouldTrigger).toBe(false);
  });

  it('picks the highest confidence pattern for the current hour', () => {
    const now = dateAt(7, 0);
    const patterns: TimePattern[] = [
      { hour: 7, messages: ['low'], confidence: 0.65 },
      { hour: 7, messages: ['high'], confidence: 0.9 },
    ];
    const result = evaluateTimePatternTrigger(patterns, now);

    expect(result.shouldTrigger).toBe(true);
    expect(result.confidence).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// isInQuietHours
// ---------------------------------------------------------------------------

describe('isInQuietHours', () => {
  it('returns true when within same-day quiet hours', () => {
    const now = dateAt(23, 30);
    expect(isInQuietHours(now, 22, 24)).toBe(true);
  });

  it('returns false when outside same-day quiet hours', () => {
    const now = dateAt(15, 0);
    expect(isInQuietHours(now, 22, 24)).toBe(false);
  });

  it('handles midnight-crossing range: 2am with quiet 23-7', () => {
    const now = dateAt(2, 0);
    expect(isInQuietHours(now, 23, 7)).toBe(true);
  });

  it('handles midnight-crossing range: 3pm with quiet 23-7', () => {
    const now = dateAt(15, 0);
    expect(isInQuietHours(now, 23, 7)).toBe(false);
  });

  it('returns false when quiet hours are null', () => {
    const now = dateAt(3, 0);
    expect(isInQuietHours(now, null, null)).toBe(false);
  });

  it('handles exactly on quiet start boundary', () => {
    const now = dateAt(23, 0);
    expect(isInQuietHours(now, 23, 7)).toBe(true);
  });

  it('handles exactly on quiet end boundary (exclusive)', () => {
    const now = dateAt(7, 0);
    expect(isInQuietHours(now, 23, 7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRateLimited
// ---------------------------------------------------------------------------

describe('isRateLimited', () => {
  it('returns true when delivered count equals max', () => {
    expect(isRateLimited(5, 5)).toBe(true);
  });

  it('returns true when delivered count exceeds max', () => {
    expect(isRateLimited(7, 5)).toBe(true);
  });

  it('returns false when under the limit', () => {
    expect(isRateLimited(3, 5)).toBe(false);
  });

  it('returns false with zero deliveries', () => {
    expect(isRateLimited(0, 5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateAllTriggers
// ---------------------------------------------------------------------------

describe('evaluateAllTriggers', () => {
  it('returns highest confidence trigger when multiple fire', () => {
    const now = dateAt(7, 0);
    const signals = {
      calendar: [calendarEvent('Meeting', dateAt(7, 30))],
      lastMessageAt: now.getTime() - 30 * 3600_000, // 30h gap
      patterns: [{ hour: 7, messages: ['hi', 'morning', 'news'], confidence: 0.9 }],
    };

    const result = evaluateAllTriggers(signals, now, DEFAULT_PREFS, 0);

    expect(result).not.toBeNull();
    // Time pattern has 0.9 confidence — should be highest
    expect(result!.signalType).toBe('time_pattern');
    expect(result!.confidence).toBe(0.9);
  });

  it('returns null when rate limited', () => {
    const now = dateAt(10, 0);
    const signals = {
      calendar: [calendarEvent('Meeting', dateAt(10, 30))],
      lastMessageAt: null,
      patterns: [],
    };

    const result = evaluateAllTriggers(signals, now, DEFAULT_PREFS, 5);
    expect(result).toBeNull();
  });

  it('returns null during quiet hours', () => {
    const now = dateAt(2, 0);
    const prefs = { ...DEFAULT_PREFS, quietStart: 23, quietEnd: 7 };
    const signals = {
      calendar: [calendarEvent('Meeting', dateAt(2, 30))],
      lastMessageAt: null,
      patterns: [],
    };

    const result = evaluateAllTriggers(signals, now, prefs, 0);
    expect(result).toBeNull();
  });

  it('returns null when no triggers fire', () => {
    const now = dateAt(10, 0);
    const signals = {
      calendar: [], // no events
      lastMessageAt: now.getTime() - 1 * 3600_000, // 1h ago
      patterns: [], // no patterns
    };

    const result = evaluateAllTriggers(signals, now, DEFAULT_PREFS, 0);
    expect(result).toBeNull();
  });

  it('returns calendar trigger when it is the only one firing', () => {
    const now = dateAt(10, 0);
    const signals = {
      calendar: [calendarEvent('Standup', dateAt(10, 20))],
      lastMessageAt: now.getTime() - 1 * 3600_000, // recent message
      patterns: [],
    };

    const result = evaluateAllTriggers(signals, now, DEFAULT_PREFS, 0);

    expect(result).not.toBeNull();
    expect(result!.signalType).toBe('calendar_event');
    expect(result!.shouldTrigger).toBe(true);
  });
});
