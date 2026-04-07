/**
 * Tests for inference/approval-policy.ts
 *
 * Pure function tests — no I/O, no mocks needed. Verifies the declarative
 * policy map returns correct gate decisions for every skill+intent combination.
 */

import { describe, it, expect } from 'vitest';
import { requiresApproval } from '../inference/approval-policy.js';

describe('requiresApproval', () => {
  // -------------------------------------------------------------------------
  // Gated combinations (should require approval)
  // -------------------------------------------------------------------------

  it('email + send → true', () => {
    expect(requiresApproval('email', 'send')).toBe(true);
  });

  it('email + draft → true', () => {
    expect(requiresApproval('email', 'draft')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Non-gated email intents
  // -------------------------------------------------------------------------

  it('email + check → false', () => {
    expect(requiresApproval('email', 'check')).toBe(false);
  });

  it('email + read → false', () => {
    expect(requiresApproval('email', 'read')).toBe(false);
  });

  it('email + undefined intent → false', () => {
    expect(requiresApproval('email')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Non-gated skills
  // -------------------------------------------------------------------------

  it('browser + undefined → false', () => {
    expect(requiresApproval('browser')).toBe(false);
  });

  it('weather + undefined → false', () => {
    expect(requiresApproval('weather')).toBe(false);
  });

  it('calculator + undefined → false', () => {
    expect(requiresApproval('calculator')).toBe(false);
  });

  it('schedule + undefined → false', () => {
    expect(requiresApproval('schedule')).toBe(false);
  });

  it('pipeline + undefined → false', () => {
    expect(requiresApproval('pipeline')).toBe(false);
  });
});
