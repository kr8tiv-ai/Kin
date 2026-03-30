/**
 * KIN Telegram Bot - Main entry point
 *
 * Provides the primary user loop for interacting with Cipher and other Kin companions.
 */

import { Bot, GrammyError, HttpError, Context, session, SessionFlavor, InlineKeyboard } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';
import { buildCompanionPrompt } from '../inference/companion-prompts.js';
import { FallbackHandler } from '../inference/fallback-handler.js';
import { supervisedChat } from '../inference/supervisor.js';
import { conversationStore, type ConversationMemory } from './memory/conversation-store.js';
import { handleStart } from './handlers/start.js';
import { handleHelp } from './handlers/help.js';
import { handleStatus } from './handlers/status.js';
import { handleReset } from './handlers/reset.js';
import { handleHealth } from './handlers/health.js';
import { handleSwitch } from './handlers/switch.js';
import { handleCompanions } from './handlers/companions.js';
import { handleSupport, handleSupportCallback } from './handlers/support.js';
import { handleOnboarding, advanceOnboardingToGoal, handleOnboardingCallback, isAwaitingName } from './handlers/onboarding.js';
import { handleProjects, handleNewProject, createProject, handleProjectCallback } from './handlers/projects.js';
import { handleBuild, handleIterate, handleBuildCallback, enterBuildMode, isAwaitingBuild, isAwaitingIterate } from './handlers/build.js';
import { handleExport } from './handlers/export.js';
import { handleProgress, handleProgressCallback, recordActivity } from './handlers/progress.js';
import { handleCustomize, handleCustomizeCallback, handleCustomizePendingInput } from './handlers/customize.js';
import { handleRefer, handleReferCallback } from './handlers/refer.js';
import { handleUpgrade, handleUpgradeCallback } from './handlers/upgrade.js';
import { handleVoice } from './handlers/voice.js';
import { handleImage } from './handlers/image.js';
import { handleDocument } from './handlers/document.js';
import { createSkillRouter, onReminderFired } from './skills/index.js';
import type { SkillContext } from './skills/index.js';
import { sanitizeInput, escapeMarkdown, detectJailbreak } from './utils/sanitize.js';
import { checkRateLimit, RATE_LIMITS } from './utils/rate-limit.js';
import { detectLanguage, getLanguagePromptAddition } from './utils/language.js';

// Suggestion buttons shown after Cipher responses
const SUGGESTION_BUTTONS = new InlineKeyboard()
  .text('💬 Tell me more', 'suggest:more')
  .text('🎨 Build something', 'suggest:build')
  .row()
  .text('🔄 New topic', 'suggest:new')
  .text('❓ Help', 'suggest:help');

// In-character error messages (Cipher personality)
const CIPHER_ERROR_MESSAGES = [
  "Hmm, my brain's a bit foggy right now. Give me a sec and try again? 🐙",
  "Oops, I tripped over something in my code cave. Mind sending that again? 🐙",
  "My tentacles got tangled up — one more time? 🐙",
  "Something went sideways in my deep-sea circuits. Let's try that again! 🐙",
];

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

type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;

interface BotConfig {
  token: string;
  webhookUrl?: string;
  webhookPort?: number;
  usePolling?: boolean;
}

// ============================================================================
// Bot Factory
// ============================================================================

