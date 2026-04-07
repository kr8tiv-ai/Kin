/**
 * Fleet Control Plane — Frontier AI Proxy
 *
 * Standalone HTTP server that sits between fleet containers and frontier
 * AI providers. Authenticates via internal proxy tokens, routes to the
 * correct provider based on companion config, checks credit balance,
 * forwards the request, calculates cost, deducts credits, and logs usage.
 *
 * API keys never enter containers — they live only in this proxy process.
 *
 * @module fleet/frontier-proxy
 */

import http from 'node:http';
import { CreditDb } from './credit-db.js';
import { FleetDb } from './db.js';
import { getCompanionConfig, COMPANION_CONFIGS } from '../companions/config.js';
import { getProvider } from '../inference/providers/index.js';
import {
  isProviderHealthy,
  recordSuccess,
  recordFailure,
} from '../inference/providers/circuit-breaker.js';
import type {
  ProviderChatRequest,
  ProviderChatResponse,
  FrontierProviderId,
} from '../inference/providers/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrontierProxyOptions {
  creditDb: CreditDb;
  fleetDb: FleetDb;
  port?: number;
  logger?: ProxyLogger;
}

export interface ProxyLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

interface ChatRequestBody {
  companionId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

interface ProxyResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  costUsd: number;
  remainingBalance: number;
}

// ---------------------------------------------------------------------------
// Default logger (console-based)
// ---------------------------------------------------------------------------

const defaultLogger: ProxyLogger = {
  info: (msg, meta) => console.log(`[frontier-proxy] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[frontier-proxy] WARN: ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[frontier-proxy] ERROR: ${msg}`, meta ?? ''),
};

// ---------------------------------------------------------------------------
// Body parsing helper
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 1024 * 1024; // 1 MB limit

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// FrontierProxy
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8080;

export class FrontierProxy {
  private readonly creditDb: CreditDb;
  private readonly fleetDb: FleetDb;
  private readonly port: number;
  private readonly logger: ProxyLogger;
  private server: http.Server | null = null;

  constructor(opts: FrontierProxyOptions) {
    this.creditDb = opts.creditDb;
    this.fleetDb = opts.fleetDb;
    this.port = opts.port ?? DEFAULT_PORT;
    this.logger = opts.logger ?? defaultLogger;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          this.logger.error('Unhandled request error', {
            error: err instanceof Error ? err.message : String(err),
          });
          if (!res.headersSent) {
            this.sendJson(res, 500, { error: 'Internal server error' });
          }
        });
      });

      this.server.listen(this.port, () => {
        this.logger.info(`Frontier proxy listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Request routing
  // -----------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Health endpoint
    if (method === 'GET' && url === '/health') {
      this.sendJson(res, 200, { status: 'ok' });
      return;
    }

    // Chat completions endpoint
    if (method === 'POST' && url === '/v1/chat/completions') {
      await this.handleChatCompletion(req, res);
      return;
    }

    // Catch-all 404
    this.sendJson(res, 404, { error: 'Not found' });
  }

  // -----------------------------------------------------------------------
  // Chat completion handler
  // -----------------------------------------------------------------------

  private async handleChatCompletion(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // Step a: Extract Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.sendJson(res, 401, { error: 'Missing or malformed Authorization header' });
      return;
    }
    const token = authHeader.slice(7);

    // Step b: Validate proxy token
    const tokenInfo = this.creditDb.validateProxyToken(token);
    if (!tokenInfo) {
      this.sendJson(res, 401, { error: 'Invalid proxy token' });
      return;
    }
    const { userId, instanceId } = tokenInfo;

    // Step c: Parse JSON body
    let body: ChatRequestBody;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw) as ChatRequestBody;
    } catch {
      this.sendJson(res, 400, { error: 'Malformed JSON body' });
      return;
    }

    // Validate required fields
    if (!body.companionId || typeof body.companionId !== 'string') {
      this.sendJson(res, 400, { error: 'Missing or invalid companionId' });
      return;
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      this.sendJson(res, 400, { error: 'Missing or empty messages array' });
      return;
    }

    // Step d: Validate companionId exists
    if (!(body.companionId in COMPANION_CONFIGS)) {
      this.sendJson(res, 400, {
        error: `Unknown companionId: ${body.companionId}`,
      });
      return;
    }

    // Step e: Resolve provider from companion config
    const config = getCompanionConfig(body.companionId);
    const providerId: FrontierProviderId = config.frontierProvider;
    const modelId = config.frontierModelId;

    // Step f: Check circuit breaker (fail-open if isProviderHealthy throws)
    let providerHealthy = true;
    try {
      providerHealthy = isProviderHealthy(providerId);
    } catch {
      // Fail-open for availability per Q5 spec
      this.logger.warn('Circuit breaker check failed, treating as healthy', { providerId });
    }

    if (!providerHealthy) {
      this.sendJson(res, 503, {
        error: 'Provider temporarily unavailable',
        providerId,
      });
      return;
    }

    // Step g: Check credit balance
    let balance = this.creditDb.getBalance(userId);
    if (!balance || balance.balanceUsd <= 0) {
      this.sendJson(res, 402, {
        error: 'Insufficient credits',
        remainingBalance: balance?.balanceUsd ?? 0,
      });
      return;
    }

    // Step h: Forward to provider
    const provider = getProvider(providerId);
    if (!provider) {
      this.sendJson(res, 502, {
        error: 'Provider not registered',
        providerId,
      });
      return;
    }

    let response: ProviderChatResponse;
    try {
      const chatRequest: ProviderChatRequest = {
        messages: body.messages,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
      };
      response = await provider.chat(chatRequest);
    } catch (err) {
      // Step (error): Provider error path
      recordFailure(providerId);
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error('Provider request failed', { providerId, error: detail });
      this.sendJson(res, 502, { error: 'Provider error', details: detail });
      return;
    }

    // Step i: Calculate cost
    const spec = provider.spec;
    const costUsd =
      (response.inputTokens / 1_000_000) * spec.pricing.inputPer1M +
      (response.outputTokens / 1_000_000) * spec.pricing.outputPer1M;

    // Step j: Deduct credits
    const deductResult = this.creditDb.deductCredits(userId, costUsd);
    let remainingBalance: number;

    if (!deductResult) {
      // Insufficient mid-flight — still return response but log warning
      this.logger.warn('Credit deduction failed mid-flight (insufficient balance after cost calculation)', {
        userId,
        costUsd,
        balanceBefore: balance.balanceUsd,
      });
      remainingBalance = balance.balanceUsd;
    } else {
      remainingBalance = deductResult.balanceUsd;
    }

    // Step k: Log usage
    try {
      this.creditDb.logUsage({
        userId,
        instanceId,
        companionId: body.companionId,
        providerId,
        modelId,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd,
        balanceAfter: remainingBalance,
      });
    } catch (err) {
      // Usage logging is fire-and-forget — don't fail the request
      this.logger.error('Failed to log usage', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step l: Record success for circuit breaker
    recordSuccess(providerId);

    // Step m: Return response
    const proxyResponse: ProxyResponse = {
      content: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: response.model,
      provider: response.provider,
      costUsd,
      remainingBalance,
    };

    this.sendJson(res, 200, proxyResponse);
  }

  // -----------------------------------------------------------------------
  // Response helpers
  // -----------------------------------------------------------------------

  private sendJson(
    res: http.ServerResponse,
    statusCode: number,
    body: object,
  ): void {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFrontierProxy(opts: FrontierProxyOptions): FrontierProxy {
  return new FrontierProxy(opts);
}
