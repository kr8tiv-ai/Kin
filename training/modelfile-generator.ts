/**
 * Modelfile Generator — Bridges fine-tuned GGUF models to Ollama.
 *
 * Reads companion short prompts and templates Ollama Modelfiles with the
 * correct base model reference, system prompt, and Llama 3.2 parameters.
 *
 * @module training/modelfile-generator
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  COMPANION_SHORT_PROMPTS,
  getAvailableCompanions,
} from '../inference/companion-prompts.js';

// ============================================================================
// Types
// ============================================================================

export interface GenerateModelfileOptions {
  /** Companion ID (must exist in COMPANION_SHORT_PROMPTS) */
  companionId: string;
  /** Absolute or relative path to the GGUF model file */
  ggufPath?: string;
  /** Model reference for FROM line (e.g. 'hf.co/kr8tiv/kin-cipher-GGUF:Q4_K_M').
   *  When provided, used instead of ggufPath. At least one of ggufPath or modelRef is required. */
  modelRef?: string;
  /** Output directory for the Modelfile (default: training/output/{companionId}) */
  outputDir?: string;
}

export interface GenerateModelfileResult {
  /** Full path to the written Modelfile */
  modelfilePath: string;
  /** The Modelfile content string */
  modelfileContent: string;
  /** The Ollama model name (kin-{companionId}) */
  modelName: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the Ollama model name for a companion.
 *
 * @param companionId — one of the six Genesis KIN companion IDs
 * @returns model name in the format `kin-{companionId}`
 */
export function getModelName(companionId: string): string {
  return `kin-${companionId}`;
}

/**
 * Generate an Ollama Modelfile for a fine-tuned companion model.
 *
 * Validates the companionId, builds the Modelfile content with the companion's
 * short prompt and Llama 3.2 parameters, writes it to disk, and returns
 * the path, content, and model name.
 *
 * @throws {Error} if companionId is not a known companion
 */
export function generateModelfile(
  options: GenerateModelfileOptions,
): GenerateModelfileResult {
  const { companionId, ggufPath, modelRef, outputDir } = options;

  // ── Validate that at least one model source is provided ───────────────
  if (!modelRef && !ggufPath) {
    throw new Error(
      'Either modelRef or ggufPath must be provided to generateModelfile().',
    );
  }

  // ── Validate companion ID ─────────────────────────────────────────────
  const available = getAvailableCompanions();
  const shortPrompt = COMPANION_SHORT_PROMPTS[companionId];

  if (!available.includes(companionId) || shortPrompt === undefined) {
    throw new Error(
      `Unknown companionId "${companionId}". ` +
        `Available companions: ${available.join(', ')}`,
    );
  }

  // ── Build Modelfile content (prefer modelRef over ggufPath) ───────────
  const fromValue = modelRef ?? ggufPath;
  const modelfileContent = [
    `FROM ${fromValue}`,
    `SYSTEM """${shortPrompt}"""`,
    `PARAMETER temperature 0.7`,
    `PARAMETER top_p 0.9`,
    `PARAMETER num_ctx 2048`,
    `PARAMETER stop "<|start_header_id|>"`,
    `PARAMETER stop "<|end_header_id|>"`,
    `PARAMETER stop "<|eot_id|>"`,
    '', // trailing newline
  ].join('\n');

  // ── Write to disk ─────────────────────────────────────────────────────
  const resolvedDir =
    outputDir ?? path.join('training', 'output', companionId);
  fs.mkdirSync(resolvedDir, { recursive: true });

  const modelfilePath = path.join(resolvedDir, 'Modelfile');
  fs.writeFileSync(modelfilePath, modelfileContent, 'utf-8');

  const modelName = getModelName(companionId);

  return { modelfilePath, modelfileContent, modelName };
}
