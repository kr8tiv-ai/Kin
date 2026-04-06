/**
 * Fleet Control Plane — Container Lifecycle Manager
 *
 * Wraps the Docker API (via dockerode) for provisioning, starting, stopping,
 * removing, and health-checking KIN container instances. Each instance gets
 * 2 containers (kin-api + kin-web) with enforced resource limits.
 */

import Docker from 'dockerode';
import { FleetDb } from './db.js';
import { CreditDb } from './credit-db.js';
import { TunnelManager } from './tunnel-manager.js';
import {
  DEFAULT_CPU_SHARES,
  DEFAULT_MEMORY_MB,
} from './types.js';
import type {
  FleetInstance,
  FleetResourceLimits,
} from './types.js';
import {
  getGhcrImageBase,
  GHCR_REGISTRY,
} from '../scripts/ghcr-contract.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Internal port for kin-api containers */
const API_INTERNAL_PORT = 3002;

/** Internal port for kin-web containers */
const WEB_INTERNAL_PORT = 3001;

/** Base host port for api service allocation */
const API_PORT_BASE = 4000;

/** Base host port for web service allocation */
const WEB_PORT_BASE = 5000;

/** Default Docker socket path */
const DEFAULT_SOCKET_PATH = '/var/run/docker.sock';

/** Timeout for image pull operations (ms) */
const IMAGE_PULL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface FleetLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/** Silent no-op logger used when none is provided */
const nullLogger: FleetLogger = {
  info() {},
  warn() {},
  error() {},
};

// ---------------------------------------------------------------------------
// Resource usage response
// ---------------------------------------------------------------------------

export interface ContainerResourceUsage {
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage in bytes */
  memoryUsageBytes: number;
  /** Memory limit in bytes */
  memoryLimitBytes: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
}

export interface InstanceResourceUsage {
  instanceId: string;
  api: ContainerResourceUsage | null;
  web: ContainerResourceUsage | null;
}

// ---------------------------------------------------------------------------
// ContainerManager
// ---------------------------------------------------------------------------

export class ContainerManager {
  private docker: Docker | null = null;
  private readonly socketPath: string;
  private readonly fleetDb: FleetDb;
  private readonly creditDb: CreditDb | null;
  private readonly tunnelManager: TunnelManager | null;
  private readonly tunnelBaseDomain: string;
  private readonly logger: FleetLogger;
  private readonly ghcrOwner: string;

  /**
   * @param opts.dockerSocketPath  Path to the Docker socket (default: /var/run/docker.sock)
   * @param opts.fleetDb           FleetDb instance for state persistence
   * @param opts.creditDb          Optional CreditDb for proxy token lifecycle
   * @param opts.tunnelManager     Optional TunnelManager for Cloudflare Tunnel lifecycle
   * @param opts.tunnelBaseDomain  Base domain for tunnel subdomains (default: 'kin.kr8tiv.ai')
   * @param opts.logger            Optional structured logger
   * @param opts.ghcrOwner         GHCR image owner (default: 'kr8tiv-ai')
   */
  constructor(opts: {
    dockerSocketPath?: string;
    fleetDb: FleetDb;
    creditDb?: CreditDb;
    tunnelManager?: TunnelManager;
    tunnelBaseDomain?: string;
    logger?: FleetLogger;
    ghcrOwner?: string;
  }) {
    this.socketPath = opts.dockerSocketPath ?? DEFAULT_SOCKET_PATH;
    this.fleetDb = opts.fleetDb;
    this.creditDb = opts.creditDb ?? null;
    this.tunnelManager = opts.tunnelManager ?? null;
    this.tunnelBaseDomain = opts.tunnelBaseDomain ?? 'kin.kr8tiv.ai';
    this.logger = opts.logger ?? nullLogger;
    this.ghcrOwner = opts.ghcrOwner ?? 'kr8tiv-ai';
  }

  // -----------------------------------------------------------------------
  // Docker client (lazy init)
  // -----------------------------------------------------------------------

  private getDocker(): Docker {
    if (!this.docker) {
      this.docker = new Docker({ socketPath: this.socketPath });
    }
    return this.docker;
  }

