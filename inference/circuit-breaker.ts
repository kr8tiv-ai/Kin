export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private config: CircuitConfig;
  private metrics: CircuitMetrics = {
    failures: 0,
    successes: 0,
    lastFailure: null,
    lastSuccess: null,
  };
  private nextAttempt: number = 0;
  private timeoutHandle?: NodeJS.Timeout;

  constructor(config: Partial<CircuitConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeout: config.timeout ?? 30000,
      resetTimeout: config.resetTimeout ?? 60000,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  isAvailable(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.lastSuccess = Date.now();

    if (this.state === 'half-open') {
      if (this.metrics.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.state === 'closed') {
      this.metrics.failures = 0;
    }
  }

  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailure = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.scheduleReset();
    } else if (this.state === 'closed') {
      if (this.metrics.failures >= this.config.failureThreshold) {
        this.state = 'open';
        this.scheduleReset();
      }
    }
  }

  private scheduleReset(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    this.nextAttempt = Date.now() + this.config.resetTimeout;
    
    this.timeoutHandle = setTimeout(() => {
      if (this.state === 'open') {
        this.state = 'half-open';
        this.metrics.successes = 0;
      }
    }, this.config.resetTimeout);
  }

  private reset(): void {
    this.state = 'closed';
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  getMetrics(): CircuitMetrics & { state: CircuitState } {
    return {
      ...this.metrics,
      state: this.state,
    };
  }

  forceState(state: CircuitState): void {
    this.state = state;
    if (state === 'open') {
      this.scheduleReset();
    } else if (state === 'closed') {
      this.reset();
    } else if (state === 'half-open') {
      this.metrics.successes = 0;
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(name: string, config?: CircuitConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(config);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllStatus(): Record<string, { state: CircuitState; metrics: CircuitMetrics }> {
    const status: Record<string, { state: CircuitState; metrics: CircuitMetrics }> = {};
    
    for (const [name, breaker] of this.breakers) {
      status[name] = {
        state: breaker.getState(),
        metrics: breaker.getMetrics(),
      };
    }
    
    return status;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceState('closed');
    }
  }
}

let registry: CircuitBreakerRegistry | null = null;

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!registry) {
    registry = new CircuitBreakerRegistry();
  }
  return registry;
}

export function getCircuitBreaker(name: string, config?: CircuitConfig): CircuitBreaker {
  return getCircuitBreakerRegistry().getOrCreate(name, config);
}