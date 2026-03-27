/**
 * Voice Module - Audio processing pipeline for KIN
 *
 * This module provides complete voice processing with:
 * - Whisper transcription (API and local)
 * - TTS synthesis (ElevenLabs, OpenAI, local)
 * - Voice personality per companion
 * - End-to-end voice conversation flow
 *
 * @example
 * ```typescript
 * import { VoicePipeline, getVoicePipeline } from './voice';
 *
 * const pipeline = getVoicePipeline();
 *
 * // Transcribe audio
 * const transcription = await pipeline.transcribe(audioBuffer);
 *
 * // Synthesize response
 * const audio = await pipeline.synthesize("Hello!", "cipher");
 *
 * // Full flow
 * const result = await pipeline.processVoiceMessage(
 *   audioBuffer,
 *   async (text) => generateResponse(text),
 *   'cipher'
 * );
 * ```
 *
 * @module voice
 */

export {
  VoicePipeline,
  VoicePipelineError,
  getVoicePipeline,
  transcribeWithWhisper,
  transcribeLocal,
  synthesizeWithElevenLabs,
  synthesizeWithOpenAI,
  synthesizeLocal,
  convertToWav,
  type VoiceConfig,
  type TranscriptionResult,
  type SynthesisResult,
  type VoicePersonality,
} from './pipeline';

export { default as VoicePipeline } from './pipeline';

// Local STT (whisper.cpp)
export {
  transcribeWithWhisperCpp,
  isWhisperCppAvailable,
  type WhisperLocalConfig,
} from './local-stt';

// Local TTS (XTTS v2 + Piper)
export {
  synthesizeWithXtts,
  synthesizeWithPiper,
  synthesizeLocalTts,
  hasVoiceProfile,
  saveVoiceProfile,
  isXttsAvailable,
  isPiperAvailable,
  type XttsConfig,
  type PiperConfig,
  type VoiceProfile,
  type LocalTtsConfig,
} from './local-tts';
