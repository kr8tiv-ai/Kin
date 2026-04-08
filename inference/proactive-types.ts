/**
 * Proactive Companion — Type definitions for context signals,
 * suggestions, preferences, and trigger evaluation.
 *
 * All interfaces align with the DB schema tables:
 * `context_signals`, `proactive_suggestions`, and
 * `user_preferences` (proactive columns).
 *
 * @module inference/proactive-types
 */

// ---------------------------------------------------------------------------
// Context Signals
// ---------------------------------------------------------------------------

/** Signal types the proactive engine can detect. */
export type SignalType = 'calendar_event' | 'time_pattern' | 'conversation_gap';

/** Signal status lifecycle. */
export type SignalStatus = 'pending' | 'delivered' | 'dismissed' | 'expired';

/** A detected context signal stored in DB. */
export interface ContextSignal {
  id: string;
  userId: string;
  companionId: string;
  signalType: SignalType;
  payload: string; // JSON blob
  confidence: number;
  status: SignalStatus;
  createdAt: number;
  deliveredAt: number | null;
  expiresAt: number | null;
}

/** DB row shape for context_signals (snake_case). */
export interface ContextSignalRow {
  id: string;
  user_id: string;
  companion_id: string;
  signal_type: string;
  payload: string;
  confidence: number;
  status: string;
  created_at: number;
  delivered_at: number | null;
  expires_at: number | null;
}

// ---------------------------------------------------------------------------
// Proactive Suggestions
// ---------------------------------------------------------------------------

/** Suggestion status lifecycle. */
export type SuggestionStatus = 'pending' | 'delivered' | 'acted_on' | 'dismissed' | 'expired';

/** User feedback on a delivered suggestion. */
export type UserFeedback = 'helpful' | 'not_helpful' | null;

/** A proactive suggestion stored in DB. */
export interface ProactiveSuggestion {
  id: string;
  userId: string;
  companionId: string;
  signalId: string | null;
  content: string;
  deliveryChannel: string;
  deliveryRecipientId: string;
  status: SuggestionStatus;
  userFeedback: UserFeedback;
  createdAt: number;
  deliveredAt: number | null;
}

/** DB row shape for proactive_suggestions (snake_case). */
export interface ProactiveSuggestionRow {
  id: string;
  user_id: string;
  companion_id: string;
  signal_id: string | null;
  content: string;
  delivery_channel: string;
  delivery_recipient_id: string;
  status: string;
  user_feedback: string | null;
  created_at: number;
  delivered_at: number | null;
}

// ---------------------------------------------------------------------------
// Proactive Preferences
// ---------------------------------------------------------------------------

/** User's proactive companion preferences (camelCase API shape). */
export interface ProactivePreferences {
  proactiveEnabled: boolean;
  quietStart: number | null; // hour 0-23
  quietEnd: number | null;   // hour 0-23
  maxDaily: number;
  channels: string[];        // delivery channels opted into
}

// ---------------------------------------------------------------------------
// Trigger Evaluation
// ---------------------------------------------------------------------------

/** Result of evaluating a single trigger rule. */
export interface TriggerResult {
  shouldTrigger: boolean;
  signalType: SignalType;
  reason: string;
  confidence: number;
}

/** Request to generate a proactive suggestion message. */
export interface SuggestionRequest {
  userId: string;
  companionId: string;
  signal: ContextSignal;
  userPrefs: ProactivePreferences;
  companionName: string;
}

// ---------------------------------------------------------------------------
// Calendar Events (simplified from Google Calendar API)
// ---------------------------------------------------------------------------

/** Simplified calendar event returned by CalendarManager. */
export interface CalendarEvent {
  title: string;
  startTime: number;  // epoch ms
  endTime: number;    // epoch ms
  location: string | null;
}
