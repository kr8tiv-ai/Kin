/**
 * Voice Processing Pipeline - Whisper transcription + TTS synthesis
 *
 * Provides:
 * - OpenAI Whisper integration for transcription
 * - ElevenLabs or OpenAI TTS for voice synthesis
 * - Voice personality configuration per companion
 * - End-to-end voice conversation flow
 *
 * @module voice/pipeline
 */

// ============================================================================
// Types
// ============================================================================

export interface VoiceConfig {
  /** Whisper API key (OpenAI) */
  whisperApiKey?: string;
  /** TTS provider: 'elevenlabs' | 'openai' | 'local' */
  ttsProvider?: 'elevenlabs' | 'openai' | 'local';
  /** ElevenLabs API key */
  elevenLabsApiKey?: string;
  /** OpenAI API key for TTS */
  openAiApiKey?: string;
  /** Default voice for TTS */
  defaultVoice?: string;
  /** Audio format for output */
  outputFormat?: 'mp3' | 'opus' | 'aac' | 'flac';
  /** Maximum audio duration in seconds */
  maxDurationSeconds?: number;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  durationSeconds: number;
  confidence?: number;
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  durationSeconds: number;
  format: string;
  voiceId: string;
}

export interface VoicePersonality {
  companionId: string;
  voiceId: string;
  style: string;
  speed: number;
  pitch: number;
  characteristics: string[];
}

// ============================================================================
// Whisper Transcription
// ============================================================================

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeWithWhisper(
  audioBuffer: Buffer,
  config: VoiceConfig
): Promise<TranscriptionResult> {
  const apiKey = config.whisperApiKey ?? process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new VoicePipelineError('OpenAI API key required for Whisper transcription', 'MISSING_API_KEY');
  }

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)]), 'audio.ogg');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  const startTime = performance.now();

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new VoicePipelineError(
        `Whisper transcription failed: ${response.status} ${error}`,
        'TRANSCRIPTION_FAILED'
      );
    }

    const result = await response.json() as {
      text: string;
      language?: string;
      duration?: number;
    };

    return {
      text: result.text.trim(),
      language: result.language,
      durationSeconds: result.duration ?? (performance.now() - startTime) / 1000,
    };
  } catch (error) {
    if (error instanceof VoicePipelineError) throw error;
    throw new VoicePipelineError(
      `Transcription error: ${error instanceof Error ? error.message : 'Unknown'}`,
      'TRANSCRIPTION_ERROR'
    );
  }
}

/**
 * Transcribe using local whisper.cpp
 */
export async function transcribeLocal(
  audioBuffer: Buffer,
  config: VoiceConfig
): Promise<TranscriptionResult> {
  const { transcribeWithWhisperCpp, isWhisperCppAvailable } = await import('./local-stt.js');

  const available = await isWhisperCppAvailable();
  if (!available) {
    console.warn('[voice] whisper.cpp not available, falling back to Whisper API');
    return transcribeWithWhisper(audioBuffer, config);
  }

  return transcribeWithWhisperCpp(audioBuffer, {
    binaryPath: process.env.WHISPER_CPP_PATH,
    modelPath: process.env.WHISPER_MODEL_PATH,
    language: 'en',
    threads: Number(process.env.WHISPER_THREADS) || 4,
    timeoutMs: 30000,
  });
}

// ============================================================================
// TTS Synthesis
// ============================================================================

