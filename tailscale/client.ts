/**
 * Tailscale Client - Remote access integration
 *
 * Provides:
 * - Tailscale API integration
 * - Device pairing flow
 * - Remote access from Mission Control
 * - Trust ladder enforcement
 * - Security boundaries
 *
 * @module tailscale/client
 */

// ============================================================================
// Types
// ============================================================================

export interface TailscaleConfig {
  /** Tailscale API key */
  apiKey?: string;
  /** Tailnet name */
  tailnet?: string;
  /** OAuth client ID */
  oauthClientId?: string;
  /** OAuth client secret */
  oauthClientSecret?: string;
  /** API base URL */
  apiUrl?: string;
}

export interface Device {
  id: string;
  name: string;
  hostname: string;
  ipAddresses: string[];
  os: string;
  online: boolean;
  lastSeen: Date;
  exitNode: boolean;
  tags: string[];
  user: string;
  created: Date;
}

export interface PeerConnection {
  peerId: string;
  peerName: string;
  peerIp: string;
  connected: boolean;
  latencyMs: number;
  uploadBytes: number;
  downloadBytes: number;
}

export interface TrustLevel {
  level: number;
  name: string;
  description: string;
  permissions: string[];
  maxSessionDuration: number; // in seconds
  requiresMfa: boolean;
}

export interface RemoteSession {
  id: string;
  deviceId: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;
  trustLevel: number;
  active: boolean;
  commands: string[];
}

export interface AccessRequest {
  userId: string;
  deviceId: string;
  reason: string;
  requestedDuration: number;
  trustLevel: number;
}

// ============================================================================
// Trust Ladder Definition
// ============================================================================

const TRUST_LADDER: TrustLevel[] = [
  {
    level: 0,
    name: 'Guest',
    description: 'One-time access with heavy restrictions',
    permissions: ['view_status'],
    maxSessionDuration: 300, // 5 minutes
    requiresMfa: true,
  },
  {
    level: 1,
    name: 'Visitor',
    description: 'Limited access with monitoring',
    permissions: ['view_status', 'view_logs'],
    maxSessionDuration: 900, // 15 minutes
    requiresMfa: true,
  },
  {
    level: 2,
    name: 'Member',
    description: 'Standard access for trusted users',
    permissions: ['view_status', 'view_logs', 'execute_readonly', 'ssh_view'],
    maxSessionDuration: 3600, // 1 hour
    requiresMfa: true,
  },
  {
    level: 3,
    name: 'Admin',
    description: 'Full access with audit logging',
    permissions: ['view_status', 'view_logs', 'execute_readonly', 'execute_write', 'ssh_full', 'manage_devices'],
    maxSessionDuration: 28800, // 8 hours
    requiresMfa: false, // Already trusted
  },
  {
    level: 4,
    name: 'Owner',
    description: 'Unlimited access and configuration',
    permissions: ['*'],
    maxSessionDuration: 0, // No limit
    requiresMfa: false,
  },
];

// ============================================================================
// Tailscale API Client
// ============================================================================

export class TailscaleClient {
  private apiKey: string;
  private tailnet: string;
  private apiUrl: string;

  constructor(config: TailscaleConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.TAILSCALE_API_KEY ?? '';
    this.tailnet = config.tailnet ?? process.env.TAILSCALE_TAILNET ?? '';
    this.apiUrl = config.apiUrl ?? 'https://api.tailscale.com/api/v2';
  }

  // ==========================================================================
  // Device Management
  // ==========================================================================

  /**
   * List all devices in the tailnet
   */
  async listDevices(): Promise<Device[]> {
    const response = await this.request(`/tailnet/${this.tailnet}/devices`);
    
    const data = await response.json() as { devices: any[] };
    
    return data.devices.map((d: any) => ({
      id: d.id,
      name: d.name,
      hostname: d.hostname,
      ipAddresses: d.addresses ?? [],
      os: d.os,
      online: d.online ?? false,
      lastSeen: new Date(d.lastSeen ?? Date.now()),
      exitNode: d.exitNode ?? false,
      tags: d.tags ?? [],
      user: d.user?.loginName ?? '',
      created: new Date(d.created ?? Date.now()),
    }));
  }

