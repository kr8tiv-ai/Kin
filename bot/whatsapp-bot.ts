/**
 * KIN WhatsApp Bot - WhatsApp interface for KIN companions
 *
 * Provides the WhatsApp user loop for interacting with Cipher and other KIN
 * companions. Uses @whiskeysockets/baileys for WhatsApp Web multi-device
 * protocol. Mirrors the Telegram bot's inference pipeline:
 *   build prompt -> inject memories -> supervisedChat -> store history
 *
 * @module bot/whatsapp-bot
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessageContent,
  WAMessageKey,
  proto,
  getContentType,
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';

import { buildCompanionPrompt, getAvailableCompanions } from '../inference/companion-prompts.js';
import { FallbackHandler } from '../inference/fallback-handler.js';
import { supervisedChat } from '../inference/supervisor.js';
import { conversationStore } from './memory/conversation-store.js';
import { sanitizeInput, detectJailbreak } from './utils/sanitize.js';
import { checkRateLimit, RATE_LIMITS } from './utils/rate-limit.js';
import { getVoicePipeline, VoicePipelineError } from '../voice/index.js';
import { createSkillRouter, registerCompanionAbilities } from './skills/index.js';
import type { SkillContext } from './skills/index.js';
import { detectLanguage, getLanguagePromptAddition } from './utils/language.js';
import { recordActivity } from './handlers/progress.js';

// ============================================================================
// Types
// ============================================================================

export interface WhatsAppBotConfig {
  /** Directory for persistent auth state (QR session) */
  authDir: string;
}

export interface UserSession {
  userId: string;
  companionId: string;
  lastActivity: Date;
  tier: 'free' | 'hatchling' | 'elder' | 'hero' | 'nft';
}

// ============================================================================
// Constants
// ============================================================================

/** Default auth directory for WhatsApp session persistence */
const DEFAULT_AUTH_DIR = process.env.WHATSAPP_AUTH_DIR ?? './data/whatsapp-auth';

/** Max reconnect delay in ms (capped exponential backoff) */
const MAX_RECONNECT_DELAY_MS = 60_000;

/** Base reconnect delay in ms */
const BASE_RECONNECT_DELAY_MS = 2_000;

/** In-character error messages (Cipher personality) */
export const CIPHER_ERROR_MESSAGES = [
  "Hmm, my brain's a bit foggy right now. Give me a sec and try again?",
  "Oops, I tripped over something in my code cave. Mind sending that again?",
  "My tentacles got tangled up -- one more time?",
  "Something went sideways in my deep-sea circuits. Let's try that again!",
];

/** Voice personality prompt additions (same as Telegram voice handler) */
const VOICE_PERSONALITY = `
[VOICE MODE ACTIVE]
When responding to voice messages:
- Keep responses conversational and natural for speech
- Use contractions naturally (I'm, you're, let's)
- Include occasional playful sounds like "hmm", "ah", "ooh"
- Keep paragraphs short for better readability
- Match the user's energy level
`;

// ============================================================================
// Per-User Session Store (in-memory, keyed by phone number)
// ============================================================================

export const sessions = new Map<string, UserSession>();

/**
 * Get or create a user session keyed by phone number (JID).
 */
export function getSession(jid: string): UserSession {
  const userId = jidToUserId(jid);
  let session = sessions.get(userId);
  if (!session) {
    session = {
      userId,
      companionId: 'cipher',
      lastActivity: new Date(),
      tier: 'free',
    };
    sessions.set(userId, session);
  }
  session.lastActivity = new Date();
  return session;
}

/**
 * Extract a stable user ID from a WhatsApp JID.
 * Strips the @s.whatsapp.net suffix to get the raw phone number.
 */
export function jidToUserId(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
}

// ============================================================================
// Fallback Handler (shared singleton for this bot instance)
// ============================================================================

function createFallbackInstance(): FallbackHandler {
  return new FallbackHandler(
    {
      discloseRouting: true,
      preferredProvider: process.env.GROQ_API_KEY
        ? 'groq'
        : process.env.ANTHROPIC_API_KEY
          ? 'anthropic'
          : 'openai',
    },
    {
      groq: process.env.GROQ_API_KEY ? { apiKey: process.env.GROQ_API_KEY } : undefined,
      openai: process.env.OPENAI_API_KEY ? { apiKey: process.env.OPENAI_API_KEY } : undefined,
      anthropic: process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : undefined,
    },
  );
}

// ============================================================================
// Skill Router (shared singleton, mirrors Telegram pattern)
// ============================================================================