// ElevenLabs pre-made voice IDs (free tier)
// These map each companion's personality to a matching ElevenLabs voice.
// Override per-companion via ELEVENLABS_VOICE_ID env var for single-voice mode.
const COMPANION_VOICES: Record<string, VoicePersonality> = {
  cipher: {
    companionId: 'cipher',
    voiceId: 'pNInz6obpgDQGcFmaJgB',  // Adam — deep, warm, analytical
    style: 'analytical, warm, slightly playful',
    speed: 1.0,
    pitch: 0,
    characteristics: ['thoughtful pauses', 'technical precision', 'encouraging tone'],
  },
  mischief: {
    companionId: 'mischief',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Bella — playful, young, energetic
    style: 'playful, energetic, curious',
    speed: 1.1,
    pitch: 2,
    characteristics: ['giggles', 'excited inflection', 'friendly teasing'],
  },
  vortex: {
    companionId: 'vortex',
    voiceId: 'VR6AewLTigWG4xSOukaG',  // Arnold — authoritative, strategic
    style: 'calm, wise, serene',
    speed: 0.95,
    pitch: -2,
    characteristics: ['measured pace', 'soothing tone', 'thoughtful'],
  },
  forge: {
    companionId: 'forge',
    voiceId: 'ErXwobaYiN019PkySvjV',  // Antoni — confident, builder energy
    style: 'confident, inspiring, warm',
    speed: 1.0,
    pitch: 0,
    characteristics: ['energetic', 'encouraging', 'visionary'],
  },
  aether: {
    companionId: 'aether',
    voiceId: 'MF3mGyEYCl7XYWbV9V6O',  // Elli — calm, contemplative
    style: 'steady, patient, methodical',
    speed: 0.9,
    pitch: -1,
    characteristics: ['grounded', 'reassuring', 'careful'],
  },
  catalyst: {
    companionId: 'catalyst',
    voiceId: '21m00Tcm4TlvDq8ikWAM',  // Rachel — warm, motivational
    style: 'enthusiastic, warm, adaptive',
    speed: 1.05,
    pitch: 1,
    characteristics: ['versatile', 'engaging', 'supportive'],
  },
};

/**
 * Synthesize speech using ElevenLabs
 */
export async function synthesizeWithElevenLabs(
  text: string,
  companionId: string,
  config: VoiceConfig
): Promise<SynthesisResult> {
  const apiKey = config.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new VoicePipelineError('ElevenLabs API key required', 'MISSING_API_KEY');
  }

  const voice = COMPANION_VOICES[companionId] ?? COMPANION_VOICES['cipher']!;
  // Per-companion voice ID takes priority; env var is a single-voice fallback
  const voiceId = config.defaultVoice ?? voice?.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB';

  const startTime = performance.now();

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new VoicePipelineError(
        `ElevenLabs synthesis failed: ${response.status} ${error}`,
        'SYNTHESIS_FAILED'
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const durationSeconds = estimateAudioDuration(audioBuffer, config.outputFormat ?? 'mp3');

    return {
      audioBuffer,
      durationSeconds,
      format: config.outputFormat ?? 'mp3',
      voiceId,
    };
  } catch (error) {
    if (error instanceof VoicePipelineError) throw error;
    throw new VoicePipelineError(
      `Synthesis error: ${error instanceof Error ? error.message : 'Unknown'}`,
      'SYNTHESIS_ERROR'
    );
  }
}

/**
 * Synthesize speech using OpenAI TTS
 */
export async function synthesizeWithOpenAI(
  text: string,
  companionId: string,
  config: VoiceConfig
): Promise<SynthesisResult> {
  const apiKey = config.openAiApiKey ?? process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new VoicePipelineError('OpenAI API key required for TTS', 'MISSING_API_KEY');
  }

  // Map companion to OpenAI voice
  const voiceMap: Record<string, string> = {
    cipher: 'onyx',
    mischief: 'nova',
    vortex: 'echo',
    forge: 'alloy',
    aether: 'fable',
    catalyst: 'shimmer',
  };

  const voice = voiceMap[companionId] ?? 'onyx';
  const startTime = performance.now();

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: config.outputFormat ?? 'mp3',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new VoicePipelineError(
        `OpenAI TTS failed: ${response.status} ${error}`,
        'SYNTHESIS_FAILED'
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const durationSeconds = estimateAudioDuration(audioBuffer, config.outputFormat ?? 'mp3');

    return {
      audioBuffer,
      durationSeconds,
      format: config.outputFormat ?? 'mp3',
      voiceId: voice,
    };
  } catch (error) {
    if (error instanceof VoicePipelineError) throw error;
    throw new VoicePipelineError(
      `Synthesis error: ${error instanceof Error ? error.message : 'Unknown'}`,
      'SYNTHESIS_ERROR'
    );
  }
}

/**
 * Synthesize speech locally using XTTS v2 (voice cloning) or Piper (fast fallback)
 */
