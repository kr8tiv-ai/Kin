/**
 * KIN Discord Bot - Discord companion interface
 *
 * Provides slash commands and DM conversations for interacting with
 * Cipher and the other Genesis Six KIN companions via Discord.
 * Mirrors the Telegram bot's inference pipeline: build prompt, inject
 * memories, supervisedChat, store history.
 *
 * @module bot/discord-bot
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ChannelType,
  ActivityType,
  type Interaction,
  type Message as DiscordMessage,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { buildCompanionPrompt, getAvailableCompanions } from '../inference/companion-prompts.js';
import { createTypingIndicator } from './utils/typing.js';
import { FallbackHandler } from '../inference/fallback-handler.js';
import { supervisedChat } from '../inference/supervisor.js';
import { conversationStore } from './memory/conversation-store.js';
import { sanitizeInput, detectJailbreak } from './utils/sanitize.js';
import { checkRateLimit, RATE_LIMITS } from './utils/rate-limit.js';
import { getDb } from '../db/connection.js';
import {
  isAuthorized,
  isOwner,
  generatePairingCode,
  validatePairingCode,
  approveSender,
  denySender,
  getPendingCodes,
} from './utils/dm-security.js';
import { detectLanguage, getLanguagePromptAddition } from './utils/language.js';
import { createSkillRouter, registerCompanionAbilities } from './skills/index.js';
import type { SkillContext } from './skills/index.js';
import { recordActivity } from './handlers/progress.js';

// ============================================================================
// Types
// ============================================================================

interface DiscordBotConfig {
  /** Discord bot token */
  token: string;
  /** Discord application (client) ID */
  clientId: string;
}

interface UserSession {
  userId: string;
  companionId: string;
  tier: 'free' | 'hatchling' | 'elder' | 'hero' | 'nft';
  lastActivity: Date;
}

// ============================================================================
// Constants
// ============================================================================

/** In-character error messages (Cipher personality) */
const CIPHER_ERROR_MESSAGES = [
  "Hmm, my brain's a bit foggy right now. Give me a sec and try again?",
  "Oops, I tripped over something in my code cave. Mind sending that again?",
  "My tentacles got tangled up -- one more time?",
  "Something went sideways in my deep-sea circuits. Let's try that again!",
];

/** Maximum Discord message length (2000 chars) */
const DISCORD_MAX_LENGTH = 2000;

// ============================================================================
// Session Store
// ============================================================================

const sessions = new Map<string, UserSession>();

/** Sweep interval: every 10 min, evict sessions idle >1 hour. */
const SESSION_IDLE_MS = 60 * 60 * 1000; // 1 hour
const SESSION_SWEEP_MS = 10 * 60 * 1000; // 10 minutes

const sessionSweep = setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const [id, session] of sessions) {
    if (session.lastActivity.getTime() < cutoff) {
      sessions.delete(id);
    }
  }
}, SESSION_SWEEP_MS);
sessionSweep.unref();

/**
 * Get or create a user session.
 */
function getSession(userId: string): UserSession {
  let session = sessions.get(userId);
  if (!session) {
    session = {
      userId,
      companionId: 'cipher',
      tier: 'free',
      lastActivity: new Date(),
    };
    sessions.set(userId, session);
  }
  session.lastActivity = new Date();
  return session;
}

// ============================================================================
// Skill Router (shared singleton, mirrors WhatsApp/Telegram pattern)
// ============================================================================

const skillRouter = createSkillRouter();
registerCompanionAbilities(skillRouter);

// ============================================================================
// Slash Command Definitions
// ============================================================================

const chatCommand = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('Send a message to your KIN companion')
  .addStringOption((option: any) =>
    option
      .setName('message')
      .setDescription('What you want to say')
      .setRequired(true),
  );

