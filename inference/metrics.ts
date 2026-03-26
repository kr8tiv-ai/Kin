/**
 * Inference Metrics - Latency, token, and success rate monitoring
 *
 * Provides comprehensive metrics tracking for LLM inference:
 * - Latency tracking (response times, streaming)
 * - Token counting and estimation
 * - Success rate monitoring
 * - Provider comparison
 *
 * @module inference/metrics
 */

// ============================================================================
// Types
// ============================================================================

export interface InferenceMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
  /** P50 latency */
  p50LatencyMs: number;
  /** P95 latency */
  p95LatencyMs: number;
  /** P99 latency */
  p99LatencyMs: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Tokens per second (output) */
  tokensPerSecond: number;
  /** Average tokens per request */
  avgTokensPerRequest: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Last updated timestamp */
  lastUpdated: string;
}

export interface ProviderMetrics extends InferenceMetrics {
  /** Provider name */
  provider: 'local' | 'openai' | 'anthropic';
  /** Model name */
  model: string;
}

export interface RequestMetric {
  /** Request ID */
  requestId: string;
  /** Timestamp */
  timestamp: string;
  /** Provider used */
  provider: 'local' | 'openai' | 'anthropic';
  /** Model used */
  model: string;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Time to first token (for streaming) */
  timeToFirstTokenMs?: number;
  /** Input token count */
  inputTokens: number;
  /** Output token count */
  outputTokens: number;
  /** Whether request succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Cost in USD (for cloud providers) */
  costUsd?: number;
  /** Route decision */
  route?: 'local' | 'fallback';
}

export interface MetricThresholds {
  /** Warn if latency exceeds this (ms) */
  latencyWarningMs: number;
  /** Error if latency exceeds this (ms) */
  latencyErrorMs: number;
  /** Warn if success rate below this */
  successRateWarning: number;
  /** Error if success rate below this */
  successRateError: number;
  /** Warn if cost exceeds this per hour */
  hourlyCostWarningUsd: number;
}

export type MetricEvent = 
  | { type: 'request_start'; requestId: string; provider: string; model: string }
  | { type: 'request_end'; metric: RequestMetric }
  | { type: 'threshold_exceeded'; metric: string; value: number; threshold: number }
  | { type: 'provider_switch'; from: string; to: string; reason: string };

export type MetricCallback = (event: MetricEvent) => void;

// ============================================================================
// Token Counter
// ============================================================================

/**
 * Estimate token count for text
 * Uses simple heuristic: ~4 characters per token for English
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // Simple heuristic: average 4 characters per token
  // This is approximate - real tokenization requires the model's tokenizer
  const charCount = text.length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  
  // Use word count for short texts, character count for long
  if (wordCount < 50) {
    return Math.ceil(wordCount * 1.3); // ~1.3 tokens per word
  }
  
  return Math.ceil(charCount / 4);
}

/**
 * Estimate tokens for chat messages
 */
export function estimateChatTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  
  for (const message of messages) {
    // Add overhead for message structure
    total += 4; // role tokens + formatting
    total += estimateTokens(message.content);
  }
  
  // Add reply overhead
  total += 3;
  
  return total;
}

// ============================================================================
// Metrics Collector
// ============================================================================

/**
 * Collects and aggregates inference metrics
 */
export class MetricsCollector {
  private metrics: RequestMetric[] = [];
  private maxMetrics = 10000;
  private thresholds: MetricThresholds;
  private callbacks: MetricCallback[] = [];
  private pendingRequests: Map<string, { start: number; provider: string; model: string }> = new Map();

  constructor(thresholds?: Partial<MetricThresholds>) {
    this.thresholds = {
      latencyWarningMs: thresholds?.latencyWarningMs ?? 3000,
      latencyErrorMs: thresholds?.latencyErrorMs ?? 10000,
      successRateWarning: thresholds?.successRateWarning ?? 0.95,
      successRateError: thresholds?.successRateError ?? 0.90,
      hourlyCostWarningUsd: thresholds?.hourlyCostWarningUsd ?? 5.0,
    };
  }

  // ==========================================================================
  // Recording
  // ==========================================================================

  /**
   * Record the start of a request
   */
  startRequest(requestId: string, provider: string, model: string): void {
    this.pendingRequests.set(requestId, {
      start: performance.now(),
      provider,
      model,
    });

    this.emit({
      type: 'request_start',
      requestId,
      provider,
      model,
    });
  }

  /**
   * Record a completed request
   */
  recordRequest(metric: Omit<RequestMetric, 'timestamp'>): void {
    const fullMetric: RequestMetric = {
      ...metric,
      timestamp: new Date().toISOString(),
    };

    this.metrics.push(fullMetric);
    this.pendingRequests.delete(metric.requestId);

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Check thresholds
    this.checkThresholds(fullMetric);

    // Emit event
    this.emit({
      type: 'request_end',
      metric: fullMetric,
    });
  }

  /**
   * Record a request directly (without start/stop)
   */
  record(metric: RequestMetric): void {
    this.metrics.push(metric);

    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    this.checkThresholds(metric);
    this.emit({ type: 'request_end', metric });
  }

