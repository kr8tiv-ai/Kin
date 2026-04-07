/**
 * Shared Soul types — used by soul routes, soul-drift, and soul-bridge.
 *
 * These were previously duplicated across api/routes/soul.ts and
 * inference/soul-drift.ts. Centralised here to keep one source of truth.
 *
 * @module inference/soul-types
 */

export interface SoulTraits {
  warmth: number;      // 0-100
  formality: number;   // 0-100
  humor: number;       // 0-100
  directness: number;  // 0-100
  creativity: number;  // 0-100
  depth: number;       // 0-100
}

export interface SoulStyle {
  vocabulary: 'simple' | 'moderate' | 'advanced';
  responseLength: 'concise' | 'balanced' | 'detailed';
  useEmoji: boolean;
}

export interface SoulConfigBody {
  customName?: string;
  traits: SoulTraits;
  values: string[];
  style: SoulStyle;
  customInstructions: string;
  boundaries: string[];
  antiPatterns: string[];
}