const companionCommand = new SlashCommandBuilder()
  .setName('companion')
  .setDescription('Switch your active KIN companion')
  .addStringOption((option: any) =>
    option
      .setName('name')
      .setDescription('Companion name (cipher, mischief, vortex, forge, aether, catalyst)')
      .setRequired(true)
      .addChoices(
        { name: 'Cipher -- Code Kraken', value: 'cipher' },
        { name: 'Mischief -- Glitch Pup', value: 'mischief' },
        { name: 'Vortex -- Teal Dragon', value: 'vortex' },
        { name: 'Forge -- Cyber Unicorn', value: 'forge' },
        { name: 'Aether -- Frost Ape', value: 'aether' },
        { name: 'Catalyst -- Cosmic Blob', value: 'catalyst' },
      ),
  );

const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check your KIN session status and conversation stats');

const approveCommand = new SlashCommandBuilder()
  .setName('approve')
  .setDescription('Approve a pending DM pairing code (owner only)')
  .addStringOption((option: any) =>
    option
      .setName('code')
      .setDescription('The 6-digit pairing code to approve')
      .setRequired(true),
  );

const denyCommand = new SlashCommandBuilder()
  .setName('deny')
  .setDescription('Deny a pending DM pairing code (owner only)')
  .addStringOption((option: any) =>
    option
      .setName('code')
      .setDescription('The 6-digit pairing code to deny')
      .setRequired(true),
  );

const pendingCommand = new SlashCommandBuilder()
  .setName('pending')
  .setDescription('List all pending DM pairing codes (owner only)');

const slashCommands = [chatCommand, companionCommand, statusCommand, approveCommand, denyCommand, pendingCommand];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Split a long response into Discord-safe chunks (max 2000 chars).
 * Splits on newline boundaries when possible.
 */