export function createKINBot(config: BotConfig) {
  const bot = new Bot<BotContext>(config.token);

  // Install retry plugin for automatic retries on network errors
  bot.use(autoRetry() as any);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({
        userId: '',
        companionId: 'cipher',
        conversationStarted: false,
        lastActivity: new Date(),
        preferences: {
          voiceEnabled: true,
          teachingMode: true,
        },
      }),
    })
  );

  // Conversations plugin
  bot.use(conversations());

  // Initialize skill router
  const skillRouter = createSkillRouter();

  // Wire reminder notifications — when a reminder fires, send message to user
  onReminderFired(async (reminder) => {
    try {
      const chatId = Number(reminder.userId);
      if (!isNaN(chatId)) {
        await bot.api.sendMessage(chatId, `⏰ Reminder: ${reminder.task}`);
      }
    } catch (err) {
      console.error('Failed to deliver reminder:', err);
    }
  });

  // Initialize fallback handler — auto-detect best free provider
  const fallback = new FallbackHandler(
    {
      discloseRouting: true,
      preferredProvider: process.env.GROQ_API_KEY ? 'groq' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
    },
    {
      groq: process.env.GROQ_API_KEY ? { apiKey: process.env.GROQ_API_KEY } : undefined,
      openai: process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : undefined,
      anthropic: process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : undefined,
    }
  );

  // ==========================================================================
  // Command Handlers
  // ==========================================================================

  bot.command('start', async (ctx) => {
    await handleStart(ctx, conversationStore);
  });

  bot.command('help', async (ctx) => {
    await handleHelp(ctx);
  });

  bot.command('status', async (ctx) => {
    await handleStatus(ctx, conversationStore);
  });

  bot.command('reset', async (ctx) => {
    await handleReset(ctx, conversationStore);
  });

  bot.command('health', async (ctx) => {
    await handleHealth(ctx);
  });

  bot.command('switch', async (ctx) => {
    await handleSwitch(ctx, conversationStore);
  });

  bot.command('companions', async (ctx) => {
    await handleCompanions(ctx);
  });

  bot.command('support', async (ctx) => {
    await handleSupport(ctx);
  });

  bot.command('projects', async (ctx) => {
    await handleProjects(ctx);
  });

  bot.command('newproject', async (ctx) => {
    await handleNewProject(ctx);
  });

  bot.command('export', async (ctx) => {
    await handleExport(ctx, conversationStore);
  });

  bot.command('progress', async (ctx) => {
    await handleProgress(ctx);
  });

  bot.command('customize', async (ctx) => {
    await handleCustomize(ctx);
  });

  bot.command('refer', async (ctx) => {
    await handleRefer(ctx);
  });

  bot.command('upgrade', async (ctx) => {
    await handleUpgrade(ctx);
  });

  // ==========================================================================
  // Callback Query Handlers (Inline Button Presses)
  // ==========================================================================

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Support category buttons
    if (data.startsWith('support:')) {
      await handleSupportCallback(ctx, data);
      return;
    }

    // Suggestion buttons after Cipher responses
    if (data === 'suggest:more') {
      await ctx.answerCallbackQuery();
      // Inject "Tell me more about that" as if user typed it
      const userId = ctx.from?.id.toString() ?? 'unknown';
      ctx.session.userId = userId;
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');
      const companionId = ctx.session.companionId ?? 'cipher';
      const history = await conversationStore.getHistory(userId, 20);

      // Inject memories into system prompt
      const userMemories = await conversationStore.getMemories?.(userId) ?? [];
      const memoryBlock = userMemories.length > 0
        ? `\n\nYou remember these things about the user:\n${userMemories.map((m: string) => `- ${m}`).join('\n')}`
        : '';

      const systemPrompt = buildCompanionPrompt(companionId, {
        userName: ctx.from?.first_name ?? 'Friend',
        taskContext: { type: 'chat' },
        timeContext: new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: 'numeric' }),
      }) + memoryBlock;
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: 'Tell me more about that' },
      ];
      const result = await supervisedChat(messages, companionId, fallback, { taskType: 'chat' });
      await conversationStore.addMessage(userId, 'user', 'Tell me more about that');
      await conversationStore.addMessage(userId, 'assistant', result.content);
      try {
        await ctx.reply(result.content, { parse_mode: 'Markdown', reply_markup: SUGGESTION_BUTTONS });
      } catch {
        await ctx.reply(result.content, { reply_markup: SUGGESTION_BUTTONS });
      }
      return;
    }

    if (data === 'suggest:build') {
      await ctx.answerCallbackQuery();
      const buildUserId = ctx.from?.id.toString() ?? 'unknown';
      enterBuildMode(buildUserId);
      await ctx.reply(
        "🎨 *Let's build something!*\n\nDescribe what you want — a portfolio, a landing page, a blog — and I'll generate the code for you.\n\nWhat are we making?",
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (data === 'suggest:new') {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        "🔄 Fresh start! What would you like to talk about?",
      );
      return;
    }

    if (data === 'suggest:help') {
      await ctx.answerCallbackQuery();
      await handleHelp(ctx as any);
      return;
    }

    // Onboarding buttons
    if (data.startsWith('onboard:')) {
      await handleOnboardingCallback(ctx, data, conversationStore);
      return;
    }

    // Build pipeline buttons (deploy, iterate, save)
    if (data.startsWith('build:')) {
      await handleBuildCallback(ctx, data, fallback);
      return;
    }

    // Project buttons
    if (data.startsWith('project:')) {
      await handleProjectCallback(ctx, data);
      return;
    }

    // Progress buttons
    if (data.startsWith('progress:')) {
      await handleProgressCallback(ctx, data);
      return;
    }

    // Customization buttons
    if (data.startsWith('custom:')) {
      await handleCustomizeCallback(ctx, data);
      return;
    }

    // Referral buttons
    if (data.startsWith('refer:')) {
      await handleReferCallback(ctx, data);
      return;
    }

    // Upgrade buttons
    if (data.startsWith('upgrade:')) {
      await handleUpgradeCallback(ctx, data);
      return;
    }

    // Unknown callback — acknowledge silently
    await ctx.answerCallbackQuery();
  });

  // ==========================================================================
  // Voice Handler
  // ==========================================================================

  bot.on('message:voice', async (ctx) => {
    const userId = ctx.from?.id.toString() ?? 'unknown';
    const rl = checkRateLimit(userId, 'voice', RATE_LIMITS.voice.maxRequests, RATE_LIMITS.voice.windowMs);
    if (!rl.allowed) {
      const mins = Math.ceil(rl.resetInMs / 60000);
      await ctx.reply(`You've sent a lot of voice notes! Take a breather — I'll be ready again in ~${mins} min.`);
      return;
    }
    await handleVoice(ctx, fallback);
  });

  // ==========================================================================
  // Image Handler — Vision AI for photos
  // ==========================================================================

  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from?.id.toString() ?? 'unknown';
    const rl = checkRateLimit(userId, 'image', RATE_LIMITS.image.maxRequests, RATE_LIMITS.image.windowMs);
    if (!rl.allowed) {
      const mins = Math.ceil(rl.resetInMs / 60000);
      await ctx.reply(`You've sent a lot of images! I need a moment to rest my eyes — try again in ~${mins} min.`);
      return;
    }
    await handleImage(ctx, fallback);
  });

  // ==========================================================================
  // Document Handler — Text files, code, CSV, etc.
  // ==========================================================================

  bot.on('message:document', async (ctx) => {
    const userId = ctx.from?.id.toString() ?? 'unknown';
    const rl = checkRateLimit(userId, 'image', RATE_LIMITS.image.maxRequests, RATE_LIMITS.image.windowMs);
    if (!rl.allowed) {
      const mins = Math.ceil(rl.resetInMs / 60000);
      await ctx.reply(`You've sent a lot of files! I need a moment — try again in ~${mins} min.`);
      return;
    }
    await handleDocument(ctx, fallback);
  });

  // ==========================================================================
  // Message Handler (Main Loop)
  // ==========================================================================

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id.toString() ?? 'unknown';
    const rawMessage = ctx.message.text;
    const message = sanitizeInput(rawMessage);
    if (!message) return; // Empty after sanitization

    // Jailbreak detection — deflect prompt injection attempts in-character
    const jailbreakMatch = detectJailbreak(message);
    if (jailbreakMatch) {
      console.warn(`[Jailbreak] User ${userId} attempted: ${jailbreakMatch}`);
      await ctx.reply(
        "Haha, nice try! I'm a KIN companion — I stay in character because that's who I am. 😄 What can I actually help you with?",
      );
      return;
    }

    // Handle ReplyKeyboard button taps (map to commands/prompts)
    const buttonMap: Record<string, () => Promise<void>> = {
      '💬 Chat': async () => {
        await ctx.reply("I'm all ears! What's on your mind? 🐙");
      },
      '🎨 Build a Website': async () => {
        enterBuildMode(userId);
        await ctx.reply(
          "🎨 *Let's build something!*\n\nDescribe what you want — a portfolio, a landing page, a blog — and I'll generate the code for you.\n\nWhat are we making?",
          { parse_mode: 'Markdown' },
        );
      },
      '🐙 My Companions': async () => { await handleCompanions(ctx as any); },
      '📊 Status': async () => { await handleStatus(ctx as any, conversationStore); },
      '❓ Help': async () => { await handleHelp(ctx as any); },
      '🆘 Support': async () => { await handleSupport(ctx as any); },
    };

    const buttonHandler = buttonMap[message];
    if (buttonHandler) {
      ctx.session.userId = userId;
      ctx.session.lastActivity = new Date();
      await buttonHandler();
      return;
    }

    // Update session
    ctx.session.userId = userId;
    ctx.session.lastActivity = new Date();
    ctx.session.conversationStarted = true;

    // Track activity for progress/gamification
    recordActivity(userId);

    // Intercept onboarding name input
    if (isAwaitingName(userId)) {
      await advanceOnboardingToGoal(ctx, message, conversationStore);
      return;
    }

    // Intercept customization pending input (nickname, personality notes)
    if (await handleCustomizePendingInput(ctx, message)) {
      return;
    }

    // Intercept build mode — user is describing what they want built
    if (isAwaitingBuild(userId)) {
      await handleBuild(ctx as any, message, fallback);
      return;
    }

    // Intercept iterate mode — user is refining a previous build
    if (isAwaitingIterate(userId)) {
      await handleIterate(ctx as any, message, fallback);
      return;
    }

    // Show typing indicator
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    try {
      // Check if message triggers a skill (before LLM)
      const matchedSkill = skillRouter.matchSkill(message);
      if (matchedSkill) {
        const history = await conversationStore.getHistory(userId, 20);
        const skillCtx: SkillContext = {
          message,
          userId,
          userName: ctx.from?.first_name ?? 'Friend',
          conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
          env: process.env as Record<string, string | undefined>,
        };
        const result = await skillRouter.executeSkill(matchedSkill.name, skillCtx);
        if (result && result.type !== 'error') {
          await conversationStore.addMessage(userId, 'user', message);
          await conversationStore.addMessage(userId, 'assistant', result.content);
          await ctx.reply(result.content, { parse_mode: result.type === 'markdown' ? 'Markdown' : undefined });
          return;
        }
        // If skill returned error, fall through to LLM
      }

      // Get conversation history
      const history = await conversationStore.getHistory(userId, 20);

      // Detect language for multi-language support
      const lang = detectLanguage(message);
      const langAddition = getLanguagePromptAddition(lang);

      // Build messages for the LLM — uses active companion's personality
      const companionId = ctx.session.companionId ?? 'cipher';

      // Inject memories into system prompt
      const userMemories = await conversationStore.getMemories?.(userId) ?? [];
      const memoryBlock = userMemories.length > 0
        ? `\n\nYou remember these things about the user:\n${userMemories.map((m: string) => `- ${m}`).join('\n')}`
        : '';

      const systemPrompt = buildCompanionPrompt(companionId, {
        userName: ctx.from?.first_name ?? 'Friend',
        taskContext: { type: 'chat' },
        timeContext: new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: 'numeric' }),
      }) + memoryBlock + langAddition;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: message },
      ];

      // Generate response via two-brain architecture (local + supervisor)
      const result = await supervisedChat(messages, companionId, fallback, {
        taskType: 'chat',
      });
      const response = result.content;

      // Store in conversation history
      await conversationStore.addMessage(userId, 'user', message);
      await conversationStore.addMessage(userId, 'assistant', response);

      // Send response with suggestion buttons
      try {
        await ctx.reply(response, { parse_mode: 'Markdown', reply_markup: SUGGESTION_BUTTONS });
      } catch {
        // If Markdown parsing fails, send as plain text with buttons
        await ctx.reply(response, { reply_markup: SUGGESTION_BUTTONS });
      }

    } catch (error) {
      console.error('Error handling message:', error);
      const errorMsg = CIPHER_ERROR_MESSAGES[Math.floor(Math.random() * CIPHER_ERROR_MESSAGES.length)];
      await ctx.reply(errorMsg!);
    }
  });

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);

    if (err.error instanceof GrammyError) {
      console.error('Error in request:', err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error('Could not connect to Telegram:', err.error);
    } else {
      console.error('Unknown error:', err.error);
    }
  });

  return bot;
}

// ============================================================================
// Start Bot
// ============================================================================

export async function startBot(config: BotConfig) {
  const bot = createKINBot(config);

  if (config.webhookUrl) {
    // Webhook mode for production
    await bot.api.setWebhook(config.webhookUrl, {
      allowed_updates: ['message', 'edited_message', 'callback_query'],
    });
    console.log(`Webhook set to ${config.webhookUrl}`);
    
    // Start webhook server
    // (This would typically be handled by a separate server like Fastify)
    return bot;
  } else if (config.usePolling !== false) {
    // Polling mode for development
    console.log('Starting bot in polling mode...');
    await bot.start();

    const shutdown = async () => {
      console.log('\nShutting down KIN...');
      await bot.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return bot;
  }

  return bot;
}

// ============================================================================
// Auto-start when run directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not set. Get one from @BotFather');
    process.exit(1);
  }
  startBot({ token, usePolling: true });
}

export default createKINBot;
