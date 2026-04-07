/**
 * Advantage Detector — Tracks local-vs-frontier quality deltas, detects regressions,
 * and provides a regression gate for the advantage loop.
 *
 * Singleton pattern with lazy-load JSONL persistence at:
 *   data/advantage/{companionId}/history.jsonl
 *
 * @module inference/advantage-detector
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ComparisonReport } from './eval/types.js';

// ============================================================================
// Types
// ============================================================================

export interface AdvantageDataPoint {
  timestamp: number;
  taskCategory: string;
  localLatency: number;
  frontierLatency: number;
  localWins: boolean;
  /** Optional quality score (0-1) from the eval pipeline. */
  qualityScore?: number;
  /** Quality delta (local - frontier) from eval comparison. Present when recorded via recordEvalComparison(). */
  qualityDelta?: number;
}

export interface AdvantageReport {
  category: string;
  localAdvantage: boolean;
  averageLatencySavings: number;
  winRate: number;
  sampleSize: number;
  recommendation: 'local' | 'frontier' | 'hybrid';
  /** Average quality delta (local - frontier) when quality delta data is present. */
  averageQualityDelta?: number;
}

export interface AdvantageTrend {
  category: string;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
}

/** Result from detectRegression(). */
export interface RegressionResult {
  category: string;
  /** Whether regression was detected for this category. */
  regressing: boolean;
  /** Quality delta in the recent window (average). */
  recentAvgDelta: number;
  /** Quality delta in the baseline window (average). */
  baselineAvgDelta: number;
  /** Magnitude of quality drop (baseline - recent). Positive = regression. */
  dropMagnitude: number;
  /** Number of data points in the recent window. */
  recentSamples: number;
  /** Number of data points in the baseline window. */
  baselineSamples: number;
}

/** Regression gate verdict — pure function output (K023). */
export interface RegressionGateResult {
  /** Whether the gate passes (no critical regressions). */
  pass: boolean;
  /** Human-readable reasons explaining the verdict. */
  reasons: string[];
  /** Per-category regression details. */
  regressions: RegressionResult[];
  /** ISO-8601 timestamp of the check. */
  checkedAt: string;
}

/** Options for regression detection. */
export interface RegressionOptions {
  /** Number of recent entries to compare (default: 10). */
  windowSize?: number;
  /** Quality delta drop threshold to flag as regression (default: 0.1 = 10%). */
  qualityDropThreshold?: number;
  /** Minimum samples required in both windows (default: 5). */
  minSamples?: number;
}

const DEFAULT_REGRESSION_OPTIONS: Required<RegressionOptions> = {
  windowSize: 10,
  qualityDropThreshold: 0.1,
  minSamples: 5,
};

// ============================================================================
// Persistence Helpers
// ============================================================================

const DEFAULT_BASE_PATH = path.join('data', 'advantage');

/** A pending persistence entry: companion + data point. */
interface PersistEntry {
  companionId: string;
  point: AdvantageDataPoint;
}

/**
 * Append advantage data points to JSONL files, grouped by companionId.
 * Fire-and-forget safe — errors are logged, never thrown.
 */
async function persistPoints(
  entries: PersistEntry[],
  basePath: string = DEFAULT_BASE_PATH,
): Promise<void> {
  // Group by companionId
  const grouped = new Map<string, AdvantageDataPoint[]>();
  for (const { companionId, point } of entries) {
    if (!grouped.has(companionId)) {
      grouped.set(companionId, []);
    }
    grouped.get(companionId)!.push(point);
  }

  for (const [companionId, points] of grouped) {
    const dir = path.join(basePath, companionId);
    const filePath = path.join(dir, 'history.jsonl');

    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const lines = points.map((p) => JSON.stringify(p)).join('\n') + '\n';
      await fs.promises.appendFile(filePath, lines, 'utf-8');
    } catch (err) {
      console.error(`[advantage-detector] Failed to persist to ${filePath}:`, err);
    }
  }
}

/**
 * Load advantage history from JSONL for a specific companion.
 * Returns empty array on missing files (ENOENT).
 */
async function loadHistory(
  companionId: string,
  basePath: string = DEFAULT_BASE_PATH,
): Promise<AdvantageDataPoint[]> {
  const filePath = path.join(basePath, companionId, 'history.jsonl');

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const points: AdvantageDataPoint[] = [];

    for (const line of lines) {
      try {
        points.push(JSON.parse(line) as AdvantageDataPoint);
      } catch {
        console.warn(`[advantage-detector] Skipped malformed line in ${filePath}`);
      }
    }

    return points;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error(`[advantage-detector] Failed to read ${filePath}:`, err);
    return [];
  }
}

