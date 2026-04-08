/**
 * KIN API Server
 * 
 * Production-ready Fastify server for the KIN platform.
 * Provides REST API for Mission Control dashboard and external integrations.
 */

import Fastify from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
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
import billingWebhookRoutes from './routes/billing-webhook.js';
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
import voiceIntroRoutes from './routes/voice-intro.js';
import modelRoutes from './routes/models.js';
import trainingRoutes from './routes/training.js';
import installerRoutes from './routes/installer.js';
import setupWizardRoutes from './routes/setup-wizard.js';
import completionRoutes from './routes/completion.js';
import rateLimitRoutes from './routes/rate-limit.js';
import fleetRoutes from '../fleet/routes.js';
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import communityRoutes from './routes/community.js';
import evalRoutes from './routes/eval.js';
import distillRoutes from './routes/distill.js';
import retrainRoutes from './routes/retrain.js';
import revenueRoutes from './routes/revenue.js';
import advantageRoutes from './routes/advantage.js';
import dmSecurityRoutes from './routes/dm-security.js';
import gmailAuthRoutes from './routes/gmail-auth.js';
import schedulerRoutes, { webhookRoutes } from './routes/scheduler.js';
import mediaRoutes from './routes/media.js';
import missionControlRoutes from './routes/mission-control.js';
import kinCreditsRoutes from './routes/kin-credits.js';
import firstMessageRoutes from './routes/first-message.js';
import canvasRoutes from './routes/canvas.js';
import proactiveRoutes from './routes/proactive.js';
import calendarAuthRoutes from './routes/calendar-auth.js';
import familyRoutes from './routes/family.js';

// Mission Control imports
import { initMissionControlClient, getMissionControlClient } from '../inference/mission-control.js';
import { getMetricsCollector } from '../inference/metrics.js';

// Fleet imports
import { FleetDb } from '../fleet/db.js';
import { ContainerManager } from '../fleet/container-manager.js';
import { TunnelManager, type TunnelManagerConfig } from '../fleet/tunnel-manager.js';
import { CreditDb } from '../fleet/credit-db.js';
import { FrontierProxy } from '../fleet/frontier-proxy.js';
import creditRoutes from '../fleet/credit-routes.js';

// Scheduler imports
import { SchedulerManager } from '../inference/scheduler-manager.js';
import { ChannelDelivery } from '../inference/channel-delivery.js';
import { createSkillRouter } from '../bot/skills/index.js';
import { setSchedulerManager } from '../bot/skills/builtins/schedule.js';

// Pipeline imports
import { PipelineManager } from '../inference/pipeline-manager.js';
import { setPipelineManager } from '../bot/skills/builtins/pipeline.js';

// Approval imports
import { ApprovalManager } from '../inference/approval-manager.js';
import { requiresApproval, extractSkillIntent } from '../inference/approval-policy.js';
import pipelineRoutes from './routes/pipelines.js';
import approvalRoutes from './routes/approvals.js';

// KIN Credits imports
import { CredentialManager, setCredentialManager } from '../inference/kin-credits.js';