function splitMessage(content: string): string[] {
  if (content.length <= DISCORD_MAX_LENGTH) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline within the limit
    let splitIdx = remaining.lastIndexOf('\n', DISCORD_MAX_LENGTH);
    if (splitIdx <= 0) {
      // No newline found -- split at the limit
      splitIdx = DISCORD_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/**
 * Pick a random in-character error message.
 */
function randomErrorMessage(): string {
  return CIPHER_ERROR_MESSAGES[Math.floor(Math.random() * CIPHER_ERROR_MESSAGES.length)]!;
}

// ============================================================================
// Core Inference Pipeline
// ============================================================================

/**
 * Run the full inference pipeline for a user message.
 * Mirrors the Telegram bot flow: build prompt -> inject memories ->
 * supervisedChat -> store history.
 */
async function runInferencePipeline(
  userId: string,
  userName: string,
  message: string,
  session: UserSession,
  fallback: FallbackHandler,
): Promise<string> {
  // Rate limit check
  const rl = checkRateLimit(userId, 'chat', RATE_LIMITS.chat.maxRequests, RATE_LIMITS.chat.windowMs);
  if (!rl.allowed) {
    const mins = Math.ceil(rl.resetInMs / 60000);
    return `You've been chatting a lot! Take a breather -- I'll be ready again in ~${mins} min.`;
  }

  const companionId = session.companionId;

  // Check if message triggers a skill (before LLM inference)
  const matchedSkill = skillRouter.matchSkill(message);
  if (matchedSkill) {
    const history = await conversationStore.getHistory(userId, 20, companionId);
    const skillCtx: SkillContext = {
      message,
      userId,
      userName: userName || 'Friend',
      conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
      env: process.env as Record<string, string | undefined>,
    };
    const result = await skillRouter.executeSkill(matchedSkill.name, skillCtx);
    if (result && result.type !== 'error') {
      await conversationStore.addMessage(userId, 'user', message, companionId);
      await conversationStore.addMessage(userId, 'assistant', result.content, companionId);
      return result.content;
    }
    // If skill returned error, fall through to LLM
  }

  // Get conversation history
  const history = await conversationStore.getHistory(userId, 20, companionId);

  // Detect language for multi-language support
  const lang = detectLanguage(message);
  const langAddition = getLanguagePromptAddition(lang);

  // Build system prompt with active companion personality + language addition
  const systemPrompt = buildCompanionPrompt(companionId, {
    userName,
    taskContext: { type: 'chat' },
    timeContext: new Date().toLocaleString('en-US', {
      weekday: 'long',
      hour: 'numeric',
      minute: 'numeric',
    }),
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
    memoryFallback: async () => (await conversationStore.getMemories(userId)) ?? [],
  });

  // Store in conversation history
  await conversationStore.addMessage(userId, 'user', message, companionId);
  await conversationStore.addMessage(userId, 'assistant', result.content, companionId);

  return result.content;
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle /chat slash command.
 */
async function handleChatCommand(
  interaction: ChatInputCommandInteraction,
  fallback: FallbackHandler,
): Promise<void> {
  const rawMessage = interaction.options.getString('message', true);
  const message = sanitizeInput(rawMessage);
  if (!message) {
    await interaction.reply({ content: 'Your message was empty after cleanup. Try again?', ephemeral: true });
    return;
  }

  // Jailbreak detection
  const jailbreakMatch = detectJailbreak(message);
  if (jailbreakMatch) {
    console.warn(`[Jailbreak] Discord user ${interaction.user.id} attempted: ${jailbreakMatch}`);
    await interaction.reply({
      content: "Haha, nice try! I'm a KIN companion -- I stay in character because that's who I am. What can I actually help you with?",
    });
    return;
  }

  // Defer reply while we generate (can take a few seconds)
  await interaction.deferReply();

  const userId = interaction.user.id;
  const userName = interaction.user.displayName ?? interaction.user.username;
  const session = getSession(userId);

  // Track activity for progress/gamification (fire-and-forget per K013)
  recordActivity(userId);

  try {
    const response = await runInferencePipeline(userId, userName, message, session, fallback);
    const chunks = splitMessage(response);

    await interaction.editReply(chunks[0]!);
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(chunks[i]!);
    }
  } catch (error) {
    console.error('[discord] Error handling /chat:', error);
    await interaction.editReply(randomErrorMessage());
  }
}

/**
 * Handle /companion slash command.
 */
async function handleCompanionCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const name = interaction.options.getString('name', true).toLowerCase();
  const available = getAvailableCompanions();

  if (!available.includes(name)) {
    await interaction.reply({
      content: `Unknown companion \`${name}\`. Available: ${available.join(', ')}`,
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  const session = getSession(userId);
  const previousCompanion = session.companionId;
  session.companionId = name;

  const companionNames: Record<string, string> = {
    cipher: 'Cipher the Code Kraken',
    mischief: 'Mischief the Glitch Pup',
    vortex: 'Vortex the Teal Dragon',
    forge: 'Forge the Cyber Unicorn',
    aether: 'Aether the Frost Ape',
    catalyst: 'Catalyst the Cosmic Blob',
  };

  const displayName = companionNames[name] ?? name;

  await interaction.reply(
    `Switched from **${companionNames[previousCompanion] ?? previousCompanion}** to **${displayName}**! Say hello.`,
  );
}

/**
 * Handle /status slash command.
 */
async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const session = getSession(userId);
  const messageCount = await conversationStore.getMessageCount(userId, session.companionId);

  const companionNames: Record<string, string> = {
    cipher: 'Cipher',
    mischief: 'Mischief',
    vortex: 'Vortex',
    forge: 'Forge',
    aether: 'Aether',
    catalyst: 'Catalyst',
  };

  const lines = [
    '**KIN Session Status**',
    '',
    `**Companion:** ${companionNames[session.companionId] ?? session.companionId}`,
    `**Tier:** ${session.tier}`,
    `**Messages:** ${messageCount}`,
    `**Last active:** ${session.lastActivity.toLocaleString()}`,
  ];

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}

// ============================================================================
// DM Security Command Handlers
// ============================================================================

/**
 * Handle /approve slash command. Owner-only — approves a pending pairing code.
 */
async function handleApproveCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  if (!isOwner('discord', userId)) {
    await interaction.reply({ content: 'Only the bot owner can approve senders.', ephemeral: true });
    return;
  }

  const code = interaction.options.getString('code', true);
  const db = getDb();
  const pendingCodes = getPendingCodes(db, 'discord');
  const match = pendingCodes.find((p) => p.code === code);

  if (!match) {
    await interaction.reply({
      content: `No pending pairing code matches "${code}". Use /pending to see active codes.`,
      ephemeral: true,
    });
    return;
  }

  if (!validatePairingCode(db, 'discord', match.senderId, code)) {
    await interaction.reply({
      content: 'That pairing code has expired or already been used.',
      ephemeral: true,
    });
    return;
  }

  approveSender(db, 'discord', match.senderId, userId, match.displayName ?? undefined);

  // Notify the approved sender via DM
  try {
    const approvedUser = await interaction.client.users.fetch(match.senderId);
    await approvedUser.send("You've been approved! You can now chat with me freely. Say hi!");
  } catch {
    // Non-critical — user may have DMs disabled
    console.warn(`[discord][dm-security] Could not DM approved user ${match.senderId}`);
  }

  await interaction.reply({
    content: `Approved **${match.displayName ?? match.senderId}** (${match.senderId}). They can now chat with the bot.`,
    ephemeral: true,
  });
}

/**
 * Handle /deny slash command. Owner-only — denies a pending pairing code.
 */
async function handleDenyCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  if (!isOwner('discord', userId)) {
    await interaction.reply({ content: 'Only the bot owner can deny senders.', ephemeral: true });
    return;
  }

  const code = interaction.options.getString('code', true);
  const db = getDb();
  const pendingCodes = getPendingCodes(db, 'discord');
  const match = pendingCodes.find((p) => p.code === code);

  if (!match) {
    await interaction.reply({
      content: `No pending pairing code matches "${code}". Use /pending to see active codes.`,
      ephemeral: true,
    });
    return;
  }

  denySender(db, 'discord', match.senderId);

  // Notify the denied sender via DM
  try {
    const deniedUser = await interaction.client.users.fetch(match.senderId);
    await deniedUser.send('Sorry, the bot owner has denied your access request.');
  } catch {
    console.warn(`[discord][dm-security] Could not DM denied user ${match.senderId}`);
  }

  await interaction.reply({
    content: `Denied **${match.displayName ?? match.senderId}** (${match.senderId}).`,
    ephemeral: true,
  });
}

/**
 * Handle /pending slash command. Owner-only — lists all pending pairing codes.
 */
async function handlePendingCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  if (!isOwner('discord', userId)) {
    await interaction.reply({ content: 'Only the bot owner can view pending codes.', ephemeral: true });
    return;
  }

  const db = getDb();
  const codes = getPendingCodes(db, 'discord');

  if (codes.length === 0) {
    await interaction.reply({ content: 'No pending pairing codes.', ephemeral: true });
    return;
  }

  const lines = codes.map((c) => {
    const name = c.displayName ?? 'Unknown';
    const mins = Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 60000));
    return `• **${c.code}** — ${name} (${c.senderId}), expires in ~${mins}min`;
  });

  await interaction.reply({
    content: `**Pending Pairing Codes**\n\n${lines.join('\n')}\n\nUse \`/approve code:<code>\` or \`/deny code:<code>\``,
    ephemeral: true,
  });
}