/**
 * Load all companion histories by scanning the base directory.
 */
async function loadAllHistories(
  basePath: string = DEFAULT_BASE_PATH,
): Promise<AdvantageDataPoint[]> {
  try {
    const entries = await fs.promises.readdir(basePath, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const allPoints: AdvantageDataPoint[] = [];
    for (const companionId of dirs) {
      const points = await loadHistory(companionId, basePath);
      allPoints.push(...points);
    }
    return allPoints;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error('[advantage-detector] Failed to scan history directory:', err);
    return [];
  }
}

// ============================================================================
// Pure Gate Function (K023)
// ============================================================================

/**
 * Evaluate the regression gate as a pure function.
 * Input: regression results + options → Output: pass/fail verdict with reasons.
 */
export function evaluateRegressionGate(
  regressions: RegressionResult[],
  options: Required<RegressionOptions>,
): RegressionGateResult {
  const reasons: string[] = [];
  const regressingCategories = regressions.filter((r) => r.regressing);

  if (regressions.length === 0) {
    reasons.push('No categories with sufficient data for regression analysis.');
    return {
      pass: true,
      reasons,
      regressions: [],
      checkedAt: new Date().toISOString(),
    };
  }

  // Check for insufficient data
  const insufficientData = regressions.filter(
    (r) => r.recentSamples < options.minSamples || r.baselineSamples < options.minSamples,
  );
  if (insufficientData.length > 0) {
    for (const r of insufficientData) {
      reasons.push(
        `Category "${r.category}": insufficient samples (recent=${r.recentSamples}, baseline=${r.baselineSamples}, need=${options.minSamples}).`,
      );
    }
  }

  if (regressingCategories.length === 0) {
    reasons.push(
      `No regressions detected across ${regressions.length} category(ies) (threshold=${options.qualityDropThreshold}).`,
    );
    return {
      pass: true,
      reasons,
      regressions,
      checkedAt: new Date().toISOString(),
    };
  }

  // At least one regression detected
  for (const r of regressingCategories) {
    reasons.push(
      `Category "${r.category}" regressing: quality delta dropped by ${r.dropMagnitude.toFixed(3)} (baseline=${r.baselineAvgDelta.toFixed(3)}, recent=${r.recentAvgDelta.toFixed(3)}).`,
    );
  }

  return {
    pass: false,
    reasons,
    regressions,
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================================
// AdvantageDetector Class
// ============================================================================

class AdvantageDetector {
  private history: AdvantageDataPoint[] = [];
  private readonly THRESHOLD = 0.6;
  private readonly LATENCY_THRESHOLD = 1000;

  /**
   * Whether persistence data has been loaded from disk.
   * Set to true after first loadFromDisk() call — prevents redundant reads.
   */
  private persistenceLoaded = false;

  /** Base path for JSONL persistence. Override for tests. */
  private basePath: string = DEFAULT_BASE_PATH;

  /**
   * Record a latency/preference data point (backward-compatible original API).
   *
   * Note: Data recorded via record() does NOT have quality delta information
   * from eval comparisons. Use recordEvalComparison() for that.
   */
  record(
    taskCategory: string,
    localLatency: number,
    frontierLatency: number,
    userPreferredLocal: boolean,
    qualityScore?: number,
  ): void {
    const point: AdvantageDataPoint = {
      timestamp: Date.now(),
      taskCategory,
      localLatency,
      frontierLatency,
      localWins: userPreferredLocal,
      qualityScore,
    };

    this.history.push(point);

    if (this.history.length > 10000) {
      this.history = this.history.slice(-5000);
    }
  }

  /**
   * Record eval comparison results from the eval pipeline.
   * Extracts quality deltas (local - frontier) from ComparisonReport objects
   * and stores them as AdvantageDataPoints with qualityDelta set.
   *
   * Also persists to JSONL (fire-and-forget).
   */
  recordEvalComparison(reports: ComparisonReport[], companionId?: string): void {
    const entries: PersistEntry[] = [];

    for (const report of reports) {
      const point: AdvantageDataPoint = {
        timestamp: Date.now(),
        taskCategory: report.category,
        localLatency: report.localScores.avgLatencyMs,
        frontierLatency: report.frontierScores.avgLatencyMs,
        localWins: report.qualityDiff >= 0,
        qualityScore: report.localScores.avgQuality,
        qualityDelta: report.qualityDiff,
      };

      this.history.push(point);

      if (companionId) {
        entries.push({ companionId, point });
      }
    }

    if (this.history.length > 10000) {
      this.history = this.history.slice(-5000);
    }

    // Fire-and-forget persistence
    if (entries.length > 0) {
      persistPoints(entries, this.basePath).catch(() => {});
    }
  }

  /**
   * Get advantage reports per category.
   *
   * averageQualityDelta is computed from qualityDelta values (local - frontier
   * from eval comparisons), NOT from raw qualityScore. Falls back to undefined
   * when no eval comparison data is available for a category.
   */
  getReports(): AdvantageReport[] {
    const categories = new Set(this.history.map((h) => h.taskCategory));
    const reports: AdvantageReport[] = [];

    for (const category of categories) {
      const points = this.history.filter((h) => h.taskCategory === category);

      if (points.length === 0) continue;

      const wins = points.filter((p) => p.localWins).length;
      const total = points.length;
      const winRate = wins / total;

      const localAvg =
        points.reduce((sum, p) => sum + p.localLatency, 0) / total;
      const frontierAvg =
        points.reduce((sum, p) => sum + p.frontierLatency, 0) / total;
      const latencySavings = frontierAvg - localAvg;

      const localAdvantage =
        winRate >= this.THRESHOLD && latencySavings > this.LATENCY_THRESHOLD;

      let recommendation: 'local' | 'frontier' | 'hybrid' = 'frontier';
      if (localAdvantage) {
        recommendation = 'local';
      } else if (winRate >= 0.4 && latencySavings > 0) {
        recommendation = 'hybrid';
      }

      // BUG FIX: Compute average quality delta from qualityDelta field
      // (local - frontier from eval comparisons), not from raw qualityScore.
      const deltaPoints = points.filter((p) => p.qualityDelta !== undefined);
      const averageQualityDelta =
        deltaPoints.length > 0
          ? deltaPoints.reduce((sum, p) => sum + p.qualityDelta!, 0) /
            deltaPoints.length
          : undefined;

      reports.push({
        category,
        localAdvantage,
        averageLatencySavings: latencySavings,
        winRate,
        sampleSize: total,
        recommendation,
        averageQualityDelta,
      });
    }

    return reports;
  }

  getTrends(): AdvantageTrend[] {
    const reports = this.getReports();
    const trends: AdvantageTrend[] = [];

    for (const report of reports) {
      const points = this.history
        .filter((h) => h.taskCategory === report.category)
        .slice(-50);

      if (points.length < 10) {
        trends.push({
          category: report.category,
          trend: 'stable',
          changePercent: 0,
        });
        continue;
      }

      const mid = Math.floor(points.length / 2);
      const firstHalf = points.slice(0, mid);
      const secondHalf = points.slice(mid);

      const firstWinRate =
        firstHalf.filter((p) => p.localWins).length / firstHalf.length;
      const secondWinRate =
        secondHalf.filter((p) => p.localWins).length / secondHalf.length;

      const change =
        firstWinRate === 0
          ? 0
          : ((secondWinRate - firstWinRate) / firstWinRate) * 100;

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (change > 10) trend = 'improving';
      else if (change < -10) trend = 'declining';

      trends.push({
        category: report.category,
        trend,
        changePercent: change,
      });
    }

    return trends;
  }

  /**
   * Detect regressions by comparing recent vs baseline quality deltas per category.
   *
   * Uses a sliding window approach: the most recent N entries are the "recent" window,
   * the N entries before that are the "baseline" window. If the recent average
   * quality delta drops below the baseline by more than the threshold, it's flagged.
   */
  detectRegression(options?: RegressionOptions): RegressionResult[] {
    const opts = { ...DEFAULT_REGRESSION_OPTIONS, ...options };
    const categories = new Set(this.history.map((h) => h.taskCategory));
    const results: RegressionResult[] = [];

    for (const category of categories) {
      // Only consider points with qualityDelta (from eval comparisons)
      const deltaPoints = this.history
        .filter((h) => h.taskCategory === category && h.qualityDelta !== undefined)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (deltaPoints.length < opts.windowSize * 2) {
        // Not enough data for both windows — report but don't flag
        const recentSlice = deltaPoints.slice(-opts.windowSize);
        const baselineSlice = deltaPoints.slice(
          -opts.windowSize * 2,
          -opts.windowSize,
        );

        const recentAvg =
          recentSlice.length > 0
            ? recentSlice.reduce((s, p) => s + p.qualityDelta!, 0) /
              recentSlice.length
            : 0;
        const baselineAvg =
          baselineSlice.length > 0
            ? baselineSlice.reduce((s, p) => s + p.qualityDelta!, 0) /
              baselineSlice.length
            : 0;

        results.push({
          category,
          regressing: false,
          recentAvgDelta: recentAvg,
          baselineAvgDelta: baselineAvg,
          dropMagnitude: baselineAvg - recentAvg,
          recentSamples: recentSlice.length,
          baselineSamples: baselineSlice.length,
        });
        continue;
      }

      const recentSlice = deltaPoints.slice(-opts.windowSize);
      const baselineSlice = deltaPoints.slice(
        -opts.windowSize * 2,
        -opts.windowSize,
      );

      const recentAvg =
        recentSlice.reduce((s, p) => s + p.qualityDelta!, 0) /
        recentSlice.length;
      const baselineAvg =
        baselineSlice.reduce((s, p) => s + p.qualityDelta!, 0) /
        baselineSlice.length;

      const dropMagnitude = baselineAvg - recentAvg;
      const regressing =
        dropMagnitude > opts.qualityDropThreshold &&
        recentSlice.length >= opts.minSamples &&
        baselineSlice.length >= opts.minSamples;

      results.push({
        category,
        regressing,
        recentAvgDelta: recentAvg,
        baselineAvgDelta: baselineAvg,
        dropMagnitude,
        recentSamples: recentSlice.length,
        baselineSamples: baselineSlice.length,
      });
    }

    return results;
  }

  /**
   * Get the regression gate result — delegates to the pure evaluateRegressionGate() function.
   */
  getRegressionGate(options?: RegressionOptions): RegressionGateResult {
    const opts = { ...DEFAULT_REGRESSION_OPTIONS, ...options };
    const regressions = this.detectRegression(opts);
    return evaluateRegressionGate(regressions, opts);
  }

  recommendForTask(taskCategory: string): 'local' | 'frontier' | 'hybrid' {
    const reports = this.getReports();
    const report = reports.find((r) => r.category === taskCategory);

    if (!report) {
      return 'hybrid';
    }

    return report.recommendation;
  }

  getOverallStats(): {
    totalSamples: number;
    categoriesTracked: number;
    overallLocalWinRate: number;
    averageLatencySavings: number;
  } {
    if (this.history.length === 0) {
      return {
        totalSamples: 0,
        categoriesTracked: 0,
        overallLocalWinRate: 0,
        averageLatencySavings: 0,
      };
    }

    const categories = new Set(this.history.map((h) => h.taskCategory)).size;
    const wins = this.history.filter((p) => p.localWins).length;
    const avgLatencySavings =
      this.history.reduce(
        (sum, p) => sum + (p.frontierLatency - p.localLatency),
        0,
      ) / this.history.length;

    return {
      totalSamples: this.history.length,
      categoriesTracked: categories,
      overallLocalWinRate: wins / this.history.length,
      averageLatencySavings: avgLatencySavings,
    };
  }

  /**
   * Lazy-load persisted history from JSONL on disk.
   * Call before getReports() when you need persistence-backed data.
   * Safe to call multiple times — only loads once.
   *
   * @param companionId - If provided, load only this companion's history.
   *                      If omitted, loads all companions.
   */
  async loadFromDisk(companionId?: string): Promise<void> {
    if (this.persistenceLoaded) return;

    const loaded = companionId
      ? await loadHistory(companionId, this.basePath)
      : await loadAllHistories(this.basePath);

    // Merge loaded data with any in-memory data, avoiding duplicates by timestamp
    const existingTimestamps = new Set(this.history.map((h) => h.timestamp));
    for (const point of loaded) {
      if (!existingTimestamps.has(point.timestamp)) {
        this.history.push(point);
      }
    }

    // Sort by timestamp after merge
    this.history.sort((a, b) => a.timestamp - b.timestamp);

    this.persistenceLoaded = true;
  }

  /**
   * Set the base path for persistence. Useful for tests.
   */
  setBasePath(basePath: string): void {
    this.basePath = basePath;
    this.persistenceLoaded = false; // Reset so next load reads from new path
  }

  clearHistory(): void {
    this.history = [];
    this.persistenceLoaded = false;
  }

  /** Expose history length for diagnostics. */
  get historySize(): number {
    return this.history.length;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let detector: AdvantageDetector | null = null;

export function getAdvantageDetector(): AdvantageDetector {
  if (!detector) {
    detector = new AdvantageDetector();
  }
  return detector;
}

/** Reset the singleton — primarily for tests. */
export function resetAdvantageDetector(): void {
  detector = null;
}
