/**
 * Ollama Pool Manager - Multi-tenant inference pool
 * 
 * Manages a pool of Ollama instances for efficient shared inference
 * across multiple users/tenants with fair queuing and latency guarantees.
 */

import { OllamaClient, type HealthStatus } from './local-llm.js';

export interface PoolMember {
  id: string;
  client: OllamaClient;
  host: string;
  port: number;
  status: 'healthy' | 'degraded' | 'offline';
  currentLoad: number;
  maxConcurrent: number;
  lastHealthCheck: number;
}

export interface PoolConfig {
  members: Array<{ host: string; port: number; maxConcurrent?: number }>;
  healthCheckIntervalMs: number;
  maxQueueSize: number;
  defaultTimeoutMs: number;
  priorityLevels: number;
}

export interface QueuedRequest {
  id: string;
  userId: string;
  priority: number;
  request: any;
  enqueuedAt: number;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
}

export class OllamaPoolManager {
  private members: Map<string, PoolMember> = new Map();
  private requestQueue: QueuedRequest[] = [];
  private processing = false;
  private config: PoolConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private nextMemberId = 1;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      members: config.members ?? [],
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000,
      maxQueueSize: config.maxQueueSize ?? 1000,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 60000,
      priorityLevels: config.priorityLevels ?? 3,
    };

    for (const memberConfig of this.config.members) {
      this.addMember(memberConfig.host, memberConfig.port, memberConfig.maxConcurrent ?? 5);
    }
  }

  addMember(host: string, port: number, maxConcurrent: number = 5): string {
    const id = `ollama-${this.nextMemberId++}`;
    const client = new OllamaClient({ host, port });
    
    this.members.set(id, {
      id,
      client,
      host,
      port,
      status: 'offline',
      currentLoad: 0,
      maxConcurrent,
      lastHealthCheck: 0,
    });

    this.checkMemberHealth(id);
    return id;
  }

  removeMember(id: string): boolean {
    const member = this.members.get(id);
    if (!member || member.currentLoad > 0) {
      return false;
    }
    return this.members.delete(id);
  }

  private async checkMemberHealth(memberId: string): Promise<void> {
    const member = this.members.get(memberId);
    if (!member) return;

    try {
      const health = await member.client.checkHealth();
      const now = Date.now();
      
      member.status = health.healthy ? 'healthy' : 'offline';
      member.lastHealthCheck = now;
    } catch {
      member.status = 'offline';
    }
  }

  private async startHealthChecks(): Promise<void> {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      for (const [id] of this.members) {
        await this.checkMemberHealth(id);
      }
    }, this.config.healthCheckIntervalMs);
  }

  private getLeastLoadedMember(): PoolMember | null {
    let best: PoolMember | null = null;
    
    for (const member of this.members.values()) {
      if (member.status === 'offline') continue;
      if (member.currentLoad >= member.maxConcurrent) continue;
      if (!best || member.currentLoad < best.currentLoad) {
        best = member;
      }
    }

    return best;
  }

  private getHealthyMembers(): PoolMember[] {
    return Array.from(this.members.values())
      .filter(m => m.status !== 'offline' && m.currentLoad < m.maxConcurrent);
  }

  private enqueueRequest(request: QueuedRequest): void {
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      request.reject(new Error('Pool queue full - please retry later'));
      return;
    }

    this.requestQueue.push(request);
    this.requestQueue.sort((a, b) => b.priority - a.priority);
    
    request.timeoutHandle = setTimeout(() => {
      request.reject(new Error('Request timeout'));
      this.processQueue();
    }, this.config.defaultTimeoutMs);

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) return;
    
    const availableMembers = this.getHealthyMembers();
    if (availableMembers.length === 0) return;

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const member = this.getLeastLoadedMember();
      if (!member) break;

      const request = this.requestQueue.shift();
      if (!request) break;

      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }

      member.currentLoad++;

      try {
        const result = await member.client.chat(request.request);
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      } finally {
        member.currentLoad--;
        
        if (member.status === 'degraded' && member.currentLoad < member.maxConcurrent / 2) {
          member.status = 'healthy';
        }
      }
    }

    this.processing = false;
  }

  async chat(userId: string, request: any, priority: number = 1): Promise<any> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        priority: Math.min(Math.max(priority, 0), this.config.priorityLevels),
        request,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      };

      const member = this.getLeastLoadedMember();
      
      if (member && member.currentLoad < member.maxConcurrent) {
        member.currentLoad++;
        
        member.client.chat(request)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            member.currentLoad--;
            if (member.status === 'degraded' && member.currentLoad < member.maxConcurrent / 2) {
              member.status = 'healthy';
            }
          });
      } else {
        this.enqueueRequest(queuedRequest);
      }
    });
  }

  getStatus(): {
    members: Array<{
      id: string;
      host: string;
      port: number;
      status: string;
      currentLoad: number;
      maxConcurrent: number;
      lastHealthCheck: number;
    }>;
    queueLength: number;
  } {
    return {
      members: Array.from(this.members.values()).map(m => ({
        id: m.id,
        host: m.host,
        port: m.port,
        status: m.status,
        currentLoad: m.currentLoad,
        maxConcurrent: m.maxConcurrent,
        lastHealthCheck: m.lastHealthCheck,
      })),
      queueLength: this.requestQueue.length,
    };
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.members.clear();
    this.requestQueue = [];
  }
}

let poolInstance: OllamaPoolManager | null = null;

export function getPoolManager(config?: PoolConfig): OllamaPoolManager {
  if (!poolInstance) {
    const defaultMembers = process.env.OLLAMA_POOL_HOSTS?.split(',').map(h => {
      const parts = h.split(':');
      const host = parts[0]?.trim() ?? '127.0.0.1';
      const port = parseInt(parts[1]?.trim() ?? '11434', 10);
      return { host, port };
    }) ?? [{ host: '127.0.0.1', port: 11434 }];

    poolInstance = new OllamaPoolManager({
      ...config,
      members: defaultMembers,
    });
  }
  return poolInstance;
}