  /**
   * Get a specific device
   */
  async getDevice(deviceId: string): Promise<Device> {
    const response = await this.request(`/device/${deviceId}`);
    const d = await response.json() as any;

    return {
      id: d.id,
      name: d.name,
      hostname: d.hostname,
      ipAddresses: d.addresses ?? [],
      os: d.os,
      online: d.online ?? false,
      lastSeen: new Date(d.lastSeen ?? Date.now()),
      exitNode: d.exitNode ?? false,
      tags: d.tags ?? [],
      user: d.user?.loginName ?? '',
      created: new Date(d.created ?? Date.now()),
    };
  }

  /**
   * Authorize a device
   */
  async authorizeDevice(deviceId: string): Promise<void> {
    await this.request(`/device/${deviceId}/authorized`, {
      method: 'POST',
      body: JSON.stringify({ authorized: true }),
    });
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await this.request(`/device/${deviceId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Tag a device
   */
  async tagDevice(deviceId: string, tags: string[]): Promise<void> {
    await this.request(`/device/${deviceId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    });
  }

  // ==========================================================================
  // Access Control
  // ==========================================================================

  /**
   * Get current ACL
   */
  async getAcl(): Promise<any> {
    const response = await this.request(`/tailnet/${this.tailnet}/acl`);
    return response.json();
  }

  /**
   * Update ACL
   */
  async updateAcl(acl: any): Promise<void> {
    await this.request(`/tailnet/${this.tailnet}/acl`, {
      method: 'POST',
      body: JSON.stringify(acl),
    });
  }

  // ==========================================================================
  // DNS
  // ==========================================================================

  /**
   * Get DNS nameservers
   */
  async getDnsNameservers(): Promise<string[]> {
    const response = await this.request(`/tailnet/${this.tailnet}/dns/nameservers`);
    const data = await response.json() as { nameservers: string[] };
    return data.nameservers ?? [];
  }

  /**
   * Set DNS nameservers
   */
  async setDnsNameservers(nameservers: string[]): Promise<void> {
    await this.request(`/tailnet/${this.tailnet}/dns/nameservers`, {
      method: 'POST',
      body: JSON.stringify({ nameservers }),
    });
  }

  // ==========================================================================
  // Key Management
  // ==========================================================================

  /**
   * Create an auth key for device registration
   */
  async createAuthKey(options: {
    description?: string;
    expirySeconds?: number;
    reusable: boolean;
    tags?: string[];
  }): Promise<{ key: string }> {
    const response = await this.request(`/tailnet/${this.tailnet}/keys`, {
      method: 'POST',
      body: JSON.stringify({
        capabilities: {
          devices: {
            create: {
              reusable: options.reusable,
              tags: options.tags ?? [],
            },
          },
        },
        description: options.description,
        expirySeconds: options.expirySeconds ?? 86400,
      }),
    });

    const data = await response.json() as { key: string };
    return data;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.apiUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new TailscaleError(
        `Tailscale API error: ${response.status} ${error}`,
        response.status
      );
    }

    return response;
  }
}

// ============================================================================
// Remote Access Manager
// ============================================================================

export class RemoteAccessManager {
  private client: TailscaleClient;
  private sessions: Map<string, RemoteSession> = new Map();

  constructor(config: TailscaleConfig = {}) {
    this.client = new TailscaleClient(config);
  }

