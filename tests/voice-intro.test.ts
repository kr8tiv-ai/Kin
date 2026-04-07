/**
 * Voice Intro Endpoint Tests
 *
 * Tests POST /voice/intro — onboarding preference extraction:
 * raw audio → transcribe → LLM extraction → structured profile JSON.
 *
 * Uses Fastify inject() with mocked VoicePipeline and supervisedChat.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ============================================================================
// Mocks — hoisted before any imports that reference them
// ============================================================================

const mockTranscribe = vi.fn();
const mockSynthesize = vi.fn();
const mockIsWhisperCppAvailable = vi.fn();
const mockSupervisedChat = vi.fn();
const mockGetFallbackHandler = vi.fn();

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
  buildCompanionPrompt: vi.fn().mockReturnValue('mock system prompt'),
  COMPANION_SYSTEM_PROMPTS: { cipher: 'mock prompt' },
  COMPANION_SHORT_PROMPTS: { cipher: 'mock short' },
  getAvailableCompanions: () => ['cipher'],
  buildSoulPrompt: () => '',
}));

// ============================================================================
// Server setup
// ============================================================================

let server: FastifyInstance | null = null;
let skipReason = '';

/**
 * Checks if the error is caused by an optional native dependency
 * that isn't available in this environment.
 */
function isOptionalDependencyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('better-sqlite3') ||
    msg.includes('ERR_DLOPEN_FAILED') ||
    msg.includes('ERR_MODULE_NOT_FOUND') ||
    msg.includes('dockerode') ||
    msg.includes('Cannot find module')
  );
}

/** Get a JWT token from dev-login for protected routes. */
async function getDevToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/dev-login',
    payload: { telegramId: 999999 },
  });
  const body = JSON.parse(res.body);
  return body.token;
}

beforeAll(async () => {
  try {
    // Ensure OPENAI_API_KEY is set so STT pre-flight passes
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-for-mock';

    // Race server creation against a timeout — better-sqlite3 can hang
    // indefinitely on Windows/WSL when native bindings aren't available
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server creation timed out — likely better-sqlite3 native module hang')), 20_000),
    );

    const create = async () => {
      const { createServer } = await import('../api/server.js');
      const s = await createServer({
        environment: 'development',
        databasePath: ':memory:',
      });
      await s.ready();
      return s;
    };

    server = await Promise.race([create(), timeout]);
  } catch (err) {
    if (isOptionalDependencyError(err) || (err instanceof Error && err.message.includes('timed out'))) {
      skipReason = `Skipping integration tests — ${(err as Error).message.slice(0, 100)}`;
      console.warn(skipReason);
    } else {
      throw err;
    }
  }
}, 25_000);

afterAll(async () => {
  if (server) await server.close();
});

beforeEach(() => {
  mockTranscribe.mockReset();
  mockSynthesize.mockReset();
  mockIsWhisperCppAvailable.mockReset();
  mockSupervisedChat.mockReset();
  mockGetFallbackHandler.mockReset();

  // Defaults: STT available, transcription succeeds
  mockIsWhisperCppAvailable.mockResolvedValue(false); // rely on OPENAI_API_KEY
  mockGetFallbackHandler.mockReturnValue({});
});

// ============================================================================
// Helpers
// ============================================================================

/** Fake 1KB audio buffer */
const FAKE_AUDIO = Buffer.alloc(1024, 0x42);

// ============================================================================
// Tests
// ============================================================================