  // -----------------------------------------------------------------------
  // Port allocation
  // -----------------------------------------------------------------------

  /**
   * Find the next available host port starting from `basePort`.
   * Scans the fleet DB for ports already in use.
   */
  getAvailablePort(basePort: number, existingPorts: number[]): number {
    const used = new Set(existingPorts);
    let candidate = basePort;
    while (used.has(candidate)) {
      candidate++;
    }
    return candidate;
  }

  /** Collect all api ports currently allocated in the fleet DB. */
  private getAllocatedApiPorts(): number[] {
    return this.fleetDb
      .listInstances()
      .filter((i) => i.apiPort !== null)
      .map((i) => i.apiPort as number);
  }

  /** Collect all web ports currently allocated in the fleet DB. */
  private getAllocatedWebPorts(): number[] {
    return this.fleetDb
      .listInstances()
      .filter((i) => i.webPort !== null)
      .map((i) => i.webPort as number);
  }

  // -----------------------------------------------------------------------
  // Image helpers
  // -----------------------------------------------------------------------

  /** Get the full image ref for a service (latest tag). */
  private getImageRef(service: 'api' | 'web'): string {
    const imageName = service === 'api' ? 'kin-api' : 'kin-web';
    return `${getGhcrImageBase(this.ghcrOwner, imageName, GHCR_REGISTRY)}:latest`;
  }

