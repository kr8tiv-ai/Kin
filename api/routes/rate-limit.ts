import { FastifyPluginAsync } from 'fastify';

interface RateLimitConfig {
  tier: 'free' | 'hatchling' | 'elder' | 'hero';
  requestsPerMinute: number;
  messagesPerDay: number;
  maxConcurrentChats: number;
}

const TIER_CONFIGS: Record<string, Omit<RateLimitConfig, 'tier'>> = {
  free: { requestsPerMinute: 10, messagesPerDay: 50, maxConcurrentChats: 1 },
  hatchling: { requestsPerMinute: 60, messagesPerDay: 500, maxConcurrentChats: 2 },
  elder: { requestsPerMinute: 120, messagesPerDay: 5000, maxConcurrentChats: 5 },
  hero: { requestsPerMinute: 300, messagesPerDay: -1, maxConcurrentChats: 10 },
};

interface UserRateState {
  userId: string;
  tier: string;
  requestCounts: Map<string, { count: number; resetAt: number }>;
  dailyCounts: Map<string, { count: number; resetAt: number }>;
  concurrentChats: number;
}

class RateLimiter {
  private userStates: Map<string, UserRateState> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  getConfigForTier(tier: string): Omit<RateLimitConfig, 'tier'> {
    return TIER_CONFIGS[tier] || { requestsPerMinute: 10, messagesPerDay: 50, maxConcurrentChats: 1 };
  }

  getUserState(userId: string, tier: string): UserRateState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        userId,
        tier,
        requestCounts: new Map(),
        dailyCounts: new Map(),
        concurrentChats: 0,
      };
      this.userStates.set(userId, state);
    }
    if (state.tier !== tier) {
      state.tier = tier;
    }
    return state;
  }

  checkRateLimit(userId: string, tier: string, endpoint: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limit: number;
  } {
    const config = this.getConfigForTier(tier);
    const state = this.getUserState(userId, tier);
    const now = Date.now();
    const minuteKey = `${endpoint}:${Math.floor(now / 60000)}`;

    let minuteState = state.requestCounts.get(minuteKey);
    if (!minuteState || minuteState.resetAt < now) {
      minuteState = { count: 0, resetAt: now + 60000 };
      state.requestCounts.set(minuteKey, minuteState);
    }

    const remaining = config.requestsPerMinute - minuteState.count;
    
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      resetAt: minuteState.resetAt,
      limit: config.requestsPerMinute,
    };
  }

  checkDailyLimit(userId: string, tier: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limit: number;
  } {
    const config = this.getConfigForTier(tier);
    if (config.messagesPerDay === -1) {
      return { allowed: true, remaining: -1, resetAt: 0, limit: -1 };
    }

    const state = this.getUserState(userId, tier);
    const now = Date.now();
    const dayKey = `daily:${Math.floor(now / 86400000)}`;

    let dayState = state.dailyCounts.get(dayKey);
    if (!dayState || dayState.resetAt < now) {
      dayState = { count: 0, resetAt: now + 86400000 };
      state.dailyCounts.set(dayKey, dayState);
    }

    const remaining = config.messagesPerDay - dayState.count;
    
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      resetAt: dayState.resetAt,
      limit: config.messagesPerDay,
    };
  }

  checkConcurrentChats(userId: string, tier: string): {
    allowed: boolean;
    current: number;
    max: number;
  } {
    const config = this.getConfigForTier(tier);
    const state = this.getUserState(userId, tier);

    return {
      allowed: state.concurrentChats < config.maxConcurrentChats,
      current: state.concurrentChats,
      max: config.maxConcurrentChats,
    };
  }

  incrementRequest(userId: string, tier: string, endpoint: string): void {
    const state = this.getUserState(userId, tier);
    const now = Date.now();
    const minuteKey = `${endpoint}:${Math.floor(now / 60000)}`;

    const minuteState = state.requestCounts.get(minuteKey);
    if (minuteState && minuteState.resetAt >= now) {
      minuteState.count++;
    }
  }

  incrementDaily(userId: string, tier: string): void {
    const state = this.getUserState(userId, tier);
    const now = Date.now();
    const dayKey = `daily:${Math.floor(now / 86400000)}`;

    const dayState = state.dailyCounts.get(dayKey);
    if (dayState && dayState.resetAt >= now) {
      dayState.count++;
    }
  }

  startChat(userId: string, tier: string): boolean {
    const state = this.getUserState(userId, tier);
    const config = this.getConfigForTier(tier);
    
    if (state.concurrentChats >= config.maxConcurrentChats) {
      return false;
    }
    
    state.concurrentChats++;
    return true;
  }

  endChat(userId: string, tier: string): void {
    const state = this.userStates.get(userId);
    if (state) {
      state.concurrentChats = Math.max(0, state.concurrentChats - 1);
    }
  }

  getUserStatus(userId: string, tier: string): {
    rateLimit: { allowed: boolean; remaining: number; resetAt: number; limit: number };
    dailyLimit: { allowed: boolean; remaining: number; resetAt: number; limit: number };
    concurrentChats: { allowed: boolean; current: number; max: number };
  } {
    return {
      rateLimit: this.checkRateLimit(userId, tier, 'chat'),
      dailyLimit: this.checkDailyLimit(userId, tier),
      concurrentChats: this.checkConcurrentChats(userId, tier),
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const state of this.userStates.values()) {
      for (const [key, entry] of state.requestCounts) {
        if (entry.resetAt < now) {
          state.requestCounts.delete(key);
        }
      }
      for (const [key, entry] of state.dailyCounts) {
        if (entry.resetAt < now) {
          state.dailyCounts.delete(key);
        }
      }
    }
  }

  start(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

let rateLimiter: RateLimiter | null = null;

function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter();
    rateLimiter.start();
  }
  return rateLimiter;
}

const rateLimitRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/rate-limit/status', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const tier = (request.user as { tier: string }).tier ?? 'free';
    
    const limiter = getRateLimiter();
    const status = limiter.getUserStatus(userId, tier);
    
    return status;
  });

  fastify.post('/rate-limit/start-chat', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const tier = (request.user as { tier: string }).tier ?? 'free';
    
    const limiter = getRateLimiter();
    const started = limiter.startChat(userId, tier);
    
    if (!started) {
      reply.status(429);
      return { error: 'Maximum concurrent chats reached' };
    }
    
    return { success: true };
  });

  fastify.post('/rate-limit/end-chat', async (request) => {
    const userId = (request.user as { userId: string }).userId;
    const tier = (request.user as { tier: string }).tier ?? 'free';
    
    const limiter = getRateLimiter();
    limiter.endChat(userId, tier);
    
    return { success: true };
  });
};

export default rateLimitRoutes;