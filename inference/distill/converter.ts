/**
 * Distill Converter — Transforms DistillCandidates into SFT JSONL lines.
 *
 * Output format matches the SFT chat format consumed by fine-tune.py,
 * with extended metadata fields (source, qualityScore) for provenance.
 *
 * SFT structure: { messages: [{role, content}...], metadata: {...} }
 * Required roles: system, user, assistant (enforced by fine-tune.py REQUIRED_ROLES)
 *
 * @module inference/distill/converter
 */

import type { DistillCandidate } from './types.js';

// ============================================================================
// SFT Output Types
// ============================================================================

/**
 * SFT message role — matches fine-tune.py REQUIRED_ROLES.
 */
export interface DistillSFTMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * SFT line with extended metadata for distillation provenance.
 * Compatible with training-data.ts SFTLine shape, plus source and qualityScore.
 */
export interface DistillSFTLine {
  messages: DistillSFTMessage[];
  metadata: {
    companionId: string;
    timestamp: string;
    provider: string;
    model: string;
    latencyMs: number;
    source: 'distillation';
    qualityScore: number;
  };
}

// ============================================================================
// Converter
// ============================================================================

/**
 * Convert a DistillCandidate to an SFT training line.
 *
 * Produces the three required roles (system, user, assistant) that
 * fine-tune.py validates at line 124 (REQUIRED_ROLES).
 *
 * @param candidate - A quality-filtered frontier eval result
 * @returns SFT line ready for JSONL serialization
 */
export function convertToSFT(candidate: DistillCandidate): DistillSFTLine {
  return {
    messages: [
      { role: 'system', content: candidate.systemPrompt },
      { role: 'user', content: candidate.userMessage },
      { role: 'assistant', content: candidate.frontierResponse },
    ],
    metadata: {
      companionId: candidate.companionId,
      timestamp: candidate.evaluatedAt,
      provider: candidate.provider,
      model: candidate.model,
      latencyMs: 0, // Not tracked in eval results at the per-candidate level
      source: 'distillation',
      qualityScore: candidate.qualityScore,
    },
  };
}