  /** Pull an image with a timeout. Resolves when pull completes. */
  private async pullImage(imageRef: string): Promise<void> {
    const docker = this.getDocker();
    this.logger.info('Pulling image', { image: imageRef });

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Image pull timed out after ${IMAGE_PULL_TIMEOUT_MS}ms: ${imageRef}`));
      }, IMAGE_PULL_TIMEOUT_MS);

      docker
        .pull(imageRef)
        .then((stream) => {
          docker.modem.followProgress(stream, (err: Error | null) => {
            clearTimeout(timer);
            if (err) {
              reject(new Error(`Image pull failed: ${imageRef} — ${err.message}`));
            } else {
              resolve();
            }
          });
        })
        .catch((err: Error) => {
          clearTimeout(timer);
          reject(new Error(`Image pull failed: ${imageRef} — ${err.message}`));
        });
    });
  }

  // -----------------------------------------------------------------------
  // Provision
  // -----------------------------------------------------------------------

  /**
   * Provision a new fleet instance: create 2 containers (api + web),
   * apply resource limits, start them, and persist state.
   */
  async provision(
    userId: string,
    subdomain: string,
    resourceLimits?: Partial<FleetResourceLimits>,
  ): Promise<FleetInstance> {
    const cpuShares = resourceLimits?.cpuShares ?? DEFAULT_CPU_SHARES;
    const memoryMb = resourceLimits?.memoryMb ?? DEFAULT_MEMORY_MB;
    const memoryBytes = memoryMb * 1024 * 1024;

    // Create DB record first (status: 'provisioning')
    const instance = this.fleetDb.createInstance(userId, subdomain, {
      cpuShares,
      memoryMb,
    });

    this.logger.info('Provisioning fleet instance', {
      instanceId: instance.id,
      userId,
      subdomain,
    });

    try {
      // Allocate host ports
      const apiPort = this.getAvailablePort(API_PORT_BASE, this.getAllocatedApiPorts());
      const webPort = this.getAvailablePort(WEB_PORT_BASE, this.getAllocatedWebPorts());

      // Pull images (best-effort — may already be cached)
      const apiImage = this.getImageRef('api');
      const webImage = this.getImageRef('web');

      try {
        await this.pullImage(apiImage);
        await this.pullImage(webImage);
      } catch (pullErr) {
        const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
        this.logger.warn('Image pull failed, attempting with local cache', { error: msg });
        // Continue — images may already be available locally
      }

      // Generate proxy token if credit metering is enabled
      const proxyEnvVars: string[] = [];
      if (this.creditDb) {
        const proxyToken = this.creditDb.createProxyToken(userId, instance.id);
        const proxyUrl = process.env.FRONTIER_PROXY_URL ?? 'http://frontier-proxy:8080';
        proxyEnvVars.push(`FRONTIER_PROXY_URL=${proxyUrl}`);
        proxyEnvVars.push(`FRONTIER_PROXY_TOKEN=${proxyToken}`);
        this.logger.info('Proxy token generated for instance', {
          instanceId: instance.id,
          userId,
        });
      }

      // Create Cloudflare Tunnel if TunnelManager is configured (additive — failure is non-blocking)
      const tunnelEnvVars: string[] = [];
      if (this.tunnelManager) {
        try {
          const tunnelName = `kin-${subdomain}`;
          const ollamaHostname = `ollama.${subdomain}.${this.tunnelBaseDomain}`;

          this.logger.info('Creating tunnel for instance', {
            instanceId: instance.id,
            tunnelName,
            ollamaHostname,
          });

          const { tunnelId, token } = await this.tunnelManager.createTunnel(tunnelName);
          await this.tunnelManager.configureTunnel(tunnelId, ollamaHostname, 'http://localhost:11434');
          const { recordId: dnsRecordId } = await this.tunnelManager.createDnsRecord(ollamaHostname, tunnelId);

          this.fleetDb.updateTunnelInfo(instance.id, tunnelId, token, 'provisioned', dnsRecordId);
          tunnelEnvVars.push(`OLLAMA_HOST=https://${ollamaHostname}`);

          this.logger.info('Tunnel created for instance', {
            instanceId: instance.id,
            tunnelId,
            dnsRecordId,
          });
        } catch (tunnelErr) {
          const msg = tunnelErr instanceof Error ? tunnelErr.message : String(tunnelErr);
          this.logger.error('Tunnel creation failed — continuing without tunnel', {
            instanceId: instance.id,
            error: msg,
          });
          this.fleetDb.updateInstance(instance.id, {
            lastError: `Tunnel creation failed: ${msg}`,
          });
        }
      }

      const docker = this.getDocker();

      // Create api container
      const apiContainerName = `kin-${subdomain}-api`;
      const apiContainer = await docker.createContainer({
        Image: apiImage,
        name: apiContainerName,
        Env: [
          'NODE_ENV=production',
          'HOST=0.0.0.0',
          `PORT=${API_INTERNAL_PORT}`,
          'DATABASE_PATH=/app/data/kin.db',
          ...proxyEnvVars,
          ...tunnelEnvVars,
        ],
        ExposedPorts: { [`${API_INTERNAL_PORT}/tcp`]: {} },
        HostConfig: {
          CpuShares: cpuShares,
          Memory: memoryBytes,
          PortBindings: {
            [`${API_INTERNAL_PORT}/tcp`]: [{ HostPort: String(apiPort) }],
          },
          RestartPolicy: { Name: 'unless-stopped' },
        },
        Labels: {
          'kin.fleet.instance': instance.id,
          'kin.fleet.service': 'api',
          'kin.fleet.subdomain': subdomain,
        },
      });

      // Create web container
      const webContainerName = `kin-${subdomain}-web`;
      const webContainer = await docker.createContainer({
        Image: webImage,
        name: webContainerName,
        Env: [
          'NODE_ENV=production',
          'HOSTNAME=0.0.0.0',
          `PORT=${WEB_INTERNAL_PORT}`,
          `NEXT_PUBLIC_API_URL=http://host.docker.internal:${apiPort}`,
          ...proxyEnvVars,
        ],
        ExposedPorts: { [`${WEB_INTERNAL_PORT}/tcp`]: {} },
        HostConfig: {
          CpuShares: cpuShares,
          Memory: memoryBytes,
          PortBindings: {
            [`${WEB_INTERNAL_PORT}/tcp`]: [{ HostPort: String(webPort) }],
          },
          RestartPolicy: { Name: 'unless-stopped' },
        },
        Labels: {
          'kin.fleet.instance': instance.id,
          'kin.fleet.service': 'web',
          'kin.fleet.subdomain': subdomain,
        },
      });

      // Persist container IDs + ports
      this.fleetDb.updateContainerIds(
        instance.id,
        apiContainer.id,
        webContainer.id,
        apiPort,
        webPort,
      );

      // Start both containers
      await apiContainer.start();
      await webContainer.start();

      // Mark running
      const updated = this.fleetDb.updateStatus(instance.id, 'running');

      this.logger.info('Fleet instance provisioned', {
        instanceId: instance.id,
        apiContainerId: apiContainer.id,
        webContainerId: webContainer.id,
        apiPort,
        webPort,
      });

      return updated!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Provision failed', {
        instanceId: instance.id,
        error: msg,
      });
      this.fleetDb.updateInstance(instance.id, {
        status: 'error',
        lastError: `Provision failed: ${msg}`,
      });
      // Re-fetch so caller gets the error state
      return this.fleetDb.getInstance(instance.id)!;
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle — start / stop / remove
  // -----------------------------------------------------------------------

  /** Start both containers for a stopped instance. */
  async startInstance(instanceId: string): Promise<FleetInstance> {
    const instance = this.fleetDb.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Fleet instance not found: ${instanceId}`);
    }

    this.logger.info('Starting fleet instance', { instanceId });

    try {
      const docker = this.getDocker();

      if (instance.apiContainerId) {
        await docker.getContainer(instance.apiContainerId).start();
      }
      if (instance.webContainerId) {
        await docker.getContainer(instance.webContainerId).start();
      }

      const updated = this.fleetDb.updateStatus(instanceId, 'running');
      this.logger.info('Fleet instance started', { instanceId });
      return updated!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Start failed', { instanceId, error: msg });
      this.fleetDb.updateInstance(instanceId, {
        status: 'error',
        lastError: `Start failed: ${msg}`,
      });
      return this.fleetDb.getInstance(instanceId)!;
    }
  }

  /** Stop both containers for a running instance. */
  async stopInstance(instanceId: string): Promise<FleetInstance> {
    const instance = this.fleetDb.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Fleet instance not found: ${instanceId}`);
    }

    this.logger.info('Stopping fleet instance', { instanceId });

    try {
      const docker = this.getDocker();

      if (instance.apiContainerId) {
        await docker.getContainer(instance.apiContainerId).stop({ t: 10 });
      }
      if (instance.webContainerId) {
        await docker.getContainer(instance.webContainerId).stop({ t: 10 });
      }

      const updated = this.fleetDb.updateStatus(instanceId, 'stopped');
      this.logger.info('Fleet instance stopped', { instanceId });
      return updated!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Stop failed', { instanceId, error: msg });
      this.fleetDb.updateInstance(instanceId, {
        status: 'error',
        lastError: `Stop failed: ${msg}`,
      });
      return this.fleetDb.getInstance(instanceId)!;
    }
  }

  /** Stop + remove both containers, then delete the DB row. */
  async removeInstance(instanceId: string): Promise<void> {
    const instance = this.fleetDb.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Fleet instance not found: ${instanceId}`);
    }

    this.logger.info('Removing fleet instance', { instanceId });
    this.fleetDb.updateStatus(instanceId, 'removing');

    try {
      const docker = this.getDocker();

      // Stop + remove api container
      if (instance.apiContainerId) {
        const c = docker.getContainer(instance.apiContainerId);
        try {
          await c.stop({ t: 5 });
        } catch {
          // May already be stopped — acceptable
        }
        await c.remove({ force: true });
      }

      // Stop + remove web container
      if (instance.webContainerId) {
        const c = docker.getContainer(instance.webContainerId);
        try {
          await c.stop({ t: 5 });
        } catch {
          // May already be stopped — acceptable
        }
        await c.remove({ force: true });
      }

      // Clean up Cloudflare Tunnel + DNS (best-effort — failures don't block removal)
      if (this.tunnelManager && instance.tunnelId) {
        if (instance.dnsRecordId) {
          try {
            await this.tunnelManager.deleteDnsRecord(instance.dnsRecordId);
            this.logger.info('Deleted DNS record for removed instance', {
              instanceId,
              dnsRecordId: instance.dnsRecordId,
            });
          } catch (dnsErr) {
            const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
            this.logger.warn('DNS record cleanup failed — continuing removal', {
              instanceId,
              dnsRecordId: instance.dnsRecordId,
              error: msg,
            });
          }
        }

        try {
          await this.tunnelManager.deleteTunnel(instance.tunnelId);
          this.logger.info('Deleted tunnel for removed instance', {
            instanceId,
            tunnelId: instance.tunnelId,
          });
        } catch (tunErr) {
          const msg = tunErr instanceof Error ? tunErr.message : String(tunErr);
          this.logger.warn('Tunnel cleanup failed — continuing removal', {
            instanceId,
            tunnelId: instance.tunnelId,
            error: msg,
          });
        }
      }

      // Revoke proxy tokens before deleting DB row
      if (this.creditDb) {
        const revoked = this.creditDb.revokeProxyTokens(instanceId);
        if (revoked > 0) {
          this.logger.info('Revoked proxy tokens for removed instance', {
            instanceId,
            tokensRevoked: revoked,
          });
        }
      }

      // Delete DB row
      this.fleetDb.removeInstance(instanceId);
      this.logger.info('Fleet instance removed', { instanceId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Remove failed', { instanceId, error: msg });
      this.fleetDb.updateInstance(instanceId, {
        status: 'error',
        lastError: `Remove failed: ${msg}`,
      });
      throw new Error(`Remove failed for ${instanceId}: ${msg}`);
    }
  }

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  /**
   * Check health of the api container by inspecting its Docker state.
   * Updates the fleet DB with the health result.
   */
  async checkHealth(instanceId: string): Promise<FleetInstance> {
    const instance = this.fleetDb.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Fleet instance not found: ${instanceId}`);
    }

    this.logger.info('Checking health', { instanceId });

    try {
      if (!instance.apiContainerId) {
        this.fleetDb.updateHealth(instanceId, 'unhealthy', 'No API container ID');
        return this.fleetDb.getInstance(instanceId)!;
      }

      const docker = this.getDocker();
      const info = await docker.getContainer(instance.apiContainerId).inspect();

      if (info.State.Running) {
        this.fleetDb.updateHealth(instanceId, 'healthy');
        this.logger.info('Health check passed', { instanceId });
      } else {
        const errorMsg = `API container not running (state: ${info.State.Status})`;
        this.fleetDb.updateHealth(instanceId, 'unhealthy', errorMsg);
        this.logger.warn('Health check failed', { instanceId, state: info.State.Status });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Health check error', { instanceId, error: msg });
      this.fleetDb.updateHealth(instanceId, 'unhealthy', `Health check failed: ${msg}`);
    }

    return this.fleetDb.getInstance(instanceId)!;
  }

  // -----------------------------------------------------------------------
  // Resource usage
  // -----------------------------------------------------------------------

  /** Read Docker container stats for CPU/memory usage. */
  async getResourceUsage(instanceId: string): Promise<InstanceResourceUsage> {
    const instance = this.fleetDb.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Fleet instance not found: ${instanceId}`);
    }

    const result: InstanceResourceUsage = {
      instanceId,
      api: null,
      web: null,
    };

    const docker = this.getDocker();

    if (instance.apiContainerId) {
      result.api = await this.readContainerStats(docker, instance.apiContainerId);
    }
    if (instance.webContainerId) {
      result.web = await this.readContainerStats(docker, instance.webContainerId);
    }

    return result;
  }

  /** Read stats for a single container, returning null on error. */
  private async readContainerStats(
    docker: Docker,
    containerId: string,
  ): Promise<ContainerResourceUsage | null> {
    try {
      const stats = await docker.getContainer(containerId).stats({ stream: false });

      // CPU calculation: delta usage / delta system * 100
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
      const systemDelta =
        stats.cpu_stats.system_cpu_usage -
        (stats.precpu_stats?.system_cpu_usage ?? 0);
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      const memUsage = stats.memory_stats?.usage ?? 0;
      const memLimit = stats.memory_stats?.limit ?? 1;
      const memPercent = (memUsage / memLimit) * 100;

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsageBytes: memUsage,
        memoryLimitBytes: memLimit,
        memoryPercent: Math.round(memPercent * 100) / 100,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn('Failed to read container stats', {
        containerId,
        error: msg,
      });
      return null;
    }
  }
}