export async function synthesizeLocal(
  text: string,
  companionId: string,
  config: VoiceConfig
): Promise<SynthesisResult> {
  const { synthesizeLocalTts, isXttsAvailable, isPiperAvailable } = await import('./local-tts.js');

  // Check if any local provider is available
  const [xttsUp, piperUp] = await Promise.all([isXttsAvailable(), isPiperAvailable()]);

  if (!xttsUp && !piperUp) {
    console.warn('[voice] No local TTS available (XTTS/Piper), falling back to OpenAI');
    return synthesizeWithOpenAI(text, companionId, config);
  }

  return synthesizeLocalTts(text, companionId, {
    provider: xttsUp ? 'xtts' : 'piper',
    profilesDir: process.env.VOICE_PROFILES_DIR,
  });
}

// ============================================================================
// Pipeline Orchestration
// ============================================================================

export class VoicePipeline {
  private config: VoiceConfig;

  constructor(config: VoiceConfig = {}) {
    this.config = {
      ttsProvider: config.ttsProvider ?? 'openai',
      outputFormat: config.outputFormat ?? 'mp3',
      maxDurationSeconds: config.maxDurationSeconds ?? 300,
      ...config,
    };
  }

  /**
   * Transcribe audio to text
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const useLocal = process.env.LOCAL_WHISPER_ENABLED === 'true';
    
    if (useLocal) {
      return transcribeLocal(audioBuffer, this.config);
    }
    
    return transcribeWithWhisper(audioBuffer, this.config);
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(
    text: string,
    companionId: string = 'cipher'
  ): Promise<SynthesisResult> {
    const provider = this.config.ttsProvider ?? 'openai';

    switch (provider) {
      case 'elevenlabs':
        return synthesizeWithElevenLabs(text, companionId, this.config);
      case 'openai':
        return synthesizeWithOpenAI(text, companionId, this.config);
      case 'local':
        return synthesizeLocal(text, companionId, this.config);
      default:
        return synthesizeWithOpenAI(text, companionId, this.config);
    }
  }

  /**
   * Full voice conversation: transcribe → respond → synthesize
   */
  async processVoiceMessage(
    audioBuffer: Buffer,
    generateResponse: (text: string) => Promise<string>,
    companionId: string = 'cipher'
  ): Promise<{
    transcription: TranscriptionResult;
    response: string;
    synthesis: SynthesisResult;
  }> {
    // Step 1: Transcribe
    const transcription = await this.transcribe(audioBuffer);

    // Step 2: Generate response
    const response = await generateResponse(transcription.text);

    // Step 3: Synthesize response
    const synthesis = await this.synthesize(response, companionId);

    return {
      transcription,
      response,
      synthesis,
    };
  }

  /**
   * Get voice personality for companion
   */
  getVoicePersonality(companionId: string): VoicePersonality {
    return COMPANION_VOICES[companionId] ?? COMPANION_VOICES['cipher']!;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Estimate audio duration from buffer size
 * Approximate based on bitrate for MP3/OGG
 */
function estimateAudioDuration(buffer: Buffer, format: string): number {
  // Rough estimates based on typical bitrates
  const bytesPerSecond: Record<string, number> = {
    mp3: 16000,   // ~128kbps
    opus: 12000,  // ~96kbps
    aac: 14000,   // ~112kbps
    flac: 80000,  // Lossless, variable
  };

  const bps = bytesPerSecond[format] ?? bytesPerSecond['mp3']!;
  return buffer.length / bps!;
}

/**
 * Convert Telegram voice format (OGG/Opus) to WAV for processing
 */
export async function convertToWav(inputBuffer: Buffer): Promise<Buffer> {
  // Would use ffmpeg-static or similar
  // For now, return input (Whisper can handle OGG directly)
  return inputBuffer;
}

// ============================================================================
// Error Class
// ============================================================================

export class VoicePipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'VoicePipelineError';
  }
}

// ============================================================================
// Singleton & Exports
// ============================================================================

let defaultPipeline: VoicePipeline | null = null;

export function getVoicePipeline(config?: VoiceConfig): VoicePipeline {
  if (!defaultPipeline || config) {
    defaultPipeline = new VoicePipeline(config);
  }
  return defaultPipeline;
}

export default VoicePipeline;
