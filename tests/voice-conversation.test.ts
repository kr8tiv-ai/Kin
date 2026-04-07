/**
 * Voice Conversation Endpoint Tests
 *
 * Tests POST /voice/conversation — the full round-trip pipeline:
 * audio upload → transcribe → companion response → TTS → JSON.
 *
 * Uses Fastify inject() with mocked VoicePipeline and supervisedChat.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ============================================================================
// Mocks — must be hoisted before any imports that reference them
// ============================================================================

const mockTranscribe = vi.fn();
const mockSynthesize = vi.fn();
const mockIsWhisperCppAvailable = vi.fn();
const mockSupervisedChat = vi.fn();
const mockGetFallbackHandler = vi.fn();
const mockBuildCompanionPrompt = vi.fn();

vi.mock('../voice/pipeline.js', () => ({
  getVoicePipeline: () => ({
    transcribe: mockTranscribe,
    synthesize: mockSynthesize,
  }),
  VoicePipelineError: class VoicePipelineError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'VoicePipelineError';
      this.code = code;
    }
  },
}));

vi.mock('../voice/local-stt.js', () => ({
  isWhisperCppAvailable: () => mockIsWhisperCppAvailable(),
}));

vi.mock('../voice/local-tts.js', () => ({
  isXttsAvailable: vi.fn().mockResolvedValue(false),
  isPiperAvailable: vi.fn().mockResolvedValue(false),
}));

vi.mock('../inference/supervisor.js', () => ({
  supervisedChat: (...args: any[]) => mockSupervisedChat(...args),
}));

vi.mock('../inference/fallback-handler.js', () => ({
  getFallbackHandler: () => mockGetFallbackHandler(),
  FallbackHandler: class {},
}));

vi.mock('../inference/companion-prompts.js', () => ({
  buildCompanionPrompt: (...args: any[]) => mockBuildCompanionPrompt(...args),
  COMPANION_SYSTEM_PROMPTS: { cipher: 'mock prompt' },
  COMPANION_SHORT_PROMPTS: { cipher: 'mock short' },
  getAvailableCompanions: () => ['cipher'],
  buildSoulPrompt: () => '',
}));

// ============================================================================
// Helpers
// ============================================================================

let server: FastifyInstance | null = null;
let skipReason = '';

/** Build a multipart body buffer with an audio field and optional companionId. */
function buildMultipartBody(
  audioContent: Buffer | null,
  companionId?: string,
): { body: Buffer; boundary: string } {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];

  if (companionId) {
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="companionId"\r\n\r\n` +
      `${companionId}\r\n`,
    ));
  }

  if (audioContent) {
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="audio"; filename="recording.ogg"\r\n` +
      `Content-Type: audio/ogg\r\n\r\n`,
    ));
    parts.push(audioContent);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeAll(async () => {
  try {
    // We only need the voice routes plugin, but the server registers multipart
    // globally — use the full server factory for realistic inject testing.
    const { createServer } = await import('../api/server.js');

    server = await createServer({
      environment: 'development',
      jwtSecret: 'test-secret-voice',
      databasePath: ':memory:',
      rateLimitMax: 10000,
    });
    await server.ready();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('bindings') ||
      msg.includes('better_sqlite3') ||
      msg.includes('better-sqlite3') ||
      msg.includes('ERR_DLOPEN_FAILED') ||
      msg.includes('dockerode')
    ) {
      skipReason = `Native dependency not available: ${msg.slice(0, 120)}`;
    } else {
      throw err;
    }
  }
});

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();

  // Default: STT is available via OpenAI key
  mockIsWhisperCppAvailable.mockResolvedValue(false);
  process.env.OPENAI_API_KEY = 'test-key';

  // Default mock responses
  mockBuildCompanionPrompt.mockReturnValue('You are Cipher.');
  mockGetFallbackHandler.mockReturnValue({});
  mockTranscribe.mockResolvedValue({
    text: 'Hello, how are you?',
    language: 'en',
    durationSeconds: 2.5,
    confidence: 0.95,
  });
  mockSupervisedChat.mockResolvedValue({
    content: 'I am doing great, thanks for asking!',
    route: 'local',
    supervisorUsed: false,
    latencyMs: 150,
    companionId: 'cipher',
    inputTokens: 50,
    outputTokens: 20,
    costUsd: 0,
  });
  mockSynthesize.mockResolvedValue({
    audioBuffer: Buffer.from('fake-audio-data'),
    durationSeconds: 3.0,
    format: 'mp3',
    voiceId: 'onyx',
  });
});

function skip(): boolean {
  if (skipReason) {
    console.log(`[SKIP] ${skipReason}`);
    return true;
  }
  return false;
}

