export interface AdvantageDataPoint {
  timestamp: number;
  taskCategory: string;
  localLatency: number;
  frontierLatency: number;
  localWins: boolean;
  /** Optional quality score (0-1) from the eval pipeline. */
  qualityScore?: number;
}

export interface AdvantageReport {
  category: string;
  localAdvantage: boolean;
  averageLatencySavings: number;
  winRate: number;
  sampleSize: number;
  recommendation: 'local' | 'frontier' | 'hybrid';
  /** Average quality delta (local - frontier) when quality data is present. */
  averageQualityDelta?: number;
}

export interface AdvantageTrend {
  category: string;
  trend: 'improving' | 'stable' | 'declining';
  changePercent: number;
}

class AdvantageDetector {
  private history: AdvantageDataPoint[] = [];
  private readonly THRESHOLD = 0.6;
  private readonly LATENCY_THRESHOLD = 1000;

  record(
    taskCategory: string,
    localLatency: number,
    frontierLatency: number,
    userPreferredLocal: boolean,
    qualityScore?: number,
  ): void {
    this.history.push({
      timestamp: Date.now(),
      taskCategory,
      localLatency,
      frontierLatency,
      localWins: userPreferredLocal,
      qualityScore,
    });

    if (this.history.length > 10000) {
      this.history = this.history.slice(-5000);
    }
  }

  getReports(): AdvantageReport[] {
    const categories = new Set(this.history.map(h => h.taskCategory));
    const reports: AdvantageReport[] = [];

    for (const category of categories) {
      const points = this.history.filter(h => h.taskCategory === category);
      
      if (points.length === 0) continue;

      const wins = points.filter(p => p.localWins).length;
      const total = points.length;
      const winRate = wins / total;

      const localAvg = points.reduce((sum, p) => sum + p.localLatency, 0) / total;
      const frontierAvg = points.reduce((sum, p) => sum + p.frontierLatency, 0) / total;
      const latencySavings = frontierAvg - localAvg;

      const localAdvantage = winRate >= this.THRESHOLD && latencySavings > this.LATENCY_THRESHOLD;
      
      let recommendation: 'local' | 'frontier' | 'hybrid' = 'frontier';
      if (localAdvantage) {
        recommendation = 'local';
      } else if (winRate >= 0.4 && latencySavings > 0) {
        recommendation = 'hybrid';
      }

      // Compute average quality delta when quality data is present
      const qualityPoints = points.filter(p => p.qualityScore !== undefined);
      const averageQualityDelta =
        qualityPoints.length > 0
          ? qualityPoints.reduce((sum, p) => sum + p.qualityScore!, 0) / qualityPoints.length
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
        .filter(h => h.taskCategory === report.category)
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

      const firstWinRate = firstHalf.filter(p => p.localWins).length / firstHalf.length;
      const secondWinRate = secondHalf.filter(p => p.localWins).length / secondHalf.length;

      const change = ((secondWinRate - firstWinRate) / firstWinRate) * 100;

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

  recommendForTask(taskCategory: string): 'local' | 'frontier' | 'hybrid' {
    const reports = this.getReports();
    const report = reports.find(r => r.category === taskCategory);
    
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

    const categories = new Set(this.history.map(h => h.taskCategory)).size;
    const wins = this.history.filter(p => p.localWins).length;
    const avgLatencySavings = this.history.reduce(
      (sum, p) => sum + (p.frontierLatency - p.localLatency),
      0
    ) / this.history.length;

    return {
      totalSamples: this.history.length,
      categoriesTracked: categories,
      overallLocalWinRate: wins / this.history.length,
      averageLatencySavings: avgLatencySavings,
    };
  }

  clearHistory(): void {
    this.history = [];
  }
}

let detector: AdvantageDetector | null = null;

export function getAdvantageDetector(): AdvantageDetector {
  if (!detector) {
    detector = new AdvantageDetector();
  }
  return detector;
}