/**
 * Fleet Control Plane — Wake-on-Demand Reverse Proxy
 *
 * Standalone HTTP server that:
 * 1. Extracts subdomain from Host header
 * 2. Looks up the fleet instance in FleetDb
 * 3. Wakes stopped containers via Docker API with health polling
 * 4. Proxies HTTP and WebSocket requests via http-proxy-3
 * 5. Deduplicates concurrent wake requests via Promise map
 * 6. Serves a loading page for browser requests during startup
 */

import http from 'node:http';
import type { Duplex } from 'node:stream';
import Docker from 'dockerode';
import { createProxyServer } from 'http-proxy-3';
import { FleetDb } from './db.js';
import type { IdleConfig, FleetInstance } from './types.js';
import { DEFAULT_IDLE_CONFIG } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUBDOMAIN_RE = /^[a-z][a-z0-9-]{2,31}$/;
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_MAX_ATTEMPTS = 15;
const DEFAULT_PORT = 8090;
const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';

// ---------------------------------------------------------------------------
// Loading page HTML
// ---------------------------------------------------------------------------

function loadingPageHtml(subdomain: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="2">
  <title>Starting your KIN...</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center;
           min-height: 100vh; background: #0a0a0f; color: #e0e0e0;
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; }
    .spinner { width: 48px; height: 48px; border: 4px solid rgba(0,255,255,0.2);
               border-top-color: #0ff; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 24px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.4rem; font-weight: 500; margin: 0 0 8px; }
    p { font-size: 0.9rem; color: #888; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Starting your KIN...</h1>
    <p>${subdomain}.kin.kr8tiv.ai is waking up</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// WakeProxy
// ---------------------------------------------------------------------------

export interface WakeProxyOptions {
  fleetDb: FleetDb;
  dockerSocket?: string;
  port?: number;
  idleConfig?: Partial<IdleConfig>;
}

export class WakeProxy {
  private readonly fleetDb: FleetDb;
  private readonly docker: Docker;
  private readonly port: number;
  private readonly idleConfig: IdleConfig;
  private readonly waking = new Map<string, Promise<void>>();
  private server: http.Server | null = null;
  private proxy: ReturnType<typeof createProxyServer> | null = null;

  constructor(opts: WakeProxyOptions) {
    this.fleetDb = opts.fleetDb;
    this.docker = new Docker({
      socketPath: opts.dockerSocket ?? DEFAULT_DOCKER_SOCKET,
    });
    this.port = opts.port ?? DEFAULT_PORT;
    this.idleConfig = { ...DEFAULT_IDLE_CONFIG, ...opts.idleConfig };
  }

  // -----------------------------------------------------------------------
  // Subdomain extraction
  // -----------------------------------------------------------------------

  /**
   * Extract subdomain from Host header. Strips port, extracts first label
   * before `.kin.kr8tiv.ai`. Returns null if invalid.
   */
  extractSubdomain(host: string | undefined): string | null {
    if (!host) return null;

    // Strip port if present
    const parts = host.split(':');
    const hostOnly = parts[0];
    if (!hostOnly) return null;

    // Extract first label
    const dotIndex = hostOnly.indexOf('.');
    if (dotIndex === -1) return null;

    const subdomain = hostOnly.substring(0, dotIndex);
    if (!subdomain || !SUBDOMAIN_RE.test(subdomain)) return null;

    return subdomain;
  }

  // -----------------------------------------------------------------------
  // Target resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve the proxy target URL based on instance ports and request path.
   * /api/* routes to apiPort, everything else to webPort.
   */
  resolveTarget(instance: FleetInstance, path: string): string {
    const isApi = path.startsWith('/api');
    const port = isApi ? instance.apiPort : instance.webPort;
    return `http://localhost:${port}`;
  }

  // -----------------------------------------------------------------------
  // Wake logic
  // -----------------------------------------------------------------------

  /**
   * Wake a stopped instance: start containers, poll health, update DB.
   * Deduplicates concurrent calls via the waking Map.
   */
  async wakeInstance(instance: FleetInstance): Promise<void> {
    // Check for in-flight wake
    const existing = this.waking.get(instance.subdomain);
    if (existing) {
      return existing;
    }

    // Check concurrent wake limit
    if (this.waking.size >= this.idleConfig.maxConcurrentWakes) {
      throw new Error('Too many concurrent wake operations');
    }

    const promise = this.doWake(instance);
    this.waking.set(instance.subdomain, promise);

    try {
      await promise;
    } finally {
      this.waking.delete(instance.subdomain);
    }
  }

  private async doWake(instance: FleetInstance): Promise<void> {
    // Start both containers
    if (instance.apiContainerId) {
      await this.docker.getContainer(instance.apiContainerId).start();
    }
    if (instance.webContainerId) {
      await this.docker.getContainer(instance.webContainerId).start();
    }

    // Poll health endpoint
    const apiPort = instance.apiPort;
    if (!apiPort) {
      throw new Error(`No API port for instance ${instance.id}`);
    }

    let healthy = false;
    for (let attempt = 0; attempt < HEALTH_POLL_MAX_ATTEMPTS; attempt++) {
      try {
        const ok = await this.checkHealth(apiPort);
        if (ok) {
          healthy = true;
          break;
        }
      } catch {
        // Not ready yet — keep polling
      }
      await this.sleep(HEALTH_POLL_INTERVAL_MS);
    }

    if (!healthy) {
      throw new Error(
        `Health check timed out for ${instance.subdomain} after ${HEALTH_POLL_MAX_ATTEMPTS} attempts`,
      );
    }

    // Update DB status
    this.fleetDb.updateInstance(instance.id, { status: 'running' });
  }

  private checkHealth(apiPort: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.get(
        `http://localhost:${apiPort}/health`,
        { timeout: 500 },
        (res) => {
          // Consume response body
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -----------------------------------------------------------------------
  // Request handling
  // -----------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const subdomain = this.extractSubdomain(req.headers.host);

    // Malformed or missing subdomain
    if (!subdomain) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing subdomain' }));
      return;
    }

    // Look up instance
    let instance: FleetInstance | null;
    try {
      instance = this.fleetDb.getInstanceBySubdomain(subdomain);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error looking up instance' }));
      return;
    }

    if (!instance) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No instance found for subdomain: ${subdomain}` }));
      return;
    }

    // Reject non-wakeable states
    if (instance.status === 'removing' || instance.status === 'error') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Instance is in '${instance.status}' state and cannot serve requests`,
        }),
      );
      return;
    }

    // If stopped or provisioning, wake it
    if (instance.status === 'stopped' || instance.status === 'provisioning') {
      // Check if browser request — serve loading page
      const accept = req.headers.accept ?? '';
      const isBrowser = accept.includes('text/html');

      if (isBrowser && !this.waking.has(subdomain)) {
        // First browser hit for a sleeping instance — return loading page
        // and trigger wake in background
        this.wakeInstance(instance).catch(() => {
          /* wake errors handled by subsequent requests */
        });
        res.writeHead(503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Retry-After': '2',
        });
        res.end(loadingPageHtml(subdomain));
        return;
      }

      if (isBrowser && this.waking.has(subdomain)) {
        // Already waking — serve loading page
        res.writeHead(503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Retry-After': '2',
        });
        res.end(loadingPageHtml(subdomain));
        return;
      }

      // API request — hold connection and wait for wake
      try {
        await this.wakeInstance(instance);
        // Refresh instance after wake
        instance = this.fleetDb.getInstanceBySubdomain(subdomain);
        if (!instance) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Instance disappeared during wake' }));
          return;
        }
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Failed to wake instance: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
        return;
      }
    }

    // At this point instance is running — proxy the request
    const path = req.url ?? '/';
    const target = this.resolveTarget(instance, path);

    // Update activity
    this.fleetDb.updateLastActivity(subdomain);

    // Proxy
    try {
      this.proxy!.web(req, res, { target });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error' }));
      }
    }
  }

  // -----------------------------------------------------------------------
  // WebSocket upgrade
  // -----------------------------------------------------------------------

  private handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    const subdomain = this.extractSubdomain(req.headers.host);

    if (!subdomain) {
      socket.destroy();
      return;
    }

    const instance = this.fleetDb.getInstanceBySubdomain(subdomain);
    if (!instance || instance.status !== 'running') {
      socket.destroy();
      return;
    }

    const path = req.url ?? '/';
    const target = this.resolveTarget(instance, path);

    this.fleetDb.updateLastActivity(subdomain);

    try {
      this.proxy!.ws(req, socket as any, head, { target });
    } catch {
      socket.destroy();
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.proxy = createProxyServer({});

      // Handle proxy errors gracefully
      this.proxy.on('error', (err: Error, _req: http.IncomingMessage, res: http.ServerResponse | Duplex) => {
        if ('writeHead' in res && !(res as http.ServerResponse).headersSent) {
          (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
          (res as http.ServerResponse).end(JSON.stringify({ error: 'Bad gateway' }));
        }
      });

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal proxy error' }));
          }
        });
      });

      this.server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.proxy) {
        this.proxy.close();
        this.proxy = null;
      }
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWakeProxy(opts: WakeProxyOptions): WakeProxy {
  return new WakeProxy(opts);
}
