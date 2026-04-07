/**
 * Cloudflare Tunnel Manager — wraps the Cloudflare v4 REST API
 *
 * Provides lifecycle management for per-user Cloudflare Tunnels:
 * create tunnel → configure ingress → create DNS CNAME → status → cleanup.
 *
 * All methods throw on non-2xx responses with Cloudflare error detail.
 *
 * @module fleet/tunnel-manager
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TunnelManagerConfig {
  /** Cloudflare API token with Tunnel + DNS permissions */
  apiToken: string;
  /** Cloudflare account ID */
  accountId: string;
  /** Cloudflare zone ID for DNS record management */
  zoneId: string;
  /** Base domain for tunnel subdomains (e.g. "kin.kr8tiv.ai") */
  baseDomain: string;
}

export interface CreateTunnelResult {
  tunnelId: string;
  token: string;
}

export interface TunnelStatusResult {
  id: string;
  name: string;
  status: string;
  connections: Array<{
    id: string;
    clientVersion: string;
    originIp: string;
  }>;
}

export interface DnsRecordResult {
  recordId: string;
}

// ---------------------------------------------------------------------------
// Cloudflare API error
// ---------------------------------------------------------------------------

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Array<{ code: number; message: string }> = [],
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

// ---------------------------------------------------------------------------
// TunnelManager
// ---------------------------------------------------------------------------

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export class TunnelManager {
  private apiToken: string;
  private accountId: string;
  private zoneId: string;
  private baseDomain: string;

  constructor(config: TunnelManagerConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
    this.zoneId = config.zoneId;
    this.baseDomain = config.baseDomain;
  }

  // -------------------------------------------------------------------------
  // Tunnel lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a named Cloudflare Tunnel.
   * POST /accounts/{accountId}/cfd_tunnel
   */
  async createTunnel(name: string): Promise<CreateTunnelResult> {
    const url = `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel`;
    const body = { name, tunnel_secret: this.generateSecret() };

    const data = await this.cfFetch<{
      id: string;
      token: string;
    }>(url, 'POST', body);

    console.info(`[TunnelManager] Created tunnel name=${name} tunnelId=${data.id}`);
    return { tunnelId: data.id, token: data.token };
  }

  /**
   * Configure tunnel ingress rules.
   * PUT /accounts/{accountId}/cfd_tunnel/{tunnelId}/configurations
   */
  async configureTunnel(
    tunnelId: string,
    hostname: string,
    originService: string,
  ): Promise<void> {
    const url = `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`;
    const body = {
      config: {
        ingress: [
          { hostname, service: originService },
          { service: 'http_status:404' }, // catch-all required by CF
        ],
      },
    };

    await this.cfFetch(url, 'PUT', body);
    console.info(
      `[TunnelManager] Configured tunnel tunnelId=${tunnelId} hostname=${hostname} origin=${originService}`,
    );
  }

  /**
   * Create a DNS CNAME record pointing hostname → tunnel.
   * POST /zones/{zoneId}/dns_records
   */
  async createDnsRecord(hostname: string, tunnelId: string): Promise<DnsRecordResult> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records`;
    const body = {
      type: 'CNAME',
      name: hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      ttl: 1, // auto
    };

    const data = await this.cfFetch<{ id: string }>(url, 'POST', body);
    console.info(
      `[TunnelManager] Created DNS CNAME hostname=${hostname} tunnelId=${tunnelId} recordId=${data.id}`,
    );
    return { recordId: data.id };
  }

  /**
   * Get tunnel status and active connections.
   * GET /accounts/{accountId}/cfd_tunnel/{tunnelId}
   */
  async getTunnelStatus(tunnelId: string): Promise<TunnelStatusResult> {
    const url = `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel/${tunnelId}`;
    const data = await this.cfFetch<{
      id: string;
      name: string;
      status: string;
      connections: Array<{
        id: string;
        client_version: string;
        origin_ip: string;
      }>;
    }>(url, 'GET');

    console.info(
      `[TunnelManager] Status tunnelId=${tunnelId} status=${data.status} connections=${data.connections?.length ?? 0}`,
    );

    return {
      id: data.id,
      name: data.name,
      status: data.status,
      connections: (data.connections ?? []).map((c) => ({
        id: c.id,
        clientVersion: c.client_version,
        originIp: c.origin_ip,
      })),
    };
  }

  /**
   * Delete a Cloudflare Tunnel.
   * DELETE /accounts/{accountId}/cfd_tunnel/{tunnelId}
   */
  async deleteTunnel(tunnelId: string): Promise<void> {
    const url = `${CF_API_BASE}/accounts/${this.accountId}/cfd_tunnel/${tunnelId}`;
    await this.cfFetch(url, 'DELETE');
    console.info(`[TunnelManager] Deleted tunnel tunnelId=${tunnelId}`);
  }

  /**
   * Delete a DNS record by ID.
   * DELETE /zones/{zoneId}/dns_records/{recordId}
   */
  async deleteDnsRecord(recordId: string): Promise<void> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records/${recordId}`;
    await this.cfFetch(url, 'DELETE');
    console.info(`[TunnelManager] Deleted DNS record recordId=${recordId}`);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Core fetch wrapper for Cloudflare v4 API.
   * Extracts `.result` on success, throws CloudflareApiError on failure.
   */
  private async cfFetch<T>(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[TunnelManager] Network error url=${url} error=${msg}`);
      throw new CloudflareApiError(`Network error: ${msg}`, 0);
    }

    const json = (await response.json()) as {
      success: boolean;
      result?: T;
      errors?: Array<{ code: number; message: string }>;
    };

    if (!response.ok || !json.success) {
      const errors = json.errors ?? [];
      const detail = errors.map((e) => `[${e.code}] ${e.message}`).join('; ') || 'Unknown error';
      console.warn(
        `[TunnelManager] API error url=${url} httpStatus=${response.status} detail=${detail}`,
      );
      throw new CloudflareApiError(
        `Cloudflare API error (${response.status}): ${detail}`,
        response.status,
        errors,
      );
    }

    return json.result as T;
  }

  /** Generate a random base64 secret for tunnel creation. */
  private generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
  }
}
