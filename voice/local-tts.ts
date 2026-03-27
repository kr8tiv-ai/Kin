/**
 * Local TTS - XTTS v2 (voice cloning) + Piper (fast fallback)
 *
 * XTTS v2 (Coqui TTS):
 *   - Voice cloning from 6-30s reference audio
 *   - Runs as Python HTTP server: `tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 --server`
 *   - Supports 17 languages
 *   - ~1-3s latency depending on text length
 *   - Install: `pip install TTS` (https://github.com/coqui-ai/TTS)
 *
 * Piper TTS (fast fallback):
 *   - Pre-trained voices only (no cloning)
 *   - ~50-100ms latency, runs as CLI binary
 *   - Download: https://github.com/rhasspy/piper/releases
 *   - Models: https://huggingface.co/rhasspy/piper-voices
 */

import { spawn } from 'child_process';
import { readFile, writeFile, unlink, mkdtemp, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { SynthesisResult, VoicePersonality } from './pipeline.js';
import { VoicePipelineError } from './pipeline.js';

// ============================================================================
// Types
// ============================================================================

export interface XttsConfig {
  /** XTTS server URL (default: http://localhost:8020) */
  serverUrl?: string;
  /** Language code (default: 'en') */
  language?: string;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
}

export interface PiperConfig {
  /** Path to piper binary (default: 'piper' or env PIPER_PATH) */
  binaryPath?: string;
  /** Path to piper voice model (.onnx file) */
  modelPath?: string;
  /** Speaker ID for multi-speaker models (default: 0) */
  speakerId?: number;
  /** Speech rate multiplier (default: 1.0) */
  lengthScale?: number;
  /** Timeout in ms (default: 15000) */
  timeoutMs?: number;
}

export interface VoiceProfile {
  /** KIN companion ID */
  companionId: string;
  /** Path to reference audio file for XTTS voice cloning */
  referenceAudioPath: string;
  /** Language code */
  language: string;
  /** Piper model path for fallback (if available) */
  piperModelPath?: string;
  /** Piper speaker ID */
  piperSpeakerId?: number;
}

export interface LocalTtsConfig {
  /** Primary provider: 'xtts' for voice cloning, 'piper' for fast preset */
  provider?: 'xtts' | 'piper';
  /** XTTS configuration */
  xtts?: XttsConfig;
  /** Piper configuration */
  piper?: PiperConfig;
  /** Voice profiles directory (default: env VOICE_PROFILES_DIR or './voice/profiles') */
  profilesDir?: string;
}

// ============================================================================
// Voice Profile Registry
// ============================================================================

/** Default voice profiles — reference audio must be placed in profiles dir */
const DEFAULT_PROFILES: Record<string, Omit<VoiceProfile, 'referenceAudioPath'>> = {
  cipher: {
    companionId: 'cipher',
    language: 'en',
    piperSpeakerId: 0,
  },
  mischief: {
    companionId: 'mischief',
    language: 'en',
    piperSpeakerId: 1,
  },
  vortex: {
    companionId: 'vortex',
    language: 'en',
    piperSpeakerId: 2,
  },
  forge: {
    companionId: 'forge',
    language: 'en',
    piperSpeakerId: 3,
  },
  aether: {
    companionId: 'aether',
    language: 'en',
    piperSpeakerId: 4,
  },
  catalyst: {
    companionId: 'catalyst',
    language: 'en',
    piperSpeakerId: 5,
  },
};

/**
 * Resolve voice profile for a companion.
 * Looks for reference audio at: {profilesDir}/{companionId}.wav
 */
function resolveProfile(companionId: string, profilesDir: string): VoiceProfile {
  const base = DEFAULT_PROFILES[companionId] ?? DEFAULT_PROFILES['cipher']!;
  return {
    ...base,
    companionId,
    language: base?.language ?? 'en',
    referenceAudioPath: join(profilesDir, `${companionId}.wav`),
  };
}

// ============================================================================
// XTTS v2 — Voice Cloning
// ============================================================================

/**
 * Synthesize speech using XTTS v2 server with voice cloning.
 *
 * XTTS server must be running:
 *   tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 --server
 *
 * API endpoint: POST /api/tts
 * Body: multipart/form-data with text, speaker_wav, language
 * Response: audio/wav binary
 */
export async function synthesizeWithXtts(
  text: string,
  companionId: string,
  config: LocalTtsConfig = {},
): Promise<SynthesisResult> {
  const serverUrl = config.xtts?.serverUrl ?? process.env.XTTS_SERVER_URL ?? 'http://localhost:8020';
  const language = config.xtts?.language ?? 'en';
  const timeoutMs = config.xtts?.timeoutMs ?? 30000;
  const profilesDir = config.profilesDir ?? process.env.VOICE_PROFILES_DIR ?? join(process.cwd(), 'voice', 'profiles');

  const profile = resolveProfile(companionId, profilesDir);

  // Verify reference audio exists
  let referenceAudio: Buffer;
  try {
    referenceAudio = await readFile(profile.referenceAudioPath);
  } catch {
    throw new VoicePipelineError(
      `Voice profile not found: ${profile.referenceAudioPath}. ` +
      `Record 6-30 seconds of reference audio and save as ${companionId}.wav`,
      'MISSING_VOICE_PROFILE',
    );
  }

  const startTime = performance.now();

  // Build multipart form data
  const boundary = `----KinXtts${Date.now()}`;
  const parts: Buffer[] = [];

  // Text field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="text"\r\n\r\n` +
    `${text}\r\n`
  ));

  // Language field
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `${language}\r\n`
  ));

  // Speaker WAV file
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="speaker_wav"; filename="${companionId}.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  ));
  parts.push(referenceAudio);
  parts.push(Buffer.from(`\r\n`));

  // End boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  try {
    const response = await fetch(`${serverUrl}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new VoicePipelineError(
        `XTTS synthesis failed (${response.status}): ${errorText.slice(0, 200)}`,
        'SYNTHESIS_FAILED',
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const durationMs = performance.now() - startTime;

    return {
      audioBuffer,
      durationSeconds: durationMs / 1000,
      format: 'wav',
      voiceId: `xtts_${companionId}`,
    };
  } catch (error) {
    if (error instanceof VoicePipelineError) throw error;

    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      throw new VoicePipelineError(
        `XTTS server not reachable at ${serverUrl}. ` +
        `Start it with: tts --model_name tts_models/multilingual/multi-dataset/xtts_v2 --server`,
        'XTTS_SERVER_DOWN',
      );
    }

    throw new VoicePipelineError(`XTTS error: ${msg}`, 'SYNTHESIS_ERROR');
  }
}

// ============================================================================
// Piper TTS — Fast Fallback (Preset Voices)
// ============================================================================

/**
 * Synthesize speech using Piper TTS binary.
 *
 * Pipeline: text → piper CLI → WAV file → Buffer
 *
 * Piper is invoked as:
 *   echo "text" | piper --model model.onnx --output_file output.wav
 */
export async function synthesizeWithPiper(
  text: string,
  companionId: string,
  config: LocalTtsConfig = {},
): Promise<SynthesisResult> {
  const binaryPath = config.piper?.binaryPath ?? process.env.PIPER_PATH ?? 'piper';
  const modelPath = config.piper?.modelPath ?? process.env.PIPER_MODEL_PATH;
  const speakerId = config.piper?.speakerId ?? DEFAULT_PROFILES[companionId]?.piperSpeakerId ?? 0;
  const lengthScale = config.piper?.lengthScale ?? 1.0;
  const timeoutMs = config.piper?.timeoutMs ?? 15000;

  if (!modelPath) {
    throw new VoicePipelineError(
      'PIPER_MODEL_PATH not set. Download a voice from https://huggingface.co/rhasspy/piper-voices',
      'MISSING_MODEL',
    );
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'kin-tts-'));
  const outputPath = join(tmpDir, 'output.wav');
  const startTime = performance.now();

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '--model', modelPath,
        '--output_file', outputPath,
        '--speaker', String(speakerId),
        '--length_scale', String(lengthScale),
      ];

      const piper = spawn(binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
        detached: process.platform !== 'win32',
      });

      let stderr = '';
      piper.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      // Write text to stdin
      piper.stdin?.write(text);
      piper.stdin?.end();

      piper.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new VoicePipelineError(
          `Piper TTS failed (code ${code}): ${stderr.slice(-200)}`,
          'SYNTHESIS_FAILED',
        ));
      });

      piper.on('error', (err) => {
        reject(new VoicePipelineError(
          `Piper binary not found at '${binaryPath}': ${err.message}`,
          'BINARY_MISSING',
        ));
      });
    });

    const audioBuffer = await readFile(outputPath);
    const durationMs = performance.now() - startTime;

    return {
      audioBuffer,
      durationSeconds: durationMs / 1000,
      format: 'wav',
      voiceId: `piper_speaker${speakerId}`,
    };
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

// ============================================================================
// Unified Local TTS
// ============================================================================

/**
 * Synthesize speech using the best available local provider.
 *
 * Strategy:
 * 1. If XTTS server is configured/available → use XTTS (voice cloning)
 * 2. If Piper is configured → use Piper (fast, preset voices)
 * 3. Throw error if neither is available
 */
export async function synthesizeLocalTts(
  text: string,
  companionId: string,
  config: LocalTtsConfig = {},
): Promise<SynthesisResult> {
  const provider = config.provider ?? process.env.LOCAL_TTS_PROVIDER as 'xtts' | 'piper' ?? 'xtts';

  if (provider === 'xtts') {
    try {
      return await synthesizeWithXtts(text, companionId, config);
    } catch (error) {
      // If XTTS fails and Piper is available, try fallback
      if (error instanceof VoicePipelineError && error.code === 'XTTS_SERVER_DOWN') {
        const piperPath = config.piper?.modelPath ?? process.env.PIPER_MODEL_PATH;
        if (piperPath) {
          console.warn('[voice] XTTS unavailable, falling back to Piper');
          return synthesizeWithPiper(text, companionId, config);
        }
      }
      throw error;
    }
  }

  return synthesizeWithPiper(text, companionId, config);
}

// ============================================================================
// Voice Profile Management
// ============================================================================

/**
 * Check if a voice profile (reference audio) exists for a companion.
 */
export async function hasVoiceProfile(
  companionId: string,
  profilesDir?: string,
): Promise<boolean> {
  const dir = profilesDir ?? process.env.VOICE_PROFILES_DIR ?? join(process.cwd(), 'voice', 'profiles');
  try {
    await access(join(dir, `${companionId}.wav`));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a reference audio clip as a voice profile for XTTS cloning.
 * Audio should be 6-30 seconds of clear speech, WAV format, 22050Hz+.
 */
export async function saveVoiceProfile(
  companionId: string,
  audioBuffer: Buffer,
  profilesDir?: string,
): Promise<string> {
  const dir = profilesDir ?? process.env.VOICE_PROFILES_DIR ?? join(process.cwd(), 'voice', 'profiles');
  const filePath = join(dir, `${companionId}.wav`);
  await writeFile(filePath, audioBuffer);
  return filePath;
}

/**
 * Check if XTTS server is available.
 */
export async function isXttsAvailable(serverUrl?: string): Promise<boolean> {
  const url = serverUrl ?? process.env.XTTS_SERVER_URL ?? 'http://localhost:8020';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok || response.status === 404; // server is up even if root 404s
  } catch {
    return false;
  }
}

/**
 * Check if Piper binary is available.
 */
export async function isPiperAvailable(): Promise<boolean> {
  const binaryPath = process.env.PIPER_PATH ?? 'piper';
  const modelPath = process.env.PIPER_MODEL_PATH;
  if (!modelPath) return false;

  return new Promise((resolve) => {
    const proc = spawn(binaryPath, ['--help'], {
      stdio: 'ignore',
      timeout: 5000,
    });
    proc.on('close', () => resolve(true));
    proc.on('error', () => resolve(false));
  });
}