const skillRouter = createSkillRouter();
registerCompanionAbilities(skillRouter);

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle an incoming text message through the full inference pipeline.
 */
export async function handleTextMessage(
  sock: WASocket,
  jid: string,
  rawText: string,
  pushName: string,
  fallback: FallbackHandler,
): Promise<void> {
  const session = getSession(jid);
  const userId = session.userId;
  const message = sanitizeInput(rawText);

  if (!message) return;

  // Jailbreak detection
  const jailbreakMatch = detectJailbreak(message);
  if (jailbreakMatch) {
    console.warn(`[whatsapp][jailbreak] User ${userId} attempted: ${jailbreakMatch}`);
    await sock.sendMessage(jid, {
      text: "Haha, nice try! I'm a KIN companion -- I stay in character because that's who I am. What can I actually help you with?",
    });
    return;
  }

  // Rate limiting for chat
  const rl = checkRateLimit(userId, 'chat', RATE_LIMITS.chat.maxRequests, RATE_LIMITS.chat.windowMs);
  if (!rl.allowed) {
    const mins = Math.ceil(rl.resetInMs / 60000);
    await sock.sendMessage(jid, {
      text: `You've been chatting a lot! Take a breather -- I'll be ready again in ~${mins} min.`,
    });
    return;
  }

  // Typing indicator
  await sock.sendPresenceUpdate('composing', jid);

  // Track activity for progress/gamification (fire-and-forget, mirrors Telegram)
  recordActivity(userId);

  try {
    const companionId = session.companionId;

    // Check if message triggers a skill (before LLM inference)
    const matchedSkill = skillRouter.matchSkill(message);
    if (matchedSkill) {
      const history = await conversationStore.getHistory(userId, 20, companionId);
      const skillCtx: SkillContext = {
        message,
        userId,
        userName: pushName || 'Friend',
        conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
        env: process.env as Record<string, string | undefined>,
      };
      const result = await skillRouter.executeSkill(matchedSkill.name, skillCtx);
      if (result && result.type !== 'error') {
        await conversationStore.addMessage(userId, 'user', message, companionId);
        await conversationStore.addMessage(userId, 'assistant', result.content, companionId);
        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, { text: result.content });
        return;
      }
      // If skill returned error, fall through to LLM
    }

    // Get conversation history (with correct companion)
    const history = await conversationStore.getHistory(userId, 20, companionId);

    // Detect language for multi-language support
    const lang = detectLanguage(message);
    const langAddition = getLanguagePromptAddition(lang);

    // Build system prompt with active companion personality + language addition
    const systemPrompt = buildCompanionPrompt(companionId, {
      userName: pushName || 'Friend',
      taskContext: { type: 'chat' },
      timeContext: new Date().toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: 'numeric' }),
    }) + langAddition;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Memory injection + Supermemory storage handled centrally by supervisor
    const result = await supervisedChat(messages, companionId, fallback, {
      taskType: 'chat',
      userTier: session.tier,
      userId,
      memoryFallback: async () => (await conversationStore.getMemories?.(userId)) ?? [],
    });
    const response = result.content;

    // Store in conversation history (with correct companion)
    await conversationStore.addMessage(userId, 'user', message, companionId);
    await conversationStore.addMessage(userId, 'assistant', response, companionId);

    // Clear typing and send
    await sock.sendPresenceUpdate('paused', jid);
    await sock.sendMessage(jid, { text: response });
  } catch (error) {
    console.error('[whatsapp] Error handling text message:', error);
    await sock.sendPresenceUpdate('paused', jid);
    const errorMsg = CIPHER_ERROR_MESSAGES[Math.floor(Math.random() * CIPHER_ERROR_MESSAGES.length)]!;
    await sock.sendMessage(jid, { text: errorMsg });
  }
}

/**
 * Handle an incoming audio/voice message.
 * Transcribes via the shared voice pipeline, then runs the full inference loop.
 */
