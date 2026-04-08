/**
 * Build Handler - Website generation pipeline integration
 *
 * Wires the website builder pipeline into Telegram:
 * - Takes a user's description text
 * - Calls generateWebsite() with the supervisor as the LLM client
 * - Sends generated files back as formatted code blocks
 * - Shows quality check warnings
 * - Creates a project record automatically
 * - Provides action buttons: Deploy, Iterate, Save to Projects
 *
 * @module bot/handlers/build
 */

import { Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { generateWebsite, deploy, type GeneratedFile, type GenerationResult } from '../../website/pipeline.js';
import { supervisedChat } from '../../inference/supervisor.js';
import { FallbackHandler } from '../../inference/fallback-handler.js';
import { saveProjectWithFiles, getProjectFiles } from './projects.js';

// ============================================================================
// Types
// ============================================================================

interface SessionData {
  userId: string;
  companionId: string;
  conversationStarted: boolean;
  lastActivity: Date;
  preferences: {
    voiceEnabled: boolean;
    teachingMode: boolean;
  };
}

type BotContext = Context & SessionFlavor<SessionData>;

// ============================================================================
// Build State
// ============================================================================

/**
 * Users awaiting a build description (after tapping "Build a Website").
 * Mirrors the pattern used by onboarding's isAwaitingName().
 */
const buildAwaiters = new Set<string>();

/**
 * Temporary store for the last generation result per user so Iterate / Deploy
 * buttons can reference it without re-generating.
 */
const lastBuildResult = new Map<string, { result: GenerationResult; projectId: string; lastAccessed: number }>();

/** Sweep interval: every 10 min, evict build results older than 30 min. */
const BUILD_RESULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const BUILD_SWEEP_MS = 10 * 60 * 1000; // 10 minutes

const buildSweep = setInterval(() => {
  const cutoff = Date.now() - BUILD_RESULT_TTL_MS;
  for (const [id, entry] of lastBuildResult) {
    if (entry.lastAccessed < cutoff) {
      lastBuildResult.delete(id);
    }
  }
}, BUILD_SWEEP_MS);
buildSweep.unref();

/**
 * Users currently in "iterate mode" — their next text message refines the
 * last build instead of starting fresh.
 */
const iterateAwaiters = new Set<string>();

// ============================================================================
// Public API — state helpers
// ============================================================================

/** Mark a user as awaiting a build description. */
export function enterBuildMode(userId: string): void {
  buildAwaiters.add(userId);
  // Clear iterate mode if they're starting fresh
  iterateAwaiters.delete(userId);
  // Clear stale build result for this user
  lastBuildResult.delete(userId);
}

/** Check whether a user is waiting to describe a build. */
export function isAwaitingBuild(userId: string): boolean {
  return buildAwaiters.has(userId);
}

/** Check whether a user is waiting to provide iteration feedback. */
export function isAwaitingIterate(userId: string): boolean {
  return iterateAwaiters.has(userId);
}

/** Get the last build result for a user (used by deploy handler). */
export function getLastBuildResult(userId: string) {
  return lastBuildResult.get(userId);
}

// ============================================================================
// Main Build Handler
// ============================================================================

/**
 * Handle a build description from the user.
 *
 * 1. Wraps supervisedChat as an llmClient for the pipeline
 * 2. Calls generateWebsite()
 * 3. Sends code files as Telegram messages
 * 4. Shows warnings and action buttons
 * 5. Creates a project record
 */
export async function handleBuild(
  ctx: BotContext,
  description: string,
  fallback: FallbackHandler,
): Promise<void> {
  const userId = ctx.from?.id.toString() ?? 'unknown';
  const companionId = ctx.session.companionId ?? 'cipher';

  // Clear the awaiter flag — we're handling it now
  buildAwaiters.delete(userId);

  // Let the user know generation is in progress
  await ctx.reply(
    '🔨 *Building your website...*\n\nThis may take a moment — I\'m generating code, running quality checks, and packaging everything up.',
    { parse_mode: 'Markdown' },
  );
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    // Wrap supervisedChat as the llmClient expected by the pipeline
    const llmClient = {
      chat: async (messages: { role: string; content: string }[]) => {
        const result = await supervisedChat(
          messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          companionId,
          fallback,
          { taskType: 'code' },
        );
        return result.content;
      },
    };

    const result = await generateWebsite(
      {
        prompt: description,
        companionId,
        teachingMode: ctx.session.preferences?.teachingMode ?? true,
      },
      { validationLevel: 'normal' },
      llmClient,
    );

    // ── Create project record ─────────────────────────────────────────────
    const projectId = saveProjectWithFiles(userId, description, result.files);

    // Store for later Iterate / Deploy actions
    lastBuildResult.set(userId, { result, projectId, lastAccessed: Date.now() });

    // ── Send files as code blocks ─────────────────────────────────────────
    await sendGeneratedFiles(ctx, result);

    // ── Send explanation ──────────────────────────────────────────────────
    if (result.explanation) {
      const trimmed = result.explanation.slice(0, 3000);
      try {
        await ctx.reply(trimmed, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(trimmed);
      }
    }

    // ── Teaching points ───────────────────────────────────────────────────
    if (result.teachingPoints.length > 0) {
      const points = result.teachingPoints.map(p => `- ${p}`).join('\n');
      await ctx.reply(`💡 *Teaching Points*\n\n${points}`, { parse_mode: 'Markdown' });
    }

    // ── Warnings ──────────────────────────────────────────────────────────
    if (result.warnings.length > 0) {
      const warns = result.warnings.map(w => `⚠️ ${w}`).join('\n');
      await ctx.reply(`*Quality Check Warnings*\n\n${warns}`, { parse_mode: 'Markdown' });
    }

    // ── Action buttons ────────────────────────────────────────────────────
    const keyboard = new InlineKeyboard()
      .text('🚀 Deploy', `build:deploy:${projectId}`)
      .text('🔄 Iterate', `build:iterate:${projectId}`)
      .row()
      .text('📋 Save to Projects', `build:save:${projectId}`);

    await ctx.reply(
      `✅ *Website generated!* (${result.files.length} file${result.files.length === 1 ? '' : 's'})\n\nWhat would you like to do next?`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
  } catch (error) {
    console.error('[build] Generation failed:', error);
    buildAwaiters.delete(userId);
    await ctx.reply(
      "😵 Something went wrong during generation. Want to try describing it differently, or should I try again?\n\nYou can tap *🎨 Build a Website* to start over.",
      { parse_mode: 'Markdown' },
    );
  }
}

// ============================================================================
// Iterate Handler
// ============================================================================

/**
 * Handle an iteration request — refine the last build with new instructions.
 */
export async function handleIterate(
  ctx: BotContext,
  feedback: string,
  fallback: FallbackHandler,
): Promise<void> {
  const userId = ctx.from?.id.toString() ?? 'unknown';
  const companionId = ctx.session.companionId ?? 'cipher';

  // Clear iterate flag
  iterateAwaiters.delete(userId);

  const prev = lastBuildResult.get(userId);
  if (!prev) {
    await ctx.reply(
      "I don't have a previous build to iterate on. Let's start fresh — describe what you want to build!",
    );
    enterBuildMode(userId);
    return;
  }

  await ctx.reply(
    '🔄 *Iterating on your website...*\n\nI\'m refining the code based on your feedback.',
    { parse_mode: 'Markdown' },
  );
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

  try {
    const existingCode = prev.result.files
      .map(f => `// ${f.path}\n${f.content}`)
      .join('\n\n');

    const llmClient = {
      chat: async (messages: { role: string; content: string }[]) => {
        const result = await supervisedChat(
          messages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          companionId,
          fallback,
          { taskType: 'code' },
        );
        return result.content;
      },
    };

    const result = await generateWebsite(
      {
        prompt: feedback,
        context: { existingCode },
        companionId,
        teachingMode: ctx.session.preferences?.teachingMode ?? true,
      },
      { validationLevel: 'normal' },
      llmClient,
    );

    // Update project files
    const projectId = saveProjectWithFiles(userId, feedback, result.files, prev.projectId);
    lastBuildResult.set(userId, { result, projectId, lastAccessed: Date.now() });

    // Send updated files
    await sendGeneratedFiles(ctx, result);

    if (result.explanation) {
      const trimmed = result.explanation.slice(0, 3000);
      try {
        await ctx.reply(trimmed, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(trimmed);
      }
    }

    if (result.warnings.length > 0) {
      const warns = result.warnings.map(w => `⚠️ ${w}`).join('\n');
      await ctx.reply(`*Quality Check Warnings*\n\n${warns}`, { parse_mode: 'Markdown' });
    }

    const keyboard = new InlineKeyboard()
      .text('🚀 Deploy', `build:deploy:${projectId}`)
      .text('🔄 Iterate', `build:iterate:${projectId}`)
      .row()
      .text('📋 Save to Projects', `build:save:${projectId}`);

    await ctx.reply(
      `✅ *Updated!* (${result.files.length} file${result.files.length === 1 ? '' : 's'})\n\nHappy with it, or want to keep refining?`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
  } catch (error) {
    console.error('[build] Iteration failed:', error);
    await ctx.reply(
      "😵 Something went wrong during iteration. Want to try different feedback, or start fresh with *🎨 Build a Website*?",
      { parse_mode: 'Markdown' },
    );
  }
}

// ============================================================================
// Callback Handler
// ============================================================================

/**
 * Handle inline button presses for build actions:
 *   build:deploy:{projectId}
 *   build:iterate:{projectId}
 *   build:save:{projectId}
 */
export async function handleBuildCallback(
  ctx: BotContext,
  data: string,
  fallback: FallbackHandler,
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.answerCallbackQuery({ text: 'Session error — try /start again.' });
    return;
  }

  // ── Deploy ────────────────────────────────────────────────────────────────
  if (data.startsWith('build:deploy:')) {
    const projectId = data.slice('build:deploy:'.length);
    await ctx.answerCallbackQuery({ text: '🚀 Starting deployment...' });

    const files = getProjectFiles(userId, projectId);
    if (!files || files.length === 0) {
      await ctx.reply("I couldn't find the generated files for this project. Try building again.");
      return;
    }

    await ctx.reply('🚀 *Deploying to Vercel...*', { parse_mode: 'Markdown' });
    await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

    try {
      const { url, deploymentId } = await deploy(files, 'vercel', {
        projectId: `kin-${projectId}`,
      });

      const keyboard = new InlineKeyboard()
        .url('🌐 Open Live Site', url)
        .row()
        .text('🔄 Iterate', `build:iterate:${projectId}`)
        .text('📋 My Projects', 'project:list');

      await ctx.reply(
        `🚀 *Deployed!*\n\n*URL:* ${url}\n*Deployment ID:* \`${deploymentId}\`\n\n_DNS changes can take a few minutes. Refresh if you get a 404._`,
        { parse_mode: 'Markdown', reply_markup: keyboard },
      );
    } catch (error) {
      console.error('[build] Deploy failed:', error);
      await ctx.reply(
        '❌ Deployment failed. Check that VERCEL_TOKEN is configured, or try again.',
      );
    }
    return;
  }

  // ── Iterate ───────────────────────────────────────────────────────────────
  if (data.startsWith('build:iterate:')) {
    await ctx.answerCallbackQuery();
    iterateAwaiters.add(userId);

    await ctx.reply(
      '🔄 *Iteration Mode*\n\nDescribe what you\'d like to change. For example:\n\n' +
      '• _"Make the header sticky and add a dark mode toggle"_\n' +
      '• _"Change the color scheme to blue and purple"_\n' +
      '• _"Add a contact form section at the bottom"_\n\n' +
      'What should I change?',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  // ── Save to Projects ──────────────────────────────────────────────────────
  if (data.startsWith('build:save:')) {
    const projectId = data.slice('build:save:'.length);
    await ctx.answerCallbackQuery({ text: '📋 Saved to your projects!' });

    const keyboard = new InlineKeyboard()
      .text('👀 View Project', `project:view:${projectId}`)
      .text('📋 All Projects', 'project:list');

    await ctx.reply(
      '📋 *Saved!* Your website has been saved to your projects. You can find it in the projects list anytime.',
      { parse_mode: 'Markdown', reply_markup: keyboard },
    );
    return;
  }

  // Unknown build action
  await ctx.answerCallbackQuery({ text: 'Unknown action.' });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Send generated files as Telegram code block messages.
 *
 * Telegram has a 4096-character message limit, so large files are chunked.
 */
async function sendGeneratedFiles(
  ctx: BotContext,
  result: GenerationResult,
): Promise<void> {
  const MAX_MSG_LENGTH = 4000; // leave room for formatting

  for (const file of result.files) {
    const header = `📄 *${escapeMarkdownV1(file.path)}*${file.description ? ` — _${escapeMarkdownV1(file.description)}_` : ''}`;
    const codeBlock = '```' + file.language + '\n' + file.content + '\n```';

    const fullMessage = `${header}\n\n${codeBlock}`;

    if (fullMessage.length <= MAX_MSG_LENGTH) {
      try {
        await ctx.reply(fullMessage, { parse_mode: 'Markdown' });
      } catch {
        // If Markdown fails, send as plain text
        await ctx.reply(`${file.path}\n\n${file.content}`);
      }
    } else {
      // File too large — send header then chunked code
      try {
        await ctx.reply(header, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(file.path);
      }

      // Chunk the code content
      const chunks = chunkString(file.content, MAX_MSG_LENGTH - 30); // room for ``` wrappers
      for (const chunk of chunks) {
        const block = '```' + file.language + '\n' + chunk + '\n```';
        try {
          await ctx.reply(block, { parse_mode: 'Markdown' });
        } catch {
          await ctx.reply(chunk);
        }
      }
    }
  }
}

/** Split a string into chunks of at most `size` characters, breaking at newlines when possible. */
function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  let remaining = str;

  while (remaining.length > 0) {
    if (remaining.length <= size) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline within the size limit
    let breakPoint = remaining.lastIndexOf('\n', size);
    if (breakPoint <= 0) {
      breakPoint = size;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);

    // Skip the newline we broke at
    if (remaining.startsWith('\n')) {
      remaining = remaining.slice(1);
    }
  }

  return chunks;
}

/** Basic Markdown V1 escaping for user-controlled text in headers. */
function escapeMarkdownV1(text: string): string {
  return text.replace(/([_*\[\]`])/g, '\\$1');
}

export default handleBuild;