// ============================================================================
// DM & Mention Handler
// ============================================================================

/**
 * Handle direct messages and @mentions in guild channels.
 */
async function handleMessage(
  message: DiscordMessage,
  client: Client,
  fallback: FallbackHandler,
): Promise<void> {
  // Ignore messages from bots (including self)
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user!.id);

  // Only respond in DMs or when @mentioned in a guild
  if (!isDM && !isMentioned) return;

  // ── DM Security Guard (DMs only, not guild @mentions) ──────────
  if (isDM) {
    const senderId = message.author.id;
    if (!isOwner('discord', senderId) && !isAuthorized(getDb(), 'discord', senderId)) {
      const displayName = message.author.displayName ?? message.author.username;
      const code = generatePairingCode(getDb(), 'discord', senderId, displayName);
      await message.reply(
        `Hey! I don't recognize you yet. Your pairing code is: **${code}**\n\nAsk my owner to approve you with:\n\`/approve code:${code}\``,
      );
      console.log(`[discord][dm-security] Blocked unknown sender ${senderId}, issued pairing code ${code}`);
      return;
    }
  }

  // Extract the text content (strip the bot mention if present)
  let rawContent = message.content;
  if (isMentioned && client.user) {
    rawContent = rawContent.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  }

  const content = sanitizeInput(rawContent);
  if (!content) return;

  // Jailbreak detection
  const jailbreakMatch = detectJailbreak(content);
  if (jailbreakMatch) {
    console.warn(`[Jailbreak] Discord user ${message.author.id} attempted: ${jailbreakMatch}`);
    await message.reply(
      "Haha, nice try! I'm a KIN companion -- I stay in character because that's who I am. What can I actually help you with?",
    );
    return;
  }

  // Rate limit check
  const userId = message.author.id;
  const rl = checkRateLimit(userId, 'chat', RATE_LIMITS.chat.maxRequests, RATE_LIMITS.chat.windowMs);
  if (!rl.allowed) {
    const mins = Math.ceil(rl.resetInMs / 60000);
    await message.reply(
      `You've been chatting a lot! Take a breather -- I'll be ready again in ~${mins} min.`,
    );
    return;
  }

  const userName = message.author.displayName ?? message.author.username;
  const session = getSession(userId);

  // Track activity for progress/gamification (fire-and-forget per K013)
  recordActivity(userId);

  // Typing indicator — refreshes every 8s (Discord typing expires ~10s).
  // PartialGroupDMChannel lacks sendTyping — use no-op showFn when unavailable.
  const hasTyping = 'sendTyping' in message.channel;
  const typing = createTypingIndicator({
    showFn: hasTyping
      ? async () => { await (message.channel as any).sendTyping(); }
      : async () => {},
    intervalMs: 8000,
  });

  typing.start();
  try {
    const response = await runInferencePipeline(userId, userName, content, session, fallback);
    const chunks = splitMessage(response);

    // Guild @mentions: respond in a thread to avoid channel noise
    if (!isDM) {
      try {
        const thread = await message.startThread({ name: `KIN: ${userName}` });
        for (const chunk of chunks) {
          await thread.send(chunk);
        }
        return;
      } catch (threadErr) {
        // Thread creation failed (permissions, etc.) — fall back to regular reply
        console.warn('[discord] Thread creation failed, falling back to reply:', threadErr);
      }
    }

    // DMs or thread-creation fallback: reply directly
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (error) {
    console.error('[discord] Error handling message:', error);
    await message.reply(randomErrorMessage());
  } finally {
    typing.stop();
  }
}