export async function handleAudioMessage(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  pushName: string,
  fallback: FallbackHandler,
): Promise<void> {
  const session = getSession(jid);
  const userId = session.userId;

  // Rate limit voice messages
  const rl = checkRateLimit(userId, 'voice', RATE_LIMITS.voice.maxRequests, RATE_LIMITS.voice.windowMs);
  if (!rl.allowed) {
    const mins = Math.ceil(rl.resetInMs / 60000);
    await sock.sendMessage(jid, {
      text: `You've sent a lot of voice notes! Take a breather -- I'll be ready again in ~${mins} min.`,
    });
    return;
  }

  await sock.sendPresenceUpdate('composing', jid);

  try {
    // Download audio from WhatsApp servers
    const audioBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
    ) as Buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      await sock.sendMessage(jid, {
        text: "I couldn't download that voice note. Could you try again?",
      });
      return;
    }

    // Transcribe with Whisper via existing voice pipeline
    const voicePipeline = getVoicePipeline();
    let transcription: string;
    try {
      const result = await voicePipeline.transcribe(audioBuffer);
      transcription = result.text;

      if (!transcription || transcription.trim().length === 0) {
        await sock.sendMessage(jid, {
          text: "I couldn't hear anything in that voice note. Could you try again?",
        });
        return;
      }
    } catch (error) {
      if (error instanceof VoicePipelineError) {
        console.error('[whatsapp] Transcription error:', error.message);
        await sock.sendMessage(jid, {
          text: "I'm having trouble processing audio right now. Could you type your message instead?",
        });
        return;
      }
      throw error;
    }

    console.log(`[whatsapp] Transcribed voice from ${userId}: "${transcription.slice(0, 80)}..."`);

    // Get conversation history (with correct companion)
    const companionId = session.companionId;
    const history = await conversationStore.getHistory(userId, 10, companionId);

    // Build prompt with voice personality
    const systemPrompt = buildCompanionPrompt(companionId, {
      userName: pushName || 'Friend',
      taskContext: { type: 'voice' },
    }) + '\n\n' + VOICE_PERSONALITY;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: transcription },
    ];

    // Generate response via two-brain architecture
    const result = await supervisedChat(messages, companionId, fallback, {
      taskType: 'voice',
      userTier: session.tier,
    });
    const response = result.content;

    // Store messages (with correct companion)
    await conversationStore.addMessage(userId, 'user', transcription, companionId);
    await conversationStore.addMessage(userId, 'assistant', response, companionId);

    // Send text reply (WhatsApp voice reply would need TTS + ogg encoding)
    await sock.sendPresenceUpdate('paused', jid);
    await sock.sendMessage(jid, { text: response });
  } catch (error) {
    console.error('[whatsapp] Voice processing error:', error);
    await sock.sendPresenceUpdate('paused', jid);
    await sock.sendMessage(jid, {
      text: "Hmm, I had trouble with that voice note. Mind sending it again or typing your message?",
    });
  }
}

/**
 * Handle an incoming image message.
 * Acknowledges receipt but explains text-only support for now.
 */
export async function handleImageMessage(
  sock: WASocket,
  jid: string,
  caption: string | undefined,
): Promise<void> {
  const session = getSession(jid);

  // If there's a caption, process it as a text message
  if (caption && caption.trim().length > 0) {
    await sock.sendMessage(jid, {
      text: `I can see you sent an image! I can't analyze images on WhatsApp yet, but I noticed your caption. Let me respond to that:\n\n(Processing your caption as a text message...)`,
    });
    return;
  }

  await sock.sendMessage(jid, {
    text: "I can see you sent an image! I can't analyze images on WhatsApp just yet -- that feature is coming soon. For now, try describing what you see or what you'd like help with, and I'll do my best!",
  });
}

// ============================================================================
// Command Router (text commands prefixed with /)
// ============================================================================

/**
 * Check if a message is a command and handle it.
 * Returns true if a command was handled, false if regular chat.
 */
