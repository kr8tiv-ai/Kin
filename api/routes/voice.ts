/**
 * Voice Routes -- TTS, STT, provider status, and full conversation pipeline
 * for the KIN web dashboard.
 *
 * POST /voice/tts            Text-to-speech (JSON body -> audio buffer)
 * POST /voice/stt            Speech-to-text  (raw audio body -> JSON transcript)
 * GET  /voice/providers      Lists available TTS/STT providers and their readiness
 * POST /voice/conversation   Full round-trip: audio in -> transcribe -> companion -> TTS -> JSON out
 *
 * All routes return 503 with actionable guidance when the required API key
 * or local binary is missing, so callers can surface helpful setup hints.
 *
 * @module api/routes/voice
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  VoicePipelineError,
  getVoicePipeline,
  type VoiceConfig,
} from '../../voice/pipeline.js';
import {
  isXttsAvailable,
  isPiperAvailable,
} from '../../voice/local-tts.js';
import { isWhisperCppAvailable } from '../../voice/local-stt.js';
import { supervisedChat } from '../../inference/supervisor.js';
import { buildCompanionPrompt } from '../../inference/companion-prompts.js';
import { getFallbackHandler } from '../../inference/fallback-handler.js';

// ============================================================================
// Request / Response types
// ============================================================================

interface TtsBody {
  text: string;
  companionId?: string;
  provider?: 'elevenlabs' | 'openai' | 'local';
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a VoiceConfig that respects the caller's provider override. */
function buildVoiceConfig(provider?: string): VoiceConfig {
  const base: VoiceConfig = {};
  if (provider === 'elevenlabs' || provider === 'openai' || provider === 'local') {
    base.ttsProvider = provider;
  }
  return base;
}

/** Return a user-friendly 503 when a required credential is absent. */
function missingKeyResponse(service: string, envVar: string, docsUrl?: string) {
  const hint = docsUrl
    ? `Set the ${envVar} environment variable. See ${docsUrl}`
    : `Set the ${envVar} environment variable.`;
  return {
    error: `${service} is not configured`,
    hint,
    status: 503,
  };
}

// ============================================================================
// Route definitions
// ============================================================================

const ttsBodySchema = {
  type: 'object' as const,
  required: ['text'] as const,
  properties: {
    text: { type: 'string' as const, minLength: 1, maxLength: 5000 },
    companionId: { type: 'string' as const, minLength: 1, maxLength: 64 },
    provider: {
      type: 'string' as const,
      enum: ['elevenlabs', 'openai', 'local'],
    },
  },
  additionalProperties: false,
};