// ============================================================================
// Tests
// ============================================================================

describe('POST /voice/conversation', () => {
  it('returns 200 with full round-trip JSON on successful conversation', async () => {
    if (skip()) return;

    const fakeAudio = Buffer.from('fake-ogg-audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    const json = response.json();
    // camelCase keys per K005
    expect(json.transcription).toBe('Hello, how are you?');
    expect(json.response).toBe('I am doing great, thanks for asking!');
    expect(json.audio).toBe(Buffer.from('fake-audio-data').toString('base64'));
    expect(json.audioFormat).toBe('mp3');
    expect(json.timings).toBeDefined();
    expect(typeof json.timings.transcribeMs).toBe('number');
    expect(typeof json.timings.inferenceMs).toBe('number');
    expect(typeof json.timings.synthesizeMs).toBe('number');

    // Timing headers
    expect(response.headers['x-transcribe-ms']).toBeDefined();
    expect(response.headers['x-inference-ms']).toBeDefined();
    expect(response.headers['x-synthesize-ms']).toBeDefined();
  });

  it('defaults companionId to cipher when not provided', async () => {
    if (skip()) return;

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio); // no companionId

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    // supervisedChat should be called with 'cipher'
    expect(mockSupervisedChat).toHaveBeenCalledWith(
      expect.any(Array),
      'cipher',
      expect.anything(),
      expect.objectContaining({ taskType: 'voice' }),
    );
  });

  it('returns 400 when no audio file is uploaded', async () => {
    if (skip()) return;

    // Send multipart with only companionId, no audio file
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const bodyStr =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="companionId"\r\n\r\n` +
      `cipher\r\n` +
      `--${boundary}--\r\n`;

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(bodyStr),
    });

    // Should be 400 for missing file
    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error).toBeDefined();
  });

  it('returns 503 when no STT provider is available', async () => {
    if (skip()) return;

    // No whisper.cpp AND no OpenAI key
    mockIsWhisperCppAvailable.mockResolvedValue(false);
    delete process.env.OPENAI_API_KEY;

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(503);
    const json = response.json();
    expect(json.code).toBe('NO_STT_PROVIDER');
  });

  it('returns 502 with stage info when transcription fails', async () => {
    if (skip()) return;

    const { VoicePipelineError } = await import('../voice/pipeline.js');
    mockTranscribe.mockRejectedValue(
      new VoicePipelineError('Whisper API error', 'TRANSCRIPTION_FAILED'),
    );

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(502);
    const json = response.json();
    expect(json.code).toBe('TRANSCRIPTION_FAILED');
    expect(json.stage).toBe('transcription');
  });

  it('returns 502 when inference fails', async () => {
    if (skip()) return;

    mockSupervisedChat.mockRejectedValue(new Error('Model unavailable'));

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(502);
    const json = response.json();
    expect(json.stage).toBe('inference');
    expect(json.code).toBe('INFERENCE_ERROR');
  });

  it('returns 502 when synthesis fails', async () => {
    if (skip()) return;

    const { VoicePipelineError } = await import('../voice/pipeline.js');
    mockSynthesize.mockRejectedValue(
      new VoicePipelineError('TTS failed', 'SYNTHESIS_FAILED'),
    );

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(502);
    const json = response.json();
    expect(json.code).toBe('SYNTHESIS_FAILED');
    expect(json.stage).toBe('synthesis');
  });

  it('returns 400 when transcription yields empty text', async () => {
    if (skip()) return;

    mockTranscribe.mockResolvedValue({
      text: '',
      language: 'en',
      durationSeconds: 1.0,
    });

    const fakeAudio = Buffer.from('silent-audio');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'cipher');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.code).toBe('EMPTY_TRANSCRIPTION');
  });

  it('passes correct companionId through the full pipeline', async () => {
    if (skip()) return;

    const fakeAudio = Buffer.from('audio-content');
    const { body, boundary } = buildMultipartBody(fakeAudio, 'mischief');

    const response = await server!.inject({
      method: 'POST',
      url: '/voice/conversation',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);

    // buildCompanionPrompt called with mischief
    expect(mockBuildCompanionPrompt).toHaveBeenCalledWith(
      'mischief',
      expect.objectContaining({ taskContext: { type: 'voice' } }),
    );

    // supervisedChat called with mischief
    expect(mockSupervisedChat).toHaveBeenCalledWith(
      expect.any(Array),
      'mischief',
      expect.anything(),
      expect.objectContaining({ taskType: 'voice' }),
    );

    // synthesize called with mischief
    expect(mockSynthesize).toHaveBeenCalledWith(
      'I am doing great, thanks for asking!',
      'mischief',
    );
  });
});