export async function handleCommand(
  sock: WASocket,
  jid: string,
  text: string,
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return false;

  const session = getSession(jid);
  const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
  const command = (cmd ?? '').toLowerCase();

  switch (command) {
    case 'start':
    case 'hello':
    case 'hi': {
      await sock.sendMessage(jid, {
        text: [
          `Hey there! I'm *${session.companionId.charAt(0).toUpperCase() + session.companionId.slice(1)}*, your KIN companion.`,
          '',
          'Just send me a message and we can start chatting! Here are some things I can do:',
          '',
          '/help - Show available commands',
          '/switch <name> - Switch companion (cipher, mischief, vortex, forge, aether, catalyst)',
          '/status - See your conversation stats',
          '/reset - Clear conversation history',
          '/companions - List all KIN companions',
          '',
          "What's on your mind?",
        ].join('\n'),
      });
      return true;
    }

    case 'help': {
      await sock.sendMessage(jid, {
        text: [
          '*KIN WhatsApp Commands*',
          '',
          '/start - Welcome message',
          '/help - This help menu',
          '/switch <name> - Switch to a different companion',
          '/companions - List all six Genesis KIN',
          '/status - Your conversation stats',
          '/reset - Clear conversation history',
          '',
          'You can also send voice messages and I will transcribe and respond!',
        ].join('\n'),
      });
      return true;
    }

    case 'companions': {
      await sock.sendMessage(jid, {
        text: [
          '*The Genesis Six KIN*',
          '',
          'cipher - Code Kraken (web design, frontend dev)',
          'mischief - Glitch Pup (branding, social media)',
          'vortex - Teal Dragon (content strategy, analytics)',
          'forge - Cyber Unicorn (backend, architecture)',
          'aether - Frost Ape (creative writing, storytelling)',
          'catalyst - Cosmic Blob (finance, habits, goals)',
          '',
          `Your current companion: *${session.companionId}*`,
          '',
          'Use /switch <name> to change companions.',
        ].join('\n'),
      });
      return true;
    }

    case 'switch': {
      const target = (args[0] ?? '').toLowerCase();
      const validCompanions = getAvailableCompanions();

      if (!target || !validCompanions.includes(target)) {
        await sock.sendMessage(jid, {
          text: `Please specify a companion: ${validCompanions.join(', ')}\n\nExample: /switch forge`,
        });
        return true;
      }

      session.companionId = target;
      const names: Record<string, string> = {
        cipher: 'Cipher, the Code Kraken',
        mischief: 'Mischief, the Glitch Pup',
        vortex: 'Vortex, the Teal Dragon',
        forge: 'Forge, the Cyber Unicorn',
        aether: 'Aether, the Frost Ape',
        catalyst: 'Catalyst, the Cosmic Blob',
      };
      await sock.sendMessage(jid, {
        text: `Switched to *${names[target]}*! Say hello to get started.`,
      });
      return true;
    }

    case 'status': {
      const msgCount = await conversationStore.getMessageCount(session.userId, session.companionId);
      await sock.sendMessage(jid, {
        text: [
          '*Your KIN Status*',
          '',
          `Companion: *${session.companionId}*`,
          `Messages: ${msgCount}`,
          `Tier: ${session.tier}`,
          `Last active: ${session.lastActivity.toLocaleString()}`,
        ].join('\n'),
      });
      return true;
    }

    case 'reset': {
      await conversationStore.clearHistory(session.userId, session.companionId);
      await sock.sendMessage(jid, {
        text: `Conversation history with *${session.companionId}* has been cleared. Fresh start!`,
      });
      return true;
    }

    default:
      return false;
  }
}

// ============================================================================
// Bot Factory
// ============================================================================

/**
 * Create and start a WhatsApp bot instance with persistent auth and
 * exponential-backoff reconnection.
 *
 * @param config - Bot configuration (auth directory path)
 * @returns Object with the socket, a shutdown function, and session info
 */
