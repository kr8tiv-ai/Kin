import type { BenchmarkResult, TaskCategory } from './benchmark.js';

export interface ModelMetrics {
  model: 'local' | 'frontier';
  totalRuns: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  preferenceWins: number;
  preferenceLosses: number;
  netPreference: number;
  byCategory: Record<TaskCategory, {
    runs: number;
    totalLatency: number;
    avgLatency: number;
    wins: number;
    losses: number;
  }>;
}

export interface EvaluationSeries {
  id: string;
  startedAt: number;
  completedAt?: number;
  localMetrics: ModelMetrics;
  frontierMetrics: ModelMetrics;
  results: BenchmarkResult[];
}

export function createEmptyMetrics(model: 'local' | 'frontier'): ModelMetrics {
  return {
    model,
    totalRuns: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    preferenceWins: 0,
    preferenceLosses: 0,
    netPreference: 0,
    byCategory: {
      code: { runs: 0, totalLatency: 0, avgLatency: 0, wins: 0, losses: 0 },
      writing: { runs: 0, totalLatency: 0, avgLatency: 0, wins: 0, losses: 0 },
      analysis: { runs: 0, totalLatency: 0, avgLatency: 0, wins: 0, losses: 0 },
      chat: { runs: 0, totalLatency: 0, avgLatency: 0, wins: 0, losses: 0 },
      creative: { runs: 0, totalLatency: 0, avgLatency: 0, wins: 0, losses: 0 },
    },
  };
}

export function recordResult(
  series: EvaluationSeries,
  result: BenchmarkResult,
  category: TaskCategory
): void {
  const targetMetrics = result.model === 'local' 
    ? series.localMetrics 
    : series.frontierMetrics;

  targetMetrics.totalRuns++;
  targetMetrics.totalLatencyMs += result.latencyMs;
  targetMetrics.averageLatencyMs = targetMetrics.totalLatencyMs / targetMetrics.totalRuns;

  const catMetrics = targetMetrics.byCategory[category];
  catMetrics.runs++;
  catMetrics.totalLatency += result.latencyMs;
  catMetrics.avgLatency = catMetrics.totalLatency / catMetrics.runs;

  series.results.push(result);
}

export function compareModels(series: EvaluationSeries): {
  localAdvantage: boolean;
  latencyDifference: number;
  preferenceDifference: number;
  recommendation: 'local' | 'frontier' | 'hybrid';
} {
  const localAvg = series.localMetrics.averageLatencyMs;
  const frontierAvg = series.frontierMetrics.averageLatencyMs;
  const latencyDiff = localAvg - frontierAvg;

  const localPref = series.localMetrics.netPreference;
  const frontierPref = series.frontierMetrics.netPreference;
  const prefDiff = localPref - frontierPref;

  const localAdvantage = latencyDiff < -500 && prefDiff >= -0.1;
  const recommendation = localAdvantage ? 'local' : prefDiff > 0.1 ? 'hybrid' : 'frontier';

  return {
    localAdvantage,
    latencyDifference: latencyDiff,
    preferenceDifference: prefDiff,
    recommendation,
  };
}

export function exportMetrics(series: EvaluationSeries): string {
  const comparison = compareModels(series);
  
  return JSON.stringify({
    seriesId: series.id,
    startedAt: series.startedAt,
    completedAt: series.completedAt,
    local: series.localMetrics,
    frontier: series.frontierMetrics,
    comparison,
  }, null, 2);
}

class MetricsStore {
  private series: Map<string, EvaluationSeries> = new Map();

  createSeries(id: string): EvaluationSeries {
    const series: EvaluationSeries = {
      id,
      startedAt: Date.now(),
      localMetrics: createEmptyMetrics('local'),
      frontierMetrics: createEmptyMetrics('frontier'),
      results: [],
    };
    this.series.set(id, series);
    return series;
  }

  getSeries(id: string): EvaluationSeries | undefined {
    return this.series.get(id);
  }

  completeSeries(id: string): EvaluationSeries | undefined {
    const series = this.series.get(id);
    if (series) {
      series.completedAt = Date.now();
      
      for (const result of series.results) {
        if (result.preferenceScore > 0.5) {
          if (result.model === 'local') {
            series.localMetrics.preferenceWins++;
            series.frontierMetrics.preferenceLosses++;
          } else {
            series.frontierMetrics.preferenceWins++;
            series.localMetrics.preferenceLosses++;
          }
        }
      }

      series.localMetrics.netPreference = 
        series.localMetrics.preferenceWins - series.localMetrics.preferenceLosses;
      series.frontierMetrics.netPreference = 
        series.frontierMetrics.preferenceWins - series.frontierMetrics.preferenceLosses;
    }
    return series;
  }

  listSeries(): EvaluationSeries[] {
    return Array.from(this.series.values());
  }
}

let store: MetricsStore | null = null;

export function getMetricsStore(): MetricsStore {
  if (!store) {
    store = new MetricsStore();
  }
  return store;
}