  // ==========================================================================
  // Aggregation
  // ==========================================================================

  /**
   * Get aggregated metrics
   */
  getMetrics(since?: Date): InferenceMetrics {
    const filtered = since
      ? this.metrics.filter(m => new Date(m.timestamp) >= since)
      : this.metrics;

    if (filtered.length === 0) {
      return this.getEmptyMetrics();
    }

    const successful = filtered.filter(m => m.success);
    const failed = filtered.filter(m => !m.success);
    const latencies = filtered.map(m => m.latencyMs).sort((a, b) => a - b);

    const totalInput = filtered.reduce((sum, m) => sum + m.inputTokens, 0);
    const totalOutput = filtered.reduce((sum, m) => sum + m.outputTokens, 0);
    const totalLatency = filtered.reduce((sum, m) => sum + m.latencyMs, 0);

    // Calculate tokens per second (only for successful requests with output)
    const withOutput = successful.filter(m => m.outputTokens > 0 && m.latencyMs > 0);
    const tokensPerSecond = withOutput.length > 0
      ? withOutput.reduce((sum, m) => sum + (m.outputTokens / (m.latencyMs / 1000)), 0) / withOutput.length
      : 0;

    return {
      totalRequests: filtered.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      successRate: successful.length / filtered.length,
      avgLatencyMs: totalLatency / filtered.length,
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      tokensPerSecond,
      avgTokensPerRequest: (totalInput + totalOutput) / filtered.length,
      totalCostUsd: filtered.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get metrics by provider
   */
  getMetricsByProvider(since?: Date): Map<string, ProviderMetrics> {
    const filtered = since
      ? this.metrics.filter(m => new Date(m.timestamp) >= since)
      : this.metrics;

    const byProvider = new Map<string, RequestMetric[]>();
    
    for (const metric of filtered) {
      const key = `${metric.provider}:${metric.model}`;
      if (!byProvider.has(key)) {
        byProvider.set(key, []);
      }
      byProvider.get(key)!.push(metric);
    }

    const result = new Map<string, ProviderMetrics>();
    
    for (const [key, metrics] of byProvider) {
      const [provider, model] = key.split(':') as ['local' | 'openai' | 'anthropic', string];
      result.set(key, {
        provider,
        model,
        ...this.calculateMetrics(metrics),
      });
    }

    return result;
  }

  /**
   * Get recent metrics
   */
  getRecent(count: number = 50): RequestMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get metrics for time range
   */
  getMetricsInRange(start: Date, end: Date): RequestMetric[] {
    return this.metrics.filter(
      m => new Date(m.timestamp) >= start && new Date(m.timestamp) <= end
    );
  }

  // ==========================================================================
  // Success Rate Monitoring
  // ==========================================================================

  /**
   * Get success rate for recent requests
   */
  getRecentSuccessRate(windowSize: number = 100): number {
    const recent = this.metrics.slice(-windowSize);
    if (recent.length === 0) return 1;
    
    const successful = recent.filter(m => m.success).length;
    return successful / recent.length;
  }

  /**
   * Get success rate by provider
   */
  getSuccessRateByProvider(): Map<string, number> {
    const result = new Map<string, number>();
    const byProvider = new Map<string, { success: number; total: number }>();

    for (const metric of this.metrics) {
      const key = metric.provider;
      if (!byProvider.has(key)) {
        byProvider.set(key, { success: 0, total: 0 });
      }
      const stats = byProvider.get(key)!;
      stats.total++;
      if (metric.success) stats.success++;
    }

    for (const [provider, stats] of byProvider) {
      result.set(provider, stats.success / stats.total);
    }

    return result;
  }

  // ==========================================================================
  // Latency Analysis
  // ==========================================================================

  /**
   * Get latency statistics
   */
  getLatencyStats(): {
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (this.metrics.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0 };
    }

    const latencies = this.metrics.map(m => m.latencyMs).sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);

    return {
      min: latencies[0],
      max: latencies[latencies.length - 1],
      avg: sum / latencies.length,
      median: this.percentile(latencies, 50),
      p95: this.percentile(latencies, 95),
      p99: this.percentile(latencies, 99),
    };
  }

