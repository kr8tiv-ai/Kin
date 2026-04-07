/**
 * Voice Intro Route — Onboarding preference extraction from spoken introduction
 *
 * POST /voice/intro
 *   Accepts raw audio body (same as /voice/stt), transcribes it, then
 *   uses the companion LLM to extract structured user preferences from
 *   the transcript: name, interests, goals, experience level, tone.
 *
 * Returns structured JSON with the transcript, extracted profile fields,
 * and a confidence score. Falls back gracefully when extraction parsing
 * fails — returns the transcript with an empty profile.
 *
 * Error map:
 *   400 — empty/missing audio body
 *   413 — audio > 25 MB
 *   502 — transcription pipeline failure
 *   503 — no STT provider available
 *
 * @module api/routes/voice-intro
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  VoicePipelineError,
  getVoicePipeline,
} from '../../voice/pipeline.js';
import { isWhisperCppAvailable } from '../../voice/local-stt.js';
import { supervisedChat } from '../../inference/supervisor.js';
import { getFallbackHandler } from '../../inference/fallback-handler.js';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedProfile {
  displayName: string;
  interests: string[];
  goals: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  tone: 'friendly' | 'professional' | 'casual' | 'technical';
}

export interface VoiceIntroResponse {
  transcript: string;
  profile: ExtractedProfile;
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a structured data extraction assistant. You MUST respond with ONLY valid JSON — no markdown, no code fences, no explanation. Extract user profile information from their spoken introduction.`;

const EXTRACTION_USER_PROMPT = (transcript: string) =>
  `Given this user introduction, extract structured profile data.

Transcript: "${transcript}"

Extract these fields and return ONLY a JSON object:
{
  "displayName": "the user's name or how they want to be called (empty string if not mentioned)",
  "interests": ["array of interests or topics they mentioned"],
  "goals": ["array of goals or what they want to achieve"],
  "experienceLevel": "beginner" | "intermediate" | "advanced" (infer from context, default "beginner"),
  "tone": "friendly" | "professional" | "casual" | "technical" (infer from how they speak, default "friendly")
}

If a field cannot be determined, use sensible defaults: empty string for displayName, empty arrays for interests/goals, "beginner" for experienceLevel, "friendly" for tone.`;

const DEFAULT_PROFILE: ExtractedProfile = {
  displayName: '',
  interests: [],
  goals: [],
  experienceLevel: 'beginner',
  tone: 'friendly',
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse and validate the LLM extraction response.
 * Robust against markdown fences, extra text, and partial JSON.
 */
export function parseExtractionResponse(raw: string): { profile: ExtractedProfile; confidence: number } {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // Try to find a JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { profile: { ...DEFAULT_PROFILE }, confidence: 0 };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    let fieldsExtracted = 0;
    const totalFields = 5;

    const profile: ExtractedProfile = {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '',
      interests: Array.isArray(parsed.interests)
        ? parsed.interests.filter((i: unknown) => typeof i === 'string').map((i: string) => i.trim())
        : [],
      goals: Array.isArray(parsed.goals)
        ? parsed.goals.filter((g: unknown) => typeof g === 'string').map((g: string) => g.trim())
        : [],
      experienceLevel: ['beginner', 'intermediate', 'advanced'].includes(parsed.experienceLevel)
        ? parsed.experienceLevel
        : 'beginner',
      tone: ['friendly', 'professional', 'casual', 'technical'].includes(parsed.tone)
        ? parsed.tone
        : 'friendly',
    };

    // Calculate confidence based on how many fields had real values
    if (profile.displayName.length > 0) fieldsExtracted++;
    if (profile.interests.length > 0) fieldsExtracted++;
    if (profile.goals.length > 0) fieldsExtracted++;
    if (parsed.experienceLevel && ['beginner', 'intermediate', 'advanced'].includes(parsed.experienceLevel)) fieldsExtracted++;
    if (parsed.tone && ['friendly', 'professional', 'casual', 'technical'].includes(parsed.tone)) fieldsExtracted++;

    const confidence = Math.round((fieldsExtracted / totalFields) * 100) / 100;

    return { profile, confidence };
  } catch {
    return { profile: { ...DEFAULT_PROFILE }, confidence: 0 };
  }
}