export async function createWhatsAppBot(config: WhatsAppBotConfig = { authDir: DEFAULT_AUTH_DIR }): Promise<{
  sock: WASocket;
  shutdown: () => Promise<void>;
  sessions: Map<string, UserSession>;
}> {
  const authDir = path.resolve(config.authDir);

  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const fallback = createFallbackInstance();
  let reconnectAttempt = 0;
  let sock: WASocket | null = null;
  let isShuttingDown = false;

  // ------------------------------------------------------------------
  // Connect (called on initial start and on reconnect)
  // ------------------------------------------------------------------
  async function connect(): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[whatsapp] Connecting with Baileys v${version.join('.')}...`);

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys),
      },
      printQRInTerminal: true,
      generateHighQualityLinkPreview: false,
    });

    // ── Credential persistence ────────────────────────────────────────
    socket.ev.on('creds.update', saveCreds);

    // ── Connection updates (reconnect logic) ──────────────────────────
    socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[whatsapp] Scan the QR code above to link your WhatsApp account.');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.error('[whatsapp] Device was logged out. Delete auth folder and re-scan.');
          return;
        }

        if (isShuttingDown) {
          console.log('[whatsapp] Shutting down, will not reconnect.');
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, ... capped at 60s
        reconnectAttempt++;
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt - 1),
          MAX_RECONNECT_DELAY_MS,
        );
        console.log(
          `[whatsapp] Connection closed (code ${statusCode}). ` +
          `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnectAttempt})...`,
        );

        setTimeout(async () => {
          try {
            sock = await connect();
          } catch (err) {
            console.error('[whatsapp] Reconnect failed:', err);
          }
        }, delay);
      }

      if (connection === 'open') {
        reconnectAttempt = 0;
        console.log('[whatsapp] Connected successfully!');
      }
    });

    // ── Message handler ───────────────────────────────────────────────
    socket.ev.on('messages.upsert', async ({ messages: incomingMessages, type }: { messages: any[]; type: string }) => {
      // Only process new messages (not history sync)
      if (type !== 'notify') return;

      for (const msg of incomingMessages) {
        // Skip messages from self, status broadcasts, and group chats
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Only handle DMs (skip group messages for now)
        if (jid.endsWith('@g.us')) continue;

        const pushName = msg.pushName ?? 'Friend';

        try {
          // Determine message type
          const msgType = getContentType(msg.message);

          // ── Text messages ───────────────────────────────────────
          if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
            const text =
              msg.message.conversation ??
              msg.message.extendedTextMessage?.text ??
              '';

            if (!text.trim()) continue;

            // Try command first
            const handled = await handleCommand(socket, jid, text);
            if (!handled) {
              await handleTextMessage(socket, jid, text, pushName, fallback);
            }
            continue;
          }

          // ── Audio / voice note messages ─────────────────────────
          if (msgType === 'audioMessage') {
            await handleAudioMessage(socket, jid, msg, pushName, fallback);
            continue;
          }

          // ── Image messages ──────────────────────────────────────
          if (msgType === 'imageMessage') {
            const caption = msg.message.imageMessage?.caption ?? undefined;
            await handleImageMessage(socket, jid, caption);
            continue;
          }

          // ── Video messages ──────────────────────────────────────
          if (msgType === 'videoMessage') {
            await socket.sendMessage(jid, {
              text: "I can see you sent a video! I can't process videos on WhatsApp just yet. Try describing what's in it and I'll help!",
            });
            continue;
          }

          // ── Document messages ───────────────────────────────────
          if (msgType === 'documentMessage') {
            await socket.sendMessage(jid, {
              text: "I received your document! I can't read files on WhatsApp just yet. Try pasting the text content directly and I'll take a look.",
            });
            continue;
          }

          // ── Sticker messages ────────────────────────────────────
          if (msgType === 'stickerMessage') {
            // Silently ignore stickers
            continue;
          }

          // ── Location messages ───────────────────────────────────
          if (msgType === 'locationMessage') {
            await socket.sendMessage(jid, {
              text: "I see you shared a location! I can't process map data on WhatsApp yet. What did you need help with regarding this place?",
            });
            continue;
          }

          // ── Contact messages ────────────────────────────────────
          if (msgType === 'contactMessage' || msgType === 'contactsArrayMessage') {
            await socket.sendMessage(jid, {
              text: "Thanks for sharing that contact! I can't process contact cards yet. Is there something specific you'd like help with?",
            });
            continue;
          }

          // ── Unknown message type — acknowledge gracefully ───────
          console.log(`[whatsapp] Unhandled message type: ${msgType} from ${jid}`);
        } catch (error) {
          console.error(`[whatsapp] Error handling message from ${jid}:`, error);
          try {
            const errorMsg = CIPHER_ERROR_MESSAGES[Math.floor(Math.random() * CIPHER_ERROR_MESSAGES.length)]!;
            await socket.sendMessage(jid, { text: errorMsg });
          } catch {
            // If we can't even send the error, just log it
            console.error('[whatsapp] Failed to send error message');
          }
        }
      }
    });

    sock = socket;
    return socket;
  }

  // ------------------------------------------------------------------
  // Start the connection
  // ------------------------------------------------------------------
  const socket = await connect();

  // ------------------------------------------------------------------
  // Shutdown handler
  // ------------------------------------------------------------------
  async function shutdown(): Promise<void> {
    console.log('[whatsapp] Shutting down...');
    isShuttingDown = true;
    if (sock) {
      await sock.logout().catch(() => {});
      sock.end(undefined);
    }
  }

  return {
    sock: socket,
    shutdown,
    sessions,
  };
}

// ============================================================================
// Auto-start when run directly
// ============================================================================

const isMainModule = import.meta.url === `file://${process.argv[1]}`
  || import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;

if (isMainModule) {
  const authDir = process.env.WHATSAPP_AUTH_DIR ?? DEFAULT_AUTH_DIR;
  console.log(`[whatsapp] Starting KIN WhatsApp Bot (auth: ${authDir})`);

  createWhatsAppBot({ authDir }).then(({ shutdown }) => {
    const graceful = async () => {
      await shutdown();
      process.exit(0);
    };
    process.on('SIGINT', graceful);
    process.on('SIGTERM', graceful);
  }).catch((err) => {
    console.error('[whatsapp] Fatal error:', err);
    process.exit(1);
  });
}

export default createWhatsAppBot;