// ============================================================================
// Slash Command Registration
// ============================================================================

/**
 * Register slash commands with the Discord API.
 * Called once at startup to sync command definitions.
 */
async function registerCommands(config: DiscordBotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);

  const commandData = slashCommands.map((cmd) => cmd.toJSON());

  console.log('[discord] Registering slash commands...');
  await rest.put(Routes.applicationCommands(config.clientId), { body: commandData });
  console.log('[discord] Slash commands registered.');
}

// ============================================================================
// Bot Factory
// ============================================================================

/**
 * Create and configure the KIN Discord bot.
 *
 * Returns the Discord.js Client instance. Call `client.login(token)` to
 * connect, or use the returned `start()` helper for the full lifecycle.
 */
export function createDiscordBot(config: DiscordBotConfig) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  // Initialize fallback handler -- auto-detect best available provider
  const fallback = new FallbackHandler(
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

  // ==========================================================================
  // Event: Ready
  // ==========================================================================

  client.once(Events.ClientReady, (readyClient: any) => {
    console.log(`[discord] Logged in as ${readyClient.user.tag}`);
    console.log(`[discord] Serving ${readyClient.guilds.cache.size} guild(s)`);

    // Set bot presence — visible in member list as "Playing /chat to start"
    try {
      readyClient.user.setPresence({
        activities: [{ name: '/chat to start', type: ActivityType.Custom }],
        status: 'online',
      });
    } catch {
      // Non-critical — presence is cosmetic
      console.warn('[discord] Failed to set bot presence');
    }
  });

  // ==========================================================================
  // Event: Slash Command Interactions
  // ==========================================================================

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      switch (interaction.commandName) {
        case 'chat':
          await handleChatCommand(interaction, fallback);
          break;
        case 'companion':
          await handleCompanionCommand(interaction);
          break;
        case 'status':
          await handleStatusCommand(interaction);
          break;
        case 'approve':
          await handleApproveCommand(interaction);
          break;
        case 'deny':
          await handleDenyCommand(interaction);
          break;
        case 'pending':
          await handlePendingCommand(interaction);
          break;
        default:
          await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      }
    } catch (error) {
      console.error(`[discord] Error handling /${interaction.commandName}:`, error);
      const replyFn = interaction.deferred || interaction.replied
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);
      try {
        await replyFn({ content: randomErrorMessage() });
      } catch {
        // Last resort -- interaction may have expired
        console.error('[discord] Failed to send error reply.');
      }
    }
  });

  // ==========================================================================
  // Event: Direct Messages & @Mentions
  // ==========================================================================

  client.on(Events.MessageCreate, async (message: DiscordMessage) => {
    await handleMessage(message, client, fallback);
  });

  // ==========================================================================
  // Event: Warn / Error Logging
  // ==========================================================================

  client.on(Events.Warn, (warning: any) => {
    console.warn('[discord] Warning:', warning);
  });

  client.on(Events.Error, (error: any) => {
    console.error('[discord] Client error:', error);
  });

  // ==========================================================================
  // Lifecycle Helpers
  // ==========================================================================

  /**
   * Register slash commands and connect to Discord.
   */
  async function start(): Promise<Client> {
    await registerCommands(config);
    await client.login(config.token);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[discord] Shutting down KIN Discord bot...');
      client.destroy();
      conversationStore.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return client;
  }

  return { client, start };
}

// ============================================================================
// Auto-start when run directly
// ============================================================================

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token) {
    console.error('DISCORD_BOT_TOKEN not set. Create one at https://discord.com/developers/applications');
    process.exit(1);
  }
  if (!clientId) {
    console.error('DISCORD_CLIENT_ID not set. Find it in your Discord application settings.');
    process.exit(1);
  }

  const { start } = createDiscordBot({ token, clientId });
  start();
}

export default createDiscordBot;

// ============================================================================
// Named Exports for Testability (K010)
// ============================================================================

export {
  // Command handlers
  handleChatCommand,
  handleMessage,
  handleCompanionCommand,
  handleStatusCommand,
  handleApproveCommand,
  handleDenyCommand,
  handlePendingCommand,
  // Core pipeline
  runInferencePipeline,
  // Session management
  getSession,
  sessions,
  // Helpers
  splitMessage,
  randomErrorMessage,
  // Constants & data
  CIPHER_ERROR_MESSAGES,
  slashCommands,
  // Skill router instance
  skillRouter,
};

export type { UserSession, DiscordBotConfig };
