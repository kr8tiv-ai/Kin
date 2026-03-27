/**
 * Local STT - whisper.cpp wrapper for zero-cost speech-to-text
 *
 * Uses the whisper.cpp CLI binary to transcribe audio locally.
 * Download: https://github.com/ggerganov/whisper.cpp/releases
 * Models: https://huggingface.co/ggerganov/whisper.cpp
 *
 * Recommended model: ggml-base.en.bin (~150MB, ~200ms on modern CPU)
 * For faster: ggml-tiny.en.bin (~75MB, ~100ms)
 * For better: ggml-small.en.bin (~500MB, ~500ms)
 */

import { spawn } from 'child_process';
import { writeFile, unlink, mkdtemp, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TranscriptionResult } from './pipeline.js';
import { VoicePipelineError } from './pipeline.js';

export interface WhisperLocalConfig {
  /** Path to whisper.cpp binary (default: 'whisper-cpp' or env WHISPER_CPP_PATH) */
  binaryPath?: string;
  /** Path to GGML model file (default: env WHISPER_MODEL_PATH) */
  modelPath?: string;
  /** Language hint (default: 'en') */
  language?: string;
  /** Number of threads (default: 4) */
  threads?: number;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
}

/**
 * Convert OGG/Opus audio (Telegram format) to WAV using ffmpeg.
 * whisper.cpp requires 16kHz mono WAV input.
 */
async function convertToWav16k(inputBuffer: Buffer, inputPath: string, outputPath: string): Promise<void> {
  await writeFile(inputPath, inputBuffer);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',     // 16kHz sample rate
      '-ac', '1',          // mono
      '-c:a', 'pcm_s16le', // 16-bit PCM
      '-y',                // overwrite
      outputPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });

    let stderr = '';
    ffmpeg.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new VoicePipelineError(`ffmpeg conversion failed (code ${code}): ${stderr.slice(-200)}`, 'CONVERSION_FAILED'));
    });

    ffmpeg.on('error', (err) => {
      reject(new VoicePipelineError(`ffmpeg not found: ${err.message}. Install ffmpeg for local voice.`, 'FFMPEG_MISSING'));
    });
  });
}

/**
 * Transcribe audio using local whisper.cpp binary.
 *
 * Pipeline: OGG/Opus → ffmpeg → 16kHz WAV → whisper.cpp → text
 */
export async function transcribeWithWhisperCpp(
  audioBuffer: Buffer,
  config: WhisperLocalConfig = {},
): Promise<TranscriptionResult> {
  const binaryPath = config.binaryPath ?? process.env.WHISPER_CPP_PATH ?? 'whisper-cpp';
  const modelPath = config.modelPath ?? process.env.WHISPER_MODEL_PATH;
  const language = config.language ?? 'en';
  const threads = config.threads ?? 4;
  const timeoutMs = config.timeoutMs ?? 30000;

  if (!modelPath) {
    throw new VoicePipelineError(
      'WHISPER_MODEL_PATH not set. Download a model from https://huggingface.co/ggerganov/whisper.cpp',
      'MISSING_MODEL',
    );
  }

  // Create temp directory for audio files
  const tmpDir = await mkdtemp(join(tmpdir(), 'kin-stt-'));
  const inputPath = join(tmpDir, 'input.ogg');
  const wavPath = join(tmpDir, 'input.wav');
  const outputPath = join(tmpDir, 'output');

  const startTime = performance.now();

  try {
    // Step 1: Convert to 16kHz WAV
    await convertToWav16k(audioBuffer, inputPath, wavPath);

    // Step 2: Run whisper.cpp
    const text = await new Promise<string>((resolve, reject) => {
      const args = [
        '-m', modelPath,
        '-f', wavPath,
        '-l', language,
        '-t', String(threads),
        '--no-timestamps',
        '--output-txt',
        '-of', outputPath,
      ];

      const whisper = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        detached: process.platform !== 'win32',
      });

      let stdout = '';
      let stderr = '';
      whisper.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      whisper.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      whisper.on('close', async (code) => {
        if (code !== 0) {
          reject(new VoicePipelineError(
            `whisper.cpp failed (code ${code}): ${stderr.slice(-300)}`,
            'TRANSCRIPTION_FAILED',
          ));
          return;
        }

        // Read output file
        try {
          const txtContent = await readFile(`${outputPath}.txt`, 'utf-8');
          resolve(txtContent.trim());
        } catch {
          // Fall back to stdout parsing
          resolve(stdout.trim());
        }
      });

      whisper.on('error', (err) => {
        reject(new VoicePipelineError(
          `whisper.cpp binary not found at '${binaryPath}': ${err.message}`,
          'BINARY_MISSING',
        ));
      });
    });

    const durationMs = performance.now() - startTime;

    return {
      text,
      language,
      durationSeconds: durationMs / 1000,
    };
  } finally {
    // Cleanup temp files
    await Promise.allSettled([
      unlink(inputPath),
      unlink(wavPath),
      unlink(`${outputPath}.txt`),
    ]);
  }
}

/**
 * Check if whisper.cpp is available on this system.
 */
export async function isWhisperCppAvailable(): Promise<boolean> {
  const binaryPath = process.env.WHISPER_CPP_PATH ?? 'whisper-cpp';
  const modelPath = process.env.WHISPER_MODEL_PATH;

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