  /**
   * Get latency trend (comparing recent to earlier)
   */
  getLatencyTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.metrics.length < 20) return 'stable';

    const recent = this.metrics.slice(-10);
    const earlier = this.metrics.slice(-20, -10);

    const recentAvg = recent.reduce((sum, m) => sum + m.latencyMs, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, m) => sum + m.latencyMs, 0) / earlier.length;

    const change = (recentAvg - earlierAvg) / earlierAvg;

    if (change < -0.1) return 'improving';
    if (change > 0.1) return 'degrading';
    return 'stable';
  }

  // ==========================================================================
  // Cost Tracking
  // ==========================================================================

  /**
   * Get cost summary
   */
  getCostSummary(): {
    total: number;
    byProvider: Map<string, number>;
    hourlyAverage: number;
  } {
    const total = this.metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
    const byProvider = new Map<string, number>();

    for (const metric of this.metrics) {
      const cost = metric.costUsd ?? 0;
      byProvider.set(metric.provider, (byProvider.get(metric.provider) ?? 0) + cost);
    }

    // Calculate hourly average
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => new Date(m.timestamp) >= oneHourAgo);
    const hourlyTotal = recentMetrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);

    return {
      total,
      byProvider,
      hourlyAverage: hourlyTotal,
    };
  }

  // ==========================================================================
  // Events & Callbacks
  // ==========================================================================

  /**
   * Subscribe to metric events
   */
  subscribe(callback: MetricCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Emit metric event
   */
  private emit(event: MetricEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Metrics callback error:', error);
      }
    }
  }

  // ==========================================================================
  // Threshold Checking
  // ==========================================================================

  /**
   * Check thresholds and emit warnings
   */
  private checkThresholds(metric: RequestMetric): void {
    // Latency check
    if (metric.latencyMs > this.thresholds.latencyErrorMs) {
      this.emit({
        type: 'threshold_exceeded',
        metric: 'latency',
        value: metric.latencyMs,
        threshold: this.thresholds.latencyErrorMs,
      });
    }

    // Success rate check (over last 20 requests)
    const successRate = this.getRecentSuccessRate(20);
    if (successRate < this.thresholds.successRateError) {
      this.emit({
        type: 'threshold_exceeded',
        metric: 'success_rate',
        value: successRate,
        threshold: this.thresholds.successRateError,
      });
    }

    // Hourly cost check
    const { hourlyAverage } = this.getCostSummary();
    if (hourlyAverage > this.thresholds.hourlyCostWarningUsd) {
      this.emit({
        type: 'threshold_exceeded',
        metric: 'hourly_cost',
        value: hourlyAverage,
        threshold: this.thresholds.hourlyCostWarningUsd,
      });
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Calculate percentile of sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate metrics from array
   */
  private calculateMetrics(metrics: RequestMetric[]): Omit<InferenceMetrics, 'lastUpdated'> {
    if (metrics.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 1,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        tokensPerSecond: 0,
        avgTokensPerRequest: 0,
        totalCostUsd: 0,
      };
    }

    const successful = metrics.filter(m => m.success);
    const latencies = metrics.map(m => m.latencyMs).sort((a, b) => a - b);
    const totalInput = metrics.reduce((sum, m) => sum + m.inputTokens, 0);
    const totalOutput = metrics.reduce((sum, m) => sum + m.outputTokens, 0);

    const withOutput = successful.filter(m => m.outputTokens > 0 && m.latencyMs > 0);
    const tokensPerSecond = withOutput.length > 0
      ? withOutput.reduce((sum, m) => sum + (m.outputTokens / (m.latencyMs / 1000)), 0) / withOutput.length
      : 0;

    return {
      totalRequests: metrics.length,
      successfulRequests: successful.length,
      failedRequests: metrics.length - successful.length,
      successRate: successful.length / metrics.length,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      tokensPerSecond,
      avgTokensPerRequest: (totalInput + totalOutput) / metrics.length,
      totalCostUsd: metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
    };
  }

  /**
   * Get empty metrics structure
   */
  private getEmptyMetrics(): InferenceMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      successRate: 1,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      tokensPerSecond: 0,
      avgTokensPerRequest: 0,
      totalCostUsd: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // Export & Clear
  // ==========================================================================

  /**
   * Export all metrics
   */
  export(): { metrics: RequestMetric[]; summary: InferenceMetrics } {
    return {
      metrics: [...this.metrics],
      summary: this.getMetrics(),
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.pendingRequests.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultCollector: MetricsCollector | null = null;

/**
 * Get the default metrics collector
 */
export function getMetricsCollector(thresholds?: Partial<MetricThresholds>): MetricsCollector {
  if (!defaultCollector || thresholds) {
    defaultCollector = new MetricsCollector(thresholds);
  }
  return defaultCollector;
}

/**
 * Create a new metrics collector
 */
export function createMetricsCollector(thresholds?: Partial<MetricThresholds>): MetricsCollector {
  return new MetricsCollector(thresholds);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick metrics snapshot
 */
export function getMetricsSnapshot(): InferenceMetrics {
  return getMetricsCollector().getMetrics();
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: InferenceMetrics): string {
  const lines = [
    '=== Inference Metrics ===',
    `Requests: ${metrics.successfulRequests}/${metrics.totalRequests} (${(metrics.successRate * 100).toFixed(1)}% success)`,
    `Latency: avg=${metrics.avgLatencyMs.toFixed(0)}ms p50=${metrics.p50LatencyMs.toFixed(0)}ms p95=${metrics.p95LatencyMs.toFixed(0)}ms`,
    `Tokens: ${metrics.totalInputTokens + metrics.totalOutputTokens} (${metrics.tokensPerSecond.toFixed(1)} tok/s)`,
    `Cost: $${metrics.totalCostUsd.toFixed(4)}`,
  ];
  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export default MetricsCollector;