  /**
   * Request access to a device
   */
  async requestAccess(request: AccessRequest): Promise<{
    approved: boolean;
    session?: RemoteSession;
    message: string;
  }> {
    // Get trust level config
    const trustLevel = TRUST_LADDER.find(t => t.level === request.trustLevel);
    if (!trustLevel) {
      return {
        approved: false,
        message: `Invalid trust level: ${request.trustLevel}`,
      };
    }

    // Check device exists
    try {
      const device = await this.client.getDevice(request.deviceId);
      
      if (!device.online) {
        return {
          approved: false,
          message: `Device ${request.deviceId} is offline`,
        };
      }
    } catch (error) {
      return {
        approved: false,
        message: `Device not found: ${request.deviceId}`,
      };
    }

    // Create session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const duration = Math.min(request.requestedDuration, trustLevel.maxSessionDuration);
    
    const session: RemoteSession = {
      id: sessionId,
      deviceId: request.deviceId,
      userId: request.userId,
      startedAt: now,
      expiresAt: new Date(now.getTime() + duration * 1000),
      trustLevel: request.trustLevel,
      active: true,
      commands: [],
    };

    this.sessions.set(sessionId, session);

    return {
      approved: true,
      session,
      message: `Access granted at ${trustLevel.name} level for ${duration} seconds`,
    };
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): RemoteSession | undefined {
    const session = this.sessions.get(sessionId);
    
    if (session && new Date() > session.expiresAt) {
      session.active = false;
    }
    
    return session;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
      return true;
    }
    return false;
  }

  /**
   * Check if an action is allowed for a trust level
   */
  isActionAllowed(trustLevel: number, action: string): boolean {
    const level = TRUST_LADDER.find(t => t.level === trustLevel);
    if (!level) return false;

    return level.permissions.includes('*') || level.permissions.includes(action);
  }

  /**
   * Get trust ladder levels
   */
  getTrustLadder(): TrustLevel[] {
    return TRUST_LADDER;
  }

  /**
   * Get user's trust level based on history and verification
   *
   * Trust ladder:
   *   4 Owner  — OWNER_TELEGRAM_ID env match
   *   3 Admin  — manual promotion only (not auto-assigned)
   *   2 Member — earliest session >= 7 days old
   *   1 Visitor — earliest session >= 1 day old
   *   0 Guest  — no session history or earliest session < 1 day
   */
  async getUserTrustLevel(userId: string): Promise<number> {
    // Level 4: Owner — configured in env
    const ownerId = process.env.OWNER_TELEGRAM_ID;
    if (ownerId && userId === ownerId) return 4;

    // Find the earliest session belonging to this user
    let earliestStart: Date | null = null;
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      if (!earliestStart || session.startedAt < earliestStart) {
        earliestStart = session.startedAt;
      }
    }

    // No session history at all → Level 0 (Guest)
    if (!earliestStart) return 0;

    const now = Date.now();
    const sessionAgeMs = now - earliestStart.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Account age < 1 day → Level 0 (Guest)
    if (sessionAgeMs < oneDayMs) return 0;

    // Account age < 7 days → Level 1 (Visitor)
    if (sessionAgeMs < 7 * oneDayMs) return 1;

    // Account age >= 7 days → Level 2 (Member)
    // Level 3 (Admin) requires manual promotion (not auto-assigned)
    return 2;
  }
}

// ============================================================================
// Device Pairing Flow
// ============================================================================

export class DevicePairing {
  private client: TailscaleClient;
  private pendingPairings: Map<string, { 
    authKey: string; 
    createdAt: Date; 
    deviceId?: string;
  }> = new Map();

  constructor(config: TailscaleConfig = {}) {
    this.client = new TailscaleClient(config);
  }

  /**
   * Generate a pairing URL for a new device
   */
  async generatePairingUrl(options: {
    description?: string;
    tags?: string[];
    expiresInSeconds?: number;
  } = {}): Promise<{ pairingUrl: string; pairingCode: string }> {
    // Create a one-time auth key
    const { key } = await this.client.createAuthKey({
      description: options.description ?? 'KIN Platform Device',
      reusable: false,
      tags: options.tags ?? ['tag:kin-device'],
      expirySeconds: options.expiresInSeconds ?? 3600,
    });

    // Generate pairing code
    const pairingCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    // Store pending pairing
    this.pendingPairings.set(pairingCode, {
      authKey: key,
      createdAt: new Date(),
    });

    return {
      pairingUrl: `https://login.tailscale.com/a/${key}`,
      pairingCode,
    };
  }

  /**
   * Check if a pairing is complete
   */
  async checkPairing(pairingCode: string): Promise<{
    complete: boolean;
    device?: Device;
  }> {
    const pending = this.pendingPairings.get(pairingCode);
    if (!pending) {
      return { complete: false };
    }

    // Check if a new device has appeared
    const devices = await this.client.listDevices();
    const newDevice = devices.find(d => 
      d.tags.includes('tag:kin-device') && 
      d.created > pending.createdAt
    );

    if (newDevice) {
      pending.deviceId = newDevice.id;
      return { complete: true, device: newDevice };
    }

    return { complete: false };
  }

