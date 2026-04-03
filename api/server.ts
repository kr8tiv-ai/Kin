/**
 * KIN API Server
 * 
 * Production-ready Fastify server for the KIN platform.
 * Provides REST API for Mission Control dashboard and external integrations.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import sensible from '@fastify/sensible';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

import type { Bot } from 'grammy';

// Route imports
import healthRoutes from './routes/health.js';
import kinRoutes from './routes/kin.js';
import conversationRoutes from './routes/conversations.js';
import nftRoutes from './routes/nft.js';
import authRoutes from './routes/auth.js';
import memoryRoutes from './routes/memory.js';
import supportRoutes from './routes/support.js';
import billingRoutes from './routes/billing.js';
import projectRoutes from './routes/projects.js';
import referralRoutes from './routes/referral.js';
import progressRoutes from './routes/progress.js';
import adminRoutes from './routes/admin.js';
import preferencesRoutes from './routes/preferences.js';
import telegramWebhookRoutes from './routes/telegram-webhook.js';
import chatRoutes from './routes/chat.js';
import skillsRoutes from './routes/skills.js';
import heartbeatRoutes from './routes/heartbeat.js';
import supportChatRoutes from './routes/support-chat.js';
import companionSkillsRoutes from './routes/companion-skills.js';
import soulRoutes from './routes/soul.js';
import voiceRoutes from './routes/voice.js';
import modelRoutes from './routes/models.js';
import trainingRoutes from './routes/training.js';
import installerRoutes from './routes/installer.js';
import setupWizardRoutes from './routes/setup-wizard.js';
import completionRoutes from './routes/completion.js';
import rateLimitRoutes from './routes/rate-limit.js';
import fleetRoutes from './routes/fleet.js';

// Inference imports for WebSocket streaming chat
import crypto from 'crypto';
import { getOllamaClient, isLocalLlmAvailable, type ChatMessage } from '../inference/local-llm.js';
import { buildCompanionPrompt } from '../inference/companion-prompts.js';
import { getCompanionConfig } from '../companions/config.js';

// ============================================================================
// Types
// ============================================================================

export interface ApiConfig {
  port?: number;
  host?: string;
  jwtSecret?: string;
  databasePath?: string;
  corsOrigins?: string[];
  rateLimitMax?: number;
  environment?: 'development' | 'production' | 'test';
  /** When provided, the Telegram webhook route is mounted at /telegram/webhook. */
  bot?: Bot;
  /** Optional secret for Telegram webhook header verification. */
  telegramWebhookSecret?: string;
}

/** The resolved config stored on the Fastify instance excludes runtime-only fields. */
type ResolvedConfig = Required<Omit<ApiConfig, 'bot' | 'telegramWebhookSecret'>>;

export interface AppContext {
  db: InstanceType<typeof Database>;
  config: ResolvedConfig;
}

declare module 'fastify' {
  interface FastifyInstance {
    context: AppContext;
  }
}

// ============================================================================
// Server Factory
// ============================================================================

