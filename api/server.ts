/**
 * KIN API Server
 * 
 * Production-ready Fastify server for the KIN platform.
 * Provides REST API for Mission Control dashboard and external integrations.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import sensible from '@fastify/sensible';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Route imports
import healthRoutes from './routes/health.js';
import kinRoutes from './routes/kin.js';
import conversationRoutes from './routes/conversations.js';
import nftRoutes from './routes/nft.js';
import authRoutes from './routes/auth.js';
import memoryRoutes from './routes/memory.js';
import supportRoutes from './routes/support.js';

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
}

export interface AppContext {
  db: InstanceType<typeof Database>;
  config: Required<ApiConfig>;
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
  
  const resolvedConfig: Required<ApiConfig> = {
    port: config.port ?? parseInt(process.env.PORT ?? '3000', 10),
    host: config.host ?? process.env.HOST ?? '0.0.0.0',
    jwtSecret: config.jwtSecret ?? process.env.JWT_SECRET ?? (() => {
      if (environment === 'production') throw new Error('JWT_SECRET must be set in production');
      return 'kin-dev-secret-DO-NOT-USE-IN-PROD';
    })(),
    databasePath: config.databasePath ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'kin.db'),
    corsOrigins: config.corsOrigins ?? (environment === 'development' ? ['http://localhost:3000', 'http://localhost:5173'] : []),
    rateLimitMax: config.rateLimitMax ?? 100,
    environment: environment as 'development' | 'production' | 'test',
  };

  // Ensure data directory exists
  const dbDir = path.dirname(resolvedConfig.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const fastify = Fastify({
    logger: {
      level: environment === 'development' ? 'debug' : 'info',
      transport: environment === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    },
  });

  // Initialize database
  const db = new Database(resolvedConfig.databasePath);
  db.pragma('journal_mode = WAL');
  
  // Load schema
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
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

  // CORS
  await fastify.register(cors, {
    origin: resolvedConfig.corsOrigins,
    credentials: true,
  });

  // JWT Authentication
  await fastify.register(jwt, {
    secret: resolvedConfig.jwtSecret,
  });

  // Rate limiting
  if (environment === 'production') {
    await fastify.register(rateLimit, {
      max: resolvedConfig.rateLimitMax,
      timeWindow: '1 minute',
    });
  }

  // WebSocket support
  await fastify.register(websocket);

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Health check (no auth required)
  await fastify.register(healthRoutes);

  // Authentication routes (no auth required)
  await fastify.register(authRoutes);

  // Protected routes
  await fastify.register(async (protectedFastify) => {
    // JWT verification hook
    protectedFastify.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    });

    // Register protected routes
    await protectedFastify.register(kinRoutes);
    await protectedFastify.register(conversationRoutes);
    await protectedFastify.register(nftRoutes);
    await protectedFastify.register(memoryRoutes);
    await protectedFastify.register(supportRoutes);
  });

  // ==========================================================================
  // WebSocket Routes
  // ==========================================================================

  fastify.register(async (wsFastify) => {
    wsFastify.get('/ws', { websocket: true }, (connection, request) => {
      connection.socket.on('message', (message: string) => {
        // Parse message
        try {
          const data = JSON.parse(message.toString());
          
          // Handle different message types
          switch (data.type) {
            case 'ping':
              connection.socket.send(JSON.stringify({ type: 'pong' }));
              break;
            case 'subscribe':
              // Subscribe to kin updates
              connection.socket.send(JSON.stringify({ 
                type: 'subscribed', 
                channel: data.channel 
              }));
              break;
            default:
              connection.socket.send(JSON.stringify({ 
                type: 'error', 
                message: 'Unknown message type' 
              }));
          }
        } catch {
          connection.socket.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid JSON' 
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
        headers: request.headers,
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

export default createServer;