  /**
   * Clean up expired pairings
   */
  cleanupExpiredPairings(maxAgeMs: number = 3600000): number {
    const now = new Date();
    let cleaned = 0;

    for (const [code, pending] of this.pendingPairings.entries()) {
      if (now.getTime() - pending.createdAt.getTime() > maxAgeMs) {
        this.pendingPairings.delete(code);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// Easy Onboarding (for non-technical users via Telegram)
// ============================================================================

/**
 * Simplified onboarding flow for users who don't understand networking.
 * Guides them step-by-step through Telegram messages.
 */
export class EasyOnboarding {
  private pairing: DevicePairing;
  private manager: RemoteAccessManager;

  constructor(config: TailscaleConfig = {}) {
    this.pairing = new DevicePairing(config);
    this.manager = new RemoteAccessManager(config);
  }

  /**
   * Get the welcome message explaining what Tailscale does in plain language
   */
  getWelcomeMessage(companionName: string = 'Cipher'): string {
    return [
      `Hey! So here's the deal — I can do way more for you if I can connect to your computer securely.`,
      ``,
      `Think of it like giving me a secure tunnel to your machine so I can:`,
      `- Run tasks on your computer while you're away`,
      `- Fix things without you having to copy-paste commands`,
      `- Access your files to build websites or debug code`,
      ``,
      `It uses a tool called Tailscale — it's free, safe, and takes about 2 minutes to set up.`,
      ``,
      `Want me to walk you through it?`,
    ].join('\n');
  }

  /**
   * Get step-by-step setup instructions as individual messages
   */
  getSetupSteps(): string[] {
    return [
      // Step 1
      [
        `Step 1: Install Tailscale`,
        ``,
        `Go to https://tailscale.com/download and grab the installer for your computer.`,
        ``,
        `- Windows? Click the Windows button`,
        `- Mac? Click the Mac button`,
        `- It'll install in about 30 seconds`,
        ``,
        `Let me know when it's installed!`,
      ].join('\n'),

      // Step 2
      [
        `Step 2: Sign in to Tailscale`,
        ``,
        `Open Tailscale (it should be in your system tray or menu bar).`,
        `Sign in with Google, Microsoft, or whatever you normally use.`,
        ``,
        `That's it — no passwords to create.`,
        ``,
        `Tell me when you're signed in!`,
      ].join('\n'),

      // Step 3
      [
        `Step 3: Connect your device`,
        ``,
        `I'm generating a secure link for you now...`,
      ].join('\n'),
    ];
  }

  /**
   * Generate the pairing link and return the final step message
   */
  async generatePairingStep(): Promise<{ message: string; pairingCode: string }> {
    const { pairingUrl, pairingCode } = await this.pairing.generatePairingUrl({
      description: 'KIN Companion Device',
      tags: ['tag:kin-device'],
      expiresInSeconds: 3600,
    });

    return {
      pairingCode,
      message: [
        `Click this link to connect your device to my network:`,
        `${pairingUrl}`,
        ``,
        `Your pairing code is: ${pairingCode}`,
        ``,
        `Once you click the link and approve, I'll be able to help you from anywhere.`,
        `This link expires in 1 hour.`,
      ].join('\n'),
    };
  }

  /**
   * Check if pairing succeeded and return a friendly message
   */
  async checkPairingStatus(pairingCode: string): Promise<{
    connected: boolean;
    message: string;
    deviceName?: string;
  }> {
    const result = await this.pairing.checkPairing(pairingCode);

    if (result.complete && result.device) {
      return {
        connected: true,
        deviceName: result.device.hostname,
        message: [
          `You're connected! I can see your device: ${result.device.hostname}`,
          ``,
          `I now have secure access to help you with tasks on your computer.`,
          `You can disconnect anytime from the Tailscale app.`,
          ``,
          `What would you like me to help with?`,
        ].join('\n'),
      };
    }

    return {
      connected: false,
      message: `Not connected yet. Did you click the link and approve? Try again or let me know if you need help.`,
    };
  }

  /**
   * Get the trust level explanation in plain language
   */
  getTrustExplanation(): string {
    return [
      `Here's how my access works — I start with limited permissions and earn more as you trust me:`,
      ``,
      `Level 0 - Guest: I can check if your computer is online`,
      `Level 1 - Visitor: I can look at logs and status`,
      `Level 2 - Member: I can run read-only commands and view files`,
      `Level 3 - Admin: I can make changes and run tasks`,
      `Level 4 - Owner: Full access (only for you)`,
      ``,
      `Right now you're at Level 1. As we work together, you can give me more access.`,
    ].join('\n');
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class TailscaleError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'TailscaleError';
  }
}

// ============================================================================
// Singleton & Exports
// ============================================================================

let defaultClient: TailscaleClient | null = null;

export function getTailscaleClient(config?: TailscaleConfig): TailscaleClient {
  if (!defaultClient || config) {
    defaultClient = new TailscaleClient(config);
  }
  return defaultClient;
}

let defaultManager: RemoteAccessManager | null = null;

export function getRemoteAccessManager(config?: TailscaleConfig): RemoteAccessManager {
  if (!defaultManager || config) {
    defaultManager = new RemoteAccessManager(config);
  }
  return defaultManager;
}

export default TailscaleClient;
