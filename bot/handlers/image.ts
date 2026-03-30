/**
 * Image Handler - Handles photo/image messages with vision AI
 *
 * Downloads the image from Telegram, sends to a vision-capable LLM
 * (Groq with Llama Scout, OpenAI GPT-4V, or Anthropic Claude Vision),
 * and returns a companion-personality response.
 */

import { Context, SessionFlavor } from 'grammy';
import type { FallbackHandler } from '../../inference/fallback-handler.js';
import { conversationStore } from '../memory/conversation-store.js';
import { buildCompanionPrompt } from '../../inference/companion-prompts.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

// Vision prompt addition for image context
const VISION_PROMPT = `
[IMAGE MODE ACTIVE]
The user has sent an image. Analyze what you see and respond helpfully in character.
- Describe what you observe accurately
- Connect your analysis to your companion specialty
- If it's code/design, give specific actionable feedback
- If it's a screenshot of an error, help debug it
- Keep it conversational and supportive
`;

// Vision-capable models by provider (free-tier friendly)
const VISION_MODELS: Record<string, string> = {
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct', // Free, vision-capable
  openai: 'gpt-4o-mini', // Cheapest vision model
  anthropic: 'claude-3-haiku-20240307', // Cheapest Claude with vision
};

/**
 * Download an image from Telegram and convert to base64.
 */
async function downloadImageAsBase64(
  ctx: BotContext,
  fileId: string,
): Promise<{ base64: string; mimeType: string }> {
  const file = await ctx.api.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

  const response = await fetch(fileUrl);
  const buffer = Buffer.from(await response.arrayBuffer());

  // Detect mime type from file path
  const ext = file.file_path?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };

  return {
    base64: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/jpeg',
  };
}

/**
 * Call a vision-capable LLM with an image.
 * Tries providers in order of preference (cheapest first).
 */
async function callVisionLLM(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ content: string; provider: string }> {
  // Provider priority: Groq (free) → OpenAI → Anthropic
  const providers = [
    { name: 'groq', key: process.env.GROQ_API_KEY, baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'openai', key: process.env.OPENAI_API_KEY, baseUrl: 'https://api.openai.com/v1' },
  ].filter((p) => p.key);

  for (const provider of providers) {
    try {
      const model = VISION_MODELS[provider.name]!;
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                ...(userText ? [{ type: 'text', text: userText }] : [{ type: 'text', text: 'What do you see in this image?' }]),
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        console.error(`Vision API error (${provider.name}):`, response.status, await response.text());
        continue; // Try next provider
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;

      if (content) {
        return { content, provider: provider.name };
      }
    } catch (error) {
      console.error(`Vision provider ${provider.name} failed:`, error);
      continue;
    }
  }

  // Anthropic as final fallback (different API format)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: VISION_MODELS['anthropic'],
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                ...(userText ? [{ type: 'text', text: userText }] : [{ type: 'text', text: 'What do you see in this image?' }]),
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          content: { type: string; text: string }[];
        };
        const content = data.content?.find((c) => c.type === 'text')?.text;
        if (content) {
          return { content, provider: 'anthropic' };
        }
      }
    } catch (error) {
      console.error('Anthropic vision failed:', error);
    }
  }

  throw new Error('No vision provider available');
}

/**
 * Handle incoming photo messages.
 */
export async function handleImage(
  ctx: BotContext,
  fallback: FallbackHandler,
): Promise<void> {
  const userId = ctx.from?.id.toString();
  const photo = ctx.message?.photo;
  const companionId = ctx.session.companionId ?? 'cipher';

  if (!userId || !photo || photo.length === 0) {
    await ctx.reply("I couldn't process that image. Try sending it again?");
    return;
  }

  // Update session
  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();
  ctx.session.conversationStarted = true;

  // Show typing indicator
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    // Get the largest photo (best quality) — Telegram sends multiple sizes
    const bestPhoto = photo[photo.length - 1]!;

    // Validate file size (max 5MB to prevent abuse)
    if (bestPhoto.file_size && bestPhoto.file_size > 5 * 1024 * 1024) {
      await ctx.reply("That image is too large. Please send one under 5MB.");
      return;
    }

    // Download and base64 encode
    const { base64, mimeType } = await downloadImageAsBase64(ctx, bestPhoto.file_id);

    // Get caption text if provided (user can add text with image)
    const caption = ctx.message?.caption ?? '';

    // Build companion prompt with vision addition
    const systemPrompt =
      buildCompanionPrompt(companionId, {
        userName: ctx.from?.first_name ?? 'Friend',
        taskContext: { type: 'vision' },
      }) +
      '\n\n' +
      VISION_PROMPT;

    // Call vision LLM
    const result = await callVisionLLM(systemPrompt, caption, base64, mimeType);

    // Store conversation
    const userMsg = caption ? `[Sent an image] ${caption}` : '[Sent an image]';
    await conversationStore.addMessage(userId, 'user', userMsg);
    await conversationStore.addMessage(userId, 'assistant', result.content);

    // Reply
    await ctx.reply(result.content, { parse_mode: 'Markdown' });

    console.log(
      `[Image] User ${userId} → ${result.provider} (companion: ${companionId})`,
    );
  } catch (error) {
    console.error('Image processing error:', error);
    await ctx.reply(
      "I had trouble analyzing that image. Could you try sending it again, or describe what you'd like me to look at?",
    );
  }
}

export default handleImage;
