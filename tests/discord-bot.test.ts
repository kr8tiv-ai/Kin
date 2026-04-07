/**
 * Discord Bot Unit Tests
 *
 * Comprehensive test suite for bot/discord-bot.ts handler functions.
 * All external dependencies are mocked — no real Discord connection,
 * no real DB, no real inference.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// Mocks — must be declared before the import of the module under test
// ============================================================================

// --- discord.js ---
vi.mock('discord.js', () => {
  const createMockOption = () => {
    const opt: any = {};
    opt.setName = vi.fn(() => opt);
    opt.setDescription = vi.fn(() => opt);
    opt.setRequired = vi.fn(() => opt);
    opt.addChoices = vi.fn((..._args: any[]) => opt);
    return opt;
  };

  const createMockBuilder = () => {
    const builder: any = {};
    builder.setName = vi.fn(() => builder);
    builder.setDescription = vi.fn(() => builder);
    builder.addStringOption = vi.fn((fn: Function) => {
      fn(createMockOption());
      return builder;
    });
    builder.toJSON = vi.fn(() => ({}));
    return builder;
  };

  return {
    Client: vi.fn().mockImplementation(() => ({
      user: { id: 'bot-user-id', tag: 'KINBot#1234' },
      guilds: { cache: { size: 3 } },
      login: vi.fn(async () => 'token'),
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    })),
    REST: vi.fn().mockImplementation(() => {
      const rest: any = {};
      rest.setToken = vi.fn(() => rest);
      rest.put = vi.fn(async () => ({}));
      return rest;
    }),
    Routes: {
      applicationCommands: vi.fn(() => '/api/commands'),
    },
    SlashCommandBuilder: vi.fn().mockImplementation(() => createMockBuilder()),
    Events: {
      ClientReady: 'ready',
      InteractionCreate: 'interactionCreate',
      MessageCreate: 'messageCreate',
      Warn: 'warn',
      Error: 'error',
    },
    ChannelType: {
      DM: 1,
      GuildText: 0,
    },
    Partials: {
      Channel: 0,
      Message: 1,
    },
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      DirectMessages: 4,
      MessageContent: 8,
    },
    ActivityType: {
      Custom: 4,
      Playing: 0,
      Streaming: 1,
      Listening: 2,
      Watching: 3,
    },
  };
});

// --- Companion prompts ---
vi.mock('../inference/companion-prompts.js', () => ({
  buildCompanionPrompt: vi.fn(() => 'SYSTEM_PROMPT'),
  getAvailableCompanions: vi.fn(() => ['cipher', 'mischief', 'vortex', 'forge', 'aether', 'catalyst']),
}));

// --- Fallback handler ---
vi.mock('../inference/fallback-handler.js', () => ({
  FallbackHandler: vi.fn().mockImplementation(() => ({})),
}));

// --- Supervisor ---
vi.mock('../inference/supervisor.js', () => ({
  supervisedChat: vi.fn(async () => ({
    content: 'Bot response',
    route: 'frontier',
    supervisorUsed: true,
    latencyMs: 100,
    companionId: 'cipher',
  })),
}));

// --- Conversation store ---
vi.mock('../bot/memory/conversation-store.js', () => ({
  conversationStore: {
    getHistory: vi.fn(async () => []),
    addMessage: vi.fn(async () => 'msg-123'),
    clearHistory: vi.fn(async () => {}),
    getMessageCount: vi.fn(() => 42),
    getMemories: vi.fn(async () => []),
    close: vi.fn(),
  },
}));

// --- Sanitize ---
vi.mock('../bot/utils/sanitize.js', () => ({
  sanitizeInput: vi.fn((text: string) => text?.trim() ?? ''),
  detectJailbreak: vi.fn(() => null),
}));

// --- Rate limit ---
vi.mock('../bot/utils/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 59, resetInMs: 3600000 })),
  RATE_LIMITS: {
    chat: { maxRequests: 60, windowMs: 3600000 },
  },
}));

// --- Language ---
vi.mock('../bot/utils/language.js', () => ({
  detectLanguage: vi.fn(() => 'en'),
  getLanguagePromptAddition: vi.fn(() => ''),
}));

// --- Skills ---
vi.mock('../bot/skills/index.js', () => {
  const mockRouter = {
    matchSkill: vi.fn(() => null),
    executeSkill: vi.fn(async () => ({ content: 'Skill result', type: 'text' })),
    registerSkill: vi.fn(),
  };
  return {
    createSkillRouter: vi.fn(() => mockRouter),
    registerCompanionAbilities: vi.fn(),
    __mockRouter: mockRouter,
  };
});

// --- Progress ---
vi.mock('../bot/handlers/progress.js', () => ({
  recordActivity: vi.fn(),
}));

// --- DB ---
const mockDb = { prepare: vi.fn() };
vi.mock('../db/connection.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

// --- DM security ---
vi.mock('../bot/utils/dm-security.js', () => ({
  isAuthorized: vi.fn(() => true),
  isOwner: vi.fn(() => false),
  generatePairingCode: vi.fn(() => '123456'),
  validatePairingCode: vi.fn(() => true),
  approveSender: vi.fn(),
  denySender: vi.fn(),
  getPendingCodes: vi.fn(() => []),
}));

// ============================================================================
// Import module under test (after all mocks)
// ============================================================================

import {
  createDiscordBot,
  handleChatCommand,
  handleMessage,
  handleCompanionCommand,
  handleStatusCommand,
  handleApproveCommand,
  handleDenyCommand,
  handlePendingCommand,
  runInferencePipeline,
  getSession,
  sessions,
  splitMessage,
  randomErrorMessage,
  CIPHER_ERROR_MESSAGES,
} from '../bot/discord-bot.js';

import { conversationStore } from '../bot/memory/conversation-store.js';
import { supervisedChat } from '../inference/supervisor.js';
import { sanitizeInput, detectJailbreak } from '../bot/utils/sanitize.js';
import { checkRateLimit } from '../bot/utils/rate-limit.js';
import { buildCompanionPrompt } from '../inference/companion-prompts.js';
import { detectLanguage, getLanguagePromptAddition } from '../bot/utils/language.js';
import { recordActivity } from '../bot/handlers/progress.js';
import {
  isAuthorized,
  isOwner,
  generatePairingCode,
  validatePairingCode,
  approveSender,
  denySender,
  getPendingCodes,
} from '../bot/utils/dm-security.js';
import { ChannelType } from 'discord.js';

// Access internal mock router for skill tests
const skillsMod = await import('../bot/skills/index.js') as any;
const mockSkillRouter = skillsMod.__mockRouter;

// ============================================================================
// Test Helpers
// ============================================================================

function createMockInteraction(overrides: Record<string, any> = {}) {
  const mockUserSend = vi.fn(async () => {});
  const interaction: any = {
    user: { id: 'user-123', displayName: 'TestUser', username: 'testuser' },
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'message') return 'Hello bot';
        if (name === 'name') return 'cipher';
        if (name === 'code') return '123456';
        return null;
      }),
    },
    reply: vi.fn(async () => {}),
    editReply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    deferReply: vi.fn(async () => {}),
    deferred: false,
    replied: false,
    commandName: 'chat',
    isChatInputCommand: () => true,
    client: {
      users: {
        fetch: vi.fn(async () => ({ send: mockUserSend })),
      },
    },
    ...overrides,
  };
  return interaction;
}

function createMockMessage(overrides: Record<string, any> = {}) {
  const threadSend = vi.fn(async () => {});
  const message: any = {
    author: { id: 'user-123', bot: false, displayName: 'TestUser', username: 'testuser' },
    content: 'Hello bot',
    channel: { type: ChannelType.DM, sendTyping: vi.fn(async () => {}) },
    mentions: { has: vi.fn(() => false) },
    reply: vi.fn(async () => {}),
    startThread: vi.fn(async () => ({ send: threadSend })),
    ...overrides,
  };
  return message;
}

function createMockClient() {
  return { user: { id: 'bot-user-id' } } as any;
}

function createMockFallback() {
  return {} as any;
}

// ============================================================================
// Tests
// ============================================================================

describe('getSession', () => {
  beforeEach(() => {
    sessions.clear();
  });

  it('creates a new session with default cipher companion', () => {
    const session = getSession('user-123');
    expect(session.userId).toBe('user-123');
    expect(session.companionId).toBe('cipher');
    expect(session.tier).toBe('free');
  });

  it('returns the same session on subsequent calls', () => {
    const s1 = getSession('user-123');
    s1.companionId = 'forge';
    const s2 = getSession('user-123');
    expect(s2.companionId).toBe('forge');
    expect(s2).toBe(s1);
  });

  it('updates lastActivity on each access', () => {
    const s1 = getSession('user-123');
    const firstAccess = s1.lastActivity;
    const s2 = getSession('user-123');
    expect(s2.lastActivity.getTime()).toBeGreaterThanOrEqual(firstAccess.getTime());
  });
});

describe('splitMessage', () => {
  it('returns single chunk for short message', () => {
    expect(splitMessage('Hello')).toEqual(['Hello']);
  });

  it('splits long message at 2000 chars', () => {
    const long = 'a'.repeat(3000);
    const chunks = splitMessage(long);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(2000);
    expect(chunks[1]!.length).toBe(1000);
  });

  it('splits on newline boundaries when possible', () => {
    // 30 lines of 100 chars each + 29 newlines = 3029 chars
    const lines = Array(30).fill('x'.repeat(100)).join('\n');
    const chunks = splitMessage(lines);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.length).toBeLessThanOrEqual(2000);
    // First chunk should end at a newline boundary (not mid-line)
    expect(chunks[0]!.endsWith('x'.repeat(100))).toBe(true);
  });

  it('hard splits at 2000 when no newlines present', () => {
    const noNewlines = 'x'.repeat(4500);
    const chunks = splitMessage(noNewlines);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(2000);
    expect(chunks[1]!.length).toBe(2000);
    expect(chunks[2]!.length).toBe(500);
  });
});

describe('randomErrorMessage', () => {
  it('returns one of the CIPHER_ERROR_MESSAGES', () => {
    const msg = randomErrorMessage();
    expect(CIPHER_ERROR_MESSAGES).toContain(msg);
  });
});

describe('runInferencePipeline', () => {
  const fallback = createMockFallback();

  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (supervisedChat as Mock).mockResolvedValue({
      content: 'Bot response',
      route: 'frontier',
    });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    (detectLanguage as Mock).mockReturnValue('en');
    (getLanguagePromptAddition as Mock).mockReturnValue('');
    mockSkillRouter.matchSkill.mockReturnValue(null);
  });

  it('returns inference response on happy path', async () => {
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    const result = await runInferencePipeline('user-123', 'TestUser', 'Hello', session, fallback);
    expect(result).toBe('Bot response');
    expect(supervisedChat).toHaveBeenCalled();
  });

  it('stores user and assistant messages in conversation history', async () => {
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    await runInferencePipeline('user-123', 'TestUser', 'Hello', session, fallback);
    expect(conversationStore.addMessage).toHaveBeenCalledWith('user-123', 'user', 'Hello', 'cipher');
    expect(conversationStore.addMessage).toHaveBeenCalledWith('user-123', 'assistant', 'Bot response', 'cipher');
  });

  it('returns rate limit message when rate limited', async () => {
    (checkRateLimit as Mock).mockReturnValue({ allowed: false, remaining: 0, resetInMs: 120000 });
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    const result = await runInferencePipeline('user-123', 'TestUser', 'Hello', session, fallback);
    expect(result).toContain('breather');
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('includes language prompt addition in system message', async () => {
    (detectLanguage as Mock).mockReturnValue('es');
    (getLanguagePromptAddition as Mock).mockReturnValue('\n[Respond in Spanish]');
    (buildCompanionPrompt as Mock).mockReturnValue('BASE_PROMPT');
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    await runInferencePipeline('user-123', 'TestUser', 'Hola', session, fallback);
    const callArgs = (supervisedChat as Mock).mock.calls[0];
    const messages = callArgs[0];
    const systemMsg = messages.find((m: any) => m.role === 'system');
    expect(systemMsg.content).toBe('BASE_PROMPT\n[Respond in Spanish]');
  });

  it('routes through skill when skill matches', async () => {
    mockSkillRouter.matchSkill.mockReturnValue({ name: 'weather', triggers: ['weather'] });
    mockSkillRouter.executeSkill.mockResolvedValue({ content: 'Sunny', type: 'text' });
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    const result = await runInferencePipeline('user-123', 'TestUser', 'weather in London', session, fallback);
    expect(result).toBe('Sunny');
    expect(supervisedChat).not.toHaveBeenCalled();
    expect(conversationStore.addMessage).toHaveBeenCalledWith('user-123', 'user', 'weather in London', 'cipher');
    expect(conversationStore.addMessage).toHaveBeenCalledWith('user-123', 'assistant', 'Sunny', 'cipher');
  });

  it('falls through to LLM when skill returns error', async () => {
    mockSkillRouter.matchSkill.mockReturnValue({ name: 'weather', triggers: ['weather'] });
    mockSkillRouter.executeSkill.mockResolvedValue({ content: 'Failed', type: 'error' });
    const session: any = { userId: 'user-123', companionId: 'cipher', tier: 'free', lastActivity: new Date() };
    const result = await runInferencePipeline('user-123', 'TestUser', 'weather', session, fallback);
    expect(supervisedChat).toHaveBeenCalled();
    expect(result).toBe('Bot response');
  });
});

describe('handleChatCommand', () => {
  const fallback = createMockFallback();

  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    (sanitizeInput as Mock).mockImplementation((t: string) => t?.trim() ?? '');
    (detectJailbreak as Mock).mockReturnValue(null);
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (supervisedChat as Mock).mockResolvedValue({
      content: 'Bot response',
      route: 'frontier',
    });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    (detectLanguage as Mock).mockReturnValue('en');
    (getLanguagePromptAddition as Mock).mockReturnValue('');
    mockSkillRouter.matchSkill.mockReturnValue(null);
  });

  it('defers and responds with inference result on happy path', async () => {
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith('Bot response');
  });

  it('returns ephemeral error when sanitized message is empty', async () => {
    (sanitizeInput as Mock).mockReturnValue('');
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('empty'), ephemeral: true }),
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('returns jailbreak warning without calling inference', async () => {
    (detectJailbreak as Mock).mockReturnValue('ignore previous');
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('nice try') }),
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('returns Cipher error message when inference throws', async () => {
    (supervisedChat as Mock).mockRejectedValue(new Error('LLM down'));
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    const errorMsg = interaction.editReply.mock.calls[0][0];
    expect(CIPHER_ERROR_MESSAGES).toContain(errorMsg);
  });

  it('calls recordActivity with the user ID', async () => {
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    expect(recordActivity).toHaveBeenCalledWith('user-123');
  });

  it('splits long response into editReply + followUp', async () => {
    (supervisedChat as Mock).mockResolvedValue({
      content: 'a'.repeat(3000),
      route: 'frontier',
    });
    const interaction = createMockInteraction();
    await handleChatCommand(interaction, fallback);
    expect(interaction.editReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalled();
  });
});

describe('handleCompanionCommand', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  it('switches companion to the specified name', async () => {
    const interaction = createMockInteraction({
      options: { getString: vi.fn(() => 'forge') },
    });
    await handleCompanionCommand(interaction);
    const session = getSession('user-123');
    expect(session.companionId).toBe('forge');
  });

  it('returns ephemeral error for unknown companion', async () => {
    const interaction = createMockInteraction({
      options: { getString: vi.fn(() => 'invalidbot') },
    });
    await handleCompanionCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Unknown companion'),
        ephemeral: true,
      }),
    );
  });

  it('displays switch message with both old and new companion names', async () => {
    // Start with cipher (default)
    getSession('user-123');
    const interaction = createMockInteraction({
      options: { getString: vi.fn(() => 'forge') },
    });
    await handleCompanionCommand(interaction);
    const replyContent = interaction.reply.mock.calls[0][0];
    expect(replyContent).toContain('Cipher');
    expect(replyContent).toContain('Forge');
  });
});

describe('handleStatusCommand', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    (conversationStore.getMessageCount as Mock).mockReturnValue(42);
  });

  it('returns formatted status with companion, tier, and messages', async () => {
    const interaction = createMockInteraction();
    await handleStatusCommand(interaction);
    const content = interaction.reply.mock.calls[0][0].content;
    expect(content).toContain('Cipher');
    expect(content).toContain('free');
    expect(content).toContain('42');
  });

  it('uses ephemeral reply', async () => {
    const interaction = createMockInteraction();
    await handleStatusCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
  });
});

describe('handleMessage', () => {
  let client: ReturnType<typeof createMockClient>;
  const fallback = createMockFallback();

  beforeEach(() => {
    sessions.clear();
    client = createMockClient();
    vi.clearAllMocks();
    (sanitizeInput as Mock).mockImplementation((t: string) => t?.trim() ?? '');
    (detectJailbreak as Mock).mockReturnValue(null);
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (supervisedChat as Mock).mockResolvedValue({
      content: 'Bot response',
      route: 'frontier',
    });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    (detectLanguage as Mock).mockReturnValue('en');
    (getLanguagePromptAddition as Mock).mockReturnValue('');
    (isAuthorized as Mock).mockReturnValue(true);
    (isOwner as Mock).mockReturnValue(false);
    mockSkillRouter.matchSkill.mockReturnValue(null);
  });

  it('ignores messages from bots', async () => {
    const msg = createMockMessage({
      author: { id: 'bot', bot: true, displayName: 'Bot', username: 'bot' },
    });
    await handleMessage(msg, client, fallback);
    expect(supervisedChat).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('ignores messages that are not DM and not @mention', async () => {
    const msg = createMockMessage({
      channel: { type: ChannelType.GuildText, sendTyping: vi.fn() },
      mentions: { has: vi.fn(() => false) },
    });
    await handleMessage(msg, client, fallback);
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('responds to DM from authorized user', async () => {
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith('Bot response');
  });

  it('sends pairing code to DM from unauthorized user', async () => {
    (isOwner as Mock).mockReturnValue(false);
    (isAuthorized as Mock).mockReturnValue(false);
    (generatePairingCode as Mock).mockReturnValue('654321');
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('654321'));
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('pairing code'));
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('creates thread for guild @mention and responds in thread', async () => {
    const threadSend = vi.fn(async () => {});
    const msg = createMockMessage({
      content: '<@bot-user-id> Hello there',
      channel: { type: ChannelType.GuildText, sendTyping: vi.fn() },
      mentions: { has: vi.fn(() => true) },
      startThread: vi.fn(async () => ({ send: threadSend })),
    });
    await handleMessage(msg, client, fallback);
    expect(msg.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringContaining('KIN') }),
    );
    expect(threadSend).toHaveBeenCalledWith('Bot response');
    // Should NOT call message.reply since thread was used
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('falls back to reply when thread creation fails', async () => {
    const msg = createMockMessage({
      content: '<@bot-user-id> Hello',
      channel: { type: ChannelType.GuildText, sendTyping: vi.fn() },
      mentions: { has: vi.fn(() => true) },
      startThread: vi.fn(async () => { throw new Error('No thread permission'); }),
    });
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith('Bot response');
  });

  it('sends typing indicator in DMs', async () => {
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(msg.channel.sendTyping).toHaveBeenCalled();
  });

  it('returns jailbreak warning without inference', async () => {
    (detectJailbreak as Mock).mockReturnValue('ignore previous');
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('nice try'));
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('returns rate limit cooldown message', async () => {
    (checkRateLimit as Mock).mockReturnValue({ allowed: false, remaining: 0, resetInMs: 120000 });
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith(expect.stringContaining('breather'));
    expect(supervisedChat).not.toHaveBeenCalled();
  });

  it('ignores empty sanitized message', async () => {
    (sanitizeInput as Mock).mockReturnValue('');
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(supervisedChat).not.toHaveBeenCalled();
    expect(msg.reply).not.toHaveBeenCalled();
  });

  it('strips bot mention from message content', async () => {
    const msg = createMockMessage({
      content: '<@bot-user-id> Hello there',
      channel: { type: ChannelType.GuildText, sendTyping: vi.fn() },
      mentions: { has: vi.fn(() => true) },
      startThread: vi.fn(async () => { throw new Error('No permission'); }),
    });
    await handleMessage(msg, client, fallback);
    // sanitizeInput should receive the stripped content
    expect(sanitizeInput).toHaveBeenCalledWith('Hello there');
  });

  it('calls recordActivity for authorized DM user', async () => {
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(recordActivity).toHaveBeenCalledWith('user-123');
  });

  it('sends Cipher error message when inference throws', async () => {
    (supervisedChat as Mock).mockRejectedValue(new Error('LLM down'));
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    const sentText = msg.reply.mock.calls[0][0];
    expect(CIPHER_ERROR_MESSAGES).toContain(sentText);
  });
});

describe('handleApproveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isOwner as Mock).mockReturnValue(false);
  });

  it('rejects non-owner', async () => {
    const interaction = createMockInteraction();
    await handleApproveCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('owner'), ephemeral: true }),
    );
    expect(approveSender).not.toHaveBeenCalled();
  });

  it('approves valid pending code and notifies sender', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([
      { code: '123456', senderId: 'sender-1', displayName: 'Alice', expiresAt: Date.now() + 600000 },
    ]);
    (validatePairingCode as Mock).mockReturnValue(true);
    const interaction = createMockInteraction();
    await handleApproveCommand(interaction);
    expect(approveSender).toHaveBeenCalledWith(
      expect.anything(), 'discord', 'sender-1', 'user-123', 'Alice',
    );
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Approved'), ephemeral: true }),
    );
    // Should attempt to DM the approved user
    expect(interaction.client.users.fetch).toHaveBeenCalledWith('sender-1');
  });

  it('returns error for unmatched code', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([]);
    const interaction = createMockInteraction();
    await handleApproveCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No pending'), ephemeral: true }),
    );
  });

  it('returns error for expired code', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([
      { code: '123456', senderId: 'sender-1', displayName: 'Alice', expiresAt: Date.now() + 600000 },
    ]);
    (validatePairingCode as Mock).mockReturnValue(false);
    const interaction = createMockInteraction();
    await handleApproveCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('expired'), ephemeral: true }),
    );
    expect(approveSender).not.toHaveBeenCalled();
  });
});

describe('handleDenyCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isOwner as Mock).mockReturnValue(false);
  });

  it('rejects non-owner', async () => {
    const interaction = createMockInteraction();
    await handleDenyCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('owner'), ephemeral: true }),
    );
    expect(denySender).not.toHaveBeenCalled();
  });

  it('denies valid pending code and notifies sender', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([
      { code: '123456', senderId: 'sender-2', displayName: 'Bob', expiresAt: Date.now() + 600000 },
    ]);
    const interaction = createMockInteraction();
    await handleDenyCommand(interaction);
    expect(denySender).toHaveBeenCalledWith(expect.anything(), 'discord', 'sender-2');
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Denied'), ephemeral: true }),
    );
    expect(interaction.client.users.fetch).toHaveBeenCalledWith('sender-2');
  });

  it('returns error for unmatched code', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([]);
    const interaction = createMockInteraction();
    await handleDenyCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No pending'), ephemeral: true }),
    );
  });
});

describe('handlePendingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isOwner as Mock).mockReturnValue(false);
  });

  it('rejects non-owner', async () => {
    const interaction = createMockInteraction();
    await handlePendingCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('owner'), ephemeral: true }),
    );
  });

  it('shows "no pending" when list is empty', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([]);
    const interaction = createMockInteraction();
    await handlePendingCommand(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No pending'), ephemeral: true }),
    );
  });

  it('lists pending codes with details', async () => {
    (isOwner as Mock).mockReturnValue(true);
    (getPendingCodes as Mock).mockReturnValue([
      { code: '111111', senderId: 's1', displayName: 'Carol', expiresAt: Date.now() + 300000 },
      { code: '222222', senderId: 's2', displayName: null, expiresAt: Date.now() + 600000 },
    ]);
    const interaction = createMockInteraction();
    await handlePendingCommand(interaction);
    const content = interaction.reply.mock.calls[0][0].content;
    expect(content).toContain('111111');
    expect(content).toContain('Carol');
    expect(content).toContain('222222');
    expect(content).toContain('/approve');
  });
});

describe('createDiscordBot', () => {
  it('returns an object with client and start function', () => {
    const bot = createDiscordBot({ token: 'test-token', clientId: 'test-client-id' });
    expect(bot).toHaveProperty('client');
    expect(bot).toHaveProperty('start');
    expect(typeof bot.start).toBe('function');
  });

  it('registers event handlers on the client', () => {
    const bot = createDiscordBot({ token: 'test-token', clientId: 'test-client-id' });
    // The client should have had .once and .on called for event registration
    expect(bot.client.once).toHaveBeenCalled();
    expect(bot.client.on).toHaveBeenCalled();
  });
});

describe('companion-ID tracking across operations', () => {
  const fallback = createMockFallback();
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    sessions.clear();
    client = createMockClient();
    vi.clearAllMocks();
    (sanitizeInput as Mock).mockImplementation((t: string) => t?.trim() ?? '');
    (detectJailbreak as Mock).mockReturnValue(null);
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (supervisedChat as Mock).mockResolvedValue({
      content: 'Forge response',
      route: 'frontier',
    });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    (detectLanguage as Mock).mockReturnValue('en');
    (getLanguagePromptAddition as Mock).mockReturnValue('');
    (isAuthorized as Mock).mockReturnValue(true);
    (isOwner as Mock).mockReturnValue(false);
    mockSkillRouter.matchSkill.mockReturnValue(null);
  });

  it('switch then DM uses the switched companionId', async () => {
    // Switch to forge via command handler
    const switchInteraction = createMockInteraction({
      options: { getString: vi.fn(() => 'forge') },
    });
    await handleCompanionCommand(switchInteraction);
    vi.clearAllMocks();
    // Reset mocks that were cleared
    (supervisedChat as Mock).mockResolvedValue({ content: 'Forge response', route: 'frontier' });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    (sanitizeInput as Mock).mockImplementation((t: string) => t?.trim() ?? '');
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (isAuthorized as Mock).mockReturnValue(true);
    (isOwner as Mock).mockReturnValue(false);
    (detectLanguage as Mock).mockReturnValue('en');
    (getLanguagePromptAddition as Mock).mockReturnValue('');
    mockSkillRouter.matchSkill.mockReturnValue(null);

    // Send DM — should use forge
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    expect(conversationStore.addMessage).toHaveBeenCalledWith('user-123', 'user', 'Hello bot', 'forge');
    expect(conversationStore.getHistory).toHaveBeenCalledWith('user-123', 20, 'forge');
  });

  it('switch then status queries the switched companionId', async () => {
    // Switch to mischief
    const switchInteraction = createMockInteraction({
      options: { getString: vi.fn(() => 'mischief') },
    });
    await handleCompanionCommand(switchInteraction);
    vi.clearAllMocks();
    (conversationStore.getMessageCount as Mock).mockReturnValue(10);

    // Check status — should query mischief
    const statusInteraction = createMockInteraction();
    await handleStatusCommand(statusInteraction);
    expect(conversationStore.getMessageCount).toHaveBeenCalledWith('user-123', 'mischief');
  });
});

// ============================================================================
// Discord Bot Presence (ClientReady)
// ============================================================================

describe('Discord bot presence', () => {
  it('setPresence is called on ClientReady', () => {
    // The createDiscordBot wires client.once(Events.ClientReady, ...)
    // We test that the handler calls setPresence by invoking the factory
    // and inspecting the mock client's `once` registrations.
    const { client } = createDiscordBot({ token: 'test-token', clientId: 'test-client-id' });

    // Find the ClientReady handler registered via client.once
    const onceCalls = (client.once as Mock).mock.calls;
    const readyHandler = onceCalls.find((c: any) => c[0] === 'ready');
    expect(readyHandler).toBeDefined();

    // Invoke the handler with a mock readyClient
    const mockSetPresence = vi.fn();
    const readyClient = {
      user: { tag: 'KINBot#1234', setPresence: mockSetPresence },
      guilds: { cache: { size: 5 } },
    };
    readyHandler![1](readyClient);

    expect(mockSetPresence).toHaveBeenCalledWith(
      expect.objectContaining({
        activities: expect.arrayContaining([
          expect.objectContaining({ name: '/chat to start' }),
        ]),
        status: 'online',
      }),
    );
  });
});

// ============================================================================
// Typing Indicator Integration in handleMessage
// ============================================================================

describe('handleMessage typing indicator', () => {
  let client: any;
  let fallback: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (sanitizeInput as Mock).mockImplementation((text: string) => text?.trim() ?? '');
    (detectJailbreak as Mock).mockReturnValue(null);
    (checkRateLimit as Mock).mockReturnValue({ allowed: true, remaining: 59, resetInMs: 3600000 });
    (isAuthorized as Mock).mockReturnValue(true);
    (isOwner as Mock).mockReturnValue(false);
    (supervisedChat as Mock).mockResolvedValue({
      content: 'Bot response',
      route: 'frontier',
      supervisorUsed: true,
      latencyMs: 100,
      companionId: 'cipher',
    });
    (conversationStore.getHistory as Mock).mockResolvedValue([]);
    mockSkillRouter.matchSkill.mockReturnValue(null);
    sessions.clear();

    client = {
      user: { id: 'bot-user-id' },
    };
    fallback = {};
  });

  it('calls sendTyping immediately (via typing indicator start)', async () => {
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    // sendTyping should be called at least once by the typing indicator's showFn
    expect(msg.channel.sendTyping).toHaveBeenCalled();
  });

  it('stops typing indicator even when inference throws', async () => {
    (supervisedChat as Mock).mockRejectedValueOnce(new Error('LLM exploded'));
    const msg = createMockMessage();
    await handleMessage(msg, client, fallback);
    // Should still get an error reply (not throw)
    expect(msg.reply).toHaveBeenCalledWith(expect.any(String));
    // sendTyping was called at start, proving the indicator was active
    expect(msg.channel.sendTyping).toHaveBeenCalled();
  });

  it('uses no-op showFn when channel lacks sendTyping', async () => {
    const msg = createMockMessage();
    // Remove sendTyping from channel
    delete msg.channel.sendTyping;
    // Should not throw — no-op showFn is used
    await handleMessage(msg, client, fallback);
    expect(msg.reply).toHaveBeenCalledWith('Bot response');
  });
});