export async function createServer(config: ApiConfig = {}) {
  const environment = config.environment ?? process.env.NODE_ENV ?? 'development';
  
  const resolvedConfig: ResolvedConfig = {
    port: config.port ?? parseInt(process.env.PORT ?? '3000', 10),
    host: config.host ?? process.env.HOST ?? '127.0.0.1',
    jwtSecret: config.jwtSecret ?? process.env.JWT_SECRET ?? (() => {
      if (environment === 'production') throw new Error('JWT_SECRET must be set in production');
      return 'kin-dev-secret-DO-NOT-USE-IN-PROD';
    })(),
    databasePath: config.databasePath ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'kin.db'),
    corsOrigins: config.corsOrigins ?? (environment === 'development'
      ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'http://127.0.0.1:5173']
      : ['https://www.meetyourkin.com', 'https://meetyourkin.com']),
    rateLimitMax: config.rateLimitMax ?? 100,
    environment: environment as 'development' | 'production' | 'test',
  };

  // Ensure data directory exists
  const dbDir = path.dirname(resolvedConfig.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const fastify = Fastify({
    bodyLimit: 26 * 1024 * 1024, // 26MB — accommodates audio uploads up to 25MB (Whisper limit)
    logger: {
      level: environment === 'development' ? 'debug' : 'info',
    },
  });

  // Parse audio/* and application/octet-stream bodies as raw Buffers
  // so the POST /voice/stt endpoint can receive audio file uploads.
  fastify.addContentTypeParser(
    ['audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'audio/wav',
     'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/mp4', 'audio/m4a',
     'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req: any, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => {
      done(null, body);
    },
  );

  // Initialize database
  const db = new Database(resolvedConfig.databasePath);
  db.pragma('journal_mode = WAL');
  
  // Load schema
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  // Safe migrations — add columns that may not exist in older databases.
  // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we catch errors.
  const safeMigrations = [
    `ALTER TABLE users ADD COLUMN free_until TEXT`,
    `ALTER TABLE users ADD COLUMN genesis_tier TEXT`,
    `ALTER TABLE users ADD COLUMN genesis_discount INTEGER NOT NULL DEFAULT 0`,
    // Multi-auth: Google OAuth, Solana wallet sign-in
    `ALTER TABLE users ADD COLUMN google_id TEXT`,
    `ALTER TABLE users ADD COLUMN email TEXT`,
    `ALTER TABLE users ADD COLUMN wallet_address TEXT`,
    `ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'telegram'`,
    // Email auth
    `ALTER TABLE users ADD COLUMN password_hash TEXT`,
    // X (Twitter) OAuth
    `ALTER TABLE users ADD COLUMN x_id TEXT`,
    // Setup wizard
    `ALTER TABLE user_preferences ADD COLUMN setup_wizard_complete INTEGER NOT NULL DEFAULT 0`,
    // Deployment completion
    `ALTER TABLE user_preferences ADD COLUMN deployment_complete INTEGER NOT NULL DEFAULT 0`,
  ];
  for (const migration of safeMigrations) {
    try { db.exec(migration); } catch { /* column already exists — safe to ignore */ }
  }

  // Seed dev user in development mode
  if (resolvedConfig.environment === 'development') {
    try {
      const devUser = db.prepare(`SELECT id FROM users WHERE id = 'user-dev'`).get();
      if (!devUser) {
        db.prepare(`INSERT INTO users (id, telegram_id, first_name) VALUES ('user-dev', 999999, 'Matt')`).run();
      }
      const devPrefs = db.prepare(`SELECT id FROM user_preferences WHERE user_id = 'user-dev'`).get();
      if (!devPrefs) {
        db.prepare(`INSERT INTO user_preferences (id, user_id, display_name, experience_level, goals, language, tone, onboarding_complete) VALUES ('pref-dev', 'user-dev', 'Matt', 'advanced', '["ai","defi"]', 'en', 'friendly', 1)`).run();
      }
    } catch { /* tables may not exist yet */ }
  }

  // Store context
  fastify.decorate('context', {
    db,
    config: resolvedConfig,
  });

  // ==========================================================================
  // Plugins
  // ==========================================================================

  // Error handling
  await fastify.register(sensible);

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // API only, no HTML served
  });

  // CORS
  await fastify.register(cors, {
    origin: resolvedConfig.corsOrigins,
    credentials: true,
  });

  // JWT Authentication (HS256, 2h expiry)
  await fastify.register(jwt, {
    secret: resolvedConfig.jwtSecret,
    sign: { algorithm: 'HS256', expiresIn: '2h' },
    verify: { algorithms: ['HS256'] },
  });

  // Rate limiting (all environments — higher limit in dev)
  await fastify.register(rateLimit, {
    max: environment === 'production' ? resolvedConfig.rateLimitMax : 1000,
    timeWindow: '1 minute',
  });

  // WebSocket support
  await fastify.register(websocket);

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Health check (no auth required)
  await fastify.register(healthRoutes);

  // Authentication routes (no auth required)
  await fastify.register(authRoutes);

  // Telegram webhook (no JWT — Telegram authenticates via secret token)
  if (config.bot) {
    await fastify.register(telegramWebhookRoutes, {
      bot: config.bot,
      secretToken: config.telegramWebhookSecret,
    });
    fastify.log.info('Telegram webhook route registered at POST /telegram/webhook');
  }

  // Protected routes
  await fastify.register(async (protectedFastify) => {
    // JWT verification hook — all environments require valid JWT
    protectedFastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    // Register protected routes
    await protectedFastify.register(kinRoutes);
    await protectedFastify.register(conversationRoutes);
    await protectedFastify.register(nftRoutes);
    await protectedFastify.register(memoryRoutes);
    await protectedFastify.register(supportRoutes);
    await protectedFastify.register(billingRoutes);
    await protectedFastify.register(projectRoutes);
    await protectedFastify.register(referralRoutes);
    await protectedFastify.register(progressRoutes);
    await protectedFastify.register(preferencesRoutes);
    await protectedFastify.register(adminRoutes);
    await protectedFastify.register(chatRoutes);
    await protectedFastify.register(skillsRoutes);
    await protectedFastify.register(heartbeatRoutes);
    await protectedFastify.register(supportChatRoutes);
    await protectedFastify.register(companionSkillsRoutes);
    await protectedFastify.register(soulRoutes);
    await protectedFastify.register(voiceRoutes);
    await protectedFastify.register(modelRoutes);
    await protectedFastify.register(trainingRoutes);
    await protectedFastify.register(installerRoutes);
    await protectedFastify.register(setupWizardRoutes);
    await protectedFastify.register(completionRoutes);
    await protectedFastify.register(rateLimitRoutes);
    await protectedFastify.register(fleetRoutes);
  });

  // ==========================================================================
  // Admin Dashboard (static HTML)
  // ==========================================================================

  fastify.get('/admin', async (_request, reply) => {
    const dashboardPath = path.join(process.cwd(), 'admin', 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
      const html = fs.readFileSync(dashboardPath, 'utf-8');
      reply.type('text/html').send(html);
    } else {
      reply.status(404).send({ error: 'Admin dashboard not found' });
    }
  });

  // ==========================================================================
  // WebSocket Routes
  // ==========================================================================

  fastify.register(async (wsFastify) => {
    wsFastify.get('/ws', { websocket: true }, (connection, request) => {
      connection.socket.on('message', (raw: Buffer | string) => {
        // Reject oversized messages
        const message = raw.toString();
        if (message.length > 4096) {
          connection.socket.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
          return;
        }

        // Parse message
        try {
          const data = JSON.parse(message);

          // Handle different message types
          switch (data.type) {
            case 'ping':
              connection.socket.send(JSON.stringify({ type: 'pong' }));
              break;
            case 'subscribe':
              // Subscribe to kin updates
              connection.socket.send(JSON.stringify({
                type: 'subscribed',
                channel: data.channel,
              }));
              break;
            case 'chat':
              // Streaming chat over WebSocket — works without API keys via Ollama
              handleWsChat(data, connection, fastify).catch((err) => {
                connection.socket.send(JSON.stringify({
                  type: 'chat_error',
                  error: err instanceof Error ? err.message : 'Internal error',
                }));
              });
              break;
            default:
              connection.socket.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type',
              }));
          }
        } catch {
          connection.socket.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON',
          }));
        }
      });
    });
  });

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  fastify.setErrorHandler((error: { statusCode?: number; message: string; stack?: string }, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    
    // Log error
    request.log.error({
      error: {
        message: error.message,
        stack: error.stack,
        statusCode,
      },
      request: {
        method: request.method,
        url: request.url,
        ip: request.ip,
      },
    });

    // Send response
    reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
      },
    });
  });

  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================

  const closeHandlers: (() => Promise<void>)[] = [];

  fastify.addHook('onClose', async () => {
    for (const handler of closeHandlers) {
      await handler();
    }
    db.close();
  });

  return fastify;
}

