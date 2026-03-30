/**
 * Document Handler - Handles document/file messages (PDFs, text files, etc.)
 *
 * Downloads the document from Telegram, extracts text content,
 * and passes it to the companion for analysis.
 */

import { Context, SessionFlavor } from 'grammy';
import type { FallbackHandler } from '../../inference/fallback-handler.js';
import { conversationStore } from '../memory/conversation-store.js';
import { buildCompanionPrompt } from '../../inference/companion-prompts.js';
import { supervisedChat } from '../../inference/supervisor.js';

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: { voiceEnabled: boolean; teachingMode: boolean };
}

type BotContext = Context & SessionFlavor<SessionData>;

const DOCUMENT_PROMPT = `
[DOCUMENT MODE ACTIVE]
The user has shared a document. Analyze the contents and respond helpfully in character.
- Summarize the key points
- Offer specific, actionable feedback based on your specialty
- If it's code, review it thoroughly
- If it's writing, provide editorial feedback
- Keep the response focused and practical
`;

// Supported text-extractable formats
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx',
  'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash',
  'yaml', 'yml', 'toml', 'ini', 'env', 'sql', 'graphql', 'svelte', 'vue',
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_TEXT_LENGTH = 8000; // Characters to pass to LLM

export async function handleDocument(
  ctx: BotContext,
  fallback: FallbackHandler,
): Promise<void> {
  const userId = ctx.from?.id.toString();
  const doc = ctx.message?.document;
  const companionId = ctx.session.companionId ?? 'cipher';

  if (!userId || !doc) {
    await ctx.reply("I couldn't process that file. Try sending it again?");
    return;
  }

  // Update session
  ctx.session.userId = userId;
  ctx.session.lastActivity = new Date();
  ctx.session.conversationStarted = true;

  // Validate file size
  if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
    await ctx.reply(
      "That file is too large for me to process (max 2MB). Could you send a smaller version or paste the relevant parts as text?",
    );
    return;
  }

  // Check if we can extract text from this file type
  const fileName = doc.file_name ?? 'unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (!TEXT_EXTENSIONS.has(ext)) {
    await ctx.reply(
      `I can read text-based files (code, markdown, CSV, JSON, etc.) but I can't process .${ext} files yet. Try pasting the content as a message instead!`,
    );
    return;
  }

  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    // Download file
    const file = await ctx.api.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    let textContent = buffer.toString('utf-8');

    // Truncate if too long
    if (textContent.length > MAX_TEXT_LENGTH) {
      textContent =
        textContent.slice(0, MAX_TEXT_LENGTH) +
        `\n\n[... truncated — showing first ${MAX_TEXT_LENGTH} characters of ${textContent.length} total]`;
    }

    const caption = ctx.message?.caption ?? '';

    // Build prompt
    const systemPrompt =
      buildCompanionPrompt(companionId, {
        userName: ctx.from?.first_name ?? 'Friend',
        taskContext: { type: 'document' },
      }) +
      '\n\n' +
      DOCUMENT_PROMPT;

    // Get conversation history
    const history = await conversationStore.getHistory(userId, 6);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: `${caption ? caption + '\n\n' : ''}Here's the file "${fileName}":\n\n\`\`\`${ext}\n${textContent}\n\`\`\``,
      },
    ];

    const result = await supervisedChat(messages, companionId, fallback, {
      taskType: 'analysis',
    });

    // Store messages
    await conversationStore.addMessage(
      userId,
      'user',
      `[Sent file: ${fileName}] ${caption}`,
    );
    await conversationStore.addMessage(userId, 'assistant', result.content);

    await ctx.reply(result.content, { parse_mode: 'Markdown' });

    console.log(
      `[Document] User ${userId} sent ${fileName} (${ext}, ${textContent.length} chars) → companion: ${companionId}`,
    );
  } catch (error) {
    console.error('Document processing error:', error);
    await ctx.reply(
      "I had trouble reading that file. Could you try again or paste the content as text?",
    );
  }
}

export default handleDocument;
