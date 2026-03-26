/**
 * Drift Detection Types for Mission Control
 *
 * These types mirror the TypeScript types from @kr8tiv-ai/node-runtime-truth/api/drift.ts
 * and the Python TypedDicts from runtime_types/drift_types.py.
 *
 * @module @kr8tiv-ai/mission-control/types/drift
 */

/**
 * Patterns in task handling.
 */
export interface TaskPatterns {
  preferred_task_types?: string[];
  avg_task_complexity?: number;
}

/**
 * Patterns in response generation.
 */
export interface ResponsePatterns {
  avg_response_length?: number;
  code_inclusion_rate?: number;
}

/**
 * Patterns in user interaction.
 */
export interface InteractionPatterns {
  clarification_rate?: number;
  follow_up_rate?: number;
}

/**
 * Behavioral patterns observed for a Kin.
 */
export interface BehaviorProfile {
  task_patterns: TaskPatterns;
  response_patterns: ResponsePatterns;
  interaction_patterns: InteractionPatterns;
}

/**
 * Quantitative baseline metrics for drift detection.
 */
export interface BaselineMetrics {
  avg_response_time_ms: number;
  task_completion_rate: number;
  error_rate: number;
  specialization_alignment_score: number;
}

/**
 * Behavior baseline for a Kin process.
 */
export interface DriftBaseline {
  record_id: string;
  schema_family: 'drift_baseline';
  kin_id: string;
  kin_name: string;
  specialization: string;
  behavior_profile: BehaviorProfile;
  baseline_metrics: BaselineMetrics;
  created_at: string;
  last_updated_at: string;
}

/**
 * Comparison of baseline vs current value for a single metric.
 */
export interface BaselineComparisonValue {
  baseline: number;
  current: number;
}

/**
 * Detailed information about the drift.
 */
export interface DriftAlertDetails {
  deviant_metrics: string[];
  baseline_comparison: Record<string, BaselineComparisonValue>;
  trend: 'stable' | 'increasing' | 'decreasing';
}

/**
 * Alert record generated when a Kin's behavior drifts beyond thresholds.
 */
export interface DriftAlert {
  record_id: string;
  schema_family: 'drift_alert';
  kin_id: string;
  kin_name: string;
  timestamp: string;
  drift_score: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: DriftAlertDetails;
  remediation_guidance: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

/**
 * Drift score for a single Kin process.
 */
export interface KinDriftScore {
  kin_id: string;
  kin_name: string;
  drift_score: number;
  status: 'stable' | 'warning' | 'critical';
}

/**
 * Aggregate drift status for all monitored Kin processes.
 */
export interface DriftStatus {
  record_id: string;
  schema_family: 'drift_status';
  timestamp: string;
  kin_drift_scores: KinDriftScore[];
  alert_count_24h: number;
  critical_count_24h: number;
  overall_health: 'stable' | 'warning' | 'critical';
  created_at: string;
}

/**
 * Severity level type.
 */
export type DriftSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Health status type.
 */
export type DriftHealthStatus = 'stable' | 'warning' | 'critical';

/**
 * Trend direction type.
 */
export type DriftTrend = 'stable' | 'increasing' | 'decreasing';