describe('POST /voice/intro', () => {
  it('should skip if server could not start', () => {
    if (skipReason) {
      console.warn(skipReason);
      return;
    }
    expect(server).toBeTruthy();
  });

  it('returns extracted profile from a successful introduction', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    mockTranscribe.mockResolvedValue({
      text: "Hi, I'm Alex! I'm really into AI and blockchain. My goal is to build a decentralized assistant. I'm pretty experienced with coding.",
      language: 'en',
      durationSeconds: 12.5,
      confidence: 0.95,
    });

    mockSupervisedChat.mockResolvedValue({
      content: JSON.stringify({
        displayName: 'Alex',
        interests: ['AI', 'blockchain'],
        goals: ['build a decentralized assistant'],
        experienceLevel: 'advanced',
        tone: 'casual',
      }),
      route: 'local',
      supervisorUsed: false,
      latencyMs: 200,
      companionId: 'cipher',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.transcript).toContain("I'm Alex");
    expect(body.profile.displayName).toBe('Alex');
    expect(body.profile.interests).toContain('AI');
    expect(body.profile.interests).toContain('blockchain');
    expect(body.profile.goals).toContain('build a decentralized assistant');
    expect(body.profile.experienceLevel).toBe('advanced');
    expect(body.profile.tone).toBe('casual');
    expect(body.confidence).toBeGreaterThan(0);
  });

  it('returns 400 for empty audio body', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: Buffer.alloc(0),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/raw audio/i);
  });

  it('returns 502 when transcription fails', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    // Import the mocked VoicePipelineError
    const { VoicePipelineError } = await import('../voice/pipeline.js');
    mockTranscribe.mockRejectedValue(
      new VoicePipelineError('Whisper API error', 'TRANSCRIPTION_FAILED'),
    );

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.stage).toBe('transcription');
    expect(body.code).toBe('TRANSCRIPTION_FAILED');
  });

  it('returns transcript with empty profile when extraction fails', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    mockTranscribe.mockResolvedValue({
      text: 'Hello, my name is Jordan.',
      language: 'en',
      durationSeconds: 3.0,
    });

    mockSupervisedChat.mockRejectedValue(new Error('LLM service unavailable'));

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.transcript).toBe('Hello, my name is Jordan.');
    expect(body.profile.displayName).toBe('');
    expect(body.profile.interests).toEqual([]);
    expect(body.profile.goals).toEqual([]);
    expect(body.confidence).toBe(0);
  });

  it('returns 503 when no STT provider is available', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    // Remove OPENAI_API_KEY temporarily
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    mockIsWhisperCppAvailable.mockResolvedValue(false);

    try {
      const res = await server.inject({
        method: 'POST',
        url: '/voice/intro',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'audio/ogg',
        },
        body: FAKE_AUDIO,
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('NO_STT_PROVIDER');
    } finally {
      process.env.OPENAI_API_KEY = savedKey;
    }
  });

  it('handles LLM returning malformed JSON gracefully', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    mockTranscribe.mockResolvedValue({
      text: 'I just want to explore things.',
      language: 'en',
      durationSeconds: 4.0,
    });

    mockSupervisedChat.mockResolvedValue({
      content: 'Sorry, I could not extract that information properly.',
      route: 'local',
      supervisorUsed: false,
      latencyMs: 100,
      companionId: 'cipher',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.transcript).toBe('I just want to explore things.');
    // When LLM returns non-JSON, parseExtractionResponse returns defaults
    expect(body.profile.displayName).toBe('');
    expect(body.confidence).toBe(0);
  });

  it('returns 401 without auth token', async () => {
    if (!server) return;

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: { 'content-type': 'audio/ogg' },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(401);
  });

  it('handles LLM returning JSON wrapped in code fences', async () => {
    if (!server) return;
    const token = await getDevToken(server);

    mockTranscribe.mockResolvedValue({
      text: "Hey, call me Sam. I like music and gaming. I want to create a cool AI DJ.",
      language: 'en',
      durationSeconds: 8.0,
    });

    mockSupervisedChat.mockResolvedValue({
      content: '```json\n{"displayName":"Sam","interests":["music","gaming"],"goals":["create an AI DJ"],"experienceLevel":"intermediate","tone":"casual"}\n```',
      route: 'local',
      supervisorUsed: false,
      latencyMs: 150,
      companionId: 'cipher',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/voice/intro',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'audio/ogg',
      },
      body: FAKE_AUDIO,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.profile.displayName).toBe('Sam');
    expect(body.profile.interests).toEqual(['music', 'gaming']);
    expect(body.profile.goals).toEqual(['create an AI DJ']);
    expect(body.profile.experienceLevel).toBe('intermediate');
  });
});

// ============================================================================
// Unit tests for parseExtractionResponse (pure function, no server needed)
// ============================================================================

describe('parseExtractionResponse', () => {
  let parseExtractionResponse: typeof import('../api/routes/voice-intro.js')['parseExtractionResponse'];

  beforeAll(async () => {
    // Direct import — voice-intro.ts has no native deps when imported standalone
    const mod = await import('../api/routes/voice-intro.js');
    parseExtractionResponse = mod.parseExtractionResponse;
  });

  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      displayName: 'Kai',
      interests: ['crypto', 'art'],
      goals: ['mint an NFT'],
      experienceLevel: 'beginner',
      tone: 'friendly',
    });

    const { profile, confidence } = parseExtractionResponse(raw);
    expect(profile.displayName).toBe('Kai');
    expect(profile.interests).toEqual(['crypto', 'art']);
    expect(profile.goals).toEqual(['mint an NFT']);
    expect(confidence).toBe(1);
  });

  it('extracts JSON from markdown code fences', () => {
    const raw = '```json\n{"displayName":"Mia","interests":[],"goals":[],"experienceLevel":"advanced","tone":"professional"}\n```';
    const { profile, confidence } = parseExtractionResponse(raw);
    expect(profile.displayName).toBe('Mia');
    expect(profile.experienceLevel).toBe('advanced');
    expect(profile.tone).toBe('professional');
    // displayName + experienceLevel + tone are real values; interests/goals empty
    expect(confidence).toBe(0.6);
  });

  it('returns defaults for non-JSON responses', () => {
    const raw = 'I cannot parse that introduction.';
    const { profile, confidence } = parseExtractionResponse(raw);
    expect(profile.displayName).toBe('');
    expect(profile.interests).toEqual([]);
    expect(confidence).toBe(0);
  });

  it('validates enum fields and defaults invalid values', () => {
    const raw = JSON.stringify({
      displayName: 'Test',
      interests: ['a'],
      goals: ['b'],
      experienceLevel: 'expert', // invalid
      tone: 'sarcastic', // invalid
    });

    const { profile } = parseExtractionResponse(raw);
    expect(profile.experienceLevel).toBe('beginner'); // defaulted
    expect(profile.tone).toBe('friendly'); // defaulted
  });

  it('filters non-string entries from arrays', () => {
    const raw = JSON.stringify({
      displayName: 'Tester',
      interests: ['valid', 123, null, 'also valid'],
      goals: [true, 'real goal'],
      experienceLevel: 'intermediate',
      tone: 'technical',
    });

    const { profile } = parseExtractionResponse(raw);
    expect(profile.interests).toEqual(['valid', 'also valid']);
    expect(profile.goals).toEqual(['real goal']);
  });

  it('handles empty string input', () => {
    const { profile, confidence } = parseExtractionResponse('');
    expect(profile.displayName).toBe('');
    expect(confidence).toBe(0);
  });
});