const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /voice/tts ─────────────────────────────────────────────────────
  fastify.post<{ Body: TtsBody }>('/voice/tts', {
    schema: { body: ttsBodySchema },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    const { text, companionId = 'cipher', provider } = request.body;

    // Resolve effective provider (explicit > env > default)
    const effectiveProvider = provider
      ?? (process.env.TTS_PROVIDER as TtsBody['provider'])
      ?? 'openai';

    // Pre-flight: check that required credentials exist BEFORE hitting the pipeline
    if (effectiveProvider === 'elevenlabs' && !process.env.ELEVENLABS_API_KEY) {
      return reply.status(503).send(
        missingKeyResponse('ElevenLabs TTS', 'ELEVENLABS_API_KEY', 'https://elevenlabs.io/docs'),
      );
    }
    if (effectiveProvider === 'openai' && !process.env.OPENAI_API_KEY) {
      return reply.status(503).send(
        missingKeyResponse('OpenAI TTS', 'OPENAI_API_KEY', 'https://platform.openai.com/api-keys'),
      );
    }
    if (effectiveProvider === 'local') {
      const [xtts, piper] = await Promise.all([isXttsAvailable(), isPiperAvailable()]);
      if (!xtts && !piper) {
        return reply.status(503).send({
          error: 'No local TTS provider available',
          hint: 'Start the XTTS server or install Piper. See voice/local-tts.ts for setup instructions.',
          status: 503,
        });
      }
    }

    try {
      const pipeline = getVoicePipeline(buildVoiceConfig(effectiveProvider));
      const result = await pipeline.synthesize(text, companionId);

      const contentType = result.format === 'wav' ? 'audio/wav'
        : result.format === 'opus' ? 'audio/opus'
        : result.format === 'flac' ? 'audio/flac'
        : 'audio/mpeg';

      return reply
        .header('Content-Type', contentType)
        .header('X-Voice-Id', result.voiceId)
        .header('X-Duration-Seconds', String(result.durationSeconds.toFixed(2)))
        .send(result.audioBuffer);
    } catch (err) {
      if (err instanceof VoicePipelineError) {
        const status = err.code === 'MISSING_API_KEY' ? 503 : 502;
        return reply.status(status).send({
          error: err.message,
          code: err.code,
          status,
        });
      }
      request.log.error(err, 'voice/tts unexpected error');
      return reply.status(500).send({ error: 'Internal voice synthesis error', status: 500 });
    }
  });

  // ── POST /voice/stt ─────────────────────────────────────────────────────
  // Accepts raw audio bytes in the request body.
  // Content-Type header tells us the audio format (defaults to audio/ogg).
  fastify.post('/voice/stt', {
    config: {
      rateLimit: { max: 15, timeWindow: '1 minute' },
      rawBody: true,
    },
  } as any, async (request, reply: FastifyReply) => {
    // Read raw body as Buffer
    const audioBuffer = request.body as Buffer;

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      return reply.status(400).send({
        error: 'Request body must contain raw audio bytes',
        hint: 'Send the audio file as the request body with an appropriate Content-Type header (e.g. audio/ogg, audio/wav).',
        status: 400,
      });
    }

    // Size guard: reject audio larger than 25 MB (OpenAI Whisper limit)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return reply.status(413).send({
        error: 'Audio file too large (max 25 MB)',
        status: 413,
      });
    }

    // Pre-flight: ensure at least one STT backend is available
    const whisperLocal = await isWhisperCppAvailable();
    const hasOpenAiKey = !!process.env.OPENAI_API_KEY;

    if (!whisperLocal && !hasOpenAiKey) {
      return reply.status(503).send(
        missingKeyResponse(
          'Speech-to-text',
          'OPENAI_API_KEY (or install whisper.cpp locally)',
          'https://platform.openai.com/api-keys',
        ),
      );
    }

    try {
      const pipeline = getVoicePipeline();
      const result = await pipeline.transcribe(audioBuffer);

      return reply.send({
        text: result.text,
        language: result.language ?? 'en',
        durationSeconds: result.durationSeconds,
        confidence: result.confidence,
      });
    } catch (err) {
      if (err instanceof VoicePipelineError) {
        const status = err.code === 'MISSING_API_KEY' ? 503 : 502;
        return reply.status(status).send({
          error: err.message,
          code: err.code,
          status,
        });
      }
      request.log.error(err, 'voice/stt unexpected error');
      return reply.status(500).send({ error: 'Internal transcription error', status: 500 });
    }
  });

  // ── GET /voice/providers ────────────────────────────────────────────────
  fastify.get('/voice/providers', async (_request, reply: FastifyReply) => {
    // Check all provider availability in parallel
    const [xttsUp, piperUp, whisperUp] = await Promise.all([
      isXttsAvailable(),
      isPiperAvailable(),
      isWhisperCppAvailable(),
    ]);

    const tts = {
      elevenlabs: {
        configured: !!process.env.ELEVENLABS_API_KEY,
        type: 'cloud' as const,
      },
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        type: 'cloud' as const,
      },
      xtts: {
        configured: xttsUp,
        type: 'local' as const,
        hint: xttsUp ? undefined : 'Start XTTS server: tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 --server',
      },
      piper: {
        configured: piperUp,
        type: 'local' as const,
        hint: piperUp ? undefined : 'Install Piper and set PIPER_MODEL_PATH. See https://github.com/rhasspy/piper',
      },
    };

    const stt = {
      whisper_api: {
        configured: !!process.env.OPENAI_API_KEY,
        type: 'cloud' as const,
      },
      whisper_cpp: {
        configured: whisperUp,
        type: 'local' as const,
        hint: whisperUp ? undefined : 'Install whisper.cpp and set WHISPER_MODEL_PATH. See https://github.com/ggerganov/whisper.cpp',
      },
    };

    // Wake word detection status
    const picovoiceKey = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
      ?? process.env.PICOVOICE_ACCESS_KEY;
    const wakeWord = {
      configured: !!picovoiceKey,
      provider: (picovoiceKey ? 'porcupine' : 'none') as 'porcupine' | 'none',
    };

    // Determine the currently active providers
    const activeTts = process.env.TTS_PROVIDER
      ?? (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.OPENAI_API_KEY ? 'openai' : xttsUp ? 'xtts' : piperUp ? 'piper' : 'none');
    const activeStt = whisperUp ? 'whisper_cpp'
      : process.env.OPENAI_API_KEY ? 'whisper_api'
      : 'none';

    return reply.send({
      tts,
      stt,
      wakeWord,
      active: { tts: activeTts, stt: activeStt },
    });
  });

  // ── POST /voice/conversation ────────────────────────────────────────────
  // Full round-trip voice pipeline: audio → transcribe → companion → TTS → JSON.
  // Accepts multipart form data with `audio` file + `companionId` string.
  // Returns JSON with transcription, response text, and base64-encoded audio.
  fastify.post('/voice/conversation', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  } as any, async (request, reply: FastifyReply) => {
    // ── Pre-flight: verify STT backend availability ───────────────────────
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

    // ── Parse multipart upload ────────────────────────────────────────────
    let audioBuffer: Buffer;
    let companionId = 'cipher';
    let voiceLanguage = 'en';

    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          error: 'Missing audio file in multipart upload',
          hint: 'Send a multipart form with an "audio" file field.',
          status: 400,
        });
      }

      audioBuffer = await data.toBuffer();

      // Read companionId and language from multipart fields (comes before or after file)
      const fields = data.fields as Record<string, any>;
      if (fields.companionId) {
        const field = fields.companionId;
        companionId = (typeof field === 'object' && field.value)
          ? String(field.value)
          : String(field);
      }
      if (fields.language) {
        const langField = fields.language;
        voiceLanguage = (typeof langField === 'object' && langField.value)
          ? String(langField.value)
          : String(langField);
      }
    } catch (err) {
      request.log.error(err, 'voice/conversation multipart parse error');
      return reply.status(400).send({
        error: 'Invalid multipart form data',
        status: 400,
      });
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return reply.status(400).send({
        error: 'Audio file is empty',
        hint: 'The uploaded audio file contained no data.',
        status: 400,
      });
    }

    // Size guard: reject audio > 25 MB
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return reply.status(413).send({
        error: 'Audio file too large (max 25 MB)',
        status: 413,
      });
    }

    // ── Stage 1: Transcribe ───────────────────────────────────────────────
    let transcriptionText: string;
    const t0 = performance.now();

    try {
      const pipeline = getVoicePipeline();
      const transcription = await pipeline.transcribe(audioBuffer);
      transcriptionText = transcription.text;
    } catch (err) {
      const transcribeMs = Math.round(performance.now() - t0);
      if (err instanceof VoicePipelineError) {
        const status = err.code === 'MISSING_API_KEY' ? 503 : 502;
        return reply
          .header('X-Transcribe-Ms', String(transcribeMs))
          .status(status)
          .send({ error: err.message, code: err.code, stage: 'transcription', status });
      }
      request.log.error(err, 'voice/conversation transcription error');
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .status(502)
        .send({ error: 'Transcription failed', code: 'TRANSCRIPTION_ERROR', stage: 'transcription', status: 502 });
    }

    const transcribeMs = Math.round(performance.now() - t0);

    if (!transcriptionText || transcriptionText.trim().length === 0) {
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

    // ── Stage 2: Generate companion response ──────────────────────────────
    const t1 = performance.now();
    let responseText: string;

    try {
      const systemPrompt = buildCompanionPrompt(companionId, {
        taskContext: { type: 'voice' },
      }, { language: voiceLanguage });

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptionText },
      ];

      const fallback = getFallbackHandler();
      const result = await supervisedChat(messages, companionId, fallback, {
        taskType: 'voice',
      });
      responseText = result.content;
    } catch (err) {
      const inferenceMs = Math.round(performance.now() - t1);
      request.log.error(err, 'voice/conversation inference error');
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .header('X-Inference-Ms', String(inferenceMs))
        .status(502)
        .send({
          error: 'Companion response generation failed',
          code: 'INFERENCE_ERROR',
          stage: 'inference',
          status: 502,
        });
    }

    const inferenceMs = Math.round(performance.now() - t1);

    // ── Stage 3: Synthesize TTS ───────────────────────────────────────────
    const t2 = performance.now();
    let audioBase64: string;
    let audioFormat: string;

    try {
      const pipeline = getVoicePipeline();
      const synthesis = await pipeline.synthesize(responseText, companionId);
      audioBase64 = synthesis.audioBuffer.toString('base64');
      audioFormat = synthesis.format;
    } catch (err) {
      const synthesizeMs = Math.round(performance.now() - t2);
      if (err instanceof VoicePipelineError) {
        const status = err.code === 'MISSING_API_KEY' ? 503 : 502;
        return reply
          .header('X-Transcribe-Ms', String(transcribeMs))
          .header('X-Inference-Ms', String(inferenceMs))
          .header('X-Synthesize-Ms', String(synthesizeMs))
          .status(status)
          .send({ error: err.message, code: err.code, stage: 'synthesis', status });
      }
      request.log.error(err, 'voice/conversation synthesis error');
      return reply
        .header('X-Transcribe-Ms', String(transcribeMs))
        .header('X-Inference-Ms', String(inferenceMs))
        .header('X-Synthesize-Ms', String(synthesizeMs))
        .status(502)
        .send({ error: 'Voice synthesis failed', code: 'SYNTHESIS_ERROR', stage: 'synthesis', status: 502 });
    }

    const synthesizeMs = Math.round(performance.now() - t2);

    // ── Return full conversation result ───────────────────────────────────
    return reply
      .header('X-Transcribe-Ms', String(transcribeMs))
      .header('X-Inference-Ms', String(inferenceMs))
      .header('X-Synthesize-Ms', String(synthesizeMs))
      .send({
        transcription: transcriptionText,
        response: responseText,
        audio: audioBase64,
        audioFormat,
        timings: {
          transcribeMs,
          inferenceMs,
          synthesizeMs,
        },
      });
  });
};

export default voiceRoutes;