// ============================================================================
// Route
// ============================================================================

const voiceIntroRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/voice/intro', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const t0 = performance.now();

    // ── Validate audio body ─────────────────────────────────────────────
    const audioBuffer = request.body as Buffer;

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      return reply.status(400).send({
        error: 'Request body must contain raw audio bytes',
        hint: 'Send the audio file as the request body with an appropriate Content-Type header (e.g. audio/ogg, audio/wav).',
        status: 400,
      });
    }

    // Size guard: reject audio > 25 MB (Whisper limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return reply.status(413).send({
        error: 'Audio file too large (max 25 MB)',
        status: 413,
      });
    }

    // ── Pre-flight: ensure STT backend is available ─────────────────────
    const whisperLocal = await isWhisperCppAvailable();
    const hasOpenAiKey = !!process.env.OPENAI_API_KEY;

    if (!whisperLocal && !hasOpenAiKey) {
      return reply.status(503).send({
        error: 'No speech-to-text provider available',
        code: 'NO_STT_PROVIDER',
        hint: 'Set OPENAI_API_KEY or install whisper.cpp locally.',
        status: 503,
      });
    }

    // ── Stage 1: Transcribe ─────────────────────────────────────────────
    let transcript: string;

    try {
      const pipeline = getVoicePipeline();
      const result = await pipeline.transcribe(audioBuffer);
      transcript = result.text;
    } catch (err) {
      const transcribeMs = Math.round(performance.now() - t0);

      if (err instanceof VoicePipelineError) {
        const status = err.code === 'MISSING_API_KEY' ? 503 : 502;
        return reply
          .header('X-Transcribe-Ms', String(transcribeMs))
          .status(status)
          .send({
            error: err.message,
            code: err.code,
            stage: 'transcription',
            status,
          });
      }

      request.log.error(err, 'voice/intro transcription error');
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .status(502)
        .send({
          error: 'Transcription failed',
          code: 'TRANSCRIPTION_ERROR',
          stage: 'transcription',
          status: 502,
        });
    }

    const transcribeMs = Math.round(performance.now() - t0);

    if (!transcript || transcript.trim().length === 0) {
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .status(400)
        .send({
          error: 'No speech detected in audio',
          code: 'EMPTY_TRANSCRIPTION',
          stage: 'transcription',
          status: 400,
        });
    }

    // ── Stage 2: Extract preferences via LLM ────────────────────────────
    const t1 = performance.now();
    let extractedProfile: ExtractedProfile;
    let confidence: number;

    try {
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: EXTRACTION_USER_PROMPT(transcript) },
      ];

      const fallback = getFallbackHandler();
      const result = await supervisedChat(messages, 'cipher', fallback, {
        taskType: 'analysis',
      });

      const parsed = parseExtractionResponse(result.content);
      extractedProfile = parsed.profile;
      confidence = parsed.confidence;
    } catch (err) {
      const extractMs = Math.round(performance.now() - t1);
      request.log.warn(err, 'voice/intro extraction failed — returning transcript with empty profile');

      // Extraction failure is non-fatal: return transcript with defaults
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .header('X-Extract-Ms', String(extractMs))
        .send({
          transcript,
          profile: { ...DEFAULT_PROFILE },
          confidence: 0,
        } satisfies VoiceIntroResponse);
    }

    const extractMs = Math.round(performance.now() - t1);

    // ── Return structured result ────────────────────────────────────────
    return reply
      .header('X-Transcribe-Ms', String(transcribeMs))
      .header('X-Extract-Ms', String(extractMs))
      .send({
        transcript,
        profile: extractedProfile,
        confidence,
      } satisfies VoiceIntroResponse);
  });
};

export default voiceIntroRoutes;
