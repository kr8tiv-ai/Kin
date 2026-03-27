/**
 * KIN Telegram Bot - Main entry point
 *
 * Provides the primary user loop for interacting with Cipher and other Kin companions.
 */

import { Bot, GrammyError, HttpError, Context, session, SessionFlavor } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';
import { buildCipherPrompt } from '../inference/cipher-prompts.js';
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
import { handleVoice } from './handlers/voice.js';
import { createSkillRouter, onReminderFired } from './skills/index.js';
import type { SkillContext } from './skills/index.js';
import { sanitizeInput } from './utils/sanitize.js';

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

  // Initialize fallback handler
  const fallback = new FallbackHandler(
    {
      discloseRouting: true,
      preferredProvider: 'openai',
    },
    {
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

  // ==========================================================================
  // Voice Handler
  // ==========================================================================

  bot.on('message:voice', async (ctx) => {
    await handleVoice(ctx, fallback);
  });

  // ==========================================================================
  // Message Handler (Main Loop)
  // ==========================================================================

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id.toString() ?? 'unknown';
    const rawMessage = ctx.message.text;
    const message = sanitizeInput(rawMessage);
    if (!message) return; // Empty after sanitization

    // Update session
    ctx.session.userId = userId;
    ctx.session.lastActivity = new Date();
    ctx.session.conversationStarted = true;

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

      // Build messages for the LLM
      const systemPrompt = buildCipherPrompt(message, {
        userName: ctx.from?.first_name ?? 'Friend',
        taskContext: { type: 'chat' },
        timeContext: new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: 'numeric' }),
      });

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: message },
      ];

      // Generate response via two-brain architecture (local + supervisor)
      const companionId = ctx.session.companionId ?? 'cipher';
      const result = await supervisedChat(messages, companionId, fallback, {
        taskType: 'chat',
      });
      const response = result.content;

      // Store in conversation history
      await conversationStore.addMessage(userId, 'user', message);
      await conversationStore.addMessage(userId, 'assistant', response);

      // Send response
      await ctx.reply(response);

    } catch (error) {
      console.error('Error handling message:', error);
      await ctx.reply(
        "Hey, I hit a snag processing that. Give me a moment and try again? 🐙"
      );
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
// Default Export
// ============================================================================

export default createKINBot;