// ============================================================================
// Start Server
// ============================================================================

export async function startServer(config: ApiConfig = {}) {
  const server = await createServer(config);
  
  try {
    await server.listen({
      port: server.context.config.port,
      host: server.context.config.host,
    });
    
    server.log.info(`KIN API running on http://${server.context.config.host}:${server.context.config.port}`);
    
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

// ============================================================================
// WebSocket Chat Handler — streams tokens to the client via Ollama (no API key)
// ============================================================================

/**
 * Handle a WebSocket `{ type: "chat", ... }` message.
 *
 * Expected payload:
 *   { type: "chat", message: string, companionId?: string, conversationId?: string }
 *
 * Sends back a series of frames:
 *   { type: "chat_token", content: string, done: false }
 *   { type: "chat_done",  conversationId, companionId, latencyMs }
 *   { type: "chat_error", error: string }  (on failure)
 *
 * Works entirely without API keys — uses local Ollama only.
 */
async function handleWsChat(
  data: { message?: string; companionId?: string; conversationId?: string },
  connection: { socket: { send: (msg: string) => void } },
  fastify: { context: AppContext },
): Promise<void> {
  const start = performance.now();
  const userId = 'user-dev'; // In WS context, dev mode auto-assigns; production would use JWT
  const companionId = data.companionId ?? 'cipher';
  const userMessage = data.message?.trim();

  if (!userMessage) {
    connection.socket.send(JSON.stringify({ type: 'chat_error', error: 'message is required' }));
    return;
  }

  if (userMessage.length > 4000) {
    connection.socket.send(JSON.stringify({ type: 'chat_error', error: 'Message too long (max 4000 chars)' }));
    return;
  }

  // Ensure Ollama is reachable
  const ollamaUp = await isLocalLlmAvailable();
  if (!ollamaUp) {
    connection.socket.send(JSON.stringify({
      type: 'chat_error',
      error: 'Local Ollama is not running. Start Ollama to use WebSocket chat.',
    }));
    return;
  }

  // Resolve or create conversation
  let conversationId = data.conversationId;
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    fastify.context.db.prepare(`
      INSERT INTO conversations (id, user_id, companion_id, title)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, userId, companionId, userMessage.slice(0, 80));
  }

  // Load recent messages for context
  const recentMessages = fastify.context.db.prepare(`
    SELECT role, content FROM messages
    WHERE conversation_id = ?
    ORDER BY timestamp DESC LIMIT 20
  `).all(conversationId) as Array<{ role: string; content: string }>;

  // Build prompt
  const config = getCompanionConfig(companionId);
  const systemPrompt = buildCompanionPrompt(companionId, {
    userName: userId,
    timeContext: new Date().toLocaleString('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit',
    }),
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Store user message
  fastify.context.db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content)
    VALUES (?, ?, 'user', ?)
  `).run(crypto.randomUUID(), conversationId, userMessage);

  // Stream response from Ollama
  const client = getOllamaClient();
  let fullResponse = '';

  await client.chatStream(
    { messages, model: config.localModel, options: { temperature: 0.8, top_p: 0.9 } },
    (chunk: string, done: boolean) => {
      fullResponse += chunk;
      connection.socket.send(JSON.stringify({
        type: 'chat_token',
        content: chunk,
        done: false,
      }));
    },
  );

  // Store assistant response
  if (fullResponse) {
    fastify.context.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content)
      VALUES (?, ?, 'assistant', ?)
    `).run(crypto.randomUUID(), conversationId, fullResponse);

    fastify.context.db.prepare(`
      UPDATE conversations SET updated_at = (strftime('%s','now')*1000) WHERE id = ?
    `).run(conversationId);
  }

  // Send completion frame
  connection.socket.send(JSON.stringify({
    type: 'chat_done',
    conversationId,
    companionId,
    latencyMs: Math.round(performance.now() - start),
  }));
}

export default createServer;