// Proactive companion imports
import { ProactiveManager, getProactiveManager } from '../inference/proactive-manager.js';
import { Cron } from 'croner';

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
    // Family mode — child account columns
    `ALTER TABLE user_preferences ADD COLUMN account_type TEXT DEFAULT 'standard'`,
    `ALTER TABLE user_preferences ADD COLUMN content_filter_level TEXT DEFAULT 'standard'`,
    `ALTER TABLE family_members ADD COLUMN age_bracket TEXT`,
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

  // --------------------------------------------------------------------------
  // Fleet control plane initialisation
  // --------------------------------------------------------------------------

  const usesEphemeralFleetDb = resolvedConfig.databasePath === ':memory:';
  const fleetDbPath = usesEphemeralFleetDb
    ? path.join(process.cwd(), 'data', `fleet.test.${process.pid}.db`)
    : path.join(
      path.dirname(resolvedConfig.databasePath),
      'fleet.db',
    );
  const fleetDb = new FleetDb(fleetDbPath);
  fleetDb.init();

  // Credit metering — shares the fleet.db file for co-located tables
  const creditDb = new CreditDb(fleetDbPath);
  creditDb.init();

  // KIN Credits — encrypted provider credential store (PinkBrain subscriptions)
  const credentialManager = new CredentialManager(db);
  setCredentialManager(credentialManager);

  // Cloudflare Tunnel integration (optional — requires all three env vars)
  let tunnelManager: TunnelManager | undefined;
  const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfZoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (cfApiToken && cfAccountId && cfZoneId) {
    const tunnelConfig: TunnelManagerConfig = {
      apiToken: cfApiToken,
      accountId: cfAccountId,
      zoneId: cfZoneId,
      baseDomain: process.env.TUNNEL_BASE_DOMAIN ?? 'kin.kr8tiv.ai',
    };
    tunnelManager = new TunnelManager(tunnelConfig);
    fastify.log.info('[fleet] Cloudflare Tunnel integration enabled');
  } else {
    fastify.log.warn(
      '[fleet] Cloudflare Tunnel integration disabled — set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_ZONE_ID to enable',
    );
  }

  const containerManager = new ContainerManager({
    fleetDb,
    creditDb,
    tunnelManager,
    logger: {
      info: (msg: string, ctx?: Record<string, unknown>) => fastify.log.info(ctx ?? {}, `[fleet] ${msg}`),
      warn: (msg: string, ctx?: Record<string, unknown>) => fastify.log.warn(ctx ?? {}, `[fleet] ${msg}`),
      error: (msg: string, ctx?: Record<string, unknown>) => fastify.log.error(ctx ?? {}, `[fleet] ${msg}`),
    },
  });

  // Frontier proxy — centralised AI provider gateway with credit metering
  const frontierProxyPort = parseInt(process.env.FRONTIER_PROXY_PORT ?? '8080', 10);
  const frontierProxy = new FrontierProxy({
    creditDb,
    fleetDb,
    port: frontierProxyPort,
    logger: {
      info: (msg: string, ctx?: Record<string, unknown>) => fastify.log.info(ctx ?? {}, `[frontier-proxy] ${msg}`),
      warn: (msg: string, ctx?: Record<string, unknown>) => fastify.log.warn(ctx ?? {}, `[frontier-proxy] ${msg}`),
      error: (msg: string, ctx?: Record<string, unknown>) => fastify.log.error(ctx ?? {}, `[frontier-proxy] ${msg}`),
    },
  });

  // --------------------------------------------------------------------------
  // Shared infrastructure
  // --------------------------------------------------------------------------

  const channelDelivery = new ChannelDelivery();

  // Wire skill resolution — SkillRouter holds all builtins
  const skillRouter = createSkillRouter();
  const resolveSkill = (name: string): import('../bot/skills/types.js').KinSkill | undefined => {
    if (!skillRouter.hasSkill(name)) return undefined;
    // Return a thin proxy that delegates to skillRouter.executeSkill
    return {
      name,
      description: '',
      triggers: [],
      execute: (ctx) => skillRouter.executeSkill(name, ctx),
    };
  };

  // --------------------------------------------------------------------------
  // Approval initialisation (before scheduler/pipeline — they reference it)
  // --------------------------------------------------------------------------

  const approvalManager = new ApprovalManager({ db, channelDelivery });

  // When an approval is approved, execute the held skill and deliver the result
  approvalManager.onApproved = async (approval) => {
    try {
      const payload = JSON.parse(approval.payload);
      const skill = resolveSkill(payload.skillName);
      if (!skill) return;
      const result = await skill.execute(payload.ctx);
      await channelDelivery
        .send(approval.deliveryChannel, approval.deliveryRecipientId, result.content)
        .catch(() => { /* fire-and-forget delivery — K013 */ });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[approval] onApproved execution failed for ${approval.id}: ${msg}`);
    }
  };

  // --------------------------------------------------------------------------
  // Scheduler initialisation
  // --------------------------------------------------------------------------

  const schedulerManager = new SchedulerManager(db, channelDelivery);

  // Wrap resolveSkill with approval gate for scheduled jobs
  schedulerManager.setSkillResolver((name: string) => {
    const skill = resolveSkill(name);
    if (!skill) return undefined;
    return {
      ...skill,
      execute: async (ctx) => {
        const intent = extractSkillIntent(ctx.message, name);
        if (requiresApproval(name, intent)) {
          const approval = approvalManager.createApproval({
            userId: ctx.userId,
            skillName: name,
            intent,
            payload: JSON.stringify({
              skillName: name,
              ctx: { message: ctx.message, userId: ctx.userId, userName: ctx.userName, conversationHistory: ctx.conversationHistory },
            }),
            deliveryChannel: 'api',
            deliveryRecipientId: ctx.userId,
          });
          return {
            content: `⏳ This action requires your approval before executing. Approval ID: ${approval.id}. Check your messages or visit /approvals to approve.`,
            type: 'error' as const,
            metadata: { approvalRequired: true, approvalId: approval.id },
          };
        }
        return skill.execute(ctx);
      },
    };
  });

  // Wire the schedule skill's SchedulerManager reference
  setSchedulerManager(schedulerManager);

  // Hydrate active jobs from DB
  try {
    const hydrated = schedulerManager.hydrateFromDb();
    if (hydrated > 0) {
      fastify.log.info(`[scheduler] Hydrated ${hydrated} active job(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fastify.log.error(`[scheduler] Hydration failed: ${msg}`);
  }

  // --------------------------------------------------------------------------
  // Pipeline initialisation
  // --------------------------------------------------------------------------

  const pipelineManager = new PipelineManager(db, channelDelivery);

  // Wire skill resolution — approval-aware executor
  pipelineManager.setSkillExecutor(async (skillName, ctx) => {
    const skill = resolveSkill(skillName);
    if (!skill) {
      return { content: `Skill "${skillName}" not found`, type: 'error' as const };
    }
    // Check approval gate — extract intent from message for policy check
    const intent = extractSkillIntent(ctx.message, skillName);
    if (requiresApproval(skillName, intent)) {
      const approval = approvalManager.createApproval({
        userId: ctx.userId,
        skillName,
        intent,
        payload: JSON.stringify({
          skillName,
          ctx: { message: ctx.message, userId: ctx.userId, userName: ctx.userName, conversationHistory: ctx.conversationHistory },
        }),
        deliveryChannel: 'api',
        deliveryRecipientId: ctx.userId,
      });
      return {
        content: `⏳ This action requires your approval before executing. Approval ID: ${approval.id}. Check your messages or visit /approvals to approve.`,
        type: 'error' as const,
        metadata: { approvalRequired: true, approvalId: approval.id },
      };
    }
    return skill.execute(ctx);
  });

  // Wire the pipeline skill's PipelineManager reference
  setPipelineManager(pipelineManager);

  // Hydrate cron-triggered pipelines from DB
  try {
    const hydrated = pipelineManager.hydrateFromDb();
    if (hydrated > 0) {
      fastify.log.info(`[pipeline] Hydrated ${hydrated} cron-triggered pipeline(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fastify.log.error(`[pipeline] Hydration failed: ${msg}`);
  }

  // --------------------------------------------------------------------------
  // Proactive companion initialisation
  // --------------------------------------------------------------------------

  const proactiveManager = getProactiveManager(db, channelDelivery);

  // Register 15-minute proactive scan cron
  let proactiveCron: Cron | null = null;
  try {
    const optedIn = db.prepare(
      `SELECT COUNT(*) as cnt FROM user_preferences WHERE proactive_enabled = TRUE`,
    ).get() as { cnt: number } | undefined;

    if (optedIn && optedIn.cnt > 0) {
      proactiveCron = new Cron('*/15 * * * *', async () => {
        try {
          await proactiveManager.runScan();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[proactive] Cron scan error: ${msg}`);
        }
      });
      fastify.log.info(`[proactive] Cron registered (${optedIn.cnt} opted-in user(s))`);
    } else {
      fastify.log.info('[proactive] No opted-in users — cron not started');
    }
  } catch {
    // proactive columns may not exist yet (migration not applied) — safe to skip
    fastify.log.info('[proactive] Proactive columns not available — cron not started');
  }

  // --------------------------------------------------------------------------
  // Mission Control auto-connect (opt-in via MC_URL + MC_API_KEY env vars)
  // --------------------------------------------------------------------------

  if (process.env.MC_URL) {
    try {
      const mcClient = initMissionControlClient({
        mcUrl: process.env.MC_URL,
        mcApiKey: process.env.MC_API_KEY,
        getPrivacyMode: () => {
          try {
            // Use first user's preference in dev; production should use per-request context
            const row = db.prepare(
              `SELECT privacy_mode FROM user_preferences LIMIT 1`,
            ).get() as { privacy_mode?: string } | undefined;
            return row?.privacy_mode ?? 'private';
          } catch {
            return 'private';
          }
        },
      });

      // Wire MetricsCollector → MC telemetry
      const metrics = getMetricsCollector();
      metrics.subscribe(mcClient.onMetricEvent.bind(mcClient));

      // Load companions from DB and register as MC agents
      const companions = db.prepare(
        `SELECT id, name, specialization FROM companions`,
      ).all() as Array<{ id: string; name: string; specialization: string }>;

      const companionAgents = companions.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.specialization,
      }));

      // Connect is async/fire-and-forget — don't block server startup
      mcClient.connect(companionAgents).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        fastify.log.warn(`[mission-control] Auto-connect failed: ${msg}`);
      });

      fastify.log.info('[mission-control] Auto-connect initiated (MC_URL configured)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.warn(`[mission-control] Auto-connect setup failed: ${msg}`);
    }
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

  // HTTP compression (gzip/brotli)
  await fastify.register(compress, { global: true });

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

  // Multipart file uploads (500 MB limit for archive import)
  await fastify.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024 },
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

  // Billing webhook (no JWT — Stripe authenticates via stripe-signature header)
  await fastify.register(billingWebhookRoutes);

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
    await protectedFastify.register(voiceIntroRoutes);
    await protectedFastify.register(modelRoutes);
    await protectedFastify.register(trainingRoutes);
    await protectedFastify.register(installerRoutes);
    await protectedFastify.register(setupWizardRoutes);
    await protectedFastify.register(completionRoutes);
    await protectedFastify.register(rateLimitRoutes);
    await protectedFastify.register(fleetRoutes, { fleetDb, containerManager, tunnelManager });
    await protectedFastify.register(creditRoutes, { creditDb });
    await protectedFastify.register(exportRoutes);
    await protectedFastify.register(importRoutes);
    await protectedFastify.register(communityRoutes);
    await protectedFastify.register(evalRoutes);
    await protectedFastify.register(distillRoutes);
    await protectedFastify.register(retrainRoutes);
    await protectedFastify.register(advantageRoutes);
    await protectedFastify.register(dmSecurityRoutes);
    await protectedFastify.register(revenueRoutes);
    await protectedFastify.register(gmailAuthRoutes);
    await protectedFastify.register(schedulerRoutes, { schedulerManager });
    await protectedFastify.register(pipelineRoutes, { pipelineManager });
    await protectedFastify.register(approvalRoutes, { approvalManager });
    await protectedFastify.register(mediaRoutes);
    await protectedFastify.register(missionControlRoutes);
    await protectedFastify.register(kinCreditsRoutes);
    await protectedFastify.register(firstMessageRoutes);
    await protectedFastify.register(canvasRoutes);
    await protectedFastify.register(proactiveRoutes);
    await protectedFastify.register(calendarAuthRoutes);
    await protectedFastify.register(familyRoutes);
  });

  // Webhook ingestion routes (HMAC-authenticated, no JWT)
  await fastify.register(webhookRoutes, {
    channelDelivery,
    skillResolver: resolveSkill,
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

  if (usesEphemeralFleetDb) {
    closeHandlers.push(async () => {
      if (fs.existsSync(fleetDbPath)) {
        await fs.promises.rm(fleetDbPath, { force: true });
      }
    });
  }

  fastify.addHook('onClose', async () => {
    schedulerManager.shutdown();
    pipelineManager.shutdown();
    if (proactiveCron) proactiveCron.stop();
    getMissionControlClient().disconnect();
    await frontierProxy.stop();
    creditDb.close();
    fleetDb.close();
    db.close();
    for (const handler of closeHandlers) {
      await handler();
    }
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

    // Start frontier proxy alongside the main server (fire-and-forget on failure)
    // The proxy is created during createServer() — we start it here so tests
    // using inject() don't spin up a real proxy listener.
    // Note: frontierProxy is not exposed on the instance; shutdown is handled
    // by the onClose hook registered in createServer().
    
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

  // Build prompt with language preference
  const config = getCompanionConfig(companionId);
  let wsLanguage = 'en';
  try {
    const langRow = fastify.context.db.prepare(
      `SELECT language FROM user_preferences WHERE user_id = ?`
    ).get(userId) as { language: string } | undefined;
    wsLanguage = langRow?.language ?? 'en';
  } catch { /* default to en */ }
  const systemPrompt = buildCompanionPrompt(companionId, {
    userName: userId,
    timeContext: new Date().toLocaleString('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit',
    }),
  }, { language: wsLanguage });

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

  // Notify client that inference is starting (typing indicator for web UI)
  connection.socket.send(JSON.stringify({ type: 'chat_typing', companionId }));

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
