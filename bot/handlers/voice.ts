/**
 * Voice Handler - Handles voice note messages
 */

import { Context, SessionFlavor, InputFile } from 'grammy';
import type { FallbackHandler } from '../../inference/fallback-handler.js';
import { conversationStore } from '../memory/conversation-store.js';
import { buildCipherPrompt } from '../../inference/cipher-prompts.js';
import { supervisedChat } from '../../inference/supervisor.js';
import { getVoicePipeline, VoicePipelineError } from '../../voice/index.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

// Voice personality prompt additions
const VOICE_PERSONALITY = `
[VOICE MODE ACTIVE]
When responding to voice messages:
- Keep responses conversational and natural for speech
- Use contractions naturally (I'm, you're, let's)
- Include occasional playful sounds like "hmm", "ah", "ooh"
- Keep paragraphs short for better TTS
- Match the user's energy level
`;

export async function handleVoice(
  ctx: BotContext,
  fallback: FallbackHandler
) {
  const userId = ctx.from?.id.toString();
  const voice = ctx.message?.voice;
  const companionId = ctx.session.companionId ?? 'cipher';

  if (!userId || !voice) {
    await ctx.reply("I couldn't process that voice note. Try again?");
    return;
  }

  // Update session
  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();
  ctx.session.conversationStarted = true;

  // Show typing/recording indicator
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    // Get voice pipeline
    const voicePipeline = getVoicePipeline();
    
    // Download voice file
    const fileLink = await ctx.api.getFile(voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${fileLink.file_path}`;
    
    // Fetch audio buffer
    const audioResponse = await fetch(fileUrl);
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Transcribe with Whisper
    let transcription: string;
    try {
      const result = await voicePipeline.transcribe(audioBuffer);
      transcription = result.text;
      
      if (!transcription || transcription.trim().length === 0) {
        await ctx.reply("I couldn't hear anything in that voice note. Could you try again? 🐙");
        return;
      }
    } catch (error) {
      if (error instanceof VoicePipelineError) {
        console.error('Transcription error:', error.message);
        await ctx.reply(
          "I'm having trouble processing audio right now. Could you type your message instead? 🐙"
        );
        return;
      }
      throw error;
    }
    
    // Get conversation history
    const history = await conversationStore.getHistory(userId, 10);

    // Build prompt with voice personality
    const systemPrompt = buildCipherPrompt(transcription, {
      userName: ctx.from?.first_name ?? 'Friend',
      taskContext: { type: 'chat' },
    }) + '\n\n' + VOICE_PERSONALITY;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: transcription },
    ];

    // Generate response via two-brain architecture (local + supervisor)
    const result = await supervisedChat(messages, companionId, fallback, {
      taskType: 'voice',
    });
    const response = result.content;

    // Store messages
    await conversationStore.addMessage(userId, 'user', transcription);
    await conversationStore.addMessage(userId, 'assistant', response);

    // Try to synthesize voice response
    const voiceEnabled = ctx.session.preferences?.voiceEnabled ?? true;
    
    if (voiceEnabled && process.env.ELEVENLABS_API_KEY) {
      try {
        await ctx.api.sendChatAction(ctx.chat!.id, 'record_voice');

        const synthesis = await voicePipeline.synthesize(response, companionId);

        // Send voice reply
        await ctx.api.sendVoice(ctx.chat!.id, new InputFile(new Uint8Array(synthesis.audioBuffer)));
      } catch (error) {
        // Fallback to text if TTS fails
        console.error('TTS error:', error);
        await ctx.reply(response);
      }
    } else {
      // Just send text
      await ctx.reply(response);
    }

  } catch (error) {
    console.error('Voice processing error:', error);
    await ctx.reply(
      "Hmm, I had trouble with that voice note. Mind sending it again or typing your message? 🐙"
    );
  }
}

export default handleVoice;